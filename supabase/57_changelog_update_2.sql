-- ============================================================
--  57 — the second What's New post.
--
--  Everything shipped since the twenty entries seeded in 49, which
--  is migrations 50 through 56 and the app changes that go with them.
--
--  RUN THIS LAST. `shipped_at` defaults to the moment this runs, and
--  the dialog shows people everything newer than their last sign-in —
--  so announcing a feature before its own migration is applied means
--  telling people about something that is not there yet. Run 50 to 56
--  first, then deploy the app, then run this.
--
--  Weights, as in 49: 1 is a headline, 2 is worth mentioning, 3 is a
--  footnote. The dialog caps at twenty and ranks by weight rather
--  than date, so somebody who has been away a month gets the big
--  things rather than the most recent ones.
--
--  Re-running this file adds nothing: each entry is guarded on its
--  own title.
-- ============================================================

do $$
declare
  added int := 0;
begin

  -- ----------------------------------------------------------
  --  Headlines.
  -- ----------------------------------------------------------
  if not exists (select 1 from public.changelog_entries
                  where title = 'Match percentage on profiles') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Match percentage on profiles',
     'Open anybody''s profile and see how well the two of you match, with the reason under it. Worked out fresh every time from both Top 5s, libraries, platforms and when you are each around — so it moves as either of you does.',
     'feature', 1);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Sessions say what system, and whether mics are needed') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Sessions say what system, and whether mics are needed',
     'Hosting one now asks which platform you will be on, and whether headsets are not needed, recommended or required. Both show on the session card, so you know what you are walking into before you take a slot.',
     'feature', 1);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Achievement unlocked') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Achievement unlocked',
     'Earning one now says so: a panel at the bottom of the screen with the badge''s name, and a sound of its own. Unlock several at once and they arrive together rather than queueing up.',
     'feature', 1);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Game search that forgives') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Game search that forgives',
     'pokemon, assassins creed, marvels spiderman, helldivers2, witcher wild hunt, final fantasy 7, gta, botw and even cyberbunk all find the right game now. Accents, apostrophes, missing spaces, word order, roman numerals, abbreviations and typos.',
     'improvement', 1);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Delete your account') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Delete your account',
     'At the bottom of Settings. It takes your profile, posts, comments, messages, sessions and friendships with it, permanently and with no grace period — keeping a copy for a few weeks would not really be deleting it.',
     'feature', 1);
    added := added + 1;
  end if;

  -- ----------------------------------------------------------
  --  Worth mentioning.
  -- ----------------------------------------------------------
  if not exists (select 1 from public.changelog_entries
                  where title = 'Also plays holds 28 games') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Also plays holds 28 games',
     'Up from 20. There is a badge for a library of 25, which nobody could have reached at the old limit.',
     'improvement', 2);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Achievements appear the moment you earn them') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Achievements appear the moment you earn them',
     'Your profile updates as badges unlock rather than on the next page load, and the ones that count days or weeks are checked whenever you open the app.',
     'improvement', 2);
    added := added + 1;
  end if;

  -- ----------------------------------------------------------
  --  Repairs.
  -- ----------------------------------------------------------
  if not exists (select 1 from public.changelog_entries
                  where title = 'Fixed: badges that count games and time never unlocked') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Fixed: badges that count games and time never unlocked',
     'Anything measuring your library, a weekly streak or how long you have been here was waiting on something that never happened. They work now, and everything you were already owed has been awarded.',
     'fix', 3);
    added := added + 1;
  end if;

  raise notice 'Changelog: % new entries added.', added;
end $$;

-- ============================================================
--  Done.
-- ============================================================
