-- ============================================================
--  55 — how well you match one particular person.
--
--  Find players and a friends list both show a percentage. Opening
--  somebody's profile was the one place it disappeared, which is
--  backwards: the profile is where you are actually deciding whether
--  to send the friend request.
--
--    match_with(target)   one row, or none
--
--  THE SCORING IS THE SAME EXPRESSION, on purpose. It is lifted from
--  find_players (26_match_reason.sql) and friends_of (35), not
--  rewritten. A number that means one thing on Discover and something
--  else on a profile is worse than no number at all — somebody will
--  see 71% on one screen and 64% on the other and conclude, correctly,
--  that at least one of them is made up.
--
--  NOTHING IS STORED. There is no cached score column anywhere, and
--  there should never be one. The whole point of this number is that
--  it moves: it is computed from both Top 5s, both libraries, both
--  platform lists, both availabilities and how recently they played,
--  every single time the page is opened. Somebody who is a 90% match
--  today is a 40% match after either of you rebuilds a Top 5 around a
--  game that does not exist yet. A stored score would quietly stop
--  being true and nobody would notice, because a stale number looks
--  exactly like a fresh one.
--
--  WHY IT CAN RETURN NOTHING. Two cases:
--
--    you are looking at yourself     there is no score to show
--    one of you is blocked           the profile should not be
--                                    scoring somebody you cannot see
--
--  WHY THE TWO READY FLAGS. The denominator is the best anyone could
--  possibly score against YOU. On a brand-new account with no games,
--  no platforms and no region, that maximum is 5 — the recency bonus
--  and nothing else — so any player who logged in this week scores 5
--  out of 5 and the page announces a 100% match between two strangers.
--  True to the arithmetic, useless to the person reading it. So the
--  function says plainly whether each side has enough recorded for the
--  comparison to mean anything, and the app asks for a Top 5 instead
--  of printing a number it cannot stand behind.
--
--  The bar is one game, in a Top 5 or a library, on each side. Games
--  are most of the score; without one there is very little being
--  compared.
--
--  Run in the Supabase SQL Editor, after 54.
-- ============================================================

-- CREATE OR REPLACE cannot change a function's return type, and this
-- may be re-run after a column is added to it.
drop function if exists public.match_with(uuid);

create function public.match_with(target uuid)
returns table (
  score               numeric,
  max_score           numeric,
  -- Enough on your profile to compare against.
  you_ready           boolean,
  -- Enough on theirs to be compared.
  they_ready          boolean,
  shared_games        text[],
  shared_top_games    text[],
  shared_platforms    text[],
  shared_availability text[],
  shared_genres       text[]
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select p.id, p.region, p.platforms, p.primary_platform, p.availability
    from profiles p
    where p.id = auth.uid()
  ),

  -- Both of my lists folded into one. `in_top` carries which it came
  -- from; a game in both keeps its rank and its Top 5 standing.
  my_games as (
    select
      game_id,
      min(rank)       as rank,
      bool_or(in_top) as in_top
    from (
      select t.game_id, t.rank, true as in_top
      from top_five t where t.user_id = auth.uid()
      union all
      select l.game_id, null::smallint, false
      from game_library l where l.user_id = auth.uid()
    ) mine
    group by game_id
  ),

  -- Genres come from Top 5s only. A library is a grab bag — counting
  -- its genres would say you like everything.
  my_genres as (
    select distinct unnest(g.genres) as genre
    from top_five t
    join games g on g.id = t.game_id
    where t.user_id = auth.uid()
  ),

  my_max as (
    select (
      (select coalesce(sum(case when in_top then 14 else 4 end), 0) from my_games)
      + case when coalesce(array_length((select platforms from me), 1), 0) > 0
             then 5 else 0 end
      + (select count(*) from my_genres) * 2
      + case when coalesce(array_length((select availability from me), 1), 0) > 0
             then 5 else 0 end
      + case when (select region from me) is not null then 3 else 0 end
      + case when (select primary_platform from me) is not null then 4 else 0 end
      + 5
    )::numeric as total
  ),

  -- Exactly one candidate: them. Not myself, and not somebody either
  -- of us has blocked.
  candidates as (
    select p.*
    from profiles p
    where p.id = target
      and p.id <> auth.uid()
      and auth.uid() is not null
      and not public.is_blocked(p.id)
  )

  select
    ( coalesce(games.points, 0)
      + case when coalesce(array_length(plat.arr, 1), 0) > 0 then 5 else 0 end
      + coalesce(genre.points, 0)
      + case when coalesce(array_length(avail.arr, 1), 0) > 0 then 5 else 0 end
      + case
          when c.primary_platform is not null
           and c.primary_platform = (select primary_platform from me)
          then 4 else 0
        end
      + case
          when c.region is not null and c.region = (select region from me)
          then 3 else 0
        end
      + case
          when c.last_seen_at > now() - interval '7 days'
          then 5 else 0
        end
    )::numeric as score,

    (select total from my_max) as max_score,

    (select count(*) from my_games) > 0 as you_ready,

    (
      exists (select 1 from top_five t     where t.user_id = c.id)
      or
      exists (select 1 from game_library l where l.user_id = c.id)
    ) as they_ready,

    coalesce(games.names, '{}')     as shared_games,
    coalesce(games.top_names, '{}') as shared_top_games,
    coalesce(plat.arr, '{}')        as shared_platforms,
    coalesce(avail.arr, '{}')       as shared_availability,
    coalesce(genre.names, '{}')     as shared_genres

  from candidates c

  left join lateral (
    with theirs as (
      select
        game_id,
        min(rank)       as rank,
        bool_or(in_top) as in_top
      from (
        select t.game_id, t.rank, true as in_top
        from top_five t where t.user_id = c.id
        union all
        select l.game_id, null::smallint, false
        from game_library l where l.user_id = c.id
      ) x
      group by game_id
    )
    select
      sum(
        case
          when m.in_top and t.in_top
            then 10 + greatest(0, 4 - abs(t.rank - m.rank))
          when m.in_top or t.in_top then 4
          else 2
        end
      )::numeric as points,
      array_agg(
        g.name order by
          case when m.in_top and t.in_top then 0
               when m.in_top or t.in_top then 1
               else 2 end,
          coalesce(least(t.rank, m.rank), 99),
          g.name
      ) as names,
      -- Only the games you BOTH rank in a Top 5. The line under the
      -- percentage claims "in your Top 5", and that claim has to be
      -- true: a game moved to a library still matches, for less.
      array_agg(g.name order by coalesce(least(t.rank, m.rank), 99), g.name)
        filter (where m.in_top and t.in_top) as top_names
    from theirs t
    join my_games m on m.game_id = t.game_id
    join games g    on g.id = t.game_id
  ) games on true

  left join lateral (
    select array(
      select unnest(c.platforms)
      intersect
      select unnest((select platforms from me))
    ) as arr
  ) plat on true

  left join lateral (
    select array(
      select unnest(c.availability)
      intersect
      select unnest((select availability from me))
    ) as arr
  ) avail on true

  left join lateral (
    select
      count(*) * 2                as points,
      array_agg(distinct x.genre) as names
    from (
      select distinct unnest(g.genres) as genre
      from top_five t
      join games g on g.id = t.game_id
      where t.user_id = c.id
    ) x
    join my_genres mg on mg.genre = x.genre
  ) genre on true;
$$;

revoke all on function public.match_with(uuid) from public;
grant execute on function public.match_with(uuid) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
