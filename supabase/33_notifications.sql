-- ============================================================
--  33 — notifications.
--
--  Five things worth interrupting someone for:
--
--    friend_request    somebody asked to be your friend
--    friend_accepted   somebody said yes to you
--    session_day       a session you joined is tomorrow
--    session_hour      a session you joined starts within the hour
--    friend_lfg        a friend needs players for a game you both own
--
--  Three of those are events, and events are what triggers are for.
--  The two session reminders are not events — nothing happens in the
--  database an hour before a session; the hour simply arrives. Those
--  are materialised by sync_session_reminders(), which the app calls
--  when it loads and every few minutes after.
--
--  That means a reminder is created when the app is next open rather
--  than at the exact minute. Someone who opens the app forty minutes
--  before a session still sees "starts in 40 minutes" — which is the
--  useful part — but nothing arrives while the app is shut. Real push
--  would need a scheduled job plus a service worker, and is its own
--  piece of work.
--
--  Run in the Supabase SQL Editor, after 32.
-- ============================================================


-- ------------------------------------------------------------
--  Settings.
--
--  A row per person, created on first change. Absent means every
--  default, so nobody needs a row to start receiving things — which
--  matters, because the triggers below run for accounts that have
--  never opened the settings screen.
-- ------------------------------------------------------------
create table if not exists public.notification_settings (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  friend_requests   boolean not null default true,
  friend_accepted   boolean not null default true,
  session_reminders boolean not null default true,
  friend_lfg        boolean not null default true,
  updated_at        timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

drop policy if exists "read your own notification settings" on public.notification_settings;
create policy "read your own notification settings"
  on public.notification_settings for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "write your own notification settings" on public.notification_settings;
create policy "write your own notification settings"
  on public.notification_settings for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "update your own notification settings" on public.notification_settings;
create policy "update your own notification settings"
  on public.notification_settings for update
  to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
--  The notifications themselves.
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  -- Who is being told.
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in (
               'friend_request', 'friend_accepted',
               'session_day', 'session_hour', 'friend_lfg')),
  -- Who caused it. Null for anything the system decided on its own.
  actor_id   uuid   references public.profiles(id) on delete cascade,
  -- The session or post it is about.
  post_id    bigint references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- One notification per person per post per kind. This is what makes
-- sync_session_reminders() safe to call as often as the app likes, and
-- it stops a friend's session post notifying the same person twice.
create unique index if not exists notifications_once_per_post
  on public.notifications (user_id, kind, post_id)
  where post_id is not null;

alter table public.notifications enable row level security;

-- Read and update your own. There is no insert policy: everything is
-- written by the definer function below, so nothing can invent a
-- notification addressed to somebody else.
drop policy if exists "read your own notifications" on public.notifications;
create policy "read your own notifications"
  on public.notifications for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "mark your own notifications" on public.notifications;
create policy "mark your own notifications"
  on public.notifications for update
  to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete your own notifications" on public.notifications;
create policy "delete your own notifications"
  on public.notifications for delete
  to authenticated using (user_id = auth.uid());


-- ------------------------------------------------------------
--  The one writer.
--
--  Every path into the table goes through here, so the settings check
--  lives in exactly one place and cannot be forgotten by a trigger
--  added later.
-- ------------------------------------------------------------
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
  -- Never notify someone about their own action.
  if recipient is null or recipient = actor then
    return;
  end if;

  -- No row means defaults, and the default is yes.
  select coalesce(
    (select case n_kind
              when 'friend_request'  then friend_requests
              when 'friend_accepted' then friend_accepted
              when 'session_day'     then session_reminders
              when 'session_hour'    then session_reminders
              when 'friend_lfg'      then friend_lfg
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
--  Friend requests, and the yes that follows.
-- ------------------------------------------------------------
create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.push_notification(
      new.addressee_id, 'friend_request', new.requester_id);
  end if;
  return new;
end;
$$;

drop trigger if exists friend_request_notifies on public.friendships;
create trigger friend_request_notifies
  after insert on public.friendships
  for each row execute function public.notify_friend_request();


create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the transition. send_friend_request() can touch this row
  -- for other reasons, and re-notifying on every write would mean the
  -- requester hears "accepted" more than once.
  --
  -- `is distinct from` rather than a coalesce against a placeholder
  -- string: status is an ENUM, so comparing it to '' makes Postgres
  -- try to coerce '' into friendship_status, which throws. That bug
  -- shipped and is fixed in 37 — this file now matches, so a rebuild
  -- from scratch never reintroduces it.
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.push_notification(
      new.requester_id, 'friend_accepted', new.addressee_id);
  end if;
  return new;
end;
$$;

drop trigger if exists friend_accepted_notifies on public.friendships;
create trigger friend_accepted_notifies
  after update on public.friendships
  for each row execute function public.notify_friend_accepted();


-- ------------------------------------------------------------
--  A friend is looking for players.
--
--  Two conditions, and the second is what keeps the bell usable:
--
--    1. you both own the game — Top 5 or library, either counts
--    2. it is in SOMEBODY's Top 5, yours or theirs
--
--  Without the second, a post about any of forty shared library games
--  would reach every friend, and a notification that arrives that
--  often is one people learn to ignore.
-- ------------------------------------------------------------
create or replace function public.notify_friend_lfg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  friend_id uuid;
begin
  if new.kind <> 'lfg' or new.game_id is null then
    return new;
  end if;

  for friend_id in
    select case when f.requester_id = new.author_id
                then f.addressee_id else f.requester_id end
    from friendships f
    where f.status = 'accepted'
      and (f.requester_id = new.author_id or f.addressee_id = new.author_id)
  loop
    -- Do they own it at all?
    if exists (
      select 1 from top_five      where user_id = friend_id and game_id = new.game_id
      union all
      select 1 from game_library  where user_id = friend_id and game_id = new.game_id
    )
    -- And does either of you rank it?
    and (
      exists (select 1 from top_five where user_id = friend_id       and game_id = new.game_id)
      or
      exists (select 1 from top_five where user_id = new.author_id   and game_id = new.game_id)
    )
    and not public.is_blocked(friend_id)
    then
      perform public.push_notification(
        friend_id, 'friend_lfg', new.author_id, new.id);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists friend_lfg_notifies on public.posts;
create trigger friend_lfg_notifies
  after insert on public.posts
  for each row execute function public.notify_friend_lfg();


-- ------------------------------------------------------------
--  Session reminders.
--
--  Called by the app rather than fired by a clock. The two windows do
--  not overlap, so joining a session that starts in ninety minutes
--  gets you the hour reminder when the hour comes and never a stale
--  "tomorrow" alongside it.
--
--  The unique index does the deduplicating, so calling this every
--  thirty seconds would be wasteful but harmless.
-- ------------------------------------------------------------
create or replace function public.sync_session_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  session_id bigint;
  host uuid;
begin
  if me is null then
    return;
  end if;

  -- Starting within the hour.
  for session_id, host in
    select p.id, p.author_id
    from session_players sp
    join posts p on p.id = sp.post_id
    where sp.user_id = me
      and p.kind = 'lfg'
      and p.starts_at > now()
      and p.starts_at <= now() + interval '1 hour'
  loop
    perform public.push_notification(me, 'session_hour', host, session_id);
  end loop;

  -- Tomorrow: more than an hour out, less than a day.
  for session_id, host in
    select p.id, p.author_id
    from session_players sp
    join posts p on p.id = sp.post_id
    where sp.user_id = me
      and p.kind = 'lfg'
      and p.starts_at > now() + interval '1 hour'
      and p.starts_at <= now() + interval '24 hours'
  loop
    perform public.push_notification(me, 'session_day', host, session_id);
  end loop;
end;
$$;

grant execute on function public.sync_session_reminders() to authenticated;


-- ------------------------------------------------------------
--  Reading them.
--
--  Joined here rather than in the client so the list is one request,
--  and so a notification about a deleted post still renders as
--  something rather than a blank row.
-- ------------------------------------------------------------
create or replace function public.get_notifications(max_results int default 30)
returns table (
  id            bigint,
  kind          text,
  created_at    timestamptz,
  read_at       timestamptz,
  actor_id      uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  post_id       bigint,
  game_name     text,
  starts_at     timestamptz
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    n.id, n.kind, n.created_at, n.read_at,
    n.actor_id, a.username, a.display_name, a.avatar_url, a.avatar_preset,
    n.post_id, g.name, p.starts_at
  from notifications n
  left join profiles a on a.id = n.actor_id
  left join posts    p on p.id = n.post_id
  left join games    g on g.id = p.game_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit max_results;
$$;

grant execute on function public.get_notifications(int) to authenticated;


create or replace function public.mark_notifications_read()
returns void
language sql
security invoker
set search_path = public
as $$
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
$$;

grant execute on function public.mark_notifications_read() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
