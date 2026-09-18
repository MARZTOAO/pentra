-- ============================================================
--  "Primarily plays on"
--  Run this in the Supabase SQL Editor, THEN re-run 06_matching.sql
--  so the scoring picks up the new signal.
--
--  This is separate from `platforms` on purpose. Owning an Xbox and
--  mostly playing on it are different facts, and the second one is
--  what actually predicts whether two people end up in a game
--  together. Someone with five platforms listed matches almost
--  everyone on platform; their primary narrows it to what's true.
-- ============================================================

alter table public.profiles
  add column if not exists primary_platform text;

alter table public.profiles
  drop constraint if exists primary_platform_length;
alter table public.profiles
  add constraint primary_platform_length
  check (char_length(primary_platform) <= 40);

-- ============================================================
--  Done. Now re-run 06_matching.sql.
-- ============================================================
