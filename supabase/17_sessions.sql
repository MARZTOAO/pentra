-- ============================================================
--  Sessions: "looking for players" posts
--  Run this in the Supabase SQL Editor, after 16_feed_by_game.sql.
--
--  A post can now be a session: a game, a time, and a number of
--  slots that other people fill by joining. The host occupies one
--  of those slots from the moment they post, so "3/5" means what
--  anyone would expect it to mean.
--
--  Capacity is enforced in the database with a row lock, not in the
--  app. Two people tapping Join on the last slot at the same moment
--  is the ordinary case, not an edge case, and the app has no way to
--  prevent it - only the database does.
-- ============================================================

alter table public.posts
  add column if not exists kind      text default 'text',
  add column if not exists starts_at timestamptz,
  add column if not exists slots     smallint;

alter table public.posts
  drop constraint if exists post_kind_valid;
alter table public.posts
  add constraint post_kind_valid check (kind in ('text', 'lfg'));

-- A session needs a time and a slot count; a plain post must not
-- carry either. Keeps impossible rows out rather than defending
-- against them everywhere they're read.
alter table public.posts
  drop constraint if exists session_shape;
alter table public.posts
  add constraint session_shape check (
    (kind = 'text' and starts_at is null and slots is null)
    or (kind = 'lfg' and starts_at is not null and slots between 2 and 20)
  );


create table if not exists public.session_players (
  post_id   bigint not null references public.posts(id) on delete cascade,
  user_id   uuid   not null references public.profiles(id) on delete cascade,
  joined_at timestamptz default now(),

  primary key (post_id, user_id)
);

create index if not exists session_players_post_idx
  on public.session_players (post_id);

alter table public.session_players enable row level security;

drop policy if exists "session players are readable" on public.session_players;
create policy "session players are readable"
  on public.session_players for select
  to authenticated
  using (true);

drop policy if exists "manage your own session slot" on public.session_players;
create policy "manage your own session slot"
  on public.session_players for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
--  The host takes a slot automatically.
-- ------------------------------------------------------------
create or replace function public.seat_session_host()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.kind = 'lfg' then
    insert into session_players (post_id, user_id)
    values (new.id, new.author_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists posts_seat_host on public.posts;
create trigger posts_seat_host
  after insert on public.posts
  for each row execute function public.seat_session_host();


-- ------------------------------------------------------------
--  Join. Returns what happened, so the app can say something
--  useful rather than just failing.
--
--  The `for update` is the important line: it locks the post row
--  so two simultaneous joins can't both see the last slot free.
-- ------------------------------------------------------------
create or replace function public.join_session(post bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  p     posts%rowtype;
  taken int;
begin
  select * into p from posts where id = post for update;

  if p.id is null            then return 'missing';      end if;
  if p.kind <> 'lfg'         then return 'not_session';  end if;
  if p.starts_at < now()     then return 'past';         end if;
  if public.is_blocked(p.author_id) then return 'unavailable'; end if;

  if exists (
    select 1 from session_players
    where post_id = post and user_id = auth.uid()
  ) then
    return 'already';
  end if;

  select count(*) into taken from session_players where post_id = post;

  if taken >= p.slots then
    return 'full';
  end if;

  insert into session_players (post_id, user_id) values (post, auth.uid());
  return 'joined';
end;
$$;

grant execute on function public.join_session(bigint) to authenticated;


-- ------------------------------------------------------------
--  Leave. The host can't leave their own session - they delete
--  the post instead, which takes everyone with it.
-- ------------------------------------------------------------
create or replace function public.leave_session(post bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  host uuid;
begin
  select author_id into host from posts where id = post;

  if host = auth.uid() then
    return 'host';
  end if;

  delete from session_players
  where post_id = post and user_id = auth.uid();

  return 'left';
end;
$$;

grant execute on function public.leave_session(bigint) to authenticated;


-- ------------------------------------------------------------
--  The feed, now carrying session details and who's in.
-- ------------------------------------------------------------
drop function if exists public.get_feed(text, int, int, bigint);
drop function if exists public.get_feed(text, int, int, bigint, boolean);

create or replace function public.get_feed(
  scope          text    default 'everyone',
  max_results    int     default 50,
  before_id      int     default null,
  filter_game_id bigint  default null,
  sessions_only  boolean default false
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
  mine          boolean,
  kind          text,
  starts_at     timestamptz,
  slots         smallint,
  taken         bigint,
  i_joined      boolean,
  players       jsonb
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
    p.author_id = auth.uid(),
    p.kind,
    p.starts_at,
    p.slots,
    coalesce(s.taken, 0),
    exists (
      select 1 from session_players sp
      where sp.post_id = p.id and sp.user_id = auth.uid()
    ),
    coalesce(s.players, '[]'::jsonb)
  from posts p
  join profiles a on a.id = p.author_id
  left join games g on g.id = p.game_id
  left join lateral (
    select count(*) as count from post_likes where post_id = p.id
  ) l on true
  left join lateral (
    select
      count(*) as taken,
      jsonb_agg(
        jsonb_build_object(
          'username', pr.username,
          'display_name', pr.display_name,
          'avatar_url', pr.avatar_url,
          'avatar_preset', pr.avatar_preset,
          'is_host', pr.id = p.author_id
        )
        order by sp.joined_at
      ) as players
    from session_players sp
    join profiles pr on pr.id = sp.user_id
    where sp.post_id = p.id
  ) s on true
  where not public.is_blocked(p.author_id)
    and (before_id is null or p.id < before_id)
    and (filter_game_id is null or p.game_id = filter_game_id)
    and (not sessions_only or p.kind = 'lfg')
    and (
      scope <> 'friends'
      or p.author_id = auth.uid()
      or public.is_friend(p.author_id)
    )
  -- Sessions that haven't happened yet float to the top: a game
  -- starting in an hour matters more than a comment from an hour ago.
  order by
    case when p.kind = 'lfg' and p.starts_at > now() then 0 else 1 end,
    case when p.kind = 'lfg' and p.starts_at > now() then p.starts_at end asc,
    p.created_at desc
  limit max_results;
$$;

grant execute on function public.get_feed(text, int, int, bigint, boolean) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
