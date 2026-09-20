-- ============================================================
--  41 — joins, leaves and comments, live.
--
--  Three gaps, one cause each:
--
--  1. Nobody was told when someone joined or left their session.
--     There was no trigger for it at all.
--
--  2. Comments only appeared to whoever wrote them. Everyone else
--     saw the old thread until they reloaded.
--
--  3. A session's roster only changed for the person who clicked.
--     Two people looking at the same post saw different slot counts.
--
--  2 and 3 are the same fix as 38: the tables were not published to
--  realtime, so there was nothing for the app to subscribe to.
--
--  Run in the Supabase SQL Editor, after 40.
-- ============================================================


-- ------------------------------------------------------------
--  Dedupe by actor, not just by post.
--
--  The unique index from 33 was (user_id, kind, post_id). That is
--  right for a session reminder — one "starts in an hour" per session
--  — but wrong the moment several DIFFERENT people can cause the same
--  kind of notification about the same post. With the old index, a
--  host would hear about the first person to join their session and
--  never about the second.
--
--  Adding the actor fixes that and improves comments at the same
--  time: each person who comments notifies once, while the same
--  person commenting five times still only notifies once.
--
--  The reminders are unaffected — their actor is always the host, so
--  they still dedupe exactly as before.
--
--  coalesce() rather than the bare column, because NULLs are DISTINCT
--  in a unique index: an actorless notification would collide with
--  nothing and quietly duplicate on every call. No caller passes a
--  null actor with a post today, and this is so that the first one
--  that does doesn't spam somebody.
-- ------------------------------------------------------------
drop index if exists public.notifications_once_per_post;

create unique index if not exists notifications_once_per_post_actor
  on public.notifications (
    user_id, kind, post_id,
    coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where post_id is not null;


-- ------------------------------------------------------------
--  Two new kinds.
-- ------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'friend_request', 'friend_accepted',
    'session_day', 'session_hour', 'friend_lfg',
    'post_mention', 'post_comment',
    'session_joined', 'session_left'));

alter table public.notification_settings
  add column if not exists session_players boolean not null default true;

create or replace function public.push_notification(
  recipient uuid,
  n_kind    text,
  actor     uuid   default null,
  post      bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if recipient is null or recipient = actor then
    return;
  end if;

  select coalesce(
    (select case n_kind
              when 'friend_request'  then friend_requests
              when 'friend_accepted' then friend_accepted
              when 'session_day'     then session_reminders
              when 'session_hour'    then session_reminders
              when 'friend_lfg'      then friend_lfg
              when 'post_mention'    then post_mentions
              when 'post_comment'    then post_comments
              when 'session_joined'  then session_players
              when 'session_left'    then session_players
              else true
            end
       from notification_settings where user_id = recipient),
    true) into allowed;

  if not allowed then
    return;
  end if;

  insert into notifications (user_id, kind, actor_id, post_id)
  values (recipient, n_kind, actor, post)
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------
--  Tell the host when the roster changes.
--
--  The host only, not everyone in the session. A five-slot session
--  filling up would otherwise ring four bells for every player, and
--  a notification you get four of is one you stop reading. The host
--  is the person who needs to know whether their session is filling.
-- ------------------------------------------------------------
create or replace function public.notify_session_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
begin
  select p.author_id into host from posts p where p.id = new.post_id;
  perform public.push_notification(
    host, 'session_joined', new.user_id, new.post_id);
  return new;
end;
$$;

drop trigger if exists session_join_notifies_host on public.session_players;
create trigger session_join_notifies_host
  after insert on public.session_players
  for each row execute function public.notify_session_joined();


create or replace function public.notify_session_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
begin
  select p.author_id into host from posts p where p.id = old.post_id;

  -- Nothing to say if the post itself is being deleted — the whole
  -- session is going, and the host is the one deleting it.
  if host is null then
    return old;
  end if;

  perform public.push_notification(
    host, 'session_left', old.user_id, old.post_id);
  return old;
end;
$$;

drop trigger if exists session_leave_notifies_host on public.session_players;
create trigger session_leave_notifies_host
  after delete on public.session_players
  for each row execute function public.notify_session_left();


-- ------------------------------------------------------------
--  Publish both tables to realtime.
--
--  post_comments needs REPLICA IDENTITY FULL. By default a DELETE
--  event carries only the primary key, which for that table is just
--  `id` — so a subscription filtered on post_id would never match a
--  deletion, and a comment removed by one person would stay on
--  everyone else's screen. session_players does not need it: post_id
--  is part of its primary key already.
-- ------------------------------------------------------------
alter table public.post_comments replica identity full;

do $$
declare
  t text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise notice 'No supabase_realtime publication here — skipping.';
    return;
  end if;

  foreach t in array array['post_comments', 'session_players']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      raise notice '% is already published.', t;
    else
      execute format(
        'alter publication supabase_realtime add table public.%I', t);
      raise notice '% added to realtime.', t;
    end if;
  end loop;
end $$;

-- ============================================================
--  Done.
-- ============================================================
