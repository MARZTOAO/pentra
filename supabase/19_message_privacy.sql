-- ============================================================
--  Who can message you
--  Run this in the Supabase SQL Editor.
--
--  Three settings:
--    everyone  - the default, and what makes the app work: someone
--                you matched with can actually reach you
--    friends   - only accepted friends
--    nobody    - nobody new; existing conversations still work
--
--  Enforced in the database. Hiding the Message button is a courtesy
--  to the well-behaved; the check below is what stops the rest.
-- ============================================================

alter table public.profiles
  add column if not exists message_privacy text not null default 'everyone';

alter table public.profiles
  drop constraint if exists message_privacy_valid;
alter table public.profiles
  add constraint message_privacy_valid
  check (message_privacy in ('everyone', 'friends', 'nobody'));


-- ------------------------------------------------------------
--  May I start a conversation with this person?
--
--  Only governs NEW conversations. Someone who changes their setting
--  to 'nobody' keeps the threads they already have - the setting is
--  about who can reach them, not a way to silently drop people
--  mid-conversation.
-- ------------------------------------------------------------
create or replace function public.can_message(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when other = auth.uid()          then false
    when public.is_blocked(other)    then false
    -- An existing thread stays open whatever the setting says.
    when exists (
      select 1 from conversations c
      where (c.user_a = least(auth.uid(), other)
         and c.user_b = greatest(auth.uid(), other))
    )                                then true
    else coalesce(
      (
        select case p.message_privacy
          when 'everyone' then true
          when 'friends'  then public.is_friend(other)
          else false
        end
        from profiles p where p.id = other
      ),
      false
    )
  end;
$$;

grant execute on function public.can_message(uuid) to authenticated;


-- ------------------------------------------------------------
--  Opening a conversation now checks it.
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

  if not public.can_message(other) then
    raise exception 'That player only accepts messages from friends';
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

-- ============================================================
--  Done.
-- ============================================================
