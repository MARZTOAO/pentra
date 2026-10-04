-- ============================================================
--  93. The Arcade: small games inside Pentra, starting with Lag Spike.
--
--  MARZ (2026-10-04): "I want to add a small game into the app.
--  Similar to dino run on Google. I want it to track score per user,
--  show user highest score on their profile. I want to build mini
--  games into the app if possible … simple 2D games only." And:
--  "i want leaderboards."
--
--  The games themselves run in the app (src/arcade/). The database
--  keeps one row per player per game — their best score, when they
--  set it, how many runs — and answers three questions: "did I just
--  beat my best?", "who's top among my friends / everyone?", and
--  "what are this player's bests?" for the profile card.
--
--  Scores come from the player's own device, so they can't be
--  trusted completely. submit_arcade_score refuses anything that
--  couldn't have happened: a score higher than the game can award in
--  the time the run lasted (arcade_games.max_per_second, set with
--  room to spare), or past a hard ceiling. That stops the casual
--  "type a number into the console" cheat; it can't stop a determined
--  one, and no browser game can. If a leaderboard ever looks wrong, a
--  developer can delete the row in the Table Editor.
--
--  Run in the Supabase SQL Editor BEFORE pushing (it also carries the
--  What's New entry, per 71). Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The games.
-- ------------------------------------------------------------
create table if not exists public.arcade_games (
  slug            text primary key,
  name            text not null,
  tagline         text,
  -- The most points a legitimate run can earn per second, with slack.
  max_per_second  numeric not null default 100,
  hard_cap        integer not null default 1000000,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.arcade_games enable row level security;

drop policy if exists "arcade_games_read" on public.arcade_games;
create policy "arcade_games_read" on public.arcade_games
  for select to authenticated using (true);

-- Lag Spike awards roughly 10 points a second at the start and about
-- 25 a second at full speed; 40 leaves room for a later rebalance.
insert into public.arcade_games (slug, name, tagline, max_per_second, sort_order)
values ('lag-spike', 'Lag Spike',
        'Keep the signal running. Jump the spikes. It only gets faster.',
        40, 1)
on conflict (slug) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      max_per_second = excluded.max_per_second,
      sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  2. One row per player per game.
--
--  Readable by anyone signed in: a best score is public the way
--  achievements are, and the profile card and leaderboards need it.
--  Nothing writes to it except submit_arcade_score — there is no
--  insert or update policy on purpose.
-- ------------------------------------------------------------
create table if not exists public.arcade_scores (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  game            text not null references public.arcade_games(slug) on delete cascade,
  best            integer not null check (best >= 0),
  best_at         timestamptz not null default now(),
  runs            integer not null default 0,
  last_played_at  timestamptz not null default now(),
  primary key (user_id, game)
);

create index if not exists arcade_scores_board_idx
  on public.arcade_scores (game, best desc, best_at asc);

alter table public.arcade_scores enable row level security;

drop policy if exists "arcade_scores_read" on public.arcade_scores;
create policy "arcade_scores_read" on public.arcade_scores
  for select to authenticated using (true);


-- ------------------------------------------------------------
--  3. Submit a run.
--
--  Returns the player's best after this run, whether this run set
--  it, and where that best sits among everyone (1 = top).
--  Raises on an impossible score so the app can say so.
-- ------------------------------------------------------------
drop function if exists public.submit_arcade_score(text, integer, integer);

create function public.submit_arcade_score(
  game         text,
  score        integer,
  duration_ms  integer
)
returns table (best integer, new_best boolean, rank bigint)
language plpgsql
security definer
set search_path = public
as $$
-- The parameters are named for the app (game, score, duration_ms),
-- and `game` is also a column: inside SQL statements the column wins.
#variable_conflict use_column
declare
  me        uuid := auth.uid();
  g         public.arcade_games%rowtype;
  ceiling   integer;
  prev_best integer;
  now_best  integer;
begin
  if me is null then
    raise exception 'sign in to play';
  end if;

  select * into g from public.arcade_games a where a.slug = submit_arcade_score.game;
  if g.slug is null then
    raise exception 'no such game';
  end if;

  if score is null or score < 0 or duration_ms is null or duration_ms < 0 then
    raise exception 'bad score';
  end if;

  -- What the game could possibly have awarded in that time, plus a
  -- little for the first second's rounding.
  ceiling := least(g.hard_cap,
                   ceil(duration_ms / 1000.0 * g.max_per_second)::integer + 25);
  if score > ceiling then
    raise exception 'that score doesn''t add up';
  end if;

  select s.best into prev_best
    from public.arcade_scores s
   where s.user_id = me and s.game = g.slug;

  insert into public.arcade_scores as s (user_id, game, best, best_at, runs, last_played_at)
  values (me, g.slug, score, now(), 1, now())
  on conflict (user_id, game) do update
    set runs           = s.runs + 1,
        last_played_at = now(),
        best           = greatest(s.best, excluded.best),
        best_at        = case when excluded.best > s.best then now() else s.best_at end;

  select s.best into now_best
    from public.arcade_scores s
   where s.user_id = me and s.game = g.slug;

  return query
  select now_best,
         (prev_best is null or score > prev_best) and score = now_best,
         (select count(*) + 1
            from public.arcade_scores o
           where o.game = g.slug
             and (o.best > now_best
                  or (o.best = now_best and o.best_at < (select s.best_at from public.arcade_scores s
                                                          where s.user_id = me and s.game = g.slug))));
end;
$$;

revoke all on function public.submit_arcade_score(text, integer, integer) from public, anon;
grant execute on function public.submit_arcade_score(text, integer, integer) to authenticated;


-- ------------------------------------------------------------
--  4. Leaderboards.
--
--  scope 'global' is everyone; 'friends' is your accepted friends
--  and you. Ties go to whoever got there first. Blocked players (and
--  players who blocked you) are left out, as everywhere.
-- ------------------------------------------------------------
drop function if exists public.arcade_leaderboard(text, text, integer);

create function public.arcade_leaderboard(
  game         text,
  scope        text default 'global',
  max_results  integer default 10
)
returns table (
  rank          bigint,
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  best          integer,
  best_at       timestamptz,
  is_me         boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with board as (
    select s.user_id, s.best, s.best_at
      from public.arcade_scores s
     where s.game = arcade_leaderboard.game
       and auth.uid() is not null
       and not public.is_blocked(s.user_id)
       and (
         arcade_leaderboard.scope <> 'friends'
         or s.user_id = auth.uid()
         or exists (
           select 1 from public.friendships f
            where f.status = 'accepted'
              and ((f.requester_id = auth.uid() and f.addressee_id = s.user_id)
                or (f.addressee_id = auth.uid() and f.requester_id = s.user_id))
         )
       )
  )
  select row_number() over (order by b.best desc, b.best_at asc) as rank,
         b.user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         p.avatar_preset,
         b.best,
         b.best_at,
         b.user_id = auth.uid() as is_me
    from board b
    join public.profiles p on p.id = b.user_id
   order by b.best desc, b.best_at asc
   limit greatest(1, least(coalesce(max_results, 10), 100));
$$;

revoke all on function public.arcade_leaderboard(text, text, integer) from public, anon;
grant execute on function public.arcade_leaderboard(text, text, integer) to authenticated;


-- ------------------------------------------------------------
--  5. A player's bests, for the card on their profile and the
--     "your best" line on the game page. One row per game they've
--     played, with their place among everyone.
-- ------------------------------------------------------------
drop function if exists public.arcade_bests(uuid);

create function public.arcade_bests(who uuid)
returns table (
  game      text,
  name      text,
  best      integer,
  best_at   timestamptz,
  runs      integer,
  rank      bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select s.game,
         g.name,
         s.best,
         s.best_at,
         s.runs,
         (select count(*) + 1
            from public.arcade_scores o
           where o.game = s.game
             and (o.best > s.best or (o.best = s.best and o.best_at < s.best_at))) as rank
    from public.arcade_scores s
    join public.arcade_games g on g.slug = s.game
   where auth.uid() is not null
     and s.user_id = who
     and not public.is_blocked(who)
   order by g.sort_order, g.name;
$$;

revoke all on function public.arcade_bests(uuid) from public, anon;
grant execute on function public.arcade_bests(uuid) to authenticated;


-- ------------------------------------------------------------
--  6. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('The Arcade: play Lag Spike',
     'Pentra has its first game. Keep the signal running and jump the lag spikes — it only gets faster. Your best score goes on your profile, and there are leaderboards for your friends and for everyone. Find it on the new Arcade tab. Settings moved to the gear at the top of the screen.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
