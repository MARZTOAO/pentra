-- ============================================================
--  70 — Find players: every result, 30 to a page.
--
--  Until now find_players returned the top 30 and stopped, so anyone
--  ranked 31st or lower could never be found. This keeps the scoring
--  exactly as 26 left it and adds paging:
--
--    skip_results  how many to skip (0 for page 1, 30 for page 2 …)
--    total_count   how many match the filters altogether, so the app
--                  can say "page 2 of 5"
--
--  Highest match percentage is always first — see the ORDER BY.
--
--  max_results is capped at 100 so nobody can ask for the whole table
--  in one go.
--
--  The return columns change, and `create or replace` can't do that
--  (42P13), so the old function is dropped first. The old four-argument
--  version is dropped by name as well, or PostgREST sees two overloads
--  and refuses both ("could not choose the best candidate function").
--
--  Run in the Supabase SQL Editor, after 69. Re-runnable.
-- ============================================================

drop function if exists public.find_players(bigint, text, text, integer);
drop function if exists public.find_players(bigint, text, text, integer, integer);

create function public.find_players(
  filter_game_id  bigint  default null,
  filter_platform text    default null,
  filter_region   text    default null,
  max_results     int     default 30,
  skip_results    int     default 0
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
  shared_genres       text[],
  -- How many players match the filters in total, before paging.
  -- The same on every row; the app reads it off the first.
  total_count         bigint
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
    coalesce(genre.names, '{}')  as shared_genres,

    -- Window functions run before LIMIT/OFFSET, so this is the whole
    -- result set, not the page.
    count(*) over ()             as total_count

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

  -- Highest match first. Every row shares one denominator (your
  -- max_score), so ordering by points IS ordering by percentage.
  --
  -- c.id is the last tie-break on purpose. Paging runs this query once
  -- per page, and two players with the same score and the same
  -- last_seen_at could otherwise swap places between calls — one would
  -- appear on both pages and the other on neither.
  order by score desc, c.last_seen_at desc nulls last, c.id
  limit  least(greatest(coalesce(max_results, 30), 1), 100)
  offset greatest(coalesce(skip_results, 0), 0);
$$;


grant execute on function public.find_players(bigint, text, text, integer, integer)
  to authenticated;


-- ------------------------------------------------------------
--  What's New.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Everyone in Find players',
     'Find players used to stop at your top 30 matches. Now every player who fits your filters is there, 30 to a page, best match first.',
     'improvement', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
