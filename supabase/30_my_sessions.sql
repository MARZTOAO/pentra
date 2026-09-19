-- ============================================================
--  30 — the sessions you're in.
--
--  The feed answers "what's happening"; this answers "what am I doing
--  next". Same columns as get_feed on purpose, so the client reuses
--  the Post type and SessionCard without a second shape to maintain.
--
--  Differences from get_feed:
--    - only sessions you have actually joined (hosting counts)
--    - soonest first, not newest first
--    - a session stays listed until two hours after it starts, so it
--      doesn't vanish from your list the moment it begins
--
--  Run in the Supabase SQL Editor, after 29.
-- ============================================================

drop function if exists public.my_sessions(boolean, int);

create or replace function public.my_sessions(
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
