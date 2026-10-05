-- ============================================================
--  103 — What's New line: privacy policy updated (October 5, 2026).
--
--  No schema change. The privacy page (src/pages/Legal.tsx) now covers
--  what was added recently and fixes one contradiction:
--    - push tokens for the iPhone app, and Apple delivering pushes
--    - Cloudflare's bot check on the sign-up page
--    - photos and videos on posts, gamer tags, arcade scores
--    - "payment details" → "card details" (Stripe holds the card;
--      we keep the subscription and payment records, as it says)
--  The page promises changes are announced here.
--
--  Run BEFORE pushing (see 71). Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Privacy policy updated',
     'The privacy page now covers push notifications on iPhone, the bot check on sign-up, and photos on posts. Nothing new is collected from you on the website or the desktop app.',
     'improvement', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
