-- ============================================================
--  54 — sessions say which system, and what the headset rule is.
--
--  Two questions people were answering in the body text, badly:
--  "what platform is this on" and "do I need a mic". Both are the
--  difference between a session you can join and one you cannot, and
--  neither is something anybody should have to read a paragraph to
--  find out.
--
--  TWO POSTGRES GOTCHAS THIS FILE WORKS AROUND, both of which would
--  have bitten anybody who reached for `create or replace`:
--
--  1. You cannot change a function's RETURNS TABLE with CREATE OR
--     REPLACE. Postgres refuses: "cannot change return type of
--     existing function". Each reader has to be dropped first.
--
--  2. Adding parameters with defaults does NOT replace a function —
--     it creates a second one alongside, and then a call that matches
--     both is ambiguous and errors. create_post's old signature is
--     dropped explicitly for that reason.
--
--  The three readers below are the existing functions with two
--  columns appended, patched rather than retyped, so nothing else
--  about them can have drifted.
--
--  Run in the Supabase SQL Editor, after 53.
-- ============================================================


-- ------------------------------------------------------------
--  The columns.
--
--  Nullable, because every session posted before today has no answer
--  and inventing one would be worse than admitting it. The app shows
--  nothing rather than guessing.
-- ------------------------------------------------------------
alter table public.posts
  add column if not exists platform text,
  add column if not exists headset  text;

alter table public.posts drop constraint if exists posts_platform_valid;
alter table public.posts add constraint posts_platform_valid check (
  platform is null or platform in (
    'PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch',
    'Steam Deck', 'Mobile', 'VR'
  )
);

-- 'none' rather than 'not_needed': it is the value, not a sentence,
-- and the app supplies the wording.
alter table public.posts drop constraint if exists posts_headset_valid;
alter table public.posts add constraint posts_headset_valid check (
  headset is null or headset in ('none', 'recommended', 'required')
);

-- A text post has neither. create_post enforces this too, but the
-- table is what makes it true however a row arrives.
alter table public.posts drop constraint if exists posts_session_fields;
alter table public.posts add constraint posts_session_fields check (
  kind = 'lfg' or (platform is null and headset is null)
);


-- ------------------------------------------------------------
--  Posting one.
--
--  The old signature is dropped rather than replaced: adding
--  parameters makes an overload, and a call naming the original
--  arguments would then match both and fail as ambiguous.
-- ------------------------------------------------------------
-- Including the shape this file itself creates, so running it twice
-- replaces rather than colliding with its own previous run.
drop function if exists public.create_post(text, bigint, text, timestamptz, smallint, jsonb, uuid[], text, text);
drop function if exists public.create_post(text, bigint, text, timestamptz, smallint, jsonb, uuid[]);
drop function if exists public.create_post(text, bigint, text, timestamptz, smallint, jsonb);

create function public.create_post(
  body       text,
  game_id    bigint  default null,
  kind       text    default 'text',
  starts_at  timestamptz default null,
  slots      smallint default null,
  media      jsonb   default '[]'::jsonb,
  guests     uuid[]  default '{}'::uuid[],
  platform   text    default null,
  headset    text    default null
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

  insert into posts (author_id, body, game_id, kind, starts_at, slots, platform, headset)
  values (
    auth.uid(), body, game_id, kind, starts_at, slots,
    -- Only a session has a platform or a headset rule. Forcing them
    -- null on a text post is cheaper than a check constraint that
    -- fires after somebody has typed a paragraph.
    case when kind = 'lfg' then platform end,
    case when kind = 'lfg' then headset  end
  )
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

  -- Inside the same transaction as the post, so a session is never
  -- briefly visible with its friends missing - and an invalid guest
  -- list takes the whole post down with it rather than quietly
  -- posting a session that says something untrue about who's playing.
  if kind = 'lfg' and array_length(guests, 1) is not null then
    perform public.add_session_players(new_id, guests);
  end if;

  return new_id;
end;
$$;

grant execute on function public.create_post(text, bigint, text, timestamptz, smallint, jsonb, uuid[], text, text)
  to authenticated;


-- ------------------------------------------------------------
--  The feed.
-- ------------------------------------------------------------
drop function if exists public.get_feed(text, int, int, bigint, boolean);

create function public.get_feed(
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
  media         jsonb,
  platform      text,
  headset       text
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
    coalesce(m.media, '[]'::jsonb),
    p.platform,
    p.headset
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
          'user_id', pr.id,
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
  order by
    case when p.kind = 'lfg' and p.starts_at > now() then 0 else 1 end,
    case when p.kind = 'lfg' and p.starts_at > now() then p.starts_at end asc,
    p.created_at desc
  limit max_results;
$$;

grant execute on function public.get_feed(text, int, int, bigint, boolean) to authenticated;


-- ------------------------------------------------------------
--  A single post.
-- ------------------------------------------------------------
drop function if exists public.get_post(bigint);

create function public.get_post(want_id bigint)
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
  media         jsonb,
  platform      text,
  headset       text
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
    coalesce(m.media, '[]'::jsonb),
    p.platform,
    p.headset
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
          'user_id', pr.id,
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
  -- One post, by id.
  --
  -- The feed's scope filter is deliberately NOT carried over. A link
  -- to a post is something you were handed — a notification, a shared
  -- URL — and "everyone" is already the feed's default, so filtering
  -- by friendship here would mean a tag from a friend-of-a-friend
  -- opened an empty page. Blocking still applies: a post from someone
  -- you blocked stays unreachable however you arrived at it.
  where p.id = want_id
    and not public.is_blocked(p.author_id);
$$;

grant execute on function public.get_post(bigint) to authenticated;


-- ------------------------------------------------------------
--  My sessions.
-- ------------------------------------------------------------
drop function if exists public.my_sessions(boolean, int);

create function public.my_sessions(
  include_past boolean default false,
  max_results  int     default 50
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
  media         jsonb,
  platform      text,
  headset       text
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
    coalesce(m.media, '[]'::jsonb),
    p.platform,
    p.headset
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
          'user_id', pr.id,
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
  where p.kind = 'lfg'
    -- Sessions you are actually in. The host counts: creating one puts
    -- you in session_players, same as joining.
    and exists (
      select 1 from session_players sp
      where sp.post_id = p.id and sp.user_id = auth.uid()
    )
    and not public.is_blocked(p.author_id)
    -- Past sessions drop off by default. A list of things you already
    -- did is a different screen from a list of what's coming.
    and (include_past or p.starts_at > now() - interval '2 hours')
  order by
    -- Soonest first: this list answers "what am I doing next", which
    -- is the opposite question from the feed's "what's new".
    p.starts_at asc
  limit max_results;
$$;

grant execute on function public.my_sessions(boolean, int) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
