-- ============================================================
--  98 — What's New line: phones aren't offered the Mac download.
--
--  No schema change. An iPhone's browser describes itself as "like
--  Mac OS X", so pentra.gg on an iPhone led with the Mac download.
--  detectOS() now checks for a phone or tablet first
--  (src/lib/platform.ts).
--
--  Same push also adds the groundwork for the iPhone app (Capacitor,
--  ios/), which isn't released yet and so gets no line of its own.
--
--  Run BEFORE pushing (see 71). Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Home page on phones',
     'Opening pentra.gg on a phone no longer offers you the Mac download.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
