-- ============================================================
--  91. A player's feed, on their profile.
--
--  MARZ (2026-10-03): "I also want a feed to show up on profile under
--  everything else. The feed should function like Facebook. It should
--  show any post that user made, any sessions they hosted or are in,
--  and any post they are tagged in (not comments they're tagged in)."
--
--  get_profile_feed(who, max_results, before_id) returns exactly the
--  columns get_feed does (54), so the app draws the same PostCard. The
--  rows are the posts where the player is
--    - the author (posts and sessions they host),
--    - in the session (session_players), or
--    - tagged in the post itself (post_mentions — comment tags are a
--      different table and are left out on purpose).
--  Newest first, like a timeline; the home feed's "upcoming sessions
--  first" ordering doesn't apply here. Paged by before_id like get_feed.
--
--  Same visibility rules as everywhere else: security invoker, so the
--  caller's RLS applies, and nothing from someone who has blocked you
--  or whom you have blocked.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

drop function if exists public.get_profile_feed(uuid, int, int);

create function public.get_profile_feed(
  who          uuid,
  max_results  int default 20,
  before_id    int default null
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
  where auth.uid() is not null
    and not public.is_blocked(p.author_id)
    and (before_id is null or p.id < before_id)
    and (
      p.author_id = who
      or exists (select 1 from session_players x where x.post_id = p.id and x.user_id = who)
      or exists (select 1 from post_mentions  t where t.post_id = p.id and t.user_id = who)
    )
  order by p.created_at desc, p.id desc
  limit max_results;
$$;

revoke all on function public.get_profile_feed(uuid, int, int) from public, anon;
grant execute on function public.get_profile_feed(uuid, int, int) to authenticated;
