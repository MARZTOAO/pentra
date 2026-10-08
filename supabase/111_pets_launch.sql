-- ============================================================
--  111 — Pentra Pets goes live: the What's New line.
--
--  No schema change. Run this ONLY when the `pets` flag is switched
--  on for everyone (DevPanel → Flags → pets → on for all). Until then
--  the feature is invisible and this line would confuse people.
--
--  Order on launch day: flip the flag, then run this. Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Pentra Pets',
     'There''s an egg on your profile. It hatches into one of ten pets after your first session. Feed it, play with it, and it grows through three stages as you use Pentra: sessions, commendations and the Arcade all count. Friends can cheer it up when they visit. Want a different one? Trade it for a new egg once a month, or any time with Pentra Pro.',
     'feature', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
