-- ============================================================
--  28 — let people delete their own messages.
--
--  Soft delete: the message disappears from the conversation and
--  everyone sees that something was removed, but the original text
--  survives where moderation can reach it.
--
--  The important detail is WHERE the text survives. The client reads
--  the messages table directly, so leaving the body in place and
--  hiding it in the UI would still ship the text to anyone who opens
--  devtools — a delete that doesn't delete. Instead the original moves
--  to message_deletions, which has RLS on and no policies at all, so
--  no signed-in user can read it through the API. Only the service
--  role, which is you, can.
--
--  That's the trade being made: your reports table records a user and
--  a reason but never the message text, so a hard delete would let
--  someone send abuse, let it be read, and erase the evidence. This
--  keeps the evidence without leaving it readable in the chat.
--
--  Run in the Supabase SQL Editor, after 27.
-- ============================================================


alter table public.messages
  add column if not exists deleted_at timestamptz;


create table if not exists public.message_deletions (
  message_id    bigint primary key references public.messages(id) on delete cascade,
  original_body text   not null,
  deleted_by    uuid   references public.profiles(id) on delete set null,
  deleted_at    timestamptz default now()
);

-- RLS on, no policies, no grants. Deliberate: this table is invisible
-- to every API caller. Reaching it means the SQL editor or the service
-- role key, which is the point.
alter table public.message_deletions enable row level security;
revoke all on public.message_deletions from authenticated, anon;


-- ------------------------------------------------------------
--  Delete one of your own messages.
--
--  SECURITY DEFINER because messages has no update policy and is not
--  getting one: an update policy would let whoever can see a message
--  rewrite any column on it, including what the sender actually said.
--  This function is the single narrow exception, and the sender check
--  below is what authorises it.
-- ------------------------------------------------------------
create or replace function public.delete_message(message bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  msg record;
begin
  select id, sender_id, body, deleted_at, conversation_id
    into msg
    from messages
   where id = message;

  if not found then
    raise exception 'That message no longer exists';
  end if;

  -- Only the sender. Not the recipient, and not another member of a
  -- group chat — removing someone else's words is a moderator action,
  -- not a participant one.
  if msg.sender_id <> auth.uid() then
    raise exception 'You can only delete your own messages';
  end if;

  if msg.deleted_at is not null then
    return;  -- already gone; deleting twice is not an error
  end if;

  insert into message_deletions (message_id, original_body, deleted_by)
  values (msg.id, msg.body, auth.uid());

  -- The stored text is what the conversation list shows as the last
  -- message, so it has to read as a sentence rather than a marker.
  -- The thread styles it as a tombstone using deleted_at.
  update messages
     set body = 'Message deleted',
         deleted_at = now()
   where id = msg.id;
end;
$$;

grant execute on function public.delete_message(bigint) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
