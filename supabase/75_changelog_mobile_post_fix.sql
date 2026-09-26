-- ============================================================
--  75 — What's New line for the phone composer fix.
--
--  No schema change. On a phone, tagging a game with a long name
--  pushed the Photo and Post buttons off the edge of the screen, so a
--  session with a game couldn't be posted. The button row now wraps
--  (src/pages/Home.tsx).
--
--  Run BEFORE pushing (see 71). Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Posting on phones',
     'Tagging a game with a long name no longer pushes the Post button off the screen on phones.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
