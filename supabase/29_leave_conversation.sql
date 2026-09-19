-- ============================================================
--  29 — delete a chat.
--
--  Deleting removes the conversation from YOUR list. The other person
--  keeps theirs, untouched.
--
--  Not "delete for both", deliberately. Destroying someone else's copy
--  of a conversation without their say-so is a strange amount of power
--  to hand a stranger, and it erases the evidence behind any report
--  about what was said — the same reason message deletes are soft.
--
--  The subtle part is what happens next. get_or_create_conversation
--  re-adds membership for both people whenever either opens the chat,
--  so if they message you again you'd be put straight back in — with
--  the entire history you thought you'd deleted. That would be a nasty
--  surprise, so clearing records a timestamp that survives leaving,
--  and messages older than it stay invisible to you forever. They
--  message you again, you get the conversation back with only what
--  they've said since.
--
--  Run in the Supabase SQL Editor, after 28.
-- ============================================================


-- Survives leaving, which is the whole point: the membership row is
-- gone but this remains, so a re-add doesn't resurrect old messages.
create table if not exists public.conversation_clears (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  user_id         uuid   not null references public.profiles(id)      on delete cascade,
  cleared_at      timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

alter table public.conversation_clears enable row level security;

drop policy if exists "read your own clears" on public.conversation_clears;
create policy "read your own clears"
  on public.conversation_clears for select
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
--  Message visibility
--
--  Membership alone is no longer enough: a message also has to be
--  newer than your clear, if you have one.
--
--  SECURITY DEFINER for the same reason as in_conversation — this is
--  called from a policy on the table it reads, and a plain query would
--  recurse into its own policy.
-- ------------------------------------------------------------
create or replace function public.message_visible(
  conversation bigint,
  created      timestamptz
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    exists (
      select 1 from conversation_members
      where conversation_id = conversation
        and user_id = auth.uid()
    )
    and not exists (
      select 1 from conversation_clears
      where conversation_id = conversation
        and user_id = auth.uid()
        and cleared_at >= created
    );
$$;

grant execute on function public.message_visible(bigint, timestamptz) to authenticated;


-- Replaces the read policy from migration 27. Sending is unchanged:
-- clearing a chat doesn't stop you writing a new message into it.
drop policy if exists "read messages in your conversations" on public.messages;
create policy "read messages in your conversations"
  on public.messages for select
  to authenticated
  using (public.message_visible(conversation_id, created_at));


-- ------------------------------------------------------------
--  Delete a chat, for you.
-- ------------------------------------------------------------
create or replace function public.leave_conversation(conversation bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_kind text;
begin
  if not public.in_conversation(conversation) then
    raise exception 'That conversation is not yours';
  end if;

  select kind into conv_kind from conversations where id = conversation;

  -- A session chat's members ARE the session roster — that invariant is
  -- what makes migration 27 simple to reason about. Letting someone
  -- leave the chat while still in the session would break it, so the
  -- way out of a session chat is to leave the session.
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
end;
$$;

grant execute on function public.leave_conversation(bigint) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
