-- ============================================================
--  Photos and GIFs on posts
--  Run this in the Supabase SQL Editor.
--
--  Up to four attachments per post. Two kinds:
--
--    image - a photo, resized and re-encoded in the browser before
--            it ever leaves the machine
--    video - a GIF, converted in the browser to a silent looping
--            clip. It still behaves like a GIF in the feed; it just
--            weighs a tenth as much
--
--  The compression all happens client-side (src/lib/media.ts). This
--  file stores the results and the dimensions that go with them.
--
--  Storing width and height matters more than it looks: the feed
--  reserves the right amount of space before the picture arrives, so
--  the post underneath doesn't jump down the page mid-read.
-- ============================================================


-- ------------------------------------------------------------
--  The bucket
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-media', 'post-media', true)
on conflict (id) do nothing;

-- Files land at  <user-id>/<random>.webp , so the first path segment
-- being your own id is what the rules below check - same shape as the
-- avatars bucket in 03_avatars_storage.sql.

drop policy if exists "post media is publicly readable" on storage.objects;
create policy "post media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'post-media');

drop policy if exists "upload your own post media" on storage.objects;
create policy "upload your own post media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete your own post media" on storage.objects;
create policy "delete your own post media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- No update policy. A file is written once and never modified; a
-- changed picture is a new file, which also keeps the browser from
-- showing a stale cached copy of the old one.


-- ------------------------------------------------------------
--  The attachments
-- ------------------------------------------------------------
create table if not exists public.post_media (
  id       bigint generated always as identity primary key,
  post_id  bigint not null references public.posts(id) on delete cascade,
  -- 0-3. The unique constraint below is what caps a post at four
  -- attachments; no trigger needed, and no way around it.
  position smallint not null check (position between 0 and 3),
  kind     text not null check (kind in ('image', 'video')),
  url      text not null,
  -- The storage path, kept so the file can be deleted when the post is.
  path     text not null,
  width    int not null check (width  > 0),
  height   int not null check (height > 0),
  -- Roughly what a screen reader will read out. Optional.
  alt      text check (char_length(alt) <= 400),

  unique (post_id, position)
);

create index if not exists post_media_post_idx
  on public.post_media (post_id, position);

alter table public.post_media enable row level security;

-- Readable exactly when the post is readable. Rather than restating
-- the feed's visibility rules here - blocks, friends-only scope - this
-- defers to the posts policy, so the two can't drift apart.
drop policy if exists "post media follows the post" on public.post_media;
create policy "post media follows the post"
  on public.post_media for select
  to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id)
  );

-- Only on your own posts. Everything real goes through create_post()
-- below, but the policy is what actually stops anything else.
drop policy if exists "attach to your own posts" on public.post_media;
create policy "attach to your own posts"
  on public.post_media for insert
  to authenticated
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

drop policy if exists "remove media from your own posts" on public.post_media;
create policy "remove media from your own posts"
  on public.post_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- No update policy, deliberately: an attachment is written once.


-- ------------------------------------------------------------
--  Creating a post, attachments and all
--
--  One call rather than "insert the post, then insert the pictures".
--  A function is a single transaction, so a post can never end up
--  half-made - visible in the feed with its pictures missing because
--  the second call failed or the app was closed in between.
--
--  Files are uploaded to storage first and their URLs passed in here.
--  That order is on purpose: a failed upload means no post at all,
--  which is recoverable. The reverse would leave a post permanently
--  pointing at a picture that never arrived.
-- ------------------------------------------------------------
create or replace function public.create_post(
  body       text,
  game_id    bigint  default null,
  kind       text    default 'text',
  starts_at  timestamptz default null,
  slots      smallint default null,
  media      jsonb   default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_id bigint;
  item   jsonb;
  i      int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if coalesce(trim(body), '') = '' and jsonb_array_length(media) = 0 then
    raise exception 'A post needs either something to say or something to show';
  end if;

  if jsonb_array_length(media) > 4 then
    raise exception 'Four attachments is the limit';
  end if;

  insert into posts (author_id, body, game_id, kind, starts_at, slots)
  values (auth.uid(), body, game_id, kind, starts_at, slots)
  returning id into new_id;

  for item in select * from jsonb_array_elements(media)
  loop
    insert into post_media (post_id, position, kind, url, path, width, height, alt)
    values (
      new_id,
      i,
      item->>'kind',
      item->>'url',
      item->>'path',
      (item->>'width')::int,
      (item->>'height')::int,
      nullif(trim(coalesce(item->>'alt', '')), '')
    );

    i := i + 1;
  end loop;

  return new_id;
end;
$$;

grant execute on function public.create_post(text, bigint, text, timestamptz, smallint, jsonb)
  to authenticated;


-- ------------------------------------------------------------
--  Which files belonged to a post
--
--  Deleting a post removes its post_media rows by cascade, but the
--  files themselves live in storage and nothing in the database can
--  reach them. So the app asks for the paths first, deletes the post,
--  then clears the files out.
--
--  If that second step fails the files are simply orphaned - wasted
--  space, nothing worse, and nothing pointing at them. The query at
--  the bottom of this file finds them.
-- ------------------------------------------------------------
create or replace function public.post_media_paths(post bigint)
returns table (path text)
language sql
security invoker
set search_path = public
stable
as $$
  select m.path
  from post_media m
  join posts p on p.id = m.post_id
  where m.post_id = post
    and p.author_id = auth.uid();
$$;

grant execute on function public.post_media_paths(bigint) to authenticated;


-- ============================================================
--  The feed now carries the pictures with it
--
--  Aggregated into the same query rather than fetched per post -
--  fifty posts on screen would otherwise be fifty extra round trips,
--  which is how a feed ends up feeling slow.
-- ============================================================
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
  players       jsonb,
  media         jsonb
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
    coalesce(s.players, '[]'::jsonb),
    coalesce(m.media, '[]'::jsonb)
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
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'kind',   pm.kind,
        'url',    pm.url,
        'width',  pm.width,
        'height', pm.height,
        'alt',    pm.alt
      )
      order by pm.position
    ) as media
    from post_media pm
    where pm.post_id = p.id
  ) m on true
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
--
--  To find orphaned files - uploaded, then the post never finished,
--  or the cleanup after a delete didn't run:
--
--    select o.name, o.created_at
--    from storage.objects o
--    where o.bucket_id = 'post-media'
--      and o.created_at < now() - interval '1 day'
--      and not exists (
--        select 1 from public.post_media m where m.path = o.name
--      );
--
--  Worth running every few months. Safe to delete anything it returns.
-- ============================================================
