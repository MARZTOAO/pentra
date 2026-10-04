-- ============================================================
--  95. Stack Trace — tile matching with levels, and level progress.
--
--  MARZ (2026-10-04): "basically mahjong but call it something
--  original … 10 levels to start and track player progress so if I
--  play today and get to level 6 I can come back next week and be
--  right on the same level I left off on … no need for a leaderboard
--  here. I just want users to see the levels they've beat and the
--  time each one took."
--
--  So this game keeps no score row. It keeps one row per player per
--  level cleared: the best time, how many times, and when. "Where I
--  left off" is simply the first level without a row. The board for
--  a level is dealt fresh each visit; a half-finished level isn't
--  saved, which suits a game that takes a few minutes a level.
--
--  Run in the Supabase SQL Editor BEFORE pushing (carries the What's
--  New entry, per 71). Re-runnable.
-- ============================================================

insert into public.arcade_games (slug, name, tagline, max_per_second, sort_order)
values ('stack-trace', 'Stack Trace',
        'Clear the stack, one matching pair at a time. Ten levels. No clock but your own.',
        0, 3)
on conflict (slug) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      max_per_second = excluded.max_per_second,
      sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  1. Levels cleared, per player per game.
--
--  Readable by anyone signed in, like arcade_scores, so a profile
--  can show "6 of 10 levels". Only record_level_clear writes.
-- ------------------------------------------------------------
create table if not exists public.arcade_levels (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  game              text not null references public.arcade_games(slug) on delete cascade,
  level             integer not null check (level between 1 and 100),
  best_ms           integer not null check (best_ms > 0),
  clears            integer not null default 1,
  first_cleared_at  timestamptz not null default now(),
  last_cleared_at   timestamptz not null default now(),
  primary key (user_id, game, level)
);

alter table public.arcade_levels enable row level security;

drop policy if exists "arcade_levels_read" on public.arcade_levels;
create policy "arcade_levels_read" on public.arcade_levels
  for select to authenticated using (true);


-- ------------------------------------------------------------
--  2. A level was cleared. Keeps the best time; returns it and
--     whether this clear set it. Refuses times that can't be real
--     (under two seconds, over a day).
-- ------------------------------------------------------------
drop function if exists public.record_level_clear(text, integer, integer);

create function public.record_level_clear(game text, level integer, ms integer)
returns table (best_ms integer, new_best boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  me   uuid := auth.uid();
  prev integer;
begin
  if me is null then
    raise exception 'sign in to play';
  end if;
  if not exists (select 1 from public.arcade_games g where g.slug = record_level_clear.game) then
    raise exception 'no such game';
  end if;
  if level is null or level < 1 or level > 100 then
    raise exception 'no such level';
  end if;
  if ms is null or ms < 2000 or ms > 86400000 then
    raise exception 'that time doesn''t add up';
  end if;

  select l.best_ms into prev
    from public.arcade_levels l
   where l.user_id = me and l.game = record_level_clear.game and l.level = record_level_clear.level;

  insert into public.arcade_levels as l (user_id, game, level, best_ms, clears, first_cleared_at, last_cleared_at)
  values (me, record_level_clear.game, record_level_clear.level, ms, 1, now(), now())
  on conflict (user_id, game, level) do update
    set clears          = l.clears + 1,
        last_cleared_at = now(),
        best_ms         = least(l.best_ms, excluded.best_ms);

  return query
  select least(coalesce(prev, ms), ms), prev is null or ms < prev;
end;
$$;

revoke all on function public.record_level_clear(text, integer, integer) from public, anon;
grant execute on function public.record_level_clear(text, integer, integer) to authenticated;


-- ------------------------------------------------------------
--  3. A player's cleared levels, for their profile and the level
--     picker. Nothing from or about blocked players, as everywhere.
-- ------------------------------------------------------------
drop function if exists public.arcade_levels_of(uuid);

create function public.arcade_levels_of(who uuid)
returns table (
  game             text,
  level            integer,
  best_ms          integer,
  clears           integer,
  last_cleared_at  timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select l.game, l.level, l.best_ms, l.clears, l.last_cleared_at
    from public.arcade_levels l
   where auth.uid() is not null
     and l.user_id = who
     and not public.is_blocked(who)
   order by l.game, l.level;
$$;

revoke all on function public.arcade_levels_of(uuid) from public, anon;
grant execute on function public.arcade_levels_of(uuid) to authenticated;


-- ------------------------------------------------------------
--  4. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('New in the Arcade: Stack Trace',
     'A relaxed tile-matching game. Find pairs of free tiles to clear the stack, across ten levels that get bigger as you go. Your progress is saved, so you pick up on the level you left off, and your best time for each level is on your profile.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
