-- ============================================================
--  80 — Session chats archive 24 hours after the session.
--
--  MARZ: "24 hours after a session takes place for the messages to get
--  archived in a different tab of messages."  Archived chats are
--  READ-ONLY (his choice): history stays, nobody can post into them.
--
--  WHEN
--    24 hours after the session's start time (posts.starts_at — every
--    session has one; sessions have no end time). Computed, not
--    stored: there's no job to run and nothing to fall behind. A chat
--    is archived the moment the clock passes the line, for everyone.
--
--  WHAT CHANGES
--    session_chat_archived(conv)  the one place the rule lives.
--    get_conversations()          gains an `archived` column; the app
--                                 sorts chats into two tabs by it.
--    messages insert policy       refuses a new message into an
--                                 archived chat. Reading, marking read
--                                 and deleting your own messages are
--                                 unchanged.
--
--  Direct messages are never archived.
--
--  Run in the Supabase SQL Editor BEFORE pushing (the app reads the new
--  column). An app that hasn't updated yet just shows archived chats in
--  its one list, and a message sent into one is refused. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The rule.
-- ------------------------------------------------------------
create or replace function public.session_chat_archive_after()
returns interval
language sql
immutable
as $$ select interval '24 hours' $$;

-- SECURITY DEFINER for the same reason as in_conversation (27): it is
-- called from a policy on messages and reads posts/conversations. It
-- answers one boolean and leaks nothing else.
create or replace function public.session_chat_archived(conversation bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from conversations c
      join posts p on p.id = c.post_id
     where c.id = conversation
       and c.kind = 'session'
       and p.starts_at < now() - public.session_chat_archive_after()
  );
$$;

revoke all on function public.session_chat_archived(bigint) from public;
grant execute on function public.session_chat_archived(bigint) to authenticated;


-- ------------------------------------------------------------
--  2. No new messages into an archived chat.
--
--  27's insert policy, plus one condition.
-- ------------------------------------------------------------
drop policy if exists "send messages to your conversations" on public.messages;
create policy "send messages to your conversations"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.in_conversation(conversation_id)
    and not public.session_chat_archived(conversation_id)
  );


-- ------------------------------------------------------------
--  3. The conversation list, with `archived`.
--
--  27's function, unchanged except for the last column. The return
--  type changes, so it has to be dropped first.
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
  archived        boolean
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
    coalesce(mem.count, 0),
    -- Same rule as session_chat_archived(), inline: po is already joined.
    (c.kind = 'session'
      and po.starts_at < now() - public.session_chat_archive_after())
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
--  4. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Old session chats are archived',
     'A session''s group chat moves to the Archived tab in Messages 24 hours after the session starts. You can still read it any time; it just stops taking new messages.',
     'improvement', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
--
--  Check (read-only): your own chats and which are archived —
--    select conversation_id, kind, title, archived
--      from public.get_conversations();   -- (from the app's session)
-- ============================================================
