-- ============================================================
--  35 — a player's friends, with match detail.
--
--  Two things:
--
--    friend_count(uuid)  how many friends somebody has
--    friends_of(uuid)    who they are, scored against YOU
--
--  The scoring is deliberately the same expression Find players uses
--  (26_match_reason.sql) rather than a simpler one. A number that
--  means one thing on one screen and something else on another is
--  worse than no number, and "we have four games in common" has to
--  survive being read on two different pages.
--
--  A NOTE ON PRIVACY. Friends lists are readable by any signed-in
--  player. That is a deliberate choice — browsing a friend's friends
--  is one of the better ways to find people worth playing with — but
--  it does mean the social graph is open to anyone with an account,
--  and it is not the kind of thing that can be quietly walked back
--  once people have joined on that basis. If it ever needs narrowing,
--  add a visibility column on profiles the way message_privacy works
--  and filter in both functions below.
--
--  Run in the Supabase SQL Editor, after 34.
-- ============================================================


-- ------------------------------------------------------------
--  How many friends somebody has.
--
--  Definer, because the friendships table's own policy is written
--  around the rows you are part of, and this counts somebody else's.
-- ------------------------------------------------------------
create or replace function public.friend_count(target uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int
  from friendships f
  where f.status = 'accepted'
    and (f.requester_id = target or f.addressee_id = target);
$$;

grant execute on function public.friend_count(uuid) to authenticated;


-- ------------------------------------------------------------
--  Their friends, ranked by how well each one matches you.
--
--  The body below is find_players with a different candidate set.
-- ------------------------------------------------------------
create or replace function public.friends_of(
  target      uuid,
  max_results int default 50
)
returns table (
  id                  uuid,
  username            text,
  display_name        text,
  avatar_url          text,
  avatar_preset       text,
  bio                 text,
  region              text,
  location_city       text,
  location_state      text,
  location_country    text,
  platforms           text[],
  primary_platform    text,
  availability        text[],
  last_seen_at        timestamptz,
  score               numeric,
  max_score           numeric,
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

  -- Both my lists, folded into one. `in_top` carries which it came
  -- from; a game in both keeps its rank and its Top 5 standing.
  my_games as (
    select
      game_id,
      min(rank)        as rank,
      bool_or(in_top)  as in_top
    from (
      select t.game_id, t.rank, true as in_top
      from top_five t where t.user_id = auth.uid()
      union all
      select l.game_id, null::smallint, false
      from game_library l where l.user_id = auth.uid()
    ) mine
    group by game_id
  ),

  -- Genres still come from the Top 5 only. A library is a grab bag -
  -- counting its genres would say you like everything.
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

  -- Everyone `target` is actually friends with.
  --
  -- Unlike find_players this does NOT exclude people you are already
  -- friends with: seeing which of their friends you already know is
  -- half the point of looking. It still excludes yourself and anyone
  -- either of you has blocked.
  candidates as (
    select p.*
    from friendships f
    join profiles p
      on p.id = case when f.requester_id = target
                     then f.addressee_id else f.requester_id end
    where f.status = 'accepted'
      and (f.requester_id = target or f.addressee_id = target)
      and p.id <> auth.uid()
      and not public.is_blocked(p.id)
  )

  select
    c.id,
    c.username,
    c.display_name,
    c.avatar_url,
    c.avatar_preset,
    c.bio,
    c.region,
    c.location_city,
    c.location_state,
    c.location_country,
    c.platforms,
    c.primary_platform,
    c.availability,
    c.last_seen_at,

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

    coalesce(games.names, '{}')     as shared_games,
    coalesce(games.top_names, '{}') as shared_top_games,
    coalesce(plat.arr, '{}')     as shared_platforms,
    coalesce(avail.arr, '{}')    as shared_availability,
    coalesce(genre.names, '{}')  as shared_genres

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
      -- Strongest matches first, so the list reads top-down.
      array_agg(
        g.name order by
          case when m.in_top and t.in_top then 0
               when m.in_top or t.in_top then 1
               else 2 end,
          coalesce(least(t.rank, m.rank), 99),
          g.name
      ) as names,
      -- Only the games we BOTH rank in our Top 5. The card claims
      -- "in your Top 5", and that claim has to be true: a game you
      -- moved to your library still matches, just for fewer points.
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
      count(*) * 2                        as points,
      array_agg(distinct x.genre)         as names
    from (
      select distinct unnest(g.genres) as genre
      from top_five t
      join games g on g.id = t.game_id
      where t.user_id = c.id
    ) x
    join my_genres mg on mg.genre = x.genre
  ) genre on true

  order by score desc, c.last_seen_at desc nulls last
  limit max_results;
$$;

grant execute on function public.friends_of(uuid, int) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
