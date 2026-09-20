-- ============================================================
--  49 — "while you were gone".
--
--  A dialog on the first visit after something shipped, listing what
--  changed since that person was last shown one.
--
--  FOUR THINGS THAT DECIDE WHETHER THIS IS PLEASANT OR ANNOYING.
--
--  1. "Since you were last online" cannot mean last_seen_at. That
--     column (32_presence) updates constantly while somebody is using
--     the app, so by the time they look at anything it already says
--     now and nothing is ever new. This needs its own marker, moved
--     only when a dialog is actually dismissed.
--
--  2. A new account must not get a history lesson. Somebody who
--     signed up this morning did not miss the last six months, so the
--     marker is set at profile creation and they see nothing until
--     the next thing ships.
--
--  3. It must never collide with the welcome dialog. Two modals
--     stacked on a first run is how somebody decides an app is broken.
--     get_changelog() below returns nothing at all while
--     needs_welcome() is true, so the ordering is enforced in one
--     place rather than by hoping the components agree.
--
--  4. Somebody away for a year gets twenty, not two hundred. Ranked
--     by weight so it is the twenty BIGGEST rather than the twenty
--     most recent — a stack of typo fixes burying the feature they
--     came back for would be worse than showing nothing.
--
--  Entries are written from the SQL editor. There is no client write
--  path and no admin screen, which is the right amount of machinery
--  for something that gets a new row every few weeks.
--
--  Run in the Supabase SQL Editor, after 48.
-- ============================================================


-- ------------------------------------------------------------
--  The entries.
-- ------------------------------------------------------------
create table if not exists public.changelog_entries (
  id         bigint generated always as identity primary key,
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 300),

  -- 1 is a headline feature, 2 is worth mentioning, 3 is a footnote.
  -- This is what "top 20" sorts on: somebody who has been away a
  -- while should get the big things, not the recent ones.
  weight     int not null default 2 check (weight between 1 and 3),

  kind       text not null default 'feature'
               check (kind in ('feature', 'improvement', 'fix')),

  shipped_at timestamptz not null default now()
);

create index if not exists changelog_shipped_idx
  on public.changelog_entries (shipped_at desc);

alter table public.changelog_entries enable row level security;

drop policy if exists "changelog is readable" on public.changelog_entries;
create policy "changelog is readable"
  on public.changelog_entries for select
  to authenticated
  using (true);

-- No insert, update or delete policy. New entries are written from
-- the SQL editor, which is the honest amount of tooling for something
-- that changes every few weeks.


-- ------------------------------------------------------------
--  When each person last saw one.
--
--  Same shape as welcomed_at in 31, and added the same careful way so
--  re-running this file cannot stamp somebody who has not seen it.
--
--  Existing accounts are left NULL on purpose — they genuinely have
--  missed everything seeded below, and the whole point of the feature
--  is to catch them up. Accounts created from here on get the marker
--  set at birth by the trigger further down.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'profiles'
       and column_name  = 'changelog_seen_at'
  ) then
    alter table public.profiles add column changelog_seen_at timestamptz;
  end if;
end $$;


create or replace function public.seed_changelog_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nothing shipped before you arrived is news to you.
  new.changelog_seen_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_seed_changelog on public.profiles;
create trigger profiles_seed_changelog
  before insert on public.profiles
  for each row execute function public.seed_changelog_marker();


-- ------------------------------------------------------------
--  What did I miss?
--
--  Returns nothing at all when there is nothing to say, so the app
--  can treat "no rows" as "do not open a dialog" without a second
--  question.
--
--  `overflow` is how many more there were beyond the twenty, so the
--  dialog can end with an honest "and 14 more" instead of pretending
--  twenty was the whole story.
-- ------------------------------------------------------------
create or replace function public.get_changelog(max_results int default 20)
returns table (
  id         bigint,
  title      text,
  body       text,
  kind       text,
  weight     int,
  shipped_at timestamptz,
  overflow   int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  since  timestamptz;
  missed int;
begin
  if me is null then
    return;
  end if;

  -- Never on top of the welcome dialog. One modal at a time.
  if public.needs_welcome() then
    return;
  end if;

  select pr.changelog_seen_at into since
    from profiles pr where pr.id = me;

  select count(*) into missed
    from changelog_entries e
   where since is null or e.shipped_at > since;

  if missed = 0 then
    return;
  end if;

  return query
  select e.id, e.title, e.body, e.kind, e.weight, e.shipped_at,
         greatest(0, missed - max_results) as overflow
    from changelog_entries e
   where since is null or e.shipped_at > since
   -- Biggest first, and newest within a weight.
   order by e.weight, e.shipped_at desc
   limit max_results;
end;
$$;

grant execute on function public.get_changelog(int) to authenticated;


/**
 * Dismissed. Move the marker to now.
 *
 * Unconditional, unlike mark_welcomed() which keeps the first
 * timestamp: this one is meant to move every time.
 */
create or replace function public.mark_changelog_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update profiles
     set changelog_seen_at = now()
   where id = auth.uid();
end;
$$;

grant execute on function public.mark_changelog_seen() to authenticated;


-- ============================================================
--  The entries, as of today.
--
--  These are the things that actually shipped, not a sample. Dated
--  so that an account which has been away sees them in a sensible
--  order; weight 1 for the features somebody would notice, 3 for the
--  repairs that only matter because they were broken.
--
--  `on conflict` cannot help here — the id is generated — so the
--  insert is guarded instead, and re-running this file adds nothing.
-- ============================================================
do $$
begin
  if exists (select 1 from public.changelog_entries) then
    raise notice 'Changelog already seeded — leaving it alone.';
    return;
  end if;

  insert into public.changelog_entries (title, body, kind, weight, shipped_at) values

  -- The big ones.
  ('Achievements',
   'Forty badges on your profile, from your first post to a session every week for a year. Most were awarded retroactively, so yours should already have a few.',
   'feature', 1, now() - interval '1 hour'),

  ('Profile stats',
   'How long you have been here, sessions joined and hosted, how many different people you have played with, posts, comments and likes.',
   'feature', 1, now() - interval '2 hours'),

  ('Invite friends into a session',
   'Anyone in a session can invite a friend from the empty slots on the card. The slot is held until they answer.',
   'feature', 1, now() - interval '3 hours'),

  ('Comments on posts',
   'Reply to anything in the feed, tag friends in replies, and delete anything off your own posts.',
   'feature', 1, now() - interval '20 hours'),

  ('Notifications',
   'Friend requests, accepted requests, session reminders, tags, comments and people joining your sessions — with a per-kind settings screen and optional sound.',
   'feature', 1, now() - interval '30 hours'),

  ('Invite links',
   'Share a link to bring people to Pentra. It counts once somebody who used it has actually played a session.',
   'feature', 1, now() - interval '30 minutes'),

  ('Online status',
   'Set yourself online, away, invisible or offline, from the control next to your name.',
   'feature', 1, now() - interval '40 hours'),

  ('Tag friends in posts',
   'Type @ and pick a friend. They get told about it.',
   'feature', 1, now() - interval '28 hours'),

  ('Friends lists on profiles',
   'See how many friends somebody has and browse the list, with the same match detail as Find Players.',
   'feature', 1, now() - interval '26 hours'),

  -- Worth mentioning.
  ('Everything updates live',
   'Comments, session rosters and notifications now appear as they happen instead of after a refresh.',
   'improvement', 2, now() - interval '30 minutes'),

  ('Notifications open the post',
   'Clicking one takes you straight to the post it is about rather than the screen it lives on.',
   'improvement', 2, now() - interval '24 hours'),

  ('Sounds',
   'A tone for notifications, friend requests and messages. Switch it off per device in notification settings.',
   'improvement', 2, now() - interval '23 hours'),

  ('Avatar uploads are resized',
   'Pictures are cropped and shrunk before upload, so a photo straight off a phone no longer takes a moment to appear.',
   'improvement', 2, now() - interval '42 hours'),

  ('Welcome walkthrough',
   'New accounts get a short prompt to fill in the parts of a profile that matching actually uses.',
   'improvement', 2, now() - interval '46 hours'),

  ('Profiles read properly on a phone',
   'Bios, locations and the buttons underneath were squeezed into a narrow column on mobile. They are not any more.',
   'improvement', 2, now() - interval '44 hours'),

  ('Profiles load faster',
   'Achievements and stats were doing far more work than they needed to. Both are several times quicker.',
   'improvement', 2, now() - interval '10 minutes'),

  -- Repairs.
  ('Fixed: nobody could join a session',
   'Joining anybody else''s session silently did nothing. It had been broken for everyone except the host of each session.',
   'fix', 3, now() - interval '18 hours'),

  ('Fixed: accepting a friend request failed',
   'Accepting returned an error about an invalid value instead of accepting.',
   'fix', 3, now() - interval '25 hours'),

  ('Fixed: notifications needed a refresh',
   'Friend request notifications only appeared after reloading the page.',
   'fix', 3, now() - interval '22 hours'),

  ('Fixed: the new invite link button',
   'It was disabled from the moment the panel opened and could never be pressed.',
   'fix', 3, now() - interval '20 minutes');

  raise notice 'Changelog seeded with 20 entries.';
end $$;

-- ============================================================
--  Done.
-- ============================================================
