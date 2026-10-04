-- ============================================================
--  99 — What's New line: signing out on a phone.
--
--  No schema change. Sign out lived only in the sidebar, which phones
--  don't show, so there was no way to sign out on a phone. Settings
--  now has an Account card with a Sign out button, on phones only
--  (src/pages/Settings.tsx).
--
--  Run BEFORE pushing (see 71). Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Sign out on phones',
     'On a phone, Sign out is now at the bottom of Settings, just above Delete account.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
