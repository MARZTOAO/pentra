-- ============================================================
--  97. Hot Swap — the match-three.
--
--  MARZ (2026-10-05): "add a Bejeweled style game. This should track
--  scores and have a leaderboard. Come up with a unique name."
--
--  A row in arcade_games (93); scores, leaderboards and the profile
--  card work from the slug. Sixty-second rounds; 10 a chip, more for
--  cascades and long lines. Excellent play lands in the low thousands
--  a round, so 300 a second over the run is far beyond honest play
--  while leaving room for a lucky board.
--
--  Run in the Supabase SQL Editor BEFORE pushing (carries the What's
--  New entry, per 71). Re-runnable.
-- ============================================================

insert into public.arcade_games (slug, name, tagline, max_per_second, sort_order)
values ('hot-swap', 'Hot Swap',
        'Swap two chips to line up three. Cascades pay double. Sixty seconds.',
        300, 4)
on conflict (slug) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      max_per_second = excluded.max_per_second,
      sort_order = excluded.sort_order;

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('New in the Arcade: Hot Swap',
     'A sixty-second match-three. Swap two chips to line up three or more; chains that fall into place on their own score more each step. Friends and global leaderboards, and your best on your profile.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
