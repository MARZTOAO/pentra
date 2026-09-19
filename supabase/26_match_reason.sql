-- ============================================================
--  26 — tell the truth about WHY two players match.
--
--  Migration 24 folded the game library into matching, so a shared
--  game can now come from three places: both Top 5s, one Top 5, or
--  both libraries. `shared_games` mixed all three together, and the
--  app's card text claimed every one of them was "in your Top 5".
--
--  Remove a game from your Top 5 but keep it in your library and the
--  match correctly survives on fewer points — but the card kept
--  saying Top 5, which reads as a bug in the matching.
--
--  This returns the both-Top-5 games separately so the text can say
--  what is actually true. Scoring is unchanged.
--
--  `create or replace` cannot change a function's return columns
--  (42P13), so the old one is dropped first.
-- ============================================================

drop function if exists public.find_players(bigint, text, text, integer);

create or replace function public.find_players(
  filter_game_id  bigint  default null,
  filter_platform text    default null,
  filter_region   text    default null,
  max_results     int     default 30
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
security invoker
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

  candidates as (
    select p.*
    from profiles p
    cross join me
    where p.id <> me.id
      and not public.is_blocked(p.id)
      and not exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and ((f.requester_id = me.id and f.addressee_id = p.id)
            or (f.requester_id = p.id and f.addressee_id = me.id))
      )
      and (filter_platform is null or filter_platform = any(p.platforms))
      and (filter_region is null or p.region = filter_region)
      -- Filtering by a game now means "has it at all", not "ranks it".
      and (filter_game_id is null or exists (
        select 1 from top_five t
        where t.user_id = p.id and t.game_id = filter_game_id
      ) or exists (
        select 1 from game_library l
        where l.user_id = p.id and l.game_id = filter_game_id
      ))
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
