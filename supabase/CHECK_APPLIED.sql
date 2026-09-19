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
     ))
)
select
  migration,
  feature,
  case when present then 'ok' else '>>> MISSING — RUN IT' end as status
from checks
order by migration;
