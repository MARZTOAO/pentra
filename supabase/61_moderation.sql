-- ============================================================
--  61 — moderation: a queue worth looking at, warnings, and bans.
--
--  Reports have been landing in `reports` since 18 with nothing
--  reading them. This gives them somewhere to go.
--
--  WHAT REACHES THE QUEUE. Not every report — that is the point. A
--  person appears once THREE DIFFERENT PEOPLE have reported them.
--  Three, not "three reports": one person filing three times is one
--  person with a grudge, and counting it as three would hand anybody
--  a way to summon the owner's attention at will.
--
--  WITH ONE EXCEPTION, and it matters more than the rule. Reports of
--  threats, sexual content, or a minor being targeted surface on the
--  FIRST report, from one person, immediately. A threshold is a way
--  of managing your attention; it is not a reason for a credible
--  report of a child being harmed to sit invisible until two more
--  strangers happen to file the same one.
--
--  WHAT A BAN DOES. Two things, because one is not enough:
--
--    auth.users.banned_until   stops them getting a new token, which
--                              is what stops them signing in
--    profiles.banned_until     stops the session they already have,
--                              and hides everything they posted
--
--  Only the first is Supabase's own mechanism, and on its own it
--  leaves somebody with a live token still able to post for as long
--  as that token lasts. The second closes that, and is also what the
--  app can actually see — Supabase does not expose ban state to the
--  client, so without a column of our own a banned person just gets a
--  login that mysteriously fails.
--
--  HIDING THEIR CONTENT, in one change. `is_blocked()` is already the
--  question every read path asks before showing you somebody — 41
--  call sites across 25 migrations, covering the feed, sessions,
--  comments, chat, search, matching and profiles. Rather than edit
--  41 places and miss one, it now also answers true for a banned
--  account. The name is narrower than what it does; the comment on
--  it says so.
--
--  NOTHING IS DELETED. A ban sets a date. Unbanning clears it and
--  everything comes back — the posts, the sessions, the friendships.
--  Bans get made at 1am on partial information, and a moderation tool
--  that cannot be undone is one you will eventually be afraid to use.
--
--  Run in the Supabase SQL Editor, after 60.
-- ============================================================


-- ------------------------------------------------------------
--  State on the person.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists banned_until  timestamptz,
  add column if not exists banned_reason text,
  add column if not exists warn_count    int not null default 0;

create index if not exists profiles_banned_idx
  on public.profiles (banned_until)
  where banned_until is not null;


create or replace function public.is_banned(who uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = who and p.banned_until > now()
  );
$$;

grant execute on function public.is_banned(uuid) to authenticated;


-- ------------------------------------------------------------
--  is_blocked, widened.
--
--  READ THIS BEFORE CHANGING IT. Despite the name, this is the
--  question "should this person be invisible to me" — it is what the
--  feed, comments, chat, search, matching, sessions and profiles all
--  ask, and it is called in 41 places. Adding the ban check here is
--  what makes a ban take effect everywhere at once instead of in the
--  36 places somebody remembered.
--
--  It is deliberately NOT symmetric with the block half: `other`
--  being banned hides them from you, and the caller's own ban is not
--  considered here at all. A banned person is stopped from writing by
--  the trigger further down, and from signing in by auth.
-- ------------------------------------------------------------
create or replace function public.is_blocked(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = other and p.banned_until > now()
  );
$$;


-- ------------------------------------------------------------
--  Stopping a banned account that still holds a token.
--
--  A trigger rather than a rewrite of each insert policy. Policies
--  would have to be re-stated in full to add a condition, and
--  re-stating a policy is how a condition quietly goes missing.
--  Triggers compose: whatever those policies already enforce, they
--  still enforce.
-- ------------------------------------------------------------
create or replace function public.block_banned_writes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_banned(auth.uid()) then
    raise exception 'This account is suspended.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'posts', 'post_comments', 'post_likes',
    'messages', 'session_players', 'friendships'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I',
                     'no_writes_while_banned_' || t, t);
      execute format(
        'create trigger %I before insert on public.%I
           for each row execute function public.block_banned_writes()',
        'no_writes_while_banned_' || t, t);
    end if;
  end loop;
end $$;


-- ------------------------------------------------------------
--  The record. Every warning, ban and dismissal, permanently.
--
--  Not bureaucracy: "have I already warned this person" is the first
--  question on the second report, and without this the answer is a
--  guess.
-- ------------------------------------------------------------
create table if not exists public.moderation_actions (
  id         bigint generated always as identity primary key,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  action     text not null check (action in
               ('warned', 'banned', 'unbanned', 'dismissed')),
  note       text,
  -- Null once the account is gone; the record of what happened stays.
  acted_by   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Warnings only: when the person actually saw it.
  seen_at    timestamptz
);

create index if not exists moderation_target_idx
  on public.moderation_actions (target_id, created_at desc);

alter table public.moderation_actions enable row level security;
revoke all on public.moderation_actions from anon, authenticated;


-- ------------------------------------------------------------
--  What the person being warned sees.
--
--  The one thing in this file an ordinary account may call, and it
--  can only ever return their own warning. A warning nobody reads is
--  not a warning, so this drives a banner in the app rather than a
--  line in the notification bell.
-- ------------------------------------------------------------
create or replace function public.my_warning()
returns table (id bigint, note text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.note, m.created_at
  from public.moderation_actions m
  where m.target_id = auth.uid()
    and m.action = 'warned'
    and m.seen_at is null
  order by m.created_at desc
  limit 1;
$$;

create or replace function public.acknowledge_warning(which bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.moderation_actions
     set seen_at = now()
   where id = which
     and target_id = auth.uid()
     and action = 'warned'
     and seen_at is null;
$$;

revoke all on function public.my_warning() from public;
revoke all on function public.acknowledge_warning(bigint) from public;
grant execute on function public.my_warning() to authenticated;
grant execute on function public.acknowledge_warning(bigint) to authenticated;


-- ------------------------------------------------------------
--  THE QUEUE.
--
--  Grouped by person, not by report — you act on people. A report
--  filed about a post counts against whoever wrote the post, since
--  that is who a ban would apply to.
-- ------------------------------------------------------------
create or replace function public.dev_report_queue()
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  avatar_preset  text,
  reports        int,
  reporters      int,
  reasons        text[],
  details        text[],
  first_at       timestamptz,
  last_at        timestamptz,
  -- True when this is here because of what was alleged rather than
  -- how many people alleged it.
  severe         boolean,
  banned_until   timestamptz,
  warn_count     int,
  last_action    text,
  last_action_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return query
  with open_reports as (
    select
      -- A report about a post is a report about its author.
      coalesce(r.target_user, p.author_id) as subject,
      r.reporter_id,
      r.reason,
      r.detail,
      r.created_at
    from public.reports r
    left join public.posts p on p.id = r.target_post
    where r.status = 'open'
      and coalesce(r.target_user, p.author_id) is not null
  ),
  grouped as (
    select
      o.subject,
      count(*)::int                        as n,
      count(distinct o.reporter_id)::int   as people,
      array_agg(distinct o.reason)         as why,
      array_remove(array_agg(o.detail), null) as said,
      min(o.created_at)                    as first_at,
      max(o.created_at)                    as last_at,
      bool_or(o.reason in ('threats', 'underage', 'sexual')) as severe
    from open_reports o
    group by o.subject
  )
  select
    g.subject,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.avatar_preset,
    g.n,
    g.people,
    g.why,
    g.said,
    g.first_at,
    g.last_at,
    g.severe,
    pr.banned_until,
    pr.warn_count,
    (select m.action from public.moderation_actions m
      where m.target_id = g.subject order by m.created_at desc limit 1),
    (select m.created_at from public.moderation_actions m
      where m.target_id = g.subject order by m.created_at desc limit 1)
  from grouped g
  join public.profiles pr on pr.id = g.subject
  -- The threshold, and the exception to it.
  where g.people >= 3 or g.severe
  -- Anything severe first, however few people filed it. Then by how
  -- many people, then by most recent.
  order by g.severe desc, g.people desc, g.last_at desc;
end;
$$;


-- ------------------------------------------------------------
--  Acting.
--
--  Each one closes the open reports it acted on, so the queue
--  reflects what is still undecided rather than everything that ever
--  happened. The reports themselves are kept.
-- ------------------------------------------------------------
create or replace function public.dev_warn_user(who text, note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (target, 'warned', nullif(btrim(coalesce(note, '')), ''), auth.uid());

  update public.profiles
     set warn_count = warn_count + 1
   where id = target;

  update public.reports r
     set status = 'warned'
   where r.status = 'open'
     and coalesce(r.target_user,
           (select p.author_id from public.posts p where p.id = r.target_post)
         ) = target;

  return 'warned';
end;
$$;


create or replace function public.dev_ban_user(
  who    text,
  reason text,
  -- Null means indefinite. A number of days makes a suspension.
  days   int default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  until  timestamptz;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  if target = auth.uid() then
    return 'you cannot ban yourself';
  end if;

  -- Far enough out to be permanent in practice, without needing a
  -- second column to mean "forever".
  until := case
             when days is null then now() + interval '100 years'
             else now() + make_interval(days => days)
           end;

  update public.profiles
     set banned_until  = until,
         banned_reason = nullif(btrim(coalesce(reason, '')), '')
   where id = target;

  -- And the half that stops them signing in again. Supabase reads
  -- this column when issuing tokens.
  update auth.users
     set banned_until = until
   where id = target;

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (target, 'banned',
          coalesce(reason, '') ||
            case when days is null then ' (indefinite)'
                 else ' (' || days || ' days)' end,
          auth.uid());

  update public.reports r
     set status = 'banned'
   where r.status = 'open'
     and coalesce(r.target_user,
           (select p.author_id from public.posts p where p.id = r.target_post)
         ) = target;

  return 'banned';
end;
$$;


create or replace function public.dev_unban_user(who text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  update public.profiles
     set banned_until = null, banned_reason = null
   where id = target;

  update auth.users set banned_until = null where id = target;

  insert into public.moderation_actions (target_id, action, acted_by)
  values (target, 'unbanned', auth.uid());

  return 'unbanned';
end;
$$;


-- Closing reports without acting. The record says a person looked
-- and decided no, which is different from nobody having looked.
create or replace function public.dev_dismiss_reports(who text, note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  update public.reports r
     set status = 'dismissed'
   where r.status = 'open'
     and coalesce(r.target_user,
           (select p.author_id from public.posts p where p.id = r.target_post)
         ) = target;

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (target, 'dismissed', nullif(btrim(coalesce(note, '')), ''), auth.uid());

  return 'dismissed';
end;
$$;


-- How many reports are sitting below the threshold. Not names — just
-- the count, so you know whether the queue being empty means quiet or
-- means the bar is set too high.
create or replace function public.dev_report_backlog()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return (
    with open_reports as (
      select coalesce(r.target_user, p.author_id) as subject
      from public.reports r
      left join public.posts p on p.id = r.target_post
      where r.status = 'open'
        and coalesce(r.target_user, p.author_id) is not null
    ),
    per_person as (
      select subject, count(*) as n
      from open_reports group by subject
    ),
    surfaced as (
      select user_id from public.dev_report_queue()
    )
    select jsonb_build_object(
      'open_reports', (select coalesce(sum(n), 0) from per_person),
      'people',       (select count(*) from per_person),
      -- Reports about people the threshold is currently holding back.
      -- Not names: just enough to tell a quiet week from a bar set
      -- too high.
      'below_threshold', (
        select coalesce(sum(n), 0) from per_person
         where subject not in (select user_id from surfaced)
      )
    )
  );
end;
$$;


revoke all on function public.dev_report_queue()                from public;
revoke all on function public.dev_warn_user(text, text)         from public;
revoke all on function public.dev_ban_user(text, text, int)     from public;
revoke all on function public.dev_unban_user(text)              from public;
revoke all on function public.dev_dismiss_reports(text, text)   from public;
revoke all on function public.dev_report_backlog()              from public;

grant execute on function public.dev_report_queue()              to authenticated;
grant execute on function public.dev_warn_user(text, text)       to authenticated;
grant execute on function public.dev_ban_user(text, text, int)   to authenticated;
grant execute on function public.dev_unban_user(text)            to authenticated;
grant execute on function public.dev_dismiss_reports(text, text) to authenticated;
grant execute on function public.dev_report_backlog()            to authenticated;

-- ============================================================
--  Done.
-- ============================================================
