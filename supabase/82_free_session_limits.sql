-- ============================================================
--  82 — Session limits for free accounts. Pentra Pro has none.
--
--  MARZ: "free memberships can only post and host one session at a
--  time. They can join up to 3 at one time. Pro members can post/host
--  as many as they would like and can join as many as they would like."
--
--  Decided with him (2026-10-01):
--    - Hosting and joining are counted SEPARATELY: a free player can
--      host 1 and be in 3 others at the same time.
--    - Built behind a switch. Pro can't be bought yet, so the limits
--      stay OFF until the feature flag `free_session_limits` is turned
--      on in DevPanel → Flags (for testers first, then for everyone,
--      the day Pro goes on sale).
--
--  WHAT "AT ONE TIME" MEANS
--    Upcoming: sessions that haven't started yet. Once a session's start
--    time passes, nobody can join it or be added to it any more (17), so
--    it stops counting and the slot frees up.
--
--  WHO IS LIMITED
--    Someone for whom the flag is on, who is NOT Pro (has_plus, 10).
--    Developers are permanent Pro (77), so never limited. The service
--    role (seed scripts, future billing) is never limited.
--    Pro running out later doesn't take sessions away; it only stops
--    new ones until they're back under the limit.
--
--  WHERE IT'S ENFORCED
--    In the database, on every way in:
--      - hosting:  a trigger on posts (create_post, or a direct insert,
--                  or moving an old session's time into the future)
--      - joining:  a trigger on session_players — Join, accepting an
--                  invite, the host seating a friend, a direct insert.
--    join_session() and accept_session_invite() also check first and
--    return 'limit', so the card can say something useful instead of
--    showing an error. The triggers are the backstop.
--
--  Run in the Supabase SQL Editor BEFORE pushing (the app calls
--  my_session_limits()). Nothing changes for anyone until the flag is
--  turned on. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The switch. Off for everyone; DevPanel → Flags turns it on.
-- ------------------------------------------------------------
insert into public.feature_flags (key, description, enabled_for_all)
values (
  'free_session_limits',
  'Free accounts: host 1 and join 3 upcoming sessions at a time. Pentra Pro: unlimited. Turn on for everyone when Pro goes on sale.',
  false
)
on conflict (key) do nothing;


-- ------------------------------------------------------------
--  2. The numbers, in one place.
-- ------------------------------------------------------------
create or replace function public.free_host_limit()
returns int language sql immutable as $$ select 1 $$;

create or replace function public.free_join_limit()
returns int language sql immutable as $$ select 3 $$;


-- ------------------------------------------------------------
--  3. Does the limit apply to this person right now?
-- ------------------------------------------------------------
create or replace function public.session_limits_apply(who uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select who is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and exists (
       select 1 from feature_flags f
        where f.key = 'free_session_limits'
          and (f.enabled_for_all
               or exists (select 1 from flag_testers t
                           where t.flag_key = f.key and t.user_id = who))
     )
     and not public.has_plus(who);
$$;


-- ------------------------------------------------------------
--  4. The counts. Upcoming only; joined excludes sessions you host.
-- ------------------------------------------------------------
create or replace function public.upcoming_hosted(who uuid, except_post bigint default null)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
    from posts p
   where p.author_id = who
     and p.kind = 'lfg'
     and p.starts_at > now()
     and p.id is distinct from except_post;
$$;

create or replace function public.upcoming_joined(who uuid)
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
    from session_players sp
    join posts p on p.id = sp.post_id
   where sp.user_id = who
     and p.author_id <> who
     and p.kind = 'lfg'
     and p.starts_at > now();
$$;


-- The caller's own answer, for join_session() (which runs as the
-- caller, so can't reach the helpers above directly). Answers only
-- about yourself.
create or replace function public.at_join_limit()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.session_limits_apply(auth.uid())
     and public.upcoming_joined(auth.uid()) >= public.free_join_limit();
$$;


-- ------------------------------------------------------------
--  5. For the app: where do I stand?
--
--  `limited` false means no limits apply (flag off, or Pro) and the
--  app shows nothing. The counts are still filled in.
-- ------------------------------------------------------------
drop function if exists public.my_session_limits();

create function public.my_session_limits()
returns table (
  limited    boolean,
  hosting    int,
  host_limit int,
  joined     int,
  join_limit int
)
language sql
security definer
set search_path = public
stable
as $$
  select public.session_limits_apply(auth.uid()),
         public.upcoming_hosted(auth.uid()),
         public.free_host_limit(),
         public.upcoming_joined(auth.uid()),
         public.free_join_limit()
   where auth.uid() is not null;
$$;


-- ------------------------------------------------------------
--  6. Hosting: the trigger on posts.
--
--  Fires on a new session, and on an existing one whose time or kind
--  changes (so an old session can't be moved into the future to get
--  round the limit). A session that has already started is ignored —
--  it doesn't count and isn't counted.
-- ------------------------------------------------------------
create or replace function public.enforce_host_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'lfg' or new.starts_at is null or new.starts_at <= now() then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.kind = new.kind
     and old.starts_at is not distinct from new.starts_at then
    return new;
  end if;

  if not public.session_limits_apply(new.author_id) then
    return new;
  end if;

  -- One at a time per person, so two posts sent at the same instant
  -- can't both see zero.
  perform pg_advisory_xact_lock(hashtext('pentra.host_limit'), hashtext(new.author_id::text));

  if public.upcoming_hosted(new.author_id, new.id) >= public.free_host_limit() then
    raise exception 'Free accounts can host % upcoming session at a time. Pentra Pro has no limit.',
      public.free_host_limit()
      using errcode = 'check_violation',
            hint = 'session_host_limit';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_enforce_host_limit on public.posts;
create trigger posts_enforce_host_limit
  before insert or update of starts_at, kind on public.posts
  for each row execute function public.enforce_host_limit();


-- ------------------------------------------------------------
--  7. Joining: the trigger on session_players.
--
--  The host's own seat (17 seats them automatically) is not a join.
--  The message names the player when it's someone else being added —
--  the host seating a friend who is already at their limit.
-- ------------------------------------------------------------
create or replace function public.enforce_join_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p    posts%rowtype;
  name text;
begin
  select * into p from posts where id = new.post_id;

  if p.id is null or p.kind <> 'lfg' or p.author_id = new.user_id
     or p.starts_at <= now() then
    return new;
  end if;

  if not public.session_limits_apply(new.user_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('pentra.join_limit'), hashtext(new.user_id::text));

  if public.upcoming_joined(new.user_id) >= public.free_join_limit() then
    if new.user_id = auth.uid() then
      raise exception 'Free accounts can be in % upcoming sessions at a time. Leave one, or go Pentra Pro for no limit.',
        public.free_join_limit()
        using errcode = 'check_violation',
              hint = 'session_join_limit';
    else
      select username into name from profiles where id = new.user_id;
      raise exception '@% is already in % upcoming sessions, the most a free account can join at once.',
        coalesce(name, 'That player'), public.free_join_limit()
        using errcode = 'check_violation',
              hint = 'session_join_limit';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_enforce_join_limit on public.session_players;
create trigger session_players_enforce_join_limit
  before insert on public.session_players
  for each row execute function public.enforce_join_limit();


-- ------------------------------------------------------------
--  8. Join and Accept answer 'limit' instead of raising.
--
--  The bodies from 43, unchanged except for the one check before the
--  insert. The trigger above would stop it anyway; this is so the
--  card gets a word it can explain.
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

  -- Our own held slot is the one we are about to fill, so it does not
  -- count against us. Subtracted rather than deleted — see 43.
  taken := public.session_taken(post) - 1;

  if taken >= p.slots then
    -- Somebody got there first. Give the slot up; a promise about a
    -- slot that no longer exists is not worth keeping.
    delete from session_invites where post_id = post and invitee_id = me;
    return 'full';
  end if;

  -- 82: free accounts' join limit. The invite is kept — they may leave
  -- another session and come back to accept this one.
  if public.at_join_limit() then
    return 'limit';
  end if;

  -- The insert clears the invite, via the trigger in 42.
  insert into session_players (post_id, user_id) values (post, me);
  return 'joined';
end;
$$;

grant execute on function public.accept_session_invite(bigint) to authenticated;


create or replace function public.join_session(post bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  p     posts%rowtype;
  taken int;
  held  boolean;
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

  -- Pressing Join while holding an invite is the same act as pressing
  -- Accept. The slot you are holding is the slot you are taking, so it
  -- doesn't count against you — and leaving the invite in place until
  -- the insert is what lets whoever sent it get the credit.
  held := exists (
    select 1 from session_invites
    where post_id = post and invitee_id = auth.uid()
  );

  taken := public.session_taken(post) - case when held then 1 else 0 end;

  if taken >= p.slots then
    return 'full';
  end if;

  -- 82: free accounts' join limit.
  if public.at_join_limit() then
    return 'limit';
  end if;

  insert into session_players (post_id, user_id) values (post, auth.uid());
  return 'joined';
end;
$$;

grant execute on function public.join_session(bigint) to authenticated;


-- ------------------------------------------------------------
--  9. Grants. The helpers are internal; only the status call is for
--     the app.
-- ------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.session_limits_apply(uuid)',
    'public.upcoming_hosted(uuid, bigint)',
    'public.upcoming_joined(uuid)',
    'public.my_session_limits()',
    'public.at_join_limit()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
  end loop;
end $$;

grant execute on function public.my_session_limits() to authenticated;
grant execute on function public.at_join_limit()     to authenticated;

-- ============================================================
--  Done. No What's New entry yet: nothing changes for anyone until the
--  flag is on. Write one (DevPanel → News) the day you turn it on for
--  everyone, alongside the Pentra Pro launch.
--
--  Check (read-only):
--    select key, enabled_for_all from public.feature_flags
--     where key = 'free_session_limits';
-- ============================================================
