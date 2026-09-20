-- ============================================================
--  44 — achievements.
--
--  Two kinds, and the difference is not cosmetic.
--
--  THRESHOLD achievements are a number reaching a number: ten
--  sessions joined, a hundred likes received. They are entirely
--  derivable from profile_stats, which means they need no code of
--  their own — the catalogue row says which counter and how many,
--  and one function checks them all. It also means they can be
--  awarded retroactively, so nobody's profile is empty the day this
--  ships.
--
--  MOMENT achievements have to be caught as they happen, because the
--  evidence does not survive. "Filled a session" is only true for the
--  instant the last slot is taken; an hour later the session looks
--  the same whether it filled in ten minutes or three days. These get
--  a trigger each, and nobody earns them for anything they did before
--  today.
--
--  Adding a threshold achievement later is one INSERT. Adding a
--  moment one is a trigger.
--
--  Run in the Supabase SQL Editor, after 43.
-- ============================================================


-- ------------------------------------------------------------
--  FIRST, a fix to 43.
--
--  stats_on_join() returned early for the host, which was right for
--  the counter — the host is already credited with hosting, and
--  counting it as a session joined too would double up — but it also
--  skipped writing their attendance row. The host was therefore
--  absent from the play history entirely.
--
--  That made "played with" wrong for everybody: play a session with
--  the host and two others and it counted two. It would also have
--  made Regulars below unearnable with the person you play with
--  most, which is how it was found.
--
--  The host attends. Only the counter skips them.
-- ------------------------------------------------------------
create or replace function public.stats_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host   uuid;
  is_new boolean := false;
begin
  select p.author_id into host from posts p where p.id = new.post_id;

  insert into session_attendance (post_id, user_id)
  values (new.post_id, new.user_id)
  on conflict (post_id, user_id) do nothing;

  get diagnostics is_new = row_count;

  -- The host's slot is counted as a session hosted, not joined.
  if host = new.user_id then
    return new;
  end if;

  if is_new then
    insert into profile_stats (user_id, sessions_joined)
    values (new.user_id, 1)
    on conflict (user_id) do update set
      sessions_joined = profile_stats.sessions_joined + 1,
      updated_at      = now();
  end if;

  return new;
end;
$$;

-- And the hosts 43's backfill left out of the history.
insert into public.session_attendance (post_id, user_id, joined_at)
select sp.post_id, sp.user_id, coalesce(sp.joined_at, now())
  from public.session_players sp
on conflict (post_id, user_id) do nothing;


-- ------------------------------------------------------------
--  The catalogue.
--
--  In a table rather than in the app, so the list is the same for
--  everybody the instant it changes and a new one doesn't need a
--  deploy. stat_key is what splits the two kinds: set it and the
--  generic check below owns the achievement, leave it null and a
--  trigger does.
-- ------------------------------------------------------------
create table if not exists public.achievements (
  code        text primary key,
  name        text not null,
  description text not null,
  -- 'sessions' | 'social' | 'content' | 'milestone'. Decides the icon
  -- and groups the grid.
  category    text not null default 'milestone',
  -- Threshold achievements only.
  stat_key    text,
  threshold   int,
  -- Not shown until earned. For the ones where telling somebody what
  -- they missed is worse than saying nothing.
  secret      boolean not null default false,
  sort_order  int not null default 0,

  constraint achievement_shape check (
    (stat_key is null and threshold is null)
    or (stat_key is not null and threshold is not null and threshold > 0)
  )
);

alter table public.achievements enable row level security;

drop policy if exists "achievements are readable" on public.achievements;
create policy "achievements are readable"
  on public.achievements for select
  to authenticated
  using (true);


create table if not exists public.profile_achievements (
  user_id   uuid not null references public.profiles(id)     on delete cascade,
  code      text not null references public.achievements(code) on delete cascade,
  earned_at timestamptz not null default now(),

  primary key (user_id, code)
);

create index if not exists profile_achievements_user_idx
  on public.profile_achievements (user_id, earned_at desc);

alter table public.profile_achievements enable row level security;

drop policy if exists "earned achievements are readable" on public.profile_achievements;
create policy "earned achievements are readable"
  on public.profile_achievements for select
  to authenticated
  using (true);

-- No write policy anywhere. Everything below is security definer, so
-- nothing the client sends can award itself a badge.


-- ------------------------------------------------------------
--  The list.
--
--  `on conflict do update` rather than `do nothing`: re-running this
--  file should correct a name or a threshold that was wrong, not
--  silently keep the old one.
-- ------------------------------------------------------------
insert into public.achievements
  (code, name, description, category, stat_key, threshold, secret, sort_order)
values
  -- Getting started.
  ('first_post',    'Hello World',   'Made your first post.',
     'content',   'posts_made',       1,   false, 10),
  ('first_session', 'Showed Up',     'Joined your first session.',
     'sessions',  'sessions_joined',  1,   false, 20),
  ('first_host',    'Host',          'Posted your first session.',
     'sessions',  'sessions_hosted',  1,   false, 30),
  ('first_friend',  'Not Alone',     'Made your first friend.',
     'social',    'friends_peak',     1,   false, 40),

  -- Sessions.
  ('sessions_10',   'Regular',       'Joined 10 sessions.',
     'sessions',  'sessions_joined',  10,  false, 110),
  ('sessions_50',   'Fixture',       'Joined 50 sessions.',
     'sessions',  'sessions_joined',  50,  false, 120),
  ('host_10',       'Organiser',     'Posted 10 sessions.',
     'sessions',  'sessions_hosted',  10,  false, 130),
  ('full_house',    'Full House',    'Hosted a session that filled every slot.',
     'sessions',  null,               null, false, 140),
  ('short_notice',  'Short Notice',  'Joined a session starting within the hour.',
     'sessions',  null,               null, false, 150),

  -- Social.
  ('mixer_25',      'Mixer',         'Played with 25 different people.',
     'social',    'played_with',      25,  false, 210),
  ('friends_10',    'Well Connected','Had 10 friends at once.',
     'social',    'friends_peak',     10,  false, 220),
  ('recruiter_5',   'Recruiter',     'Five people accepted a session invite from you.',
     'social',    'invites_accepted', 5,   false, 230),
  ('regulars',      'Regulars',      'Played three sessions with the same person.',
     'social',    null,               null, false, 240),

  -- Content.
  ('poster_25',     'Prolific',      'Made 25 posts.',
     'content',   'posts_made',       25,  false, 310),
  ('commenter_50',  'In the Replies','Left 50 comments.',
     'content',   'comments_made',    50,  false, 320),
  ('liked_100',     'Well Received', 'Received 100 likes.',
     'content',   'likes_received',   100, false, 330),

  -- Milestones.
  ('anniversary',   'One Year',      'A year since you signed up.',
     'milestone', 'days_member',      365, false, 410),
  ('founder',       'Founder',       'One of the first 100 accounts.',
     'milestone', null,               null, true,  420)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  stat_key    = excluded.stat_key,
  threshold   = excluded.threshold,
  secret      = excluded.secret,
  sort_order  = excluded.sort_order;


-- ------------------------------------------------------------
--  Reading a counter by name, without dynamic SQL.
--
--  A CASE rather than `execute format(...)`: the set of keys is small
--  and known, and a typo in a catalogue row should return nothing
--  rather than run whatever text somebody put in the column.
--
--  played_with and days_member are not stored on profile_stats —
--  they are worked out on read in 43 — so they are worked out here
--  too rather than being duplicated into a counter that could drift.
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
    when 'played_with'      then (
      select count(distinct a2.user_id)::int
        from session_attendance a1
        join session_attendance a2
          on a2.post_id = a1.post_id and a2.user_id <> target
       where a1.user_id = target)
    when 'days_member'      then (
      select greatest(0, current_date - coalesce(pr.created_at, now())::date)
        from profiles pr where pr.id = target)
    else null
  end
  from profile_stats s
  where s.user_id = target;
$$;


-- ------------------------------------------------------------
--  Awarding.
--
--  One function for every threshold achievement there will ever be.
--  Earned achievements are never taken away, so a counter that can
--  fall — friends_now — is not something to hang one on; the
--  catalogue uses friends_peak for exactly that reason.
-- ------------------------------------------------------------
create or replace function public.award_threshold_achievements(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a achievements%rowtype;
begin
  if target is null then
    return;
  end if;

  for a in
    select * from achievements
     where stat_key is not null
       and code not in (
         select code from profile_achievements where user_id = target
       )
  loop
    if coalesce(public.stat_value(target, a.stat_key), 0) >= a.threshold then
      insert into profile_achievements (user_id, code)
      values (target, a.code)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;


/** The moment kind. Called from the triggers below. */
create or replace function public.award_achievement(target uuid, want_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target is null then
    return;
  end if;

  insert into profile_achievements (user_id, code)
  values (target, want_code)
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------
--  Threshold achievements ride on the stats.
--
--  Every counter in 43 is written through profile_stats, so watching
--  that one table catches all of them — there is no achievement
--  check to remember to add when a new counter appears.
--
--  No recursion risk: this writes to profile_achievements, which
--  nothing here is watching.
-- ------------------------------------------------------------
create or replace function public.stats_check_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_threshold_achievements(new.user_id);
  return new;
end;
$$;

drop trigger if exists stats_award_achievements on public.profile_stats;
create trigger stats_award_achievements
  after insert or update on public.profile_stats
  for each row execute function public.stats_check_achievements();


-- ------------------------------------------------------------
--  Full House — the host's session filled every slot.
--
--  Checked on the insert that fills it. A session that fills, loses
--  somebody and fills again awards once, because the achievement is
--  already held the second time.
-- ------------------------------------------------------------
create or replace function public.check_full_house()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p     posts%rowtype;
  taken int;
begin
  select * into p from posts where id = new.post_id;

  if p.id is null or p.kind <> 'lfg' or p.slots is null then
    return new;
  end if;

  select count(*) into taken from session_players where post_id = new.post_id;

  if taken >= p.slots then
    perform public.award_achievement(p.author_id, 'full_house');
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_full_house on public.session_players;
create trigger session_players_full_house
  after insert on public.session_players
  for each row execute function public.check_full_house();


-- ------------------------------------------------------------
--  Short Notice — joined something starting within the hour.
--
--  The host is skipped: they are seated the moment they post, so
--  posting a session for twenty minutes' time would award it for
--  nothing.
-- ------------------------------------------------------------
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

  if new.user_id = p.author_id then
    return new;
  end if;

  if p.starts_at > now() and p.starts_at <= now() + interval '1 hour' then
    perform public.award_achievement(new.user_id, 'short_notice');
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_short_notice on public.session_players;
create trigger session_players_short_notice
  after insert on public.session_players
  for each row execute function public.check_short_notice();


-- ------------------------------------------------------------
--  Regulars — three sessions with the same person.
--
--  Read off session_attendance, which is the append-only history
--  from 43, so it survives both of them leaving. Awarded to both
--  sides: it is a fact about the pair.
-- ------------------------------------------------------------
create or replace function public.check_regulars()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other uuid;
begin
  for other in
    select a2.user_id
      from session_attendance a1
      join session_attendance a2
        on a2.post_id = a1.post_id and a2.user_id <> new.user_id
     where a1.user_id = new.user_id
     group by a2.user_id
    having count(distinct a1.post_id) >= 3
  loop
    perform public.award_achievement(new.user_id, 'regulars');
    perform public.award_achievement(other, 'regulars');
  end loop;

  return new;
end;
$$;

drop trigger if exists attendance_regulars on public.session_attendance;
create trigger attendance_regulars
  after insert on public.session_attendance
  for each row execute function public.check_regulars();


-- ------------------------------------------------------------
--  Founder — one of the first hundred accounts.
--
--  Secret, because "be one of the first 100" is not something
--  account number four thousand can do anything about, and showing
--  them a locked badge for it is just a way of telling them they are
--  late.
-- ------------------------------------------------------------
create or replace function public.check_founder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from profiles) <= 100 then
    perform public.award_achievement(new.id, 'founder');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_founder on public.profiles;
create trigger profiles_founder
  after insert on public.profiles
  for each row execute function public.check_founder();


-- ------------------------------------------------------------
--  Reading them.
--
--  Every achievement, earned or not, with progress towards the ones
--  that have a number. Unearned secrets come back without their name
--  or description — the row is there so the grid can show a locked
--  tile, but it doesn't say what it is.
-- ------------------------------------------------------------
create or replace function public.get_achievements(target uuid)
returns table (
  code        text,
  name        text,
  description text,
  category    text,
  secret      boolean,
  earned_at   timestamptz,
  progress    int,
  threshold   int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.code,
    case when pa.user_id is null and a.secret then null else a.name end,
    case when pa.user_id is null and a.secret then null else a.description end,
    a.category,
    a.secret,
    pa.earned_at,
    case
      when pa.user_id is not null then a.threshold
      when a.stat_key is null     then null
      -- Never show progress past the bar: a counter can pass the
      -- threshold a moment before the trigger writes the row.
      else least(coalesce(public.stat_value(target, a.stat_key), 0), a.threshold)
    end as progress,
    a.threshold
  from achievements a
  left join profile_achievements pa
    on pa.code = a.code and pa.user_id = target
  order by
    -- Earned first, newest at the front: a profile should open on
    -- what somebody did, not on what they haven't.
    (pa.user_id is null),
    pa.earned_at desc nulls last,
    a.sort_order;
$$;

grant execute on function public.get_achievements(uuid) to authenticated;


-- ============================================================
--  BACKFILL
--
--  Every threshold achievement anybody already qualifies for, plus
--  Founder for the hundred oldest accounts. Safe to re-run.
--
--  The moment achievements are NOT backfilled and cannot be. Whether
--  a session ever filled, whether somebody joined at short notice —
--  none of that is recoverable from how things look now. They start
--  from today.
--
--  Regulars is the exception: it reads session_attendance, which 43
--  seeded from the current rosters, so it can be worked out and is
--  awarded below.
-- ============================================================

do $$
declare
  person uuid;
begin
  for person in select id from profiles loop
    perform public.award_threshold_achievements(person);
  end loop;
end $$;

-- Founder, for the hundred oldest accounts.
insert into public.profile_achievements (user_id, code)
select id, 'founder'
  from public.profiles
 order by coalesce(created_at, now()), id
 limit 100
on conflict do nothing;

-- Regulars, from the attendance history that 43 seeded.
insert into public.profile_achievements (user_id, code)
select distinct a1.user_id, 'regulars'
  from session_attendance a1
  join session_attendance a2
    on a2.post_id = a1.post_id and a2.user_id <> a1.user_id
 group by a1.user_id, a2.user_id
having count(distinct a1.post_id) >= 3
on conflict do nothing;

-- ============================================================
--  Done.
-- ============================================================
