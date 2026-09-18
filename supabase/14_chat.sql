-- ============================================================
--  Chat
--  Run this in the Supabase SQL Editor.
--
--  The tables already exist from schema.sql. This adds the functions
--  around them, for the same reason as friendships: a conversation is
--  one row shared by two people, and the rules about who may do what
--  belong in one place rather than spread across screens.
-- ============================================================


-- ------------------------------------------------------------
--  Open the conversation with someone, creating it if needed.
--
--  user_a is always the smaller uuid. That's what guarantees one
--  conversation per pair instead of two - without it, you opening
--  a chat with them and them opening one with you would make two
--  separate threads that each only see half the messages.
-- ------------------------------------------------------------
create or replace function public.get_or_create_conversation(other uuid)
returns bigint
language plpgsql
security invoker
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

  a := least(auth.uid(), other);
  b := greatest(auth.uid(), other);

  select id into found_id
  from conversations
  where user_a = a and user_b = b;

  if found_id is not null then
    return found_id;
  end if;

  insert into conversations (user_a, user_b)
  values (a, b)
  returning id into found_id;

  return found_id;
end;
$$;

grant execute on function public.get_or_create_conversation(uuid) to authenticated;


-- ------------------------------------------------------------
--  The conversation list, with everything the sidebar needs:
--  who it's with, the last thing said, and how many you haven't read.
--
--  Doing this in one query matters - the obvious alternative is to
--  fetch conversations then loop asking for each one's last message,
--  which is one round trip per row.
-- ------------------------------------------------------------
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
  unread          bigint
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
    coalesce(u.count, 0)
  from conversations c
  join profiles p
    on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
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
  where (c.user_a = auth.uid() or c.user_b = auth.uid())
    and not public.is_blocked(p.id)
  order by coalesce(m.created_at, c.created_at) desc;
$$;

grant execute on function public.get_conversations() to authenticated;


-- ------------------------------------------------------------
--  Mark everything they sent you in this thread as read.
--
--  SECURITY DEFINER, deliberately. Row-level security gives the
--  messages table select and insert policies but no update policy,
--  so a normal update here silently matches nothing.
--
--  The fix is NOT to add an update policy: that would let whoever
--  received a message change any column on it, including rewriting
--  what the sender actually said. Instead this one function runs
--  with elevated rights and does exactly one narrow thing - and the
--  membership check below is what authorises it, so it stays.
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
     and exists (
       select 1 from conversations c
       where c.id = conversation
         and (c.user_a = auth.uid() or c.user_b = auth.uid())
     );
$$;

grant execute on function public.mark_conversation_read(bigint) to authenticated;


-- ------------------------------------------------------------
--  Keep the conversation's sort order fresh when a message lands,
--  so the list can order by last_message_at without a subquery.
-- ------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ============================================================
--  Done.
-- ============================================================
