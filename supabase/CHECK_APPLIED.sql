-- ============================================================
--  Which migrations are actually live?
--
--  Running a migration file is a manual step, so it's easy to lose
--  track of which ones this database has seen — especially after a
--  stretch of building where several land at once.
--
--  This changes nothing. It just looks for the thing each migration
--  creates and reports whether it's there. Paste the whole file into
--  the Supabase SQL Editor and read the last column.
--
--  Anything showing MISSING means that migration has not been run
--  here, and the feature it powers will be dead on this database.
--  Run them in number order — later ones assume the earlier ones.
-- ============================================================

with checks(migration, feature, present) as (
  values
    ('26_match_reason',
     'Find says "in your Top 5" only when true',
     exists (
       select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'find_players'
         and 'shared_top_games' = any(p.proargnames)
     )),

    ('27_session_chat',
     'Joining a session opens its group chat',
     to_regclass('public.conversation_members') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ensure_session_conversation'
     )),

    ('28_delete_message',
     'Delete one of your own messages',
     to_regclass('public.message_deletions') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_message'
     )),

    ('29_leave_conversation',
     'Delete a whole chat from your list',
     to_regclass('public.conversation_clears') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'leave_conversation'
     )),

    ('30_my_sessions',
     'The Sessions tab',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'my_sessions'
     )),

    ('31_welcome',
     'The welcome for new accounts',
     exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'profiles'
         and column_name  = 'welcomed_at'
     )
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'needs_welcome'
     )),

    ('32_presence',
     'Online / away / invisible / offline',
     to_regclass('public.presence_settings') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_presence'
     )),

    ('33_notifications',
     'The notification bell and its settings',
     to_regclass('public.notifications') is not null
     and to_regclass('public.notification_settings') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'sync_session_reminders'
     )),
    ('34_mentions',
     '@mentions in posts and comments',
     to_regclass('public.post_mentions') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'mentionable_friends'
     )),

    ('35_friends_of',
     'Somebody''s friends, scored against you',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'friends_of'
     )),

    ('36_get_post',
     'A single post on its own page',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_post'
     )),

    -- No new object: it repairs a trigger function from 33. The only
    -- honest check is whether the repair is in the body.
    ('37_fix_accept_trigger',
     'FIX — friend requests can be accepted at all',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'notify_friend_accepted'
         and pg_get_functiondef(p.oid) ilike '%is distinct from%'
     )),

    ('38_realtime_notifications',
     'The bell updates without a refresh',
     exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     )),

    ('39_comments',
     'Comments and replies',
     to_regclass('public.post_comments') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_comments'
     )),

    -- Also replaced by 42, which keeps the advisory lock. Either way,
    -- what must NOT be there is the `for update` that broke joining.
    ('40_fix_join_session',
     'FIX — joining somebody else''s session works',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'join_session'
         and pg_get_functiondef(p.oid) ilike '%pg_advisory_xact_lock%'
     )),

    ('41_live_sessions_and_comments',
     'Sessions and comments update live',
     exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'notifications_once_per_post_actor'
     )
     and exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'post_comments'
     )),

    ('42_session_invites',
     'Inviting a friend into a session',
     to_regclass('public.session_invites') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'invite_to_session'
     )),

    ('43_profile_stats',
     'The stats block on a profile',
     to_regclass('public.profile_stats') is not null
     and to_regclass('public.session_attendance') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_profile_stats'
     )),

    ('44_achievements',
     'Achievements',
     to_regclass('public.achievements') is not null
     and to_regclass('public.profile_achievements') is not null),

    -- Checked against the catalogue, not by counting rows in
    -- `achievements`: a `select count(*)` from a table that does not
    -- exist fails when Postgres PLANS this query, which would kill
    -- the whole report on exactly the database it is meant to
    -- diagnose. Every check in this file reads the catalogue only.
    ('45_more_achievements',
     'All 40 achievements, not just the first few',
     to_regclass('public.session_full_houses') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'profile_stats'
         and column_name  = 'full_houses'
     )),

    ('46_referrals',
     'Referral codes and invite rewards',
     to_regclass('public.referral_codes') is not null
     and to_regclass('public.referrals') is not null),

    -- The bug was measuring the rate limit from when a code was
    -- ISSUED. The fix measures from when one was RETIRED.
    ('47_fix_roll_referral',
     'FIX — the New link button actually issues a new link',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'roll_referral_code'
         and pg_get_functiondef(p.oid) ilike '%max(rc.retired_at)%'
     )),

    ('48_stats_performance',
     'Achievements load in one pass instead of thirty-five',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'stat_snapshot'
     )),

    ('49_changelog',
     'The what''s-new window',
     to_regclass('public.changelog_entries') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'get_changelog'
     )),

    ('50_library_cap_28',
     'Also plays holds 28 games, not 20',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'cap_game_library'
         and pg_get_functiondef(p.oid) like '%>= 28%'
     )),

    ('51_realtime_achievements',
     'The achievement toast fires the moment one is earned',
     exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'profile_achievements'
     )),

    -- The one that mattered: achievements counting games owned, days
    -- as a member or a weekly streak never fired, because none of
    -- those touch profile_stats and time passing is not an event.
    ('52_fix_derived_achievements',
     'FIX — achievements on games owned, streaks and time fire at all',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'check_my_achievements'
     )
     and exists (
       select 1 from pg_trigger
       where tgname = 'game_library_award'
     )),

    ('53_delete_account',
     'Deleting your own account',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_my_account'
     )),

    ('54_session_platform_headset',
     'System and headset on a session',
     exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'posts'
         and column_name  = 'platform'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name   = 'posts'
         and column_name  = 'headset'
     )),

    ('55_match_with',
     'The match percentage on somebody''s profile',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'match_with'
     )),

    -- The trigram index is checked as well as the function: without
    -- it the search still returns the right answers, but reads the
    -- whole catalogue to do it, and that is a difference worth
    -- knowing about before somebody reports the app as slow.
    ('56_game_search',
     'Game search that forgives spelling and punctuation',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'search_games'
     )
     and exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'games_search_text_trgm'
     )),

    -- A data migration: it creates nothing, so the only evidence it
    -- ran is one of the rows it adds.
    --
    -- And it cannot simply say `select count(*) from
    -- changelog_entries`, guarded or not. Postgres resolves every
    -- table in this query when it PLANS it, before a single guard
    -- gets to run, so on a database missing 49 that one line takes
    -- the whole report down — on exactly the database it exists to
    -- diagnose. Naming the table inside a string keeps it away from
    -- the planner, and CASE does short-circuit at run time, so the
    -- string is never executed when the table is not there.
    ('57_changelog_update_2',
     'The second What''s New post',
     case
       when to_regclass('public.changelog_entries') is null then false
       else (xpath('/row/c/text()', query_to_xml(
               'select count(*) as c from public.changelog_entries '
               || 'where title = ''Game search that forgives''',
               false, true, '')))[1]::text::int > 0
     end),

    ('58_developer_mode',
     'Developer tools and feature flags',
     to_regclass('public.developers')    is not null
     and to_regclass('public.feature_flags') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'am_i_developer'
     )),

    ('59_dev_metrics',
     'The numbers, for developers only',
     exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dev_metrics'
     )),

    -- Both halves checked. The index without the constraint still
    -- leaves the shape hole open, and vice versa.
    ('60_username_integrity',
     'Usernames unique regardless of case, and shape enforced',
     exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'profiles_username_lower_key'
     )
     and exists (
       select 1 from pg_constraint
       where conname = 'profiles_username_shape'
     )),

    -- The ban check inside is_blocked() is checked too: without it
    -- a banned account's posts stay visible everywhere, which is the
    -- half of a ban people actually notice.
    ('61_moderation',
     'Report queue, warnings and bans',
     to_regclass('public.moderation_actions') is not null
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dev_report_queue'
     )
     and exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'is_blocked'
         and pg_get_functiondef(p.oid) ilike '%banned_until%'
     ))
)
select
  migration,
  feature,
  case when present then 'ok' else '>>> MISSING — RUN IT' end as status
from checks
-- Text order. Every migration name starts with two digits, so this is
-- also numeric order; it stops being true at 100.
order by migration;
