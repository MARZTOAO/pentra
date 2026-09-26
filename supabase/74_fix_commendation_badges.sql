-- ============================================================
--  74 — commendation badges were never awarded. Fixed.
--
--  THE BUG. 66 taught the achievement system about commendations by
--  adding a 'commendations' case to stat_value(). But since 48, the
--  awarding function doesn't use stat_value() at all — it joins the
--  catalogue against stat_snapshot(), which works every number out in
--  one pass. stat_snapshot() never learned the new key, so the join
--  found no 'commendations' row and the seven badges could never be
--  earned. The trigger from 66 fired correctly on every commendation;
--  it just had nothing to compare against.
--
--  The same gap hid the progress bars: get_achievements() reads
--  stat_snapshot() too, so every commendation badge showed 0 of N.
--
--  A second, smaller one in the same function: it cross-joined
--  profile_stats, so an account that had never had a stats row got no
--  rows back at all — nothing could be awarded to it, including
--  "first commendation" for someone who's never posted. 66 wanted that
--  case to work; now it does.
--
--  THE FIX. stat_snapshot() gains 'commendations' (read from
--  profiles.commendation_count) and a left join to profile_stats.
--  Everything else in it is 48's body, unchanged. Then everyone who's
--  already owed a badge gets it — anybody online sees the usual toast.
--
--  No app changes, so nothing to push. Run in the Supabase SQL Editor,
--  after 73. Re-runnable.
-- ============================================================

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
         ) runs)                                            as week_streak,

      -- New in 74. Lives on profiles, not profile_stats (65).
      (select pr.commendation_count
         from profiles pr where pr.id = target)             as commendations
  )
  select v.key, v.value
    from derived d
    -- Left join, so an account with no stats row still gets its
    -- derived numbers (and its commendations) back. Its profile_stats
    -- values come back null, which award_threshold_achievements()
    -- already reads as 0.
    left join s on true,
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
      ('week_streak',           d.week_streak),
      ('commendations',         d.commendations)
    ) as v(key, value);
$$;

grant execute on function public.stat_snapshot(uuid) to authenticated;


-- ------------------------------------------------------------
--  Award what everyone is already owed.
--
--  Only people who've been commended, since that's the only key that
--  changed for accounts with a stats row. Anyone else is caught the
--  next time any of their numbers move.
-- ------------------------------------------------------------
do $$
declare
  person uuid;
begin
  for person in
    select id from public.profiles where commendation_count > 0
  loop
    perform public.award_threshold_achievements(person);
  end loop;
end $$;


-- ------------------------------------------------------------
--  What's New.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Commendation badges now unlock',
     'The seven commendation achievements weren''t being awarded. They are now, and anyone already owed one has it.',
     'fix', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Check it worked (read-only):
--    select p.username, p.commendation_count, pa.code, pa.earned_at
--      from profiles p
--      join profile_achievements pa on pa.user_id = p.id
--     where pa.code like 'commended_%'
--     order by pa.earned_at desc;
-- ============================================================
