-- ============================================================
--  89. Developer mode: the controls behind the switch.
--
--  MARZ (2026-10-03): "as a developer I need more control on the app.
--  I should have total control over everything if need be like a
--  master mode. I should be able to delete posts on feed, ban accounts,
--  access and edit anyone's profile settings … a toggle that only I see
--  that says toggle developer mode."
--
--  The toggle itself lives in the app (per machine, developers only —
--  it only decides which buttons are drawn). These are the functions
--  those buttons call. Every one checks am_i_developer() first and
--  refuses everyone else, switch or no switch, like every other dev_*
--  function; and every one writes a line to moderation_actions, so
--  there is always a record of what was done to whom and by which
--  developer.
--
--  Banning, warning and unbanning already exist (61). New here:
--    dev_delete_post(post)          — any post, with its comments/likes
--    dev_delete_comment(comment)    — any comment
--    dev_update_profile(who, patch) — edit another player's profile:
--                                     name, bio, username, location,
--                                     region; clear avatar, background,
--                                     frame, banner
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  0. Three new kinds of action in the log.
-- ------------------------------------------------------------
alter table public.moderation_actions
  drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions
  add constraint moderation_actions_action_check check (action in
    ('warned', 'banned', 'unbanned', 'dismissed',
     'post_deleted', 'comment_deleted', 'profile_edited'));


-- ------------------------------------------------------------
--  1. Delete any post.
--
--  Comments, likes and attachment rows go with it by cascade, as they
--  do when the author deletes it. The files in storage stay — the
--  storage policies only let an author remove their own, and a leftover
--  file is wasted space, not a problem. The log line keeps the first
--  few words so "what did I delete" has an answer.
-- ------------------------------------------------------------
create or replace function public.dev_delete_post(post bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_body   text;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.author_id, p.body into v_author, v_body
    from public.posts p where p.id = post;
  if v_author is null then
    return 'no such post';
  end if;

  delete from public.posts where id = post;

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (v_author, 'post_deleted',
          'post #' || post || coalesce(': ' || left(v_body, 80), ''),
          auth.uid());

  return 'deleted';
end;
$$;

revoke all on function public.dev_delete_post(bigint) from public, anon;
grant execute on function public.dev_delete_post(bigint) to authenticated;


-- ------------------------------------------------------------
--  2. Delete any comment.
-- ------------------------------------------------------------
create or replace function public.dev_delete_comment(comment bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_body   text;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select c.author_id, c.body into v_author, v_body
    from public.post_comments c where c.id = comment;
  if v_author is null then
    return 'no such comment';
  end if;

  delete from public.post_comments where id = comment;

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (v_author, 'comment_deleted',
          'comment #' || comment || coalesce(': ' || left(v_body, 80), ''),
          auth.uid());

  return 'deleted';
end;
$$;

revoke all on function public.dev_delete_comment(bigint) from public, anon;
grant execute on function public.dev_delete_comment(bigint) to authenticated;


-- ------------------------------------------------------------
--  3. Edit another player's profile.
--
--  `patch` is a JSON object; only the keys below are read, anything
--  else is ignored. Text keys set the column (an empty string clears
--  it; a missing key leaves it alone). The clear_* keys are booleans.
--
--    display_name, bio, username, region,
--    location_city, location_state, location_country,
--    clear_avatar, clear_background, clear_frame, clear_banner
--
--  Usernames follow the same rule as signup (60): 3–20 letters,
--  digits or underscores, and not taken — case-insensitively, since
--  that is how lookups work.
--
--  Goes through an ordinary UPDATE, so the row's own triggers still
--  run (the Pro-perk guard, the tier guard). Nothing here can give or
--  take Pro, or touch a tier.
-- ------------------------------------------------------------
create or replace function public.dev_update_profile(who text, patch jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target   uuid;
  new_name text;
  changed  text[] := '{}';
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if patch is null or jsonb_typeof(patch) <> 'object' then
    return 'nothing to change';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  if patch ? 'username' then
    new_name := btrim(patch->>'username');
    if new_name !~ '^[A-Za-z0-9_]{3,20}$' then
      return 'Usernames are 3–20 letters, numbers or underscores.';
    end if;
    if exists (select 1 from public.profiles p
                where lower(p.username) = lower(new_name) and p.id <> target) then
      return 'That username is taken.';
    end if;
  end if;

  update public.profiles p
     set display_name     = case when patch ? 'display_name'     then nullif(btrim(patch->>'display_name'), '')     else p.display_name     end,
         bio              = case when patch ? 'bio'              then nullif(btrim(patch->>'bio'), '')              else p.bio              end,
         username         = case when patch ? 'username'         then new_name                                     else p.username         end,
         region           = case when patch ? 'region'           then nullif(btrim(patch->>'region'), '')           else p.region           end,
         location_city    = case when patch ? 'location_city'    then nullif(btrim(patch->>'location_city'), '')    else p.location_city    end,
         location_state   = case when patch ? 'location_state'   then nullif(btrim(patch->>'location_state'), '')   else p.location_state   end,
         location_country = case when patch ? 'location_country' then nullif(btrim(patch->>'location_country'), '') else p.location_country end,
         avatar_url       = case when coalesce((patch->>'clear_avatar')::boolean, false)     then null else p.avatar_url     end,
         avatar_preset    = case when coalesce((patch->>'clear_avatar')::boolean, false)     then null else p.avatar_preset  end,
         background       = case when coalesce((patch->>'clear_background')::boolean, false) then null else p.background    end,
         banner_url       = case when coalesce((patch->>'clear_background')::boolean, false)
                                   or coalesce((patch->>'clear_banner')::boolean, false)    then null else p.banner_url     end,
         avatar_frame     = case when coalesce((patch->>'clear_frame')::boolean, false)      then null else p.avatar_frame   end
   where p.id = target;

  select array_agg(k order by k) into changed
    from jsonb_object_keys(patch) k
   where k in ('display_name','bio','username','region','location_city','location_state',
               'location_country','clear_avatar','clear_background','clear_frame','clear_banner')
     and (not k like 'clear_%' or coalesce((patch->>k)::boolean, false));

  insert into public.moderation_actions (target_id, action, note, acted_by)
  values (target, 'profile_edited',
          array_to_string(coalesce(changed, '{}'), ', '),
          auth.uid());

  return 'saved';
end;
$$;

revoke all on function public.dev_update_profile(text, jsonb) from public, anon;
grant execute on function public.dev_update_profile(text, jsonb) to authenticated;
