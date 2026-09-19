-- ============================================================
--  38 — make notifications arrive live.
--
--  Symptom: a friend request only appeared after refreshing the page.
--
--  Not quite a bug — the bell polls every 60 seconds, so it would
--  have turned up on its own eventually. But "eventually, within a
--  minute" is indistinguishable from broken when you are sitting
--  there waiting for it, and nobody waits a minute to decide
--  something is working.
--
--  Chat has felt instant since 14_chat.sql because it subscribes to
--  inserts on `messages`. Notifications never got the same treatment.
--  This adds the table to the realtime publication so the app can
--  subscribe to it the same way.
--
--  Row-level security still applies to realtime events: each client
--  only receives rows it could have selected. The existing "read your
--  own notifications" policy is what makes this safe — nobody is
--  subscribed to anyone else's bell.
--
--  The poll stays. It is what drives sync_session_reminders(), and
--  nothing in the database fires when a session becomes an hour away.
--
--  Run in the Supabase SQL Editor, after 37.
-- ============================================================

do $$
begin
  -- Supabase creates this publication for every project, but guard it
  -- anyway: on a database that does not have it, the alter below would
  -- abort the whole file.
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'No supabase_realtime publication here — skipping.';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname    = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'notifications'
  ) then
    raise notice 'notifications is already published — nothing to do.';
    return;
  end if;

  alter publication supabase_realtime add table public.notifications;
  raise notice 'notifications added to realtime.';
end $$;

-- ============================================================
--  Done.
-- ============================================================
