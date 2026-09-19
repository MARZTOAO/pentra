-- ============================================================
--  Bringing friends into a session
--  Run this in the Supabase SQL Editor, after 21_post_media.sql.
--
--  The situation this exists for: you and two friends already agreed
--  to play at nine, and you need two more. Without this you post a
--  session for five and it shows one player, so it reads as though
--  nobody's committed - and then your two friends have to find the
--  post and press Join, which is busywork for a decision already made.
--
--  So the host can name friends who are already in, and they take
--  their slots immediately.
--
--  Two rules keep that from being a way to put words in someone's
--  mouth:
--
--    * only accepted friends can be added - not strangers, and not
--      anyone either of you has blocked
--    * anyone added can leave, exactly as if they'd joined and
--      changed their mind, and the host can take them back off
--
--  Being listed in a session is a small public claim about someone's
--  evening. A friend who agreed won't mind; anyone else has one click
--  to undo it.
-- ============================================================


-- ------------------------------------------------------------
--  Seat friends in a session you host
--
--  security definer because this writes rows belonging to other
--  people, which the policy on session_players rightly forbids - it
--  only ever lets you manage your own slot. The checks below are
--  what replaces that policy, so they have to be complete: host,
--  session, not started, friends only, not blocked, and capacity.
--
--  Returns how many were actually seated. Someone already in the
--  session is skipped rather than treated as an error - adding a
--  friend twice should be uneventful.
-- ------------------------------------------------------------
create or replace function public.add_session_players(
  post   bigint,
  guests uuid[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p      posts%rowtype;
  guest  uuid;
  taken  int;
  added  int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if guests is null or array_length(guests, 1) is null then
    return 0;
  end if;

  -- The lock matters for the same reason it does in join_session:
  -- someone can be pressing Join on the last slot while this runs.
  select * into p from posts where id = post for update;

  if p.id is null           then raise exception 'No such post'; end if;
  if p.author_id <> auth.uid() then raise exception 'Only the host can add players'; end if;
  if p.kind <> 'lfg'        then raise exception 'That post is not a session'; end if;
  if p.starts_at < now()    then raise exception 'That session has already started'; end if;

  select count(*) into taken from session_players where post_id = post;

  foreach guest in array guests
  loop
    continue when guest is null;

    -- The host already has a slot from the moment they posted.
    continue when guest = auth.uid();

    -- Already in, from an earlier add or by joining themselves.
    continue when exists (
      select 1 from session_players where post_id = post and user_id = guest
    );

    if not public.is_friend(guest) then
      raise exception 'You can only add friends to a session';
    end if;

    if public.is_blocked(guest) then
      raise exception 'That player is not available';
    end if;

    if taken >= p.slots then
      raise exception 'That session only has % slots', p.slots;
    end if;

    insert into session_players (post_id, user_id) values (post, guest);

    taken := taken + 1;
    added := added + 1;
  end loop;

  return added;
end;
$$;

grant execute on function public.add_session_players(bigint, uuid[]) to authenticated;


-- ------------------------------------------------------------
--  Take someone back off
--
--  The undo for adding the wrong person. The host can't remove
--  themselves this way - cancelling means deleting the post, which
--  takes everyone with it.
-- ------------------------------------------------------------
create or replace function public.remove_session_player(
  post  bigint,
  guest uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
begin
  select author_id into host from posts where id = post;

  if host is null            then raise exception 'No such post'; end if;
  if host <> auth.uid()      then raise exception 'Only the host can remove players'; end if;
  if guest = host            then raise exception 'The host keeps their own slot'; end if;

  delete from session_players where post_id = post and user_id = guest;
end;
$$;

grant execute on function public.remove_session_player(bigint, uuid) to authenticated;


-- ------------------------------------------------------------
--  Posting a session can name them up front
--
--  Dropped and recreated rather than replaced, because the argument
--  list changes and Postgres would otherwise leave the old version
--  sitting alongside the new one.
-- ------------------------------------------------------------
drop function if exists public.create_post(text, bigint, text, timestamptz, smallint, jsonb);

create or replace function public.create_post(
  body       text,
  game_id    bigint  default null,
  kind       text    default 'text',
  starts_at  timestamptz default null,
  slots      smallint default null,
  media      jsonb   default '[]'::jsonb,
  guests     uuid[]  default '{}'::uuid[]
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

grant execute on function public.create_post(text, bigint, text, timestamptz, smallint, jsonb, uuid[])
  to authenticated;

-- ------------------------------------------------------------
--  The feed names each player
--
--  The host needs to be able to remove someone they added by
--  mistake, and a username isn't enough to act on - so each player
--  in the feed now carries their id. Same columns as before, so
--  this replaces the function without dropping it.
-- ------------------------------------------------------------
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

-- ============================================================
--  Done.
-- ============================================================
