-- ============================================================
--  96. Stack Trace: twenty-five levels in five tiers.
--
--  MARZ (2026-10-04): "I would rather have 5 difficulty levels and 5
--  levels in each one, with progression where you have to beat all
--  5 levels in one difficulty before you go to the next."
--
--  The levels live in the app (src/arcade/stackTrace.ts); the
--  database already allows levels 1–100 (95), so nothing structural
--  changes. This corrects the two places that said "ten": the game's
--  tagline and the What's New line from 95, whether or not 95 has
--  run yet (an entry that isn't there is simply not updated).
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

update public.arcade_games
   set tagline = 'Clear the stack, one matching pair at a time. Five tiers, Casual to Brutal. No clock but your own.'
 where slug = 'stack-trace';

update public.changelog_entries
   set body = 'A relaxed tile-matching game. Find pairs of free tiles to clear the stack, across twenty-five levels in five tiers from Casual to Brutal — clear a tier to unlock the next. Your progress is saved, so you pick up where you left off, and your best time for each level is on your profile.'
 where title = 'New in the Arcade: Stack Trace';
