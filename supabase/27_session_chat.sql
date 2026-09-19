-- ============================================================
--  27 — group chat for sessions.
--
--  Joining a session puts you in a chat with everyone else in it.
--  Leaving takes you out again, history included: chat membership is
--  always exactly the session roster, so there's nothing to explain
--  and nothing to drift.
--
--  The awkward part is that `conversations` was built for two people —
--  (user_a, user_b), smaller uuid first. That shape cannot hold three.
--  So this adds a membership table, moves every existing DM into it,
--  and rewrites everything that read the old columns.
--
--  user_a and user_b are KEPT and still filled for direct chats. They
--  are what makes "one conversation per pair" enforceable with a unique
--  constraint; doing the same through a membership table needs a
--  trigger or an aggregate check, which is worse. They are simply
--  ignored for group chats.
--
--  Run this in the Supabase SQL Editor, after 26.
-- ============================================================


-- ------------------------------------------------------------
--  Shape
-- ------------------------------------------------------------

alter table public.conversations
  add column if not exists kind    text   not null default 'direct',
  add column if not exists post_id bigint references public.posts(id) on delete cascade;

alter table public.conversations
  drop constraint if exists conversation_kind_valid;
alter table public.conversations
  add constraint conversation_kind_valid check (kind in ('direct', 'session'));

-- A direct chat is a pair; a session chat is a post. Neither shape is
-- valid as the other, so the table refuses the impossible rows rather
-- than every reader defending against them.
alter table public.conversations
  drop constraint if exists conversation_shape;
alter table public.conversations
  add constraint conversation_shape check (
    (kind = 'direct'  and user_a is not null and user_b is not null and post_id is null)
    or
    (kind = 'session' and post_id is not null)
  );

-- Group chats have no pair, so those columns must be allowed to be
-- empty. The check above is what keeps direct chats honest.
alter table public.conversations alter column user_a drop not null;
alter table public.conversations alter column user_b drop not null;

-- One chat per session.
create unique index if not exists conversations_post_key
  on public.conversations (post_id) where post_id is not null;


create table if not exists public.conversation_members (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  user_id         uuid   not null references public.profiles(id)      on delete cascade,
  joined_at       timestamptz default now(),

  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);


-- ------------------------------------------------------------
--  Backfill
--
--  Every existing DM becomes two membership rows. Without this,
--  the new policies below would lock everyone out of their own
--  conversations the moment this file runs.
-- ------------------------------------------------------------
insert into public.conversation_members (conversation_id, user_id)
select c.id, c.user_a from public.conversations c where c.user_a is not null
union
select c.id, c.user_b from public.conversations c where c.user_b is not null
on conflict do nothing;


-- ------------------------------------------------------------
--  Membership test
--
--  SECURITY DEFINER on purpose. The policies below live ON the tables
--  this reads, so a plain query would re-enter its own policy and
--  recurse forever. Running as owner skips RLS and breaks the loop.
--
--  It answers one boolean about the caller and leaks nothing else.
-- ------------------------------------------------------------
create or replace function public.in_conversation(conversation bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from conversation_members
    where conversation_id = conversation
      and user_id = auth.uid()
  );
$$;

grant execute on function public.in_conversation(bigint) to authenticated;


-- ------------------------------------------------------------
--  Policies
--
--  The originals came from schema.sql and keyed off user_a/user_b,
--  which no longer describes who is in a conversation. Rather than
--  guess their names, drop whatever is there and restate the whole
--  set, so the end state is known regardless of history.
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('conversations', 'messages', 'conversation_members')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.conversations       enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages            enable row level security;

create policy "read conversations you are in"
  on public.conversations for select
  to authenticated
  using (public.in_conversation(id));

create policy "see who else is in your conversations"
  on public.conversation_members for select
  to authenticated
  using (public.in_conversation(conversation_id));

create policy "read messages in your conversations"
  on public.messages for select
  to authenticated
  using (public.in_conversation(conversation_id));

create policy "send messages to your conversations"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.in_conversation(conversation_id)
  );

-- Deliberately no update or delete policy on messages. Nobody edits or
-- removes what was said, including the sender. mark_conversation_read
-- is SECURITY DEFINER precisely so that read receipts don't require
-- opening that door.


-- ------------------------------------------------------------
--  Direct chats — unchanged behaviour, plus membership rows.
-- ------------------------------------------------------------
create or replace function public.get_or_create_conversation(other uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  found_id bigint;
begin
  if other = auth.uid() then
    raise exception 'You cannot message yourself';
  end if;

  if public.is_blocked(other) then
    raise exception 'That player is not available';
  end if;

  if not public.can_message(other) then
    raise exception 'That player only accepts messages from friends';
  end if;

  a := least(auth.uid(), other);
  b := greatest(auth.uid(), other);

  select id into found_id
  from conversations
  where kind = 'direct' and user_a = a and user_b = b;

  if found_id is null then
    insert into conversations (kind, user_a, user_b)
    values ('direct', a, b)
    returning id into found_id;
  end if;

  -- Definer, so this can write the other person's membership row too.
  -- The checks above are what authorise it.
  insert into conversation_members (conversation_id, user_id)
  values (found_id, a), (found_id, b)
  on conflict do nothing;

  return found_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;


-- ------------------------------------------------------------
--  Session chats
--
--  Created on demand rather than with the post: a session nobody joins
--  never needs a conversation, and the host is a session player like
--  anyone else.
-- ------------------------------------------------------------
create or replace function public.ensure_session_conversation(post bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id bigint;
begin
  select id into found_id from conversations where post_id = post;
  if found_id is not null then
    return found_id;
  end if;

  -- Only sessions get a chat. A plain text post has nobody to be in it.
  if not exists (select 1 from posts where id = post and kind = 'lfg') then
    raise exception 'That post is not a session';
  end if;

  insert into conversations (kind, post_id)
  values ('session', post)
  returning id into found_id;

  return found_id;
end;
$$;


-- Joining a session joins its chat; leaving leaves it. One trigger each
-- way, so every path in and out of a session stays in step without the
-- callers having to remember — including add_session_players and
-- remove_session_player from migration 22.
create or replace function public.sync_session_chat_join()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  conv bigint;
begin
  conv := public.ensure_session_conversation(new.post_id);

  insert into conversation_members (conversation_id, user_id)
  values (conv, new.user_id)
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.sync_session_chat_leave()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from conversation_members
   where user_id = old.user_id
     and conversation_id in (select id from conversations where post_id = old.post_id);

  return old;
end;
$$;

drop trigger if exists session_players_chat_join on public.session_players;
create trigger session_players_chat_join
  after insert on public.session_players
  for each row execute function public.sync_session_chat_join();

drop trigger if exists session_players_chat_leave on public.session_players;
create trigger session_players_chat_leave
  after delete on public.session_players
  for each row execute function public.sync_session_chat_leave();


-- Sessions that already have players predate these triggers, so they
-- need their chats built once, here.
do $$
declare r record; conv bigint;
begin
  for r in select distinct post_id from public.session_players loop
    conv := public.ensure_session_conversation(r.post_id);
    insert into public.conversation_members (conversation_id, user_id)
    select conv, sp.user_id from public.session_players sp where sp.post_id = r.post_id
    on conflict do nothing;
  end loop;
end $$;


-- ------------------------------------------------------------
--  The conversation list
--
--  Same columns as before plus four, so the existing direct-chat
--  rendering keeps working untouched and only the group case is new.
--
--  A session's title is computed here rather than stored, so it follows
--  the post: rename nothing when a session's time changes.
-- ------------------------------------------------------------
drop function if exists public.get_conversations();

create or replace function public.get_conversations()
returns table (
  conversation_id bigint,
  other_id        uuid,
  username        text,
  display_name    text,
  avatar_url      text,
  avatar_preset   text,
  last_seen_at    timestamptz,
  last_message    text,
  last_message_at timestamptz,
  last_from_me    boolean,
  unread          bigint,
  kind            text,
  post_id         bigint,
  title           text,
  member_count    bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    c.id,
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_preset,
    p.last_seen_at,
    m.body,
    m.created_at,
    m.sender_id = auth.uid(),
    coalesce(u.count, 0),
    c.kind,
    c.post_id,
    case when c.kind = 'session' then coalesce(g.name, 'Session') end,
    coalesce(mem.count, 0)
  from conversations c

  -- Only direct chats have an "other person".
  left join profiles p
    on c.kind = 'direct'
   and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end

  left join posts  po on po.id = c.post_id
  left join games  g  on g.id  = po.game_id

  left join lateral (
    select body, created_at, sender_id
    from messages
    where conversation_id = c.id
    order by created_at desc
    limit 1
  ) m on true

  left join lateral (
    select count(*) as count
    from messages
    where conversation_id = c.id
      and sender_id <> auth.uid()
      and read_at is null
  ) u on true

  left join lateral (
    select count(*) as count
    from conversation_members
    where conversation_id = c.id
  ) mem on true

  where public.in_conversation(c.id)
    -- A blocked person's DM disappears; a session chat stays, because
    -- it isn't one person's and other people are still in it.
    and (c.kind <> 'direct' or not public.is_blocked(p.id))
  order by coalesce(m.created_at, c.created_at) desc;
$$;

grant execute on function public.get_conversations() to authenticated;


-- ------------------------------------------------------------
--  Read receipts — membership instead of the pair columns.
-- ------------------------------------------------------------
create or replace function public.mark_conversation_read(conversation bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update messages
     set read_at = now()
   where conversation_id = conversation
     and sender_id <> auth.uid()
     and read_at is null
     and public.in_conversation(conversation);
$$;

grant execute on function public.mark_conversation_read(bigint) to authenticated;


-- ------------------------------------------------------------
--  Who's in a group chat, for the thread header.
-- ------------------------------------------------------------
create or replace function public.get_conversation_members(conversation bigint)
returns table (
  id            uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text
)
language sql
security invoker
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_preset
  from conversation_members cm
  join profiles p on p.id = cm.user_id
  where cm.conversation_id = conversation
    and public.in_conversation(conversation)
  order by cm.joined_at;
$$;

grant execute on function public.get_conversation_members(bigint) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
