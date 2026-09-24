-- ============================================================
--  72 — What's New line for faster update checks.
--
--  No schema change. The desktop app now looks for updates every
--  30 minutes and whenever its window comes back from the tray,
--  instead of at launch and every 6 hours (src/lib/updater.ts).
--
--  Run BEFORE pushing: since 71, an entry only appears in builds
--  made after it was written.
--
--  Run in the Supabase SQL Editor, after 71. Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Updates show up sooner',
     'The desktop app now checks for updates every half hour and whenever you open it from the tray, so new versions reach you within minutes instead of hours.',
     'improvement', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
