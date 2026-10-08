-- ============================================================
--  113 — Player level (MARZ, 2026-10-08): "add a player level to
--  everyone's profile. Being active in app builds XP."
--
--  XP is WORKED OUT, not stored: a weighted sum of the lifetime
--  counters Pentra already keeps (profile_stats from 43, commendations
--  from 65, achievements from 44, the Arcade from 93/95, chess from
--  109). That means it is retroactive — everyone has a level the moment
--  this runs — and there is no new trigger that can drift. The weights
--  are in player_xp_rules(); change them there and every level updates.
--
--  Level curve: XP needed to reach level L = 60 × (L−1)^1.6.
--    L2 60 · L3 182 · L5 556 · L10 2,017 · L20 6,700 · L30 13,000 ·
--    L50 30,000. A regular player (a session or two a week, posting,
--    the Arcade) reaches 10 in a couple of months.
--
--  Titles by level band, shown next to the number: Rookie 1, Regular
--  5, Veteran 10, Elite 20, Legend 30, Mythic 50.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

create or replace function public.player_xp_rules()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'post', 10,              -- a post made
    'comment', 5,
    'like_given', 1,
    'like_received', 2,
    'session_hosted', 40,
    'session_joined', 25,
    'invite_accepted', 30,   -- someone you invited joined Pentra
    'friend', 10,            -- per friend, at your peak
    'commendation', 15,      -- vouched for by another player
    'achievement', 50,
    'arcade_run', 2,         -- each arcade run (capped per game below)
    'arcade_run_cap', 200,   -- runs per game that count
    'arcade_level', 10,      -- each Stack Trace level cleared
    'chess_game', 15,        -- a finished chess game against a person
    'chess_win', 15,         -- and a bit more for winning
    'curve_base', 60,
    'curve_power', 1.6)
$$;

-- Total XP for a player, from what they've done.
create or replace function public.player_xp(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with r as (select public.player_xp_rules() j),
  s as (select * from profile_stats where user_id = p_user),
  arcade as (
    select coalesce(sum(least(a.runs, (select (j->>'arcade_run_cap')::int from r))), 0) as runs
      from arcade_scores a where a.user_id = p_user),
  levels as (select count(*) as n from arcade_levels where user_id = p_user),
  chess as (
    select count(*) filter (where status = 'finished') as games,
           count(*) filter (where status = 'finished'
                             and ((result = 'white' and white_id = p_user) or (result = 'black' and black_id = p_user))) as wins
      from chess_games
     where white_id = p_user or black_id = p_user),
  ach as (select count(*) as n from profile_achievements where user_id = p_user),
  prof as (select coalesce(commendation_count, 0) as commendations from profiles where id = p_user)
  select (
      coalesce((select posts_made from s), 0)       * (j->>'post')::int
    + coalesce((select comments_made from s), 0)    * (j->>'comment')::int
    + coalesce((select likes_given from s), 0)      * (j->>'like_given')::int
    + coalesce((select likes_received from s), 0)   * (j->>'like_received')::int
    + coalesce((select sessions_hosted from s), 0)  * (j->>'session_hosted')::int
    + coalesce((select sessions_joined from s), 0)  * (j->>'session_joined')::int
    + coalesce((select invites_accepted from s), 0) * (j->>'invite_accepted')::int
    + coalesce((select friends_peak from s), 0)     * (j->>'friend')::int
    + (select commendations from prof)              * (j->>'commendation')::int
    + (select n from ach)                           * (j->>'achievement')::int
    + (select runs from arcade)                     * (j->>'arcade_run')::int
    + (select n from levels)                        * (j->>'arcade_level')::int
    + (select games from chess)                     * (j->>'chess_game')::int
    + (select wins from chess)                      * (j->>'chess_win')::int
  )::int
  from r;
$$;

-- XP needed to have reached a level.
create or replace function public.player_level_floor(p_level int)
returns int language sql immutable as $$
  select case when p_level <= 1 then 0
              else round((public.player_xp_rules()->>'curve_base')::numeric
                         * power(greatest(0, p_level - 1), (public.player_xp_rules()->>'curve_power')::numeric))::int end
$$;

-- The level for an XP total (inverse of the curve).
create or replace function public.player_level_of(p_xp int)
returns int language sql immutable as $$
  select greatest(1, floor(power(greatest(0, p_xp)::numeric / (public.player_xp_rules()->>'curve_base')::numeric,
                                 1 / (public.player_xp_rules()->>'curve_power')::numeric))::int + 1)
$$;

create or replace function public.player_title(p_level int)
returns text language sql immutable as $$
  select case when p_level >= 50 then 'Mythic'
              when p_level >= 30 then 'Legend'
              when p_level >= 20 then 'Elite'
              when p_level >= 10 then 'Veteran'
              when p_level >= 5  then 'Regular'
              else 'Rookie' end
$$;

-- What the profile shows. Anyone's; defaults to yours.
create or replace function public.player_level(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  who uuid := coalesce(p_user, auth.uid());
  xp  int;
  lvl int;
begin
  if auth.uid() is null or who is null then
    return null;
  end if;
  xp := public.player_xp(who);
  lvl := public.player_level_of(xp);
  return jsonb_build_object(
    'user_id', who,
    'xp', xp,
    'level', lvl,
    'title', public.player_title(lvl),
    'level_floor', public.player_level_floor(lvl),
    'next_floor', public.player_level_floor(lvl + 1),
    'rules', public.player_xp_rules());
end;
$$;

revoke all on function public.player_xp(uuid) from public, anon, authenticated;
revoke all on function public.player_level(uuid) from public, anon;
grant execute on function public.player_level(uuid) to authenticated;


-- What's New.
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Player levels',
     'Everyone now has a level on their profile. Being active on Pentra builds XP: posting, commenting, hosting and joining sessions, making friends, commendations, achievements, the Arcade and chess all count. Rookie to Mythic.',
     'feature', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
