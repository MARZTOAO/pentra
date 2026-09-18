-- ============================================================
--  The matching engine
--  Run this in the Supabase SQL Editor. Safe to re-run.
--
--  One query, scored in the database rather than in the app. That
--  matters: pulling every profile down to the desktop and sorting
--  there would move megabytes to rank thirty people.
--
--  The weights are all in one place so they're easy to tune once you
--  have real users. A simple system you understand beats a clever one
--  you can't debug.
--
--    shared game in both Top 5s     10 each
--    rank closeness                 up to 4 more per shared game
--    any shared platform             5    (can't play together without one)
--    same primary platform           4    (where they ACTUALLY play)
--    shared genre                    2 each
--    any overlapping availability    5    (decides if you ever actually meet)
--    same region                     3
--    active in the last 7 days       5    (a dead match is worse than none)
--
--  It also returns max_score: the best anyone COULD score against you,
--  given your own profile. Five games in your Top 5 creates more
--  headroom than three; leaving your region blank removes three points
--  from what's reachable. Without that denominator, a score of 40 tells
--  you nothing.
--
--  Runs as the calling user, so row-level security still applies -
--  blocked people and private rows stay invisible.
-- ============================================================

drop function if exists public.find_players(bigint, text, text, int);

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

  -- My Top 5, with the genres of each game.
  my_top as (
    select t.game_id, t.rank, g.genres
    from top_five t
    join games g on g.id = t.game_id
    where t.user_id = auth.uid()
  ),

  my_genres as (
    select distinct unnest(genres) as genre from my_top
  ),

  -- The ceiling: a hypothetical perfect match against MY profile.
  -- Every shared game is worth at most 14 (10 + a full rank bonus),
  -- and I can share at most as many games as I've actually picked.
  my_max as (
    select (
      (select count(*) from my_top) * 14
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

  -- Hard filters first. Cheaper than scoring people you'd never show,
  -- and it keeps blocked users and existing friends out of the results.
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
      and (filter_game_id is null or exists (
        select 1 from top_five t
        where t.user_id = p.id and t.game_id = filter_game_id
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

    coalesce(games.names, '{}')  as shared_games,
    coalesce(plat.arr, '{}')     as shared_platforms,
    coalesce(avail.arr, '{}')    as shared_availability,
    coalesce(genre.names, '{}')  as shared_genres

  from candidates c

  -- Shared games, with a bonus the closer the two rankings sit.
  -- Your #1 matching their #2 means more than your #1 matching their #5.
  left join lateral (
    select
      sum(10 + greatest(0, 4 - abs(t.rank - m.rank)))::numeric as points,
      array_agg(g.name order by least(t.rank, m.rank))         as names
    from top_five t
    join my_top m on m.game_id = t.game_id
    join games g  on g.id = t.game_id
    where t.user_id = c.id
  ) games on true

  left join lateral (
    select array(
      select unnest(coalesce(c.platforms, '{}'))
      intersect
      select unnest(coalesce((select platforms from me), '{}'))
    ) as arr
  ) plat on true

  left join lateral (
    select array(
      select unnest(coalesce(c.availability, '{}'))
      intersect
      select unnest(coalesce((select availability from me), '{}'))
    ) as arr
  ) avail on true

  -- Genre overlap catches "we both love soulslikes" even with no
  -- exact game in common.
  left join lateral (
    select
      (count(*) * 2)::numeric  as points,
      array_agg(x.genre)       as names
    from (
      select distinct gx.genre
      from top_five t2
      join games g2 on g2.id = t2.game_id
      cross join lateral unnest(coalesce(g2.genres, '{}')) as gx(genre)
      where t2.user_id = c.id
        and gx.genre in (select genre from my_genres)
    ) x
  ) genre on true

  order by score desc, c.last_seen_at desc nulls last
  limit max_results;
$$;

grant execute on function public.find_players(bigint, text, text, int) to authenticated;


-- ============================================================
--  Keeps "active in the last 7 days" honest. The app calls this
--  when you open Find Players.
-- ============================================================
create or replace function public.touch_last_seen()
returns void
language sql
security invoker
set search_path = public
as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
