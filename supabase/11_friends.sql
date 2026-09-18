-- ============================================================
--  Friend requests
--  Run this in the Supabase SQL Editor.
--
--  All of this goes through functions rather than letting the app
--  write to the friendships table directly. The reason is that a
--  friendship is ONE row shared by two people, and who may change
--  it depends on which side you're on: the addressee accepts, the
--  requester cancels, either can remove. Encoding that in functions
--  keeps the rules in one place instead of scattered across screens.
-- ============================================================


-- ------------------------------------------------------------
--  Send a request (or accept one that's already waiting)
-- ------------------------------------------------------------
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing friendships%rowtype;
begin
  if target = auth.uid() then
    raise exception 'You cannot add yourself';
  end if;

  if public.is_blocked(target) then
    raise exception 'That player is not available';
  end if;

  select * into existing
  from friendships
  where (requester_id = auth.uid() and addressee_id = target)
     or (requester_id = target and addressee_id = auth.uid());

  -- Nothing between you yet.
  if existing.id is null then
    insert into friendships (requester_id, addressee_id, status)
    values (auth.uid(), target, 'pending');
    return 'sent';
  end if;

  if existing.status = 'accepted' then
    return 'already_friends';
  end if;

  if existing.status = 'pending' then
    -- They asked you first. Treating this as an accept is what a
    -- person means when they click Add on someone who already asked.
    if existing.addressee_id = auth.uid() then
      update friendships
         set status = 'accepted', responded_at = now()
       where id = existing.id;
      return 'accepted';
    end if;

    return 'already_sent';
  end if;

  -- Previously declined: reopen it, with whoever is asking now as
  -- the requester.
  update friendships
     set requester_id = auth.uid(),
         addressee_id = target,
         status       = 'pending',
         created_at   = now(),
         responded_at = null
   where id = existing.id;

  return 'sent';
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;


-- ------------------------------------------------------------
--  Accept or decline. Only the person who was asked may answer.
-- ------------------------------------------------------------
create or replace function public.respond_to_friend_request(
  friendship_id bigint,
  accept boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update friendships
     set status = case when accept then 'accepted' else 'declined' end::friendship_status,
         responded_at = now()
   where id = friendship_id
     and addressee_id = auth.uid()
     and status = 'pending';

  if not found then
    raise exception 'No pending request for you to answer';
  end if;
end;
$$;

grant execute on function public.respond_to_friend_request(bigint, boolean) to authenticated;


-- ------------------------------------------------------------
--  Remove a friend, or cancel a request you sent. Same action
--  from the database's point of view: the row goes.
-- ------------------------------------------------------------
create or replace function public.remove_friend(other uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from friendships
  where (requester_id = auth.uid() and addressee_id = other)
     or (requester_id = other and addressee_id = auth.uid());
end;
$$;

grant execute on function public.remove_friend(uuid) to authenticated;


-- ------------------------------------------------------------
--  Everything the Friends screen needs, in one call.
--
--  `direction` says which list a row belongs in:
--    friend   - accepted, you're friends
--    incoming - they asked you, waiting on your answer
--    outgoing - you asked them, waiting on theirs
-- ------------------------------------------------------------
-- Dropped first because Postgres refuses to change the columns a
-- function returns via CREATE OR REPLACE. Any time this list changes,
-- the drop has to happen too.
drop function if exists public.get_friend_list();

create or replace function public.get_friend_list()
returns table (
  friendship_id bigint,
  other_id      uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  last_seen_at  timestamptz,
  direction     text,
  created_at    timestamptz
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    f.id,
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_preset,
    p.last_seen_at,
    case
      when f.status = 'accepted'            then 'friend'
      when f.addressee_id = auth.uid()      then 'incoming'
      else                                       'outgoing'
    end as direction,
    f.created_at
  from friendships f
  join profiles p
    on p.id = case when f.requester_id = auth.uid()
                   then f.addressee_id
                   else f.requester_id end
  where (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and f.status in ('accepted', 'pending')
    and not public.is_blocked(p.id)
  order by
    case
      when f.status = 'pending' and f.addressee_id = auth.uid() then 0
      when f.status = 'accepted'                                then 1
      else 2
    end,
    p.last_seen_at desc nulls last;
$$;

grant execute on function public.get_friend_list() to authenticated;


-- ------------------------------------------------------------
--  Where do I stand with one specific person? Used by the button
--  on their profile.
-- ------------------------------------------------------------
drop function if exists public.get_friend_status(uuid);

create or replace function public.get_friend_status(other uuid)
returns text
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(
    (
      select case
        when f.status = 'accepted'       then 'friend'
        when f.status = 'declined'       then 'none'
        when f.addressee_id = auth.uid() then 'incoming'
        else                                  'outgoing'
      end
      from friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = other)
         or (f.requester_id = other and f.addressee_id = auth.uid())
      limit 1
    ),
    'none'
  );
$$;

grant execute on function public.get_friend_status(uuid) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
