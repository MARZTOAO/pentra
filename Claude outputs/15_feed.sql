-- ============================================================
--  The feed
--  Run this in the Supabase SQL Editor.
--
--  Posts and likes. Two scopes: everyone, and just your friends.
--  Both exist for a reason - a friends-only feed is empty until you
--  have friends, which is exactly when a new user decides whether
--  the app is worth keeping.
-- ============================================================

create table if not exists public.posts (
  id         bigint generated always as identity primary key,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  -- Optional: a game this post is about, shown as a small tag.
  game_id    bigint references public.games(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx  on public.posts (author_id);


create table if not exists public.post_likes (
  post_id    bigint not null references public.posts(id) on delete cascade,
  user_id    uuid   not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),

  primary key (post_id, user_id)
);


-- ------------------------------------------------------------
--  Row level security
-- ------------------------------------------------------------
alter table public.posts      enable row level security;
alter table public.post_likes enable row level security;

drop policy if exists "posts are readable by signed-in users" on public.posts;
create policy "posts are readable by signed-in users"
  on public.posts for select
  to authenticated
  using (not public.is_blocked(author_id));

drop policy if exists "write your own posts" on public.posts;
create policy "write your own posts"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "delete your own posts" on public.posts;
create policy "delete your own posts"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid());

-- Deliberately no update policy. Editing a post after people have
-- reacted to it changes what they agreed with; delete and repost.

drop policy if exists "likes are readable" on public.post_likes;
create policy "likes are readable"
  on public.post_likes for select
  to authenticated
  using (true);

drop policy if exists "manage your own likes" on public.post_likes;
create policy "manage your own likes"
  on public.post_likes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
--  The feed itself.
--
--  scope: 'everyone' or 'friends'.
--
--  Like counts and whether you've liked something come back in the
--  same query. The alternative is a request per post, which is fine
--  with ten posts and ruinous with a hundred.
-- ------------------------------------------------------------
drop function if exists public.get_feed(text, int, int);

create or replace function public.get_feed(
  scope       text default 'everyone',
  max_results int  default 50,
  before_id   int  default null
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
    and (
      scope <> 'friends'
      or p.author_id = auth.uid()
      or public.is_friend(p.author_id)
    )
  order by p.created_at desc
  limit max_results;
$$;

grant execute on function public.get_feed(text, int, int) to authenticated;


-- ------------------------------------------------------------
--  Like or unlike, in one call.
-- ------------------------------------------------------------
create or replace function public.toggle_like(post bigint)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  existed boolean;
begin
  delete from post_likes
  where post_id = post and user_id = auth.uid();

  get diagnostics existed = row_count;

  if existed then
    return false;
  end if;

  insert into post_likes (post_id, user_id) values (post, auth.uid());
  return true;
end;
$$;

grant execute on function public.toggle_like(bigint) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
