-- ============================================================
--  Why didn't the "While you were gone" dialog appear?
--
--  Read-only. Changes nothing. Paste the whole thing into the
--  Supabase SQL Editor, then read the `verdict` column at the bottom.
--
--  Replace THEIR_USERNAME below with your friend's username — both
--  places.
-- ============================================================


-- ------------------------------------------------------------
--  A. Did migration 49 actually run?
--
--  If this says the table is missing, that is the whole answer: the
--  app asks for something that isn't there, gets an error, and shows
--  no dialog rather than an error message.
-- ------------------------------------------------------------
select
  'A. migration 49 applied?' as step,
  to_regclass('public.changelog_entries') is not null as table_exists,
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'changelog_seen_at') = 1      as column_exists,
  to_regprocedure('public.get_changelog(int)') is not null as function_exists;


-- ------------------------------------------------------------
--  B. Are there any entries to show?
-- ------------------------------------------------------------
select
  'B. entries' as step,
  count(*)                                   as total,
  count(*) filter (where weight = 1)         as headline,
  min(shipped_at)                            as oldest,
  max(shipped_at)                            as newest
from public.changelog_entries;


-- ------------------------------------------------------------
--  C. Their account, and what the app would decide for it.
--
--  The two things that suppress the dialog are a changelog_seen_at
--  that is already past every entry, and a pending welcome — the
--  dialog deliberately stays out of the way until the welcome has
--  been dismissed, so two modals never stack.
-- ------------------------------------------------------------
with them as (
  select id, username, created_at, welcomed_at, changelog_seen_at
    from public.profiles
   where username = 'THEIR_USERNAME'
)
select
  'C. their account' as step,
  t.username,
  t.created_at                               as signed_up,
  t.welcomed_at,
  -- Null rather than a misleading `true` when there is no such
  -- profile: every one of these is null-true for a row that isn't
  -- there, and a screen full of confident wrong answers is worse than
  -- a blank.
  case when t.id is null then null else t.welcomed_at is null end
                                             as welcome_still_pending,
  t.changelog_seen_at,
  case when t.id is null then null else
    (select count(*) from public.changelog_entries e
      where t.changelog_seen_at is null
         or e.shipped_at > t.changelog_seen_at)
  end                                        as entries_they_would_see,
  case
    when t.id is null
      then '>>> No profile with that username — check the spelling'
    when t.welcomed_at is null
      then '>>> SUPPRESSED: they have not dismissed the welcome dialog yet. '
           || 'The changelog waits for that on purpose. They should have seen '
           || 'the WELCOME popup instead — ask them if they did.'
    when t.changelog_seen_at is not null
     and not exists (select 1 from public.changelog_entries e
                      where e.shipped_at > t.changelog_seen_at)
      then '>>> NOTHING NEW: their marker is already past every entry. '
           || 'Either they dismissed it, or their account was created after '
           || 'the entries were seeded.'
    else '>>> The database says they SHOULD see it. So the app did not ask: '
         || 'either the browser is running an older build, or they signed in '
         || 'before the deploy finished. Get them to hard-refresh.'
  end                                        as verdict
from them t
right join (select 1) x on true;


-- ------------------------------------------------------------
--  D. Everyone else, in one line each.
--
--  Useful for telling "one person's account is odd" apart from
--  "nobody can see this".
-- ------------------------------------------------------------
select
  'D. everyone' as step,
  p.username,
  p.welcomed_at is null                      as welcome_pending,
  p.changelog_seen_at,
  (select count(*) from public.changelog_entries e
    where p.changelog_seen_at is null
       or e.shipped_at > p.changelog_seen_at) as would_see
from public.profiles p
order by p.created_at
limit 50;
