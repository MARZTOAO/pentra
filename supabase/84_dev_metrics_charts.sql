-- ============================================================
--  84 — numbers over time, for the developer metrics page.
--
--  59's dev_metrics() answers "how many, right now". Charts need
--  "how many, on each day", and that is what this adds:
--
--    dev_daily_active      a table: one row per day, one number —
--                          how many people opened Pentra that day
--    dev_metrics_series()  one call, one jsonb object: a row per day
--                          for the chosen range, plus the breakdowns
--                          the charts draw (platforms, top games, who
--                          is still around, where people drop off)
--
--  SAME LINE AS 59. Counts only. Nothing here returns a name, a
--  message, or what any one person did. dev_daily_active in particular
--  keeps a NUMBER per day, not a list of who was there — it cannot be
--  turned back into anybody's history, because it never had one.
--
--  DAILY ACTIVE STARTS TODAY. Postgres only knows each person's
--  most recent visit (last_seen_at), not every visit, so past days
--  can't be rebuilt. From the moment this runs, the first time anyone
--  turns up on a new day adds one to that day's count. Today is filled
--  in from last_seen_at on the way in, so the chart has a first point.
--  Days are UTC days. Invisible players aren't counted (the heartbeat
--  stops touching last_seen_at for them — see 32), same as 59.
--
--  TEST ACCOUNTS. The seed scripts make @example.test accounts. They
--  are never counted as daily active, and dev_metrics_series() leaves
--  them out of everything unless asked (real_only => false).
--
--  Everything else is rebuilt from the created_at columns already on
--  every table, so signups, posts, sessions and the rest have their
--  full history the first time the page opens. One honest caveat: a
--  deleted account takes its rows with it (cascade), so the history is
--  of accounts that still exist.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The daily-active counter. Sealed: RLS on, no policies, no
--     grants. Only the trigger below writes it and only
--     dev_metrics_series() reads it.
-- ------------------------------------------------------------
create table if not exists public.dev_daily_active (
  day   date primary key,
  users integer not null default 0 check (users >= 0)
);

alter table public.dev_daily_active enable row level security;
revoke all on table public.dev_daily_active from public, anon, authenticated;


-- Is this one of the seed scripts' accounts?
create or replace function public.is_test_account(who uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users u
     where u.id = who
       and lower(u.email) like '%@example.test'
  );
$$;

revoke all on function public.is_test_account(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
--  2. Counting a day.
--
--  Fires when last_seen_at moves. Adds one only on the FIRST visit of
--  a UTC day — the heartbeat touches last_seen_at every minute, and
--  every one after the first is already today. A brand-new account
--  counts on the day it signs up.
-- ------------------------------------------------------------
create or replace function public.count_daily_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_day date;
begin
  if new.last_seen_at is null then
    return null;
  end if;

  new_day := (new.last_seen_at at time zone 'UTC')::date;

  if tg_op = 'UPDATE'
     and old.last_seen_at is not null
     and (old.last_seen_at at time zone 'UTC')::date >= new_day then
    return null;                       -- already counted today
  end if;

  if public.is_test_account(new.id) then
    return null;
  end if;

  insert into public.dev_daily_active as d (day, users)
  values (new_day, 1)
  on conflict (day) do update set users = d.users + 1;

  return null;
end;
$$;

revoke all on function public.count_daily_active() from public, anon, authenticated;

drop trigger if exists profiles_count_daily_active on public.profiles;
create trigger profiles_count_daily_active
  after insert or update of last_seen_at on public.profiles
  for each row execute function public.count_daily_active();


-- Today, from what's already there. Anyone already seen today is in
-- this number, and their next heartbeat won't add them again (their
-- last visit is already today), so it is exact rather than an estimate.
-- On a re-run, today's row already exists and is left alone.
insert into public.dev_daily_active (day, users)
select (now() at time zone 'UTC')::date, count(*)
  from public.profiles p
 where (p.last_seen_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
   and not public.is_test_account(p.id)
on conflict (day) do nothing;


-- ------------------------------------------------------------
--  3. The series.
--
--  days      how far back: 7 to 365 (clamped)
--  tz        the developer's own time zone, so "today" on the chart
--            is their today. Anything Postgres doesn't recognise
--            falls back to UTC rather than failing.
--  real_only leave out the seed scripts' @example.test accounts
-- ------------------------------------------------------------
create or replace function public.dev_metrics_series(
  days      integer default 30,
  tz        text    default 'UTC',
  real_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  span      integer;
  zone      text := coalesce(nullif(btrim(tz), ''), 'UTC');
  today     date;
  first_day date;
  since     timestamptz;
  test_ids  uuid[] := '{}';
  out       jsonb;
begin
  -- Definer function: it reads past row level security, so this check
  -- is the only thing between an ordinary account and these numbers.
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  span := least(365, greatest(7, coalesce(days, 30)));

  begin
    perform now() at time zone zone;
  exception when others then
    zone := 'UTC';
  end;

  today     := (now() at time zone zone)::date;
  first_day := today - (span - 1);
  since     := first_day::timestamp at time zone zone;   -- local midnight

  if real_only then
    select coalesce(array_agg(u.id), '{}') into test_ids
      from auth.users u
     where lower(u.email) like '%@example.test';
  end if;

  with
  people as (
    select p.*
      from public.profiles p
     where not (p.id = any(test_ids))
  ),
  calendar as (
    select d::date as day
      from generate_series(first_day, today, interval '1 day') d
  ),
  signups as (
    select (created_at at time zone zone)::date as day, count(*) as n
      from people where created_at >= since group by 1
  ),
  posts_d as (
    select (created_at at time zone zone)::date as day,
           count(*) filter (where kind = 'lfg') as sessions,
           count(*) filter (where kind is distinct from 'lfg') as posts
      from public.posts
     where created_at >= since and not (author_id = any(test_ids))
     group by 1
  ),
  joins_d as (
    -- Joins by someone other than the host. The host has a row too
    -- (that's how 59 counts host-only), so it is left out here.
    select (s.joined_at at time zone zone)::date as day, count(*) as n
      from public.session_players s
      join public.posts p on p.id = s.post_id
     where s.joined_at >= since
       and s.user_id <> p.author_id
       and not (s.user_id = any(test_ids))
     group by 1
  ),
  comments_d as (
    select (created_at at time zone zone)::date as day, count(*) as n
      from public.post_comments
     where created_at >= since and not (author_id = any(test_ids))
     group by 1
  ),
  likes_d as (
    select (created_at at time zone zone)::date as day, count(*) as n
      from public.post_likes
     where created_at >= since and not (user_id = any(test_ids))
     group by 1
  ),
  messages_d as (
    select (created_at at time zone zone)::date as day, count(*) as n
      from public.messages
     where created_at >= since and not (sender_id = any(test_ids))
     group by 1
  ),
  friends_d as (
    select (coalesce(responded_at, created_at) at time zone zone)::date as day,
           count(*) as n
      from public.friendships
     where status = 'accepted'
       and coalesce(responded_at, created_at) >= since
       and not (requester_id = any(test_ids))
       and not (addressee_id = any(test_ids))
     group by 1
  ),
  referrals_d as (
    select (created_at at time zone zone)::date as day, count(*) as n
      from public.referrals
     where created_at >= since and not (referred_id = any(test_ids))
     group by 1
  ),
  before_range as (
    select count(*) as n from people where created_at < since
  ),
  daily as (
    select c.day,
           coalesce(s.n, 0)          as signups,
           (select n from before_range)
             + sum(coalesce(s.n, 0)) over (order by c.day) as accounts,
           a.users                   as active,      -- null = not recorded
           coalesce(p.posts, 0)      as posts,
           coalesce(p.sessions, 0)   as sessions,
           coalesce(j.n, 0)          as joins,
           coalesce(cm.n, 0)         as comments,
           coalesce(l.n, 0)          as likes,
           coalesce(m.n, 0)          as messages,
           coalesce(f.n, 0)          as friendships,
           coalesce(r.n, 0)          as referrals
      from calendar c
      left join signups     s  on s.day  = c.day
      left join public.dev_daily_active a on a.day = c.day
      left join posts_d     p  on p.day  = c.day
      left join joins_d     j  on j.day  = c.day
      left join comments_d  cm on cm.day = c.day
      left join likes_d     l  on l.day  = c.day
      left join messages_d  m  on m.day  = c.day
      left join friends_d   f  on f.day  = c.day
      left join referrals_d r  on r.day  = c.day
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days',         span,
    'tz',           zone,
    'real_only',    real_only,
    'test_accounts', (select count(*) from auth.users u
                       where lower(u.email) like '%@example.test'),
    'active_since', (select min(day) from public.dev_daily_active),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', day, 'signups', signups, 'accounts', accounts,
               'active', active, 'posts', posts, 'sessions', sessions,
               'joins', joins, 'comments', comments, 'likes', likes,
               'messages', messages, 'friendships', friendships,
               'referrals', referrals) order by day), '[]'::jsonb)
        from daily
    ),

    -- Free vs Pro, right now.
    'tiers', (
      select jsonb_build_object(
        'pro',  count(*) filter (where public.row_has_plus(tier, tier_expires_at)),
        'free', count(*) filter (where not public.row_has_plus(tier, tier_expires_at)))
        from people
    ),

    -- Main platform. Top eight; the rest folded into "Other".
    'platforms', (
      with c as (
        select coalesce(nullif(btrim(primary_platform), ''), 'Not set') as label,
               count(*) as n
          from people group by 1
      ), r as (
        select label, n, row_number() over (order by n desc, label) as k from c
      )
      select coalesce(jsonb_agg(jsonb_build_object('label', label, 'n', n)
                                order by n desc, label), '[]'::jsonb)
        from (
          select label, n from r where k <= 8
          union all
          select 'Other', sum(n)::bigint from r where k > 8 having count(*) > 0
        ) x
    ),

    -- The games most often in people's Top 5.
    'top_games', (
      select coalesce(jsonb_agg(jsonb_build_object('label', name, 'n', n)
                                order by n desc, name), '[]'::jsonb)
        from (
          select g.name, count(distinct t.user_id) as n
            from public.top_five t
            join public.games g on g.id = t.game_id
           where not (t.user_id = any(test_ids))
           group by g.name
           order by n desc, g.name
           limit 8
        ) x
    ),

    -- Accounts older than a week, sorted into exactly one box each.
    'health', (
      select jsonb_build_object(
        'active',  count(*) filter (where not never and last_seen_at >= now() - interval '7 days'),
        'quiet',   count(*) filter (where not never and last_seen_at <  now() - interval '7 days'
                                                    and last_seen_at >= now() - interval '30 days'),
        'gone',    count(*) filter (where not never and last_seen_at <  now() - interval '30 days'),
        'never',   count(*) filter (where never))
        from (
          select last_seen_at,
                 (last_seen_at is null
                  or last_seen_at < created_at + interval '1 day') as never
            from people
           where created_at < now() - interval '7 days'
        ) x
    ),

    -- Where new players drop off. Each step is "has ever done this".
    'funnel', jsonb_build_object(
      'accounts', (select count(*) from people),
      'top_five', (select count(distinct t.user_id) from public.top_five t
                    where t.user_id in (select id from people)),
      'played',   (select count(distinct s.user_id) from public.session_players s
                    where s.user_id in (select id from people)),
      'friend',   (select count(distinct x.id) from (
                     select requester_id as id from public.friendships where status = 'accepted'
                     union
                     select addressee_id from public.friendships where status = 'accepted'
                   ) x where x.id in (select id from people))
    ),

    -- Sessions that have started, in the range: did anybody come?
    'session_fill', (
      select jsonb_build_object(
        'host_only', count(*) filter (where joined <= 1),
        'partial',   count(*) filter (where joined > 1 and joined < coalesce(slots, 0)),
        'full',      count(*) filter (where joined > 1 and joined >= coalesce(slots, 0)))
        from (
          select p.slots,
                 (select count(*) from public.session_players s where s.post_id = p.id) as joined
            from public.posts p
           where p.kind = 'lfg'
             and p.starts_at >= since
             and p.starts_at <  now()
             and not (p.author_id = any(test_ids))
        ) x
    )
  ) into out;

  return out;
end;
$$;

revoke all on function public.dev_metrics_series(integer, text, boolean) from public, anon;
grant execute on function public.dev_metrics_series(integer, text, boolean) to authenticated;

-- ============================================================
--  Done. No What's New entry: nobody but developers can see this.
--
--  Check (read-only):
--    select * from public.dev_daily_active order by day desc limit 7;
-- ============================================================
