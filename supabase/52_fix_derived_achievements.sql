-- ============================================================
--  52 — FIX: achievements on derived stats never fired.
--
--  Symptom: add 25 games to your library and Collector does not
--  unlock. No badge, no toast. Then do something unrelated — post,
--  comment, like anything — and it appears instantly.
--
--  THE CAUSE. award_threshold_achievements() is called from exactly
--  one place: a trigger on profile_stats. That was fine when every
--  achievement read a stored counter, because every counter is
--  written through that table.
--
--  It stopped being fine in 45, which added achievements on stats
--  that are COMPUTED at read time rather than stored:
--
--    games_owned            counted from game_library
--    distinct_games_played  counted from session_attendance + posts
--    week_streak            derived from attendance dates
--    days_member            derived from profiles.created_at
--
--  None of those touch profile_stats when they change. Adding a game
--  writes to game_library and nothing else, so nothing ever checks.
--  The achievement sits there, earned in fact and unawarded in the
--  database, until some unrelated action bumps a counter and the
--  check runs for a different reason entirely.
--
--  Reproduced exactly: 25 games added, Collector not awarded; one
--  no-op write to profile_stats, Collector awarded.
--
--  days_member is the pure case and shows why a trigger alone cannot
--  finish the job: nothing at all happens in the database on the
--  anniversary of somebody signing up. Time passing is not an event.
--  So there is also an RPC the app calls when it loads, which is both
--  the answer for time-based achievements and a safety net for every
--  other derived one.
--
--  Run in the Supabase SQL Editor, after 51.
-- ============================================================


-- ------------------------------------------------------------
--  Adding a game.
--
--  Cheap enough to hang off every insert: since 48 the check is one
--  join against a single snapshot rather than a loop of queries —
--  measured at 0.15ms on 18,000 attendance rows.
-- ------------------------------------------------------------
create or replace function public.library_check_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_threshold_achievements(new.user_id);
  return new;
end;
$$;

drop trigger if exists game_library_award on public.game_library;
create trigger game_library_award
  after insert on public.game_library
  for each row execute function public.library_check_achievements();


-- ------------------------------------------------------------
--  Turning up to a session.
--
--  Two things change here, and the second is the one that was being
--  missed. The joiner's own distinct_games_played and week_streak
--  move — but so does everybody ELSE's played_with, because a new
--  person in the session is a new person they have played with. The
--  host especially: their stats are not touched by somebody else
--  joining, so their Mixer achievements were waiting on them to go
--  and do something unrelated.
-- ------------------------------------------------------------
create or replace function public.attendance_check_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  perform public.award_threshold_achievements(new.user_id);

  for other in
    select a.user_id
      from session_attendance a
     where a.post_id = new.post_id
       and a.user_id <> new.user_id
  loop
    perform public.award_threshold_achievements(other);
  end loop;

  return new;
end;
$$;

drop trigger if exists attendance_award on public.session_attendance;
create trigger attendance_award
  after insert on public.session_attendance
  for each row execute function public.attendance_check_achievements();


-- ------------------------------------------------------------
--  The one a trigger cannot do.
--
--  Nothing happens in the database when somebody's account turns a
--  year old, or when a new week begins and their streak becomes 12
--  weeks long. There is no row to hang a trigger on, because the
--  event is the calendar.
--
--  So the app calls this when it loads. It is also the backstop for
--  everything else here: if a derived stat ever changes by a route
--  nobody thought to add a trigger for, this catches it on the next
--  visit rather than never.
--
--  Safe to call as often as we like — the insert is guarded by the
--  primary key on profile_achievements, so a repeat call writes
--  nothing.
-- ------------------------------------------------------------
create or replace function public.check_my_achievements()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  perform public.award_threshold_achievements(auth.uid());
end;
$$;

grant execute on function public.check_my_achievements() to authenticated;


-- ------------------------------------------------------------
--  And award what everybody is already owed.
--
--  Anybody who added games, played a variety of them or passed an
--  anniversary since 45 shipped has been quietly owed these.
-- ------------------------------------------------------------
do $$
declare
  person uuid;
begin
  for person in select id from profiles loop
    perform public.award_threshold_achievements(person);
  end loop;
end $$;

-- ============================================================
--  Done.
-- ============================================================
