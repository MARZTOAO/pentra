-- ============================================================
--  107 — What's New line: the Support page (October 7, 2026).
--
--  No schema change. pentra.gg/#/support (src/pages/Support.tsx):
--  how to reach us, and answers to the common questions (signing in,
--  deleting an account, report and block, Pro refunds, notifications,
--  giveaways, creator partnerships). Linked from the site footer.
--
--  Run BEFORE pushing (see 71). Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('New Support page',
     'Questions about your account, Pentra Pro, notifications or giveaways? The new Support page at pentra.gg/#/support has the answers, and how to reach us.',
     'improvement', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
