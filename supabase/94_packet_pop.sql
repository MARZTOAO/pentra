-- ============================================================
--  94. Packet Pop — the second arcade game.
--
--  MARZ (2026-10-04): "an infinite bubble blaster game (match colors
--  to break chains and earn score … include leaderboards as well."
--
--  Nothing new structurally: 93 built the Arcade so that a game is a
--  row in arcade_games plus code in the app. This adds the row. The
--  scores, leaderboards and profile card all work from the slug.
--
--  max_per_second: Packet Pop pays 10 a popped bubble and 20 a
--  dropped one, so a lucky shot that drops twenty bubbles is 400+ in
--  a second. 400/s on average over a whole run is far beyond honest
--  play (good players average well under 50/s) while leaving that
--  one big shot room, since the check is over the run's total time.
--
--  Run in the Supabase SQL Editor BEFORE pushing (carries the What's
--  New entry, per 71). Re-runnable.
-- ============================================================

insert into public.arcade_games (slug, name, tagline, max_per_second, sort_order)
values ('packet-pop', 'Packet Pop',
        'Match three to pop. Drop what''s left hanging. New rows keep coming.',
        400, 2)
on conflict (slug) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      max_per_second = excluded.max_per_second,
      sort_order = excluded.sort_order;

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('New in the Arcade: Packet Pop',
     'A bubble shooter in Pentra colours. Aim, fire, match three to pop them, and drop whatever''s left hanging for double points. New rows keep coming, faster as you go. Friends and global leaderboards, and your best on your profile.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
