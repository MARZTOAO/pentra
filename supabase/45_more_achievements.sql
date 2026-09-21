-- ============================================================
--  45 — forty achievements, on a real difficulty ladder.
--
--  44 shipped eighteen, most of them reachable in a fortnight. This
--  takes it to forty and spreads them out: a handful you earn on your
--  first evening, a middle band that takes months, and a few at the
--  top that take years and are meant to.
--
--  The shape of the ladder, per line of play:
--
--      first one  ->  a few dozen  ->  a few hundred  ->  a thousand
--
--  Somebody who plays twice a week is at "Regular" in five weeks,
--  "Fixture" in six months, "Veteran" in two and a half years and
--  will probably never see "Lifer". That is the point — a ladder
--  everybody finishes is a checklist, and people stop looking at it
--  the moment they do.
--
--  Most of this file is catalogue rows, which need no code: 44's
--  generic check owns anything with a stat_key. What needs building
--  is the handful of new things to count.
--
--  Run in the Supabase SQL Editor, after 44.
-- ============================================================


-- ------------------------------------------------------------
--  Two new counters.
--
--  Both are "how many times has this happened to you", and neither
--  can be worked out after the fact from how things look now — a
--  session that filled and then lost somebody is indistinguishable
--  from one that never filled. So they are counted as they happen,
--  like everything else in 43.
-- ------------------------------------------------------------
alter table public.profile_stats
  add column if not exists full_houses   int not null default 0,
  add column if not exists short_notices int not null default 0;


-- Which sessions have ever been full. The counter needs this: without
-- it, a session that fills, loses somebody and fills again would count
-- twice, and filling the same session repeatedly would be a way to run
-- the number up.
create table if not exists public.session_full_houses (
  post_id  bigint primary key,
  host_id  uuid not null references public.profiles(id) on delete cascade,
  filled_at timestamptz not null default now()
);

alter table public.session_full_houses enable row level security;

drop policy if exists "full houses are readable" on public.session_full_houses;
create policy "full houses are readable"
  on public.session_full_houses for select
  to authenticated
  using (true);


-- ------------------------------------------------------------
--  Full House, now counted as well as awarded.
-- ------------------------------------------------------------
create or replace function public.check_full_house()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p      posts%rowtype;
  taken  int;
  is_new boolean := false;
begin
  select * into p from posts where id = new.post_id;

  if p.id is null or p.kind <> 'lfg' or p.slots is null then
    return new;
  end if;

  select count(*) into taken from session_players where post_id = new.post_id;

  if taken < p.slots then
    return new;
  end if;

  insert into session_full_houses (post_id, host_id)
  values (new.post_id, p.author_id)
  on conflict (post_id) do nothing;

  get diagnostics is_new = row_count;

  -- Only the first time this session filled.
  if not is_new then
    return new;
  end if;

  perform public.award_achievement(p.author_id, 'full_house');

  insert into profile_stats (user_id, full_houses)
  values (p.author_id, 1)
  on conflict (user_id) do update set
    full_houses = profile_stats.full_houses + 1,
    updated_at  = now();

  return new;
end;
$$;


-- ------------------------------------------------------------
--  Short Notice, moved onto attendance.
--
--  It was a trigger on session_players, which fires again every time
--  somebody leaves and rejoins. session_attendance has a primary key
--  on (post_id, user_id) and is never deleted, so an insert there
--  happens exactly once per person per session — which is precisely
--  the rule this counter needs, for free.
-- ------------------------------------------------------------
drop trigger if exists session_players_short_notice on public.session_players;

create or replace function public.check_short_notice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p posts%rowtype;
begin
  select * into p from posts where id = new.post_id;

  if p.id is null or p.kind <> 'lfg' or p.starts_at is null then
    return new;
  end if;

  -- The host is seated the moment they post, so posting a session for
  -- twenty minutes' time would otherwise award it for nothing.
  if new.user_id = p.author_id then
    return new;
  end if;

  if p.starts_at > new.joined_at
     and p.starts_at <= new.joined_at + interval '1 hour' then
    perform public.award_achievement(new.user_id, 'short_notice');

    insert into profile_stats (user_id, short_notices)
    values (new.user_id, 1)
    on conflict (user_id) do update set
      short_notices = profile_stats.short_notices + 1,
      updated_at    = now();
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_short_notice on public.session_attendance;
create trigger attendance_short_notice
  after insert on public.session_attendance
  for each row execute function public.check_short_notice();


-- ------------------------------------------------------------
--  Three more things to count, worked out on read.
--
--  These are derived rather than stored because each is a query over
--  data that already exists, and a stored counter is one more thing
--  that can drift. They are only read when somebody looks at a
--  profile.
--
--  week_streak is the interesting one: the longest run of consecutive
--  weeks containing at least one session. The trick is the standard
--  one for runs — subtract each row's position from its date, and
--  every consecutive week lands on the same value, so grouping by it
--  gives the runs.
-- ------------------------------------------------------------
create or replace function public.stat_value(target uuid, key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case key
    when 'posts_made'       then s.posts_made
    when 'comments_made'    then s.comments_made
    when 'likes_given'      then s.likes_given
    when 'likes_received'   then s.likes_received
    when 'sessions_hosted'  then s.sessions_hosted
    when 'sessions_joined'  then s.sessions_joined
    when 'invites_sent'     then s.invites_sent
    when 'invites_accepted' then s.invites_accepted
    when 'friends_now'      then s.friends_now
    when 'friends_peak'     then s.friends_peak
    when 'full_houses'      then s.full_houses
    when 'short_notices'    then s.short_notices

    when 'played_with'      then (
      select count(distinct a2.user_id)::int
        from session_attendance a1
        join session_attendance a2
          on a2.post_id = a1.post_id and a2.user_id <> target
       where a1.user_id = target)

    when 'days_member'      then (
      select greatest(0, current_date - coalesce(pr.created_at, now())::date)
        from profiles pr where pr.id = target)

    when 'games_owned'      then (
      select count(*)::int from game_library gl where gl.user_id = target)

    -- Sessions whose post named a game. A session for a deleted post
    -- drops out, which is the honest answer: we no longer know what
    -- game it was for.
    when 'distinct_games_played' then (
      select count(distinct p.game_id)::int
        from session_attendance a
        join posts p on p.id = a.post_id
       where a.user_id = target and p.game_id is not null)

    when 'week_streak'      then (
      select coalesce(max(run), 0)::int
        from (
          select count(*) as run
            from (
              -- row_number() is bigint and `date - bigint` is not an
              -- operator Postgres has; the cast is load-bearing.
              select w,
                     (w - (row_number() over (order by w)::int * 7)) as island
                from (
                  select distinct date_trunc('week', a.joined_at)::date as w
                    from session_attendance a
                   where a.user_id = target
                ) weeks
            ) grouped
           group by island
        ) runs)

    else null
  end
  from profile_stats s
  where s.user_id = target;
$$;


-- ------------------------------------------------------------
--  The full forty.
--
--  Re-inserted whole rather than only the new ones, so this file is
--  the single description of the catalogue and re-running it fixes
--  anything that drifted. `on conflict do update` keeps the earned
--  rows — those live in profile_achievements and are not touched.
--
--  sort_order groups them by line of play and orders each group by
--  difficulty, so "Show all" reads as a ladder rather than a bag.
-- ------------------------------------------------------------
insert into public.achievements
  (code, name, description, category, stat_key, threshold, secret, sort_order)
values
  -- ---- Posting -------------------------------------------------
  ('first_post',      'Hello World',      'Made your first post.',
     'content',  'posts_made',      1,    false, 100),
  ('poster_25',       'Prolific',         'Made 25 posts.',
     'content',  'posts_made',      25,   false, 101),
  ('poster_250',      'Broadcaster',      'Made 250 posts.',
     'content',  'posts_made',      250,  false, 102),
  ('poster_1000',     'Printing Press',   'Made 1,000 posts.',
     'content',  'posts_made',      1000, false, 103),

  -- ---- Commenting ----------------------------------------------
  ('commenter_50',    'In the Replies',   'Left 50 comments.',
     'content',  'comments_made',   50,   false, 110),
  ('commenter_500',   'Never Silent',     'Left 500 comments.',
     'content',  'comments_made',   500,  false, 111),

  -- ---- Being read ----------------------------------------------
  ('liked_100',       'Well Received',    'Received 100 likes.',
     'content',  'likes_received',  100,  false, 120),
  ('liked_1000',      'Crowd Pleaser',    'Received 1,000 likes.',
     'content',  'likes_received',  1000, false, 121),
  ('liked_5000',      'Household Name',   'Received 5,000 likes.',
     'content',  'likes_received',  5000, false, 122),

  -- ---- Turning up ----------------------------------------------
  ('first_session',   'Showed Up',        'Joined your first session.',
     'sessions', 'sessions_joined', 1,    false, 200),
  ('sessions_10',     'Regular',          'Joined 10 sessions.',
     'sessions', 'sessions_joined', 10,   false, 201),
  ('sessions_50',     'Fixture',          'Joined 50 sessions.',
     'sessions', 'sessions_joined', 50,   false, 202),
  ('sessions_250',    'Veteran',          'Joined 250 sessions.',
     'sessions', 'sessions_joined', 250,  false, 203),
  ('sessions_1000',   'Lifer',            'Joined 1,000 sessions.',
     'sessions', 'sessions_joined', 1000, false, 204),

  -- ---- Hosting -------------------------------------------------
  ('first_host',      'Host',             'Posted your first session.',
     'sessions', 'sessions_hosted', 1,    false, 210),
  ('host_10',         'Organiser',        'Posted 10 sessions.',
     'sessions', 'sessions_hosted', 10,   false, 211),
  ('host_100',        'Ringleader',       'Posted 100 sessions.',
     'sessions', 'sessions_hosted', 100,  false, 212),
  ('host_500',        'Backbone',         'Posted 500 sessions.',
     'sessions', 'sessions_hosted', 500,  false, 213),

  -- ---- Filling them --------------------------------------------
  ('full_house',      'Full House',       'Hosted a session that filled every slot.',
     'sessions', null,              null, false, 220),
  ('full_house_10',   'Packed Out',       'Filled 10 sessions you hosted.',
     'sessions', 'full_houses',     10,   false, 221),
  ('full_house_50',   'Standing Room Only','Filled 50 sessions you hosted.',
     'sessions', 'full_houses',     50,   false, 222),

  -- ---- Being available -----------------------------------------
  ('short_notice',    'Short Notice',     'Joined a session starting within the hour.',
     'sessions', null,              null, false, 230),
  ('short_notice_25', 'Always Around',    'Joined 25 sessions at under an hour''s notice.',
     'sessions', 'short_notices',   25,   false, 231),

  -- ---- Keeping it up -------------------------------------------
  ('streak_12',       'Three Months Straight', 'Played a session every week for 12 weeks.',
     'sessions', 'week_streak',     12,   false, 240),
  ('streak_52',       'Unbroken',         'Played a session every week for a year.',
     'sessions', 'week_streak',     52,   false, 241),

  -- ---- Friends -------------------------------------------------
  ('first_friend',    'Not Alone',        'Made your first friend.',
     'social',   'friends_peak',    1,    false, 300),
  ('friends_10',      'Well Connected',   'Had 10 friends at once.',
     'social',   'friends_peak',    10,   false, 301),
  ('friends_50',      'Popular',          'Had 50 friends at once.',
     'social',   'friends_peak',    50,   false, 302),
  ('friends_150',     'Dunbar''s Limit',  'Had 150 friends at once.',
     'social',   'friends_peak',    150,  false, 303),

  -- ---- Who you play with ---------------------------------------
  ('regulars',        'Regulars',         'Played three sessions with the same person.',
     'social',   null,              null, false, 310),
  ('mixer_25',        'Mixer',            'Played with 25 different people.',
     'social',   'played_with',     25,   false, 311),
  ('mixer_100',       'Social Butterfly', 'Played with 100 different people.',
     'social',   'played_with',     100,  false, 312),
  ('mixer_500',       'Everyone Knows You','Played with 500 different people.',
     'social',   'played_with',     500,  false, 313),

  -- ---- Bringing people in --------------------------------------
  ('recruiter_5',     'Recruiter',        'Five people accepted a session invite from you.',
     'social',   'invites_accepted', 5,   false, 320),
  ('recruiter_50',    'Talent Scout',     'Fifty people accepted a session invite from you.',
     'social',   'invites_accepted', 50,  false, 321),

  -- ---- Games ---------------------------------------------------
  -- Only one for library size, and deliberately. A library is
  -- self-reported — you can add a hundred games in an afternoon
  -- without playing any of them — so it is the easiest number here to
  -- inflate, and a ladder of them would reward doing exactly that.
  -- Games actually played is the harder and more interesting one.
  ('library_25',      'Collector',        'Put 25 games in your library.',
     'games',    'games_owned',     25,   false, 400),
  ('variety_25',      'Variety Pack',     'Played sessions for 25 different games.',
     'games',    'distinct_games_played', 25, false, 402),

  -- ---- Time served ---------------------------------------------
  ('anniversary',     'One Year',         'A year since you signed up.',
     'milestone','days_member',     365,  false, 500),
  ('five_years',      'Five Years',       'Five years since you signed up.',
     'milestone','days_member',     1825, false, 501),
  ('founder',         'Founder',          'One of the first 100 accounts.',
     'milestone', null,             null, true,  510)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  stat_key    = excluded.stat_key,
  threshold   = excluded.threshold,
  secret      = excluded.secret,
  sort_order  = excluded.sort_order;


-- ============================================================
--  BACKFILL
-- ============================================================

-- Sessions that are full right now. Not the same as "ever filled" —
-- one that filled last March and lost somebody is invisible — but it
-- is everything still knowable, and it beats starting everyone at
-- zero.
insert into public.session_full_houses (post_id, host_id, filled_at)
select p.id, p.author_id, coalesce(p.created_at, now())
  from public.posts p
 where p.kind = 'lfg'
   and p.slots is not null
   and (select count(*) from public.session_players sp
         where sp.post_id = p.id) >= p.slots
on conflict (post_id) do nothing;

-- Short notice, from the attendance history. The post has to still
-- exist for this to be knowable.
with counted as (
  select a.user_id,
         count(*)::int as n
    from public.session_attendance a
    join public.posts p on p.id = a.post_id
   where p.kind = 'lfg'
     and p.starts_at is not null
     and a.user_id <> p.author_id
     and p.starts_at >  a.joined_at
     and p.starts_at <= a.joined_at + interval '1 hour'
   group by a.user_id
)
update public.profile_stats s
   set short_notices = c.n, updated_at = now()
  from counted c
 where c.user_id = s.user_id;

with counted as (
  select host_id, count(*)::int as n
    from public.session_full_houses
   group by host_id
)
update public.profile_stats s
   set full_houses = c.n, updated_at = now()
  from counted c
 where c.host_id = s.user_id;

-- And award everything anybody now qualifies for.
do $$
declare
  person uuid;
begin
  for person in select id from profiles loop
    perform public.award_threshold_achievements(person);
  end loop;
end $$;

insert into public.profile_achievements (user_id, code)
select host_id, 'full_house' from public.session_full_houses
on conflict do nothing;

-- ============================================================
--  Done. Forty.
-- ============================================================
