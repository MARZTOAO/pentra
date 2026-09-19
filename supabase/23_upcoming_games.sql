-- ============================================================
--  Release dates, and games that haven't come out yet
--  Run this in the Supabase SQL Editor.
--
--  The catalogue has only ever held released games, because the
--  import sorts by how many ratings a game has and an unreleased
--  game has none. That's a gap worth closing: the moment people most
--  want to arrange to play something together is the week it lands.
--
--  Nothing here deletes anything. Posts, sessions and Top 5 entries
--  all point at rows in this table, so a sync that removed a game
--  would orphan them. Add and update only.
-- ============================================================

alter table public.games
  add column if not exists release_date timestamptz;

-- IGDB's count of people following a game before it's out. It's the
-- only measure of interest an unreleased game has - no ratings exist
-- yet, by definition.
alter table public.games
  add column if not exists hypes int not null default 0;


-- ------------------------------------------------------------
--  Ranking search results
--
--  Search sorts by `popularity`, which is IGDB's rating count. For
--  an unreleased game that's zero, so the most anticipated game of
--  the year would sort below every obscure thing ever shipped.
--
--  So: rank on whichever signal that game actually has. A stored
--  column rather than an expression in the query, because the app
--  searches the table directly through PostgREST and can only sort
--  on real columns.
-- ------------------------------------------------------------
alter table public.games
  drop column if exists relevance;

alter table public.games
  add column relevance int
  generated always as (
    greatest(coalesce(popularity, 0), coalesce(hypes, 0))
  ) stored;

create index if not exists games_relevance_idx
  on public.games (relevance desc);

-- Used by the "coming soon" listing below.
create index if not exists games_release_date_idx
  on public.games (release_date)
  where release_date is not null;


-- ------------------------------------------------------------
--  What's coming out
--
--  For a browsing screen, and for sanity-checking a sync run. A
--  null release_date means IGDB has no date for it - which covers
--  everything already in your catalogue until a sync fills them in,
--  and is not the same as "unreleased".
-- ------------------------------------------------------------
create or replace function public.upcoming_games(
  within_days int default 120,
  max_results int default 40
)
returns table (
  id           bigint,
  name         text,
  cover_url    text,
  genres       text[],
  platforms    text[],
  release_date timestamptz,
  hypes        int
)
language sql
security invoker
set search_path = public
stable
as $$
  select g.id, g.name, g.cover_url, g.genres, g.platforms,
         g.release_date, g.hypes
  from games g
  where g.release_date > now()
    and g.release_date < now() + make_interval(days => greatest(1, within_days))
  order by g.release_date asc, g.hypes desc
  limit greatest(1, least(max_results, 100));
$$;

grant execute on function public.upcoming_games(int, int) to authenticated;

-- ============================================================
--  Done.
--
--  After a sync run, this shows what landed:
--    select count(*) filter (where release_date > now()) as upcoming,
--           count(*) filter (where release_date is not null) as dated,
--           count(*) as total
--    from games;
-- ============================================================
