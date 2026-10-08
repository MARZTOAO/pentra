-- ============================================================
--  108 — Group chats people make themselves.
--
--  Until now a group chat only existed as a session's chat (27). Now
--  anyone can start one: name it, pick people, and talk (MARZ,
--  2026-10-08). The rules:
--    - Anyone in the group can add more people.
--    - Only the person who made it can remove someone.
--    - Anyone can leave. If the maker leaves, the longest-standing
--      member takes over, so a group never ends up with nobody who
--      can tidy it.
--    - You can only add someone you'd be allowed to message directly
--      (their privacy setting and blocks apply — can_message, 19).
--    - Up to 50 people.
--
--  Shape: conversations.kind gains 'group'; a group has a title and a
--  created_by, and no pair or post. Everything else (members, messages,
--  read receipts, deleting the chat for yourself, pushes) is what
--  session chats already use.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. Shape.
-- ------------------------------------------------------------

alter table public.conversations
  add column if not exists title      text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.conversations
  drop constraint if exists conversation_kind_valid;
alter table public.conversations
  drop constraint if exists conversations_kind_check;
alter table public.conversations
  add constraint conversation_kind_valid check (kind in ('direct', 'session', 'group'));

alter table public.conversations
  drop constraint if exists conversation_shape;
alter table public.conversations
  add constraint conversation_shape check (
    (kind = 'direct'  and user_a is not null and user_b is not null and post_id is null)
    or
    (kind = 'session' and post_id is not null)
    or
    (kind = 'group'   and post_id is null and user_a is null and user_b is null
                      and title is not null and char_length(btrim(title)) between 1 and 60)
  );

create or replace function public.group_chat_max_members()
returns integer language sql immutable as $$ select 50 $$;


-- ------------------------------------------------------------
--  2. Making one.
--
--  You're in it from the start. The people you pick are added with
--  the same rules as adding later, so one person you can't message
--  doesn't stop the group being made — they're just left out, and
--  the result says so.
-- ------------------------------------------------------------
create or replace function public.create_group_conversation(p_title text, p_members uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  t       text := btrim(coalesce(p_title, ''));
  conv    bigint;
  added   int;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  if char_length(t) < 1 or char_length(t) > 60 then
    return jsonb_build_object('error', 'Give the group a name (up to 60 characters).');
  end if;

  insert into conversations (kind, title, created_by)
  values ('group', t, me)
  returning id into conv;

  insert into conversation_members (conversation_id, user_id) values (conv, me);

  added := (public.add_group_members(conv, p_members)->>'added')::int;

  return jsonb_build_object('id', conv, 'added', added);
end;
$$;

revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;


-- ------------------------------------------------------------
--  3. Adding people. Anyone in the group may.
-- ------------------------------------------------------------
create or replace function public.add_group_members(p_conversation bigint, p_members uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  c       public.conversations;
  u       uuid;
  added   int := 0;
  skipped int := 0;
  room    int;
begin
  select * into c from conversations where id = p_conversation;
  if c.id is null or c.kind <> 'group' then
    return jsonb_build_object('error', 'That isn''t a group chat.');
  end if;
  if not public.in_conversation(p_conversation) then
    return jsonb_build_object('error', 'You''re not in that group.');
  end if;

  room := public.group_chat_max_members()
          - (select count(*) from conversation_members where conversation_id = p_conversation);

  foreach u in array coalesce(p_members, '{}'::uuid[]) loop
    if room <= 0 then
      skipped := skipped + 1;
      continue;
    end if;
    if u is null or u = me
       or exists (select 1 from conversation_members
                   where conversation_id = p_conversation and user_id = u)
       or not public.can_message(u) then
      skipped := skipped + 1;
      continue;
    end if;

    insert into conversation_members (conversation_id, user_id) values (p_conversation, u)
    on conflict do nothing;
    if found then
      added := added + 1;
      room  := room - 1;
      -- Someone re-added after leaving starts from now, not from the
      -- history they walked away from (29).
      delete from conversation_clears where conversation_id = p_conversation and user_id = u;
      insert into conversation_clears (conversation_id, user_id, cleared_at)
      values (p_conversation, u, now());
    end if;
  end loop;

  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;

revoke all on function public.add_group_members(bigint, uuid[]) from public, anon;
grant execute on function public.add_group_members(bigint, uuid[]) to authenticated;


-- ------------------------------------------------------------
--  4. Removing someone. The maker only.
-- ------------------------------------------------------------
create or replace function public.remove_group_member(p_conversation bigint, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c  public.conversations;
begin
  select * into c from conversations where id = p_conversation;
  if c.id is null or c.kind <> 'group' then
    return 'That isn''t a group chat.';
  end if;
  if c.created_by is distinct from me then
    return 'Only the person who made the group can remove people.';
  end if;
  if p_user = me then
    return 'Leave the group instead.';
  end if;

  delete from conversation_members
   where conversation_id = p_conversation and user_id = p_user;
  if not found then
    return 'They''re not in the group.';
  end if;

  -- They don't keep reading after they're out.
  insert into conversation_clears (conversation_id, user_id, cleared_at)
  values (p_conversation, p_user, now())
  on conflict (conversation_id, user_id) do update set cleared_at = now();

  return 'removed';
end;
$$;

revoke all on function public.remove_group_member(bigint, uuid) from public, anon;
grant execute on function public.remove_group_member(bigint, uuid) to authenticated;


-- ------------------------------------------------------------
--  5. Leaving. 29's function, plus: a maker who leaves hands the
--     group to whoever has been in it longest; the last person out
--     deletes it.
-- ------------------------------------------------------------
create or replace function public.leave_conversation(conversation bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_kind text;
  maker     uuid;
  heir      uuid;
begin
  if not public.in_conversation(conversation) then
    raise exception 'That conversation is not yours';
  end if;

  select kind, created_by into conv_kind, maker from conversations where id = conversation;

  if conv_kind = 'session' then
    raise exception 'Leave the session itself to leave its chat';
  end if;

  insert into conversation_clears (conversation_id, user_id, cleared_at)
  values (conversation, auth.uid(), now())
  on conflict (conversation_id, user_id)
  do update set cleared_at = now();

  delete from conversation_members
   where conversation_id = conversation
     and user_id = auth.uid();

  if conv_kind = 'group' then
    select user_id into heir
      from conversation_members
     where conversation_id = conversation
     order by joined_at, user_id
     limit 1;

    if heir is null then
      delete from conversations where id = conversation;
    elsif maker = auth.uid() then
      update conversations set created_by = heir where id = conversation;
    end if;
  end if;
end;
$$;

revoke all on function public.leave_conversation(bigint) from public, anon;
grant execute on function public.leave_conversation(bigint) to authenticated;


-- ------------------------------------------------------------
--  6. Renaming. Anyone in the group.
-- ------------------------------------------------------------
create or replace function public.rename_group_conversation(p_conversation bigint, p_title text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := btrim(coalesce(p_title, ''));
begin
  if char_length(t) < 1 or char_length(t) > 60 then
    return 'Give the group a name (up to 60 characters).';
  end if;
  update conversations set title = t
   where id = p_conversation and kind = 'group' and public.in_conversation(p_conversation);
  return case when found then 'saved' else 'That isn''t a group you''re in.' end;
end;
$$;

revoke all on function public.rename_group_conversation(bigint, text) from public, anon;
grant execute on function public.rename_group_conversation(bigint, text) to authenticated;


-- ------------------------------------------------------------
--  7. The conversation list: 80's function, with the group's title,
--     who made it, and never archived. The return type changes, so
--     it's dropped first.
-- ------------------------------------------------------------
drop function if exists public.get_conversations();

create function public.get_conversations()
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
  member_count    bigint,
  archived        boolean,
  created_by      uuid
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
    case when c.kind = 'session' then coalesce(g.name, 'Session')
         when c.kind = 'group'   then c.title end,
    coalesce(mem.count, 0),
    (c.kind = 'session'
      and po.starts_at < now() - public.session_chat_archive_after()),
    c.created_by
  from conversations c

  left join profiles p
    on c.kind = 'direct'
   and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end

  left join posts  po on po.id = c.post_id
  left join games  g  on g.id  = po.game_id

  left join lateral (
    select body, created_at, sender_id
    from messages
    where conversation_id = c.id
      and public.message_visible(c.id, created_at)
    order by created_at desc
    limit 1
  ) m on true

  left join lateral (
    select count(*) as count
    from messages
    where conversation_id = c.id
      and sender_id <> auth.uid()
      and read_at is null
      and public.message_visible(c.id, created_at)
  ) u on true

  left join lateral (
    select count(*) as count
    from conversation_members
    where conversation_id = c.id
  ) mem on true

  where public.in_conversation(c.id)
    and (c.kind <> 'direct' or not public.is_blocked(p.id))
  order by coalesce(m.created_at, c.created_at) desc;
$$;

revoke all on function public.get_conversations() from public, anon;
grant execute on function public.get_conversations() to authenticated;


-- ------------------------------------------------------------
--  8. What's New.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Group chats',
     'Start a group chat with anyone: tap New group in Messages, name it and pick people. Anyone in the group can add more people; whoever made it can remove them.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
