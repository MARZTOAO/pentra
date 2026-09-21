-- ============================================================
--  51 — tell the app the moment an achievement is earned.
--
--  Achievements are awarded by triggers inside the database — the
--  stats change, award_threshold_achievements() runs, a row appears.
--  Nothing tells the browser, so without this the only way anybody
--  learns they earned something is by opening their profile and
--  noticing a badge that wasn't there before.
--
--  Publishing the table to realtime means the row's arrival IS the
--  message. No polling, and nothing to keep in sync.
--
--  REPLICA IDENTITY is left alone. The primary key is
--  (user_id, code), so an INSERT event carries both columns the app
--  filters and reads — which is all it needs. Deletions are not
--  interesting here: achievements are not taken away.
--
--  Row-level security applies to realtime too, and the read policy on
--  this table is `using (true)` — every earned achievement is public,
--  the same as the badges on a profile. So the user_id filter in the
--  subscription is what keeps somebody else's unlock off your screen,
--  not a privacy boundary. That is fine: it is public information
--  either way.
--
--  Run in the Supabase SQL Editor, after 50.
-- ============================================================

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
      and tablename = 'profile_achievements'
  ) then
    raise notice 'profile_achievements is already published.';
  else
    alter publication supabase_realtime add table public.profile_achievements;
    raise notice 'profile_achievements added to realtime.';
  end if;
end $$;

-- ============================================================
--  Done.
-- ============================================================
