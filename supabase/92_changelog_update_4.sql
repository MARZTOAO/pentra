-- ============================================================
--  92 — What's New for everything shipped since late September.
--
--  MARZ (2026-10-03): "the update list hasn't included many of the
--  updates we've done." Correct — the entries were never written. The
--  dialog only shows rows in changelog_entries, and those are written
--  by a person on purpose, so when features ship without a line the
--  dialog is silent. This is the third catch-up file (57, 68, now 92).
--
--  Ten entries, player-facing wording only. Developer-only work
--  (developer mode, seeded tags, the Developer page, ad posting) is
--  deliberately not announced — nobody else can see it.
--
--  Two entries are guarded more loosely than by exact title:
--    - "Pentra Pro is here" is skipped if ANY entry already mentions
--      Pentra Pro, in case one was typed into DevPanel → news on
--      launch day under a different title.
--    - Otherwise an entry whose exact title exists is skipped, so
--      running this twice announces nothing twice.
--
--  ORDER MATTERS (71): entries only show to builds made AFTER they
--  were written. Run this FIRST, then push. If the last push already
--  went out, run this and then push anything — the next build picks
--  them up.
--
--  Run in the Supabase SQL Editor. Re-runnable.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Pentra Pro is here',
     'Pro gets you a gold badge, avatar frames, moving backgrounds, exclusive avatars and backgrounds, and no limits on sessions. $5.99 a month, or $4.99 a month billed yearly, cancel any time, and promo codes are entered at checkout. Find it under Pentra Pro in the sidebar.',
     'feature', 1),
    ('Profile tabs and an activity feed',
     'Stats and achievements now live on their own tabs, so a profile opens on the player. Below the Top 5 and tags is their activity: posts they made, sessions they host or joined, and posts they were tagged in.',
     'feature', 1),
    ('Bigger text everywhere',
     'Everything in Pentra is now a quarter larger and easier to read, on desktop and on phones.',
     'improvement', 1),
    ('Your profile, as others see it',
     'The Profile tab now opens your public profile. Tap the gear to edit it.',
     'improvement', 2),
    ('One Save button',
     'Editing your profile has a single Save at the bottom instead of one per section. Leaving with unsaved changes asks whether to save them.',
     'improvement', 2),
    ('Session limits for free accounts',
     'Free accounts can host one upcoming session and join three at a time. Pentra Pro has no limit.',
     'improvement', 2),
    ('Test your desktop notifications',
     'Settings → Notifications has a Send a test notification button, so you can check Windows is showing them without waiting for a message.',
     'improvement', 2),
    ('Ads you can look at',
     'Tap a sponsored picture or video to see it large, with an × to close. Visiting the advertiser is a separate Visit button, so looking never opens a website.',
     'improvement', 3),
    ('Type your password twice',
     'Signing up now asks for the password twice and checks they match, so a typo can''t lock you out of a new account.',
     'improvement', 3),
    ('Menus no longer run off the edge on phones',
     'Dropdowns like the background and avatar pickers stayed within the screen on desktop but spilled off the right edge on phones. Fixed.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
)
and not (
  v.title = 'Pentra Pro is here'
  and exists (select 1 from public.changelog_entries c where c.title ilike '%pentra pro%')
);

-- How many landed:
--   select count(*) from public.changelog_entries
--    where shipped_at > now() - interval '10 minutes';
