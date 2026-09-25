-- ============================================================
--  73 — Commend anyone, from their profile. Once a month per player.
--
--  Until now a commendation needed a session you'd both been in, and
--  the same pair could repeat it weekly. MARZ's change:
--
--    - You can commend any player from their profile, whether or not
--      you've played together.
--    - One commendation per player per 30 days — whichever way you
--      give it. A profile commendation and a session one share the
--      same cooldown, so the session button can't be used to get a
--      second one in.
--
--  The session route (commend(other, session)) stays exactly as it
--  was apart from the cooldown: after a session starts, the people in
--  it can still commend each other from the session card.
--
--  WHAT STAYS THE SAME
--    - +1 to the count, +5 to standing (capped at 100), as before.
--    - Nobody can see who commended them.
--    - Not yourself, not anyone you've blocked or who's blocked you,
--      not a banned player (is_blocked covers banned since 61).
--    - Two clicks at once can't both land (advisory lock per pair).
--
--  NEW
--    - A suspended (banned) account can't give commendations. The
--      session route never checked this; now both do.
--
--  Run in the Supabase SQL Editor, BEFORE pushing — the new app calls
--  commend_player() and commend_status(), which don't exist until this
--  runs. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The cooldown, in one place.
-- ------------------------------------------------------------
create or replace function public.commend_cooldown()
returns interval
language sql
immutable
as $$ select interval '30 days' $$;


-- ------------------------------------------------------------
--  2. The one place a commendation is written.
--
--  Internal: nobody can call this directly (grants revoked below).
--  commend() and commend_player() do their own route-specific checks
--  and then hand over to this, so the cooldown, the lock and the
--  standing repair can't drift apart between the two routes.
--
--  Returns 'commended' or 'already' (cooldown still running).
-- ------------------------------------------------------------
create or replace function public.give_commendation(other uuid, session bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  repair   int  := 5;
  last_one timestamptz;
begin
  if me is null then
    raise exception 'Sign in to commend players';
  end if;

  if other is null or other = me then
    raise exception 'You cannot commend yourself';
  end if;

  if public.is_banned(me) then
    raise exception 'This account is suspended.'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.profiles where id = other) then
    raise exception 'That player does not exist';
  end if;

  -- Blocking runs both ways, and covers banned players.
  if public.is_blocked(other) then
    raise exception 'You cannot commend that player';
  end if;

  -- Serialise this pair: the check below reads then writes, and two
  -- clicks at the same moment would otherwise both get through.
  perform pg_advisory_xact_lock(
    hashtext(least(me::text, other::text)),
    hashtext(greatest(me::text, other::text))
  );

  select max(c.created_at) into last_one
    from public.commendations c
   where c.from_id = me and c.to_id = other;

  if last_one is not null and last_one > now() - public.commend_cooldown() then
    return 'already';
  end if;

  insert into public.commendations (from_id, to_id, post_id)
  values (me, other, session);

  update public.profiles
     set commendation_count = commendation_count + 1,
         rating = least(100, rating + repair)
   where id = other;

  return 'commended';
end;
$$;


-- ------------------------------------------------------------
--  3. From a session — same checks as 65, shared writer.
-- ------------------------------------------------------------
create or replace function public.commend(other uuid, session bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  post record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to commend players';
  end if;

  select p.id, p.author_id, p.kind, p.starts_at
    into post
    from public.posts p
   where p.id = session;

  if not found or post.kind <> 'session' then
    raise exception 'That session does not exist';
  end if;

  if post.starts_at is null or post.starts_at > now() then
    raise exception 'You can commend people once the session has started';
  end if;

  if not (
    auth.uid() = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = auth.uid())
  ) then
    raise exception 'You were not in that session';
  end if;

  if not (
    other = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = other)
  ) then
    raise exception 'They were not in that session';
  end if;

  return public.give_commendation(other, post.id);
end;
$$;


-- ------------------------------------------------------------
--  4. From a profile. No session needed.
-- ------------------------------------------------------------
create or replace function public.commend_player(other uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.give_commendation(other, null);
end;
$$;


-- ------------------------------------------------------------
--  5. Can I commend this player right now?
--
--  For the profile button. Returns one row:
--    can_commend   true when the button should be live
--    available_at  when the cooldown lifts; null when it isn't running
--  No rows for signed-out callers.
-- ------------------------------------------------------------
drop function if exists public.commend_status(uuid);

create function public.commend_status(other uuid)
returns table (can_commend boolean, available_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me   uuid := auth.uid();
  last timestamptz;
begin
  if me is null then
    return;
  end if;

  if other is null or other = me
     or public.is_banned(me)
     or public.is_blocked(other)
     or not exists (select 1 from public.profiles where id = other) then
    can_commend := false;
    available_at := null;
    return next;
    return;
  end if;

  select max(c.created_at) into last
    from public.commendations c
   where c.from_id = me and c.to_id = other;

  if last is not null and last > now() - public.commend_cooldown() then
    can_commend := false;
    available_at := last + public.commend_cooldown();
  else
    can_commend := true;
    available_at := null;
  end if;

  return next;
end;
$$;


-- ------------------------------------------------------------
--  6. The session card's list — same shape as 65, 30-day cooldown.
-- ------------------------------------------------------------
create or replace function public.session_commendables(session bigint)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  commended     boolean,
  available_at  timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  post record;
begin
  select p.id, p.author_id, p.kind, p.starts_at
    into post
    from public.posts p
   where p.id = session;

  if not found or post.kind <> 'session' then
    return;
  end if;

  if post.starts_at is null or post.starts_at > now() then
    return;
  end if;

  if not (
    auth.uid() = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = auth.uid())
  ) then
    return;
  end if;

  return query
  with roster as (
    select post.author_id as id
    union
    select sp.user_id from public.session_players sp where sp.post_id = post.id
  )
  select
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.avatar_preset,
    (last.at is not null and last.at > now() - public.commend_cooldown()),
    case when last.at is not null and last.at > now() - public.commend_cooldown()
         then last.at + public.commend_cooldown() end
  from roster r
  join public.profiles pr on pr.id = r.id
  left join lateral (
    select max(c.created_at) as at
      from public.commendations c
     where c.from_id = auth.uid() and c.to_id = pr.id
  ) last on true
  where r.id <> auth.uid()
    and not public.is_blocked(r.id)
  order by pr.username;
end;
$$;


-- ------------------------------------------------------------
--  7. Who can call what.
-- ------------------------------------------------------------
revoke all on function public.give_commendation(uuid, bigint) from public;
revoke all on function public.commend_player(uuid)            from public;
revoke all on function public.commend_status(uuid)            from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.give_commendation(uuid, bigint) from anon';
    execute 'revoke all on function public.commend_player(uuid) from anon';
    execute 'revoke all on function public.commend_status(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.give_commendation(uuid, bigint) from authenticated';
  end if;
end $$;

grant execute on function public.commend(uuid, bigint)         to authenticated;
grant execute on function public.commend_player(uuid)          to authenticated;
grant execute on function public.commend_status(uuid)          to authenticated;
grant execute on function public.session_commendables(bigint)  to authenticated;


-- ------------------------------------------------------------
--  8. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Commend anyone',
     'You can now commend a player straight from their profile, not just after a session together. It''s once per player per month, however you give it.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
--
--  Tuning: commend_cooldown() (30 days) and the repair of 5 in
--  give_commendation(). Penalties are in apply_moderation_penalty (67).
-- ============================================================
