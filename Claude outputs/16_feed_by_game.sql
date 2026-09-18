-- ============================================================
--  Filtering the feed by game
--  Run this in the Supabase SQL Editor.
--
--  Replaces get_feed with a version that takes a game, and adds a
--  list of games that actually have posts.
--
--  That second function matters more than it looks: a filter offering
--  every game in a 20,000-row catalogue mostly produces empty results.
--  Offering only games people have posted about means every option in
--  the list leads somewhere.
-- ============================================================

drop function if exists public.get_feed(text, int, int);
drop function if exists public.get_feed(text, int, int, bigint);

create or replace function public.get_feed(
  scope          text   default 'everyone',
  max_results    int    default 50,
  before_id      int    default null,
  filter_game_id bigint default null
)
returns table (
  id            bigint,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  game_id       bigint,
  game_name     text,
  game_cover    text,
  likes         bigint,
  liked_by_me   boolean,
  mine          boolean
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    p.id,
    p.body,
    p.created_at,
    p.author_id,
    a.username,
    a.display_name,
    a.avatar_url,
    a.avatar_preset,
    p.game_id,
    g.name,
    g.cover_url,
    coalesce(l.count, 0),
    exists (
      select 1 from post_likes pl
      where pl.post_id = p.id and pl.user_id = auth.uid()
    ),
    p.author_id = auth.uid()
  from posts p
  join profiles a on a.id = p.author_id
  left join games g on g.id = p.game_id
  left join lateral (
    select count(*) as count from post_likes where post_id = p.id
  ) l on true
  where not public.is_blocked(p.author_id)
    and (before_id is null or p.id < before_id)
    and (filter_game_id is null or p.game_id = filter_game_id)
    and (
      scope <> 'friends'
      or p.author_id = auth.uid()
      or public.is_friend(p.author_id)
    )
  order by p.created_at desc
  limit max_results;
$$;

grant execute on function public.get_feed(text, int, int, bigint) to authenticated;


-- ------------------------------------------------------------
--  Games people are actually posting about, busiest first.
--  This is the filter's option list, and doubles as a view of
--  where the activity is.
-- ------------------------------------------------------------
drop function if exists public.get_feed_games();

create or replace function public.get_feed_games()
returns table (
  game_id   bigint,
  name      text,
  cover_url text,
  posts     bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    g.id,
    g.name,
    g.cover_url,
    count(*) as posts
  from posts p
  join games g on g.id = p.game_id
  where not public.is_blocked(p.author_id)
  group by g.id, g.name, g.cover_url
  order by count(*) desc, g.name
  limit 60;
$$;

grant execute on function public.get_feed_games() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
