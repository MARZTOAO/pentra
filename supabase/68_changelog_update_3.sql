-- ============================================================
--  68 — What's New for everything shipped 22-23 September.
--
--  Eleven entries: commendations, standing, message reports, password
--  reset and change, the text filter, email confirmation, and three
--  desktop fixes. Player-facing wording only — nothing internal like
--  Resend, migration numbers or penalty sizes.
--
--  WHY THIS IS A FILE AND NOT THE DEVPANEL BOX. Eleven at once is a
--  lot of typing into a form, and a file keeps a record of what was
--  announced. For one or two entries in future, use DevPanel → news.
--
--  Re-runnable: an entry whose title already exists is skipped, so
--  running this twice does not announce anything twice.
--
--  Everyone who has dismissed the dialog before now will see these on
--  their next visit. Brand-new accounts will not — their marker is set
--  at signup, by design, so nobody gets a history lesson on day one.
--
--  Run in the Supabase SQL Editor. Order does not matter.
-- ============================================================

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Commendations',
     'Played with someone good? Once a session starts, give them a thumbs-up. Everyone''s profile now shows how many commendations they''ve received.',
     'feature', 1),
    ('Player standing',
     'Every profile shows a standing badge. Everyone starts at 100. It only drops if a moderator upholds a report, and commendations from other players bring it back up.',
     'feature', 1),
    ('Report a message',
     'You can now report a single message in chat. A copy of what was said goes with the report, so it can be reviewed without anyone having to ask you.',
     'feature', 1),
    ('Forgot your password?',
     'Locked out? Use the link on the login screen and we''ll email you a way to set a new password.',
     'feature', 1),
    ('Change your password',
     'Settings has a new Password section. Changing it signs you out on every other device, so an old session can''t hang around.',
     'feature', 2),
    ('Commendation badges',
     'Seven new achievements for commendations received, from your first one all the way up to 10,000.',
     'feature', 2),
    ('Safer profiles and posts',
     'Slurs and hate speech are blocked in profiles, posts and comments. Swearing is still fine in posts, just not in usernames or gamer tags.',
     'improvement', 1),
    ('Confirm your email',
     'New accounts confirm their email address before they start. It keeps fake accounts and typo''d addresses out.',
     'improvement', 2),
    ('Unread dot on the tray icon',
     'On the desktop app, the Pentra icon in your tray shows a dot when something''s unread. Hover it for the count.',
     'improvement', 2),
    ('Messages that don''t slip through',
     'If your connection drops for a moment, messages sent in the gap now still reach you as a notification instead of going unannounced.',
     'improvement', 2),
    ('One Pentra at a time',
     'Opening Pentra while it''s already running in the tray now brings the window back, instead of starting a second copy.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- How many landed:
--   select count(*) from public.changelog_entries
--    where shipped_at > now() - interval '10 minutes';
