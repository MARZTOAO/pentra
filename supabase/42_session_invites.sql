-- ============================================================
--  42 — anyone in a session can invite a friend into it.
--
--  Until now only the host could seat people, and only while posting
--  (22_session_guests.sql). This opens it to everyone already in the
--  session, from the empty slots on the card itself, and adds the
--  thing the host's version never had: the person invited has to say
--  yes.
--
--  WHY A SEPARATE TABLE rather than a status column on
--  session_players. Inserting a row there is not a label — it is the
--  act of joining. 27_session_chat puts every new session_players row
--  into the session's group chat, 41 tells the host somebody joined,
--  and every slot count in the app reads that table. An 'invited' row
--  sitting in it would put someone in a group chat they never agreed
--  to be in. So a pending invite lives somewhere else entirely, and
--  becomes a session_players row at the moment it is accepted.
--
--  A PENDING INVITE HOLDS ITS SLOT. That is what "pending" means on
--  the card: the circle is spoken for. The alternative — invites that
--  reserve nothing — lets a host invite two friends for the last slot
--  and then explain to one of them why the app lied. The hold lapses
--  on its own when the session starts, so nothing needs sweeping up.
--
--  Run in the Supabase SQL Editor, after 41.
-- ============================================================


-- ------------------------------------------------------------
--  Shape
-- ------------------------------------------------------------
create table if not exists public.session_invites (
  post_id    bigint not null references public.posts(id)    on delete cascade,
  invitee_id uuid   not null references public.profiles(id) on delete cascade,
  inviter_id uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  primary key (post_id, invitee_id)
);

create index if not exists session_invites_invitee_idx
  on public.session_invites (invitee_id);

alter table public.session_invites enable row level security;

-- Readable by anyone signed in, exactly like the roster it is part of.
-- A held slot is visible on the card to everyone looking at the post,
-- so there is nothing here that the picture doesn't already show.
drop policy if exists "session invites are readable" on public.session_invites;
create policy "session invites are readable"
  on public.session_invites for select
  to authenticated
  using (true);

-- Deliberately no insert, update or delete policy. Every change goes
-- through the functions below, so "who may invite whom" is written
-- down once instead of being split between a policy and a function
-- that have to agree.


-- ------------------------------------------------------------
--  Joining clears any invite you were holding.
--
--  As a trigger rather than a line in each function, because there
--  are four ways into session_players — join_session, the host's
--  add_session_players, accepting an invite, and the trigger that
--  seats the host — and only one of them would remember to do it.
-- ------------------------------------------------------------
create or replace function public.clear_session_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from session_invites
   where post_id = new.post_id and invitee_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists session_join_clears_invite on public.session_players;
create trigger session_join_clears_invite
  after insert on public.session_players
  for each row execute function public.clear_session_invite();


-- ------------------------------------------------------------
--  How full a session is.
--
--  Players plus invites still waiting on an answer. Invites stop
--  counting once the session has started — an unanswered invite to
--  something already under way is not holding anything, and this is
--  what stops a forgotten invite occupying a slot for ever.
-- ------------------------------------------------------------
create or replace function public.session_taken(post bigint)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from session_players where post_id = post)
    +
    (select count(*)
       from session_invites i
       join posts p on p.id = i.post_id
      where i.post_id = post and p.starts_at > now())
$$;

grant execute on function public.session_taken(bigint) to authenticated;


-- ------------------------------------------------------------
--  Invite friends into a session you are in.
--
--  Anyone in the session, not just the host. The host is in
--  session_players from the moment they post (17_sessions seats them
--  with a trigger), so "must be in the session" covers them without a
--  special case.
--
--  Returns how many invites it actually sent, skipping anyone already
--  in, already invited, or invited twice in one call.
-- ------------------------------------------------------------
create or replace function public.invite_to_session(
  post   bigint,
  guests uuid[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  p     posts%rowtype;
  guest uuid;
  taken int;
  sent  int := 0;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  if guests is null or array_length(guests, 1) is null then
    return 0;
  end if;

  -- Same lock as join_session, for the same reason: somebody can be
  -- pressing Join on the last slot while this runs. See 40.
  perform pg_advisory_xact_lock(post);

  select * into p from posts where id = post;

  if p.id is null        then raise exception 'No such post'; end if;
  if p.kind <> 'lfg'     then raise exception 'That post is not a session'; end if;
  if p.starts_at < now() then raise exception 'That session has already started'; end if;

  if not exists (
    select 1 from session_players where post_id = post and user_id = me
  ) then
    raise exception 'Only people in the session can invite others';
  end if;

  taken := public.session_taken(post);

  foreach guest in array guests
  loop
    continue when guest is null;
    continue when guest = me;

    -- Already playing, or already waiting on an answer. Not an error:
    -- two people inviting the same friend at once is ordinary.
    continue when exists (
      select 1 from session_players where post_id = post and user_id = guest
    );
    continue when exists (
      select 1 from session_invites where post_id = post and invitee_id = guest
    );

    -- Your friends, not the host's. You are the one vouching for them.
    if not public.is_friend(guest) then
      raise exception 'You can only invite friends to a session';
    end if;

    if public.is_blocked(guest) then
      raise exception 'That player is not available';
    end if;

    -- And not somebody the host has blocked, or who has blocked the
    -- host. Being able to put a name into someone else's session by
    -- being friends with them would go around the block.
    if exists (
      select 1 from blocks b
      where (b.blocker_id = p.author_id and b.blocked_id = guest)
         or (b.blocker_id = guest and b.blocked_id = p.author_id)
    ) then
      raise exception 'That player is not available';
    end if;

    if taken >= p.slots then
      raise exception 'That session is full';
    end if;

    insert into session_invites (post_id, invitee_id, inviter_id)
    values (post, guest, me);

    perform public.push_notification(guest, 'session_invite', me, post);

    taken := taken + 1;
    sent  := sent + 1;
  end loop;

  return sent;
end;
$$;

grant execute on function public.invite_to_session(bigint, uuid[]) to authenticated;


-- ------------------------------------------------------------
--  Yes.
--
--  Reports what happened rather than raising, the same way
--  join_session does, so the card can say something for every
--  outcome instead of looking like a dead button. That distinction
--  cost a day once — see the note at the top of 40.
-- ------------------------------------------------------------
create or replace function public.accept_session_invite(post bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  p     posts%rowtype;
  taken int;
begin
  if me is null then
    return 'signed_out';
  end if;

  perform pg_advisory_xact_lock(post);

  if not exists (
    select 1 from session_invites where post_id = post and invitee_id = me
  ) then
    return 'no_invite';
  end if;

  select * into p from posts where id = post;

  if p.id is null        then return 'missing'; end if;
  if p.kind <> 'lfg'     then return 'not_session'; end if;
  if p.starts_at < now() then return 'past'; end if;

  if exists (
    select 1 from session_players where post_id = post and user_id = me
  ) then
    delete from session_invites where post_id = post and invitee_id = me;
    return 'already';
  end if;

  -- Give up our own held slot before counting, or we would find the
  -- session full of ourselves.
  delete from session_invites where post_id = post and invitee_id = me;

  taken := public.session_taken(post);

  if taken >= p.slots then
    -- Someone got there first. The invite is gone either way — a slot
    -- that no longer exists is not worth keeping a promise about.
    return 'full';
  end if;

  insert into session_players (post_id, user_id) values (post, me);
  return 'joined';
end;
$$;

grant execute on function public.accept_session_invite(bigint) to authenticated;


-- ------------------------------------------------------------
--  No thanks.
-- ------------------------------------------------------------
create or replace function public.decline_session_invite(post bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  delete from session_invites
   where post_id = post and invitee_id = auth.uid();
end;
$$;

grant execute on function public.decline_session_invite(bigint) to authenticated;


-- ------------------------------------------------------------
--  Taking an invite back.
--
--  Whoever sent it, or the host. The host owns the session and has
--  always been able to remove a player; an invite they did not send
--  is the same call made earlier.
-- ------------------------------------------------------------
create or replace function public.cancel_session_invite(
  post  bigint,
  guest uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  delete from session_invites i
   where i.post_id = post
     and i.invitee_id = guest
     and (
       i.inviter_id = me
       or exists (select 1 from posts p where p.id = post and p.author_id = me)
     );
end;
$$;

grant execute on function public.cancel_session_invite(bigint, uuid) to authenticated;


-- ------------------------------------------------------------
--  Reading them.
--
--  Batched over a list of posts, the same shape as comment_counts, so
--  a feed of sessions costs one query rather than one per card.
--
--  `mine` is the flag the card needs most: it is what turns a dimmed
--  circle into an Accept / Decline pair.
-- ------------------------------------------------------------
create or replace function public.session_invites_for(posts bigint[])
returns table (
  post_id       bigint,
  invitee_id    uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  inviter_id    uuid,
  inviter_name  text,
  mine          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.post_id,
    i.invitee_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.avatar_preset,
    i.inviter_id,
    coalesce(iv.display_name, iv.username) as inviter_name,
    i.invitee_id = auth.uid()              as mine
  from session_invites i
  join profiles pr on pr.id = i.invitee_id
  join profiles iv on iv.id = i.inviter_id
  join posts    p  on p.id  = i.post_id
  where i.post_id = any(posts)
    -- Invites to a session that has started are no longer holding a
    -- slot, so they are no longer part of the picture either.
    and p.starts_at > now()
  order by i.created_at;
$$;

grant execute on function public.session_invites_for(bigint[]) to authenticated;


-- ------------------------------------------------------------
--  Everything that counts slots now counts held ones too.
--
--  Both functions are otherwise untouched: the bodies below are the
--  ones from 40 with the count line changed, not rewrites.
-- ------------------------------------------------------------
create or replace function public.join_session(post bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  p     posts%rowtype;
  taken int;
begin
  -- An advisory lock rather than `for update` on the post: `for
  -- update` is filtered by the UPDATE policy, and we may not modify
  -- somebody else's post. See the note at the top of 40.
  perform pg_advisory_xact_lock(post);

  select * into p from posts where id = post;

  if p.id is null            then return 'missing';      end if;
  if p.kind <> 'lfg'         then return 'not_session';  end if;
  if p.starts_at < now()     then return 'past';         end if;
  if public.is_blocked(p.author_id) then return 'unavailable'; end if;

  if exists (
    select 1 from session_players
    where post_id = post and user_id = auth.uid()
  ) then
    return 'already';
  end if;

  -- An invite you are holding is your slot: accepting it below is the
  -- same thing as joining, so pressing Join instead should work.
  if exists (
    select 1 from session_invites
    where post_id = post and invitee_id = auth.uid()
  ) then
    delete from session_invites
     where post_id = post and invitee_id = auth.uid();
  end if;

  taken := public.session_taken(post);

  if taken >= p.slots then
    return 'full';
  end if;

  insert into session_players (post_id, user_id) values (post, auth.uid());
  return 'joined';
end;
$$;

grant execute on function public.join_session(bigint) to authenticated;


create or replace function public.add_session_players(
  post   bigint,
  guests uuid[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p      posts%rowtype;
  guest  uuid;
  taken  int;
  added  int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if guests is null or array_length(guests, 1) is null then
    return 0;
  end if;

  perform pg_advisory_xact_lock(post);

  select * into p from posts where id = post;

  if p.id is null           then raise exception 'No such post'; end if;
  if p.author_id <> auth.uid() then raise exception 'Only the host can add players'; end if;
  if p.kind <> 'lfg'        then raise exception 'That post is not a session'; end if;
  if p.starts_at < now()    then raise exception 'That session has already started'; end if;

  taken := public.session_taken(post);

  foreach guest in array guests
  loop
    continue when guest is null;

    -- The host already has a slot from the moment they posted.
    continue when guest = auth.uid();

    -- Already in, from an earlier add or by joining themselves.
    continue when exists (
      select 1 from session_players where post_id = post and user_id = guest
    );

    if not public.is_friend(guest) then
      raise exception 'You can only add friends to a session';
    end if;

    if public.is_blocked(guest) then
      raise exception 'That player is not available';
    end if;

    -- A guest the host seats outright is not two claims on one slot:
    -- if they were holding an invite, that invite is what this
    -- replaces, so it stops counting before the check below. The
    -- insert's trigger deletes it; this makes the arithmetic agree.
    if exists (
      select 1 from session_invites where post_id = post and invitee_id = guest
    ) then
      taken := taken - 1;
    end if;

    if taken >= p.slots then
      raise exception 'That session only has % slots', p.slots;
    end if;

    insert into session_players (post_id, user_id) values (post, guest);

    taken := taken + 1;
    added := added + 1;
  end loop;

  return added;
end;
$$;

grant execute on function public.add_session_players(bigint, uuid[]) to authenticated;


-- ------------------------------------------------------------
--  The notification.
-- ------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'friend_request', 'friend_accepted',
    'session_day', 'session_hour', 'friend_lfg',
    'post_mention', 'post_comment',
    'session_joined', 'session_left',
    'session_invite'));

alter table public.notification_settings
  add column if not exists session_invites boolean not null default true;

-- Its own toggle rather than sharing session_players. Being invited
-- somewhere is addressed to you; a player count moving on a session
-- you host is news about your own thing. Someone might well want one
-- and not the other.
create or replace function public.push_notification(
  recipient uuid,
  n_kind    text,
  actor     uuid   default null,
  post      bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if recipient is null or recipient = actor then
    return;
  end if;

  select coalesce(
    (select case n_kind
              when 'friend_request'  then friend_requests
              when 'friend_accepted' then friend_accepted
              when 'session_day'     then session_reminders
              when 'session_hour'    then session_reminders
              when 'friend_lfg'      then friend_lfg
              when 'post_mention'    then post_mentions
              when 'post_comment'    then post_comments
              when 'session_joined'  then session_players
              when 'session_left'    then session_players
              when 'session_invite'  then session_invites
              else true
            end
       from notification_settings where user_id = recipient),
    true) into allowed;

  if not allowed then
    return;
  end if;

  insert into notifications (user_id, kind, actor_id, post_id)
  values (recipient, n_kind, actor, post)
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------
--  Live, like the rest of the card.
--
--  REPLICA IDENTITY FULL is not needed: post_id is part of the
--  primary key, so a DELETE event already carries the column the
--  subscription filters on. Same reasoning as session_players in 41.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'No supabase_realtime publication here — skipping.';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_invites'
  ) then
    raise notice 'session_invites is already published.';
  else
    alter publication supabase_realtime add table public.session_invites;
    raise notice 'session_invites added to realtime.';
  end if;
end $$;

-- ============================================================
--  Done.
-- ============================================================
