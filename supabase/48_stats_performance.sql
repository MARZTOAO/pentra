-- ============================================================
--  48 — make profiles fast again.
--
--  Symptom: achievements took a visible moment to appear, and it got
--  worse the more somebody had played.
--
--  THE CAUSE. get_achievements() called stat_value() once per row.
--  With forty-three achievements that is up to thirty-five separate
--  invocations per profile view, and three of the things stat_value
--  can be asked for are not cheap:
--
--    played_with           self-join across session_attendance
--    week_streak           distinct weeks, then a window function
--    distinct_games_played join out to posts
--
--  Each invocation redid its own from scratch. The work was not
--  wrong, just repeated — the same profile answered the same
--  question thirty-five times to draw one screen.
--
--  award_threshold_achievements() had the identical loop, and that
--  one runs on EVERY like, comment, post and session join, because it
--  hangs off the profile_stats trigger. So the cost was on the write
--  path too, where nobody was looking for it.
--
--  Measured on 18,000 attendance rows, before:
--
--    get_achievements              16 ms
--    award_threshold_achievements  16 ms   (per like, per comment…)
--
--  THE FIX. Work the values out once into a small set of key/value
--  pairs, then join the catalogue against that. Thirty-five
--  evaluations become one, and both paths get it.
--
--  Run in the Supabase SQL Editor, after 47.
-- ============================================================


-- ------------------------------------------------------------
--  Every countable thing about somebody, in one pass.
--
--  Returned as rows rather than columns so the catalogue can be
--  joined straight onto it by stat_key — which is what turns a loop
--  of function calls into a single join.
-- ------------------------------------------------------------
create or replace function public.stat_snapshot(target uuid)
returns table (key text, value int)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select * from profile_stats where user_id = target
  ),
  derived as (
    select
      -- Each of these runs exactly once now, however many
      -- achievements end up asking about it.
      (select count(distinct a2.user_id)::int
         from session_attendance a1
         join session_attendance a2
           on a2.post_id = a1.post_id and a2.user_id <> target
        where a1.user_id = target)                          as played_with,

      (select greatest(0, current_date - coalesce(pr.created_at, now())::date)
         from profiles pr where pr.id = target)             as days_member,

      (select count(*)::int
         from game_library gl where gl.user_id = target)    as games_owned,

      (select count(distinct p.game_id)::int
         from session_attendance a
         join posts p on p.id = a.post_id
        where a.user_id = target and p.game_id is not null) as distinct_games_played,

      (select coalesce(max(run), 0)::int
         from (
           select count(*) as run
             from (
               select w,
                      (w - (row_number() over (order by w)::int * 7)) as island
                 from (
                   select distinct date_trunc('week', a.joined_at)::date as w
                     from session_attendance a
                    where a.user_id = target
                 ) weeks
             ) grouped
            group by island
         ) runs)                                            as week_streak
  )
  select v.key, v.value
    from s, derived d,
    lateral (values
      ('posts_made',            s.posts_made),
      ('comments_made',         s.comments_made),
      ('likes_given',           s.likes_given),
      ('likes_received',        s.likes_received),
      ('sessions_hosted',       s.sessions_hosted),
      ('sessions_joined',       s.sessions_joined),
      ('invites_sent',          s.invites_sent),
      ('invites_accepted',      s.invites_accepted),
      ('friends_now',           s.friends_now),
      ('friends_peak',          s.friends_peak),
      ('full_houses',           s.full_houses),
      ('short_notices',         s.short_notices),
      ('referrals_qualified',   s.referrals_qualified),
      ('played_with',           d.played_with),
      ('days_member',           d.days_member),
      ('games_owned',           d.games_owned),
      ('distinct_games_played', d.distinct_games_played),
      ('week_streak',           d.week_streak)
    ) as v(key, value);
$$;

grant execute on function public.stat_snapshot(uuid) to authenticated;


-- ------------------------------------------------------------
--  Awarding, without the loop.
--
--  This is the one that matters most. It is on the profile_stats
--  trigger, so it runs every time anybody likes anything.
-- ------------------------------------------------------------
create or replace function public.award_threshold_achievements(target uuid)
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
  select target, a.code
    from achievements a
    join public.stat_snapshot(target) v on v.key = a.stat_key
   where a.stat_key is not null
     and coalesce(v.value, 0) >= a.threshold
     and not exists (
       select 1 from profile_achievements pa
        where pa.user_id = target and pa.code = a.code
     )
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------
--  Reading them, without the loop.
--
--  Same output as before, column for column — only the way progress
--  is worked out has changed.
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
  with snap as (
    select * from public.stat_snapshot(target)
  )
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
      -- Never past the bar: a counter can pass the threshold a moment
      -- before the trigger writes the row.
      else least(coalesce(v.value, 0), a.threshold)
    end as progress,
    a.threshold
  from achievements a
  left join profile_achievements pa
    on pa.code = a.code and pa.user_id = target
  left join snap v
    on v.key = a.stat_key
  order by
    -- Earned first, newest at the front: a profile should open on
    -- what somebody did, not on what they haven't.
    (pa.user_id is null),
    pa.earned_at desc nulls last,
    a.sort_order;
$$;

grant execute on function public.get_achievements(uuid) to authenticated;


-- ------------------------------------------------------------
--  The referral panel, in one call instead of two.
--
--  It was calling my_referral_code() and then referral_summary(),
--  one after the other, because the summary is `stable` and cannot
--  create the code it reports on. Two round trips to draw one panel.
-- ------------------------------------------------------------
create or replace function public.referral_panel()
returns table (
  code       text,
  total      int,
  qualified  int,
  can_roll   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  mine        text;
  last_rolled timestamptz;
begin
  if me is null then
    return;
  end if;

  -- Not stable, so this one is allowed to make the code if it is the
  -- first time anybody has asked.
  mine := public.my_referral_code();

  select max(rc.retired_at) into last_rolled
    from referral_codes rc where rc.user_id = me;

  return query
  select
    mine,
    (select count(*)::int from referrals r where r.referrer_id = me),
    (select count(*)::int from referrals r
      where r.referrer_id = me and r.qualified_at is not null),
    (last_rolled is null or last_rolled <= now() - interval '1 hour');
end;
$$;

grant execute on function public.referral_panel() to authenticated;


-- ------------------------------------------------------------
--  Two indexes the derived stats lean on.
--
--  session_attendance already has (post_id, user_id) as its primary
--  key and an index on user_id, which covers the self-join. These
--  cover the two joins that had nothing.
-- ------------------------------------------------------------
create index if not exists posts_game_idx
  on public.posts (game_id) where game_id is not null;

create index if not exists game_library_user_idx
  on public.game_library (user_id);

-- ============================================================
--  Done.
-- ============================================================
