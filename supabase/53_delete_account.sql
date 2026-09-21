-- ============================================================
--  53 — deleting your own account.
--
--  Required by Apple for anything on the App Store that lets people
--  sign up, and the right thing to have regardless: an account you
--  cannot leave is not really yours.
--
--  WHY THIS IS A DATABASE FUNCTION AND NOT AN APP CALL. Removing a
--  row from auth.users needs privileges the browser does not have and
--  must never have — the service role key bypasses every policy in
--  the database, so it lives in a .env file and nowhere near the app.
--  A security definer function is the way to lend exactly one
--  privileged action to an ordinary signed-in user, and nothing else.
--
--  THE SHAPE THAT MAKES IT SAFE. This function takes no user id. It
--  can only ever delete auth.uid() — the account that called it.
--  There is no parameter anybody could change to point it at someone
--  else, because the dangerous version of this function is one that
--  accepts a target.
--
--  The username has to be supplied and has to match. That is not
--  security — the caller obviously knows their own username — it is a
--  guard against an accidental or automated call reaching this by
--  mistake. The deliberate act has to be spelled out.
--
--  WHAT GOES. Deleting the auth user cascades through profiles and
--  from there through everything keyed to it:
--
--    posts, comments, likes, and the mentions in them
--    friendships, blocks, and anything they reported
--    sessions they hosted, and their place in sessions they joined
--    chat membership and their messages
--    top five, game library, stats, achievements, notifications
--    their attendance history, which is why other people's
--      "played with" numbers will drop by one
--
--  WHAT SURVIVES, deliberately:
--
--    friend_code_registry   the code is kept with an empty owner, so
--                           it is never handed to somebody new. A
--                           trigger in 20 does this.
--    referral_codes         same idea, by an ON DELETE SET NULL.
--    other people's lifetime counters, which only ever go up. Nobody
--      loses a post count because somebody else left.
--
--  There is no grace period and no undo. Anything else would mean
--  keeping the data we just promised to delete.
--
--  Run in the Supabase SQL Editor, after 52.
-- ============================================================

-- ------------------------------------------------------------
--  FIRST, two triggers that would have made deletion impossible.
--
--  Found by testing a real deletion rather than reading the code:
--  deleting an account threw a foreign key violation and rolled the
--  whole thing back. Anybody with a single friend could not have left.
--
--  Both are triggers that fire DURING the cascade and try to write a
--  row keyed to the profile that is in the middle of being removed:
--
--    stats_on_friendship   the cascade deletes your friendship rows,
--                          which fires refresh_friend_count for both
--                          sides — including you. It does an upsert
--                          into profile_stats, and your profile has
--                          just gone.
--
--    notify_session_left   the cascade deletes your session_players
--                          rows, which tells each host that somebody
--                          left — with you as the actor. The same
--                          problem, plus a notification about a
--                          person who no longer exists.
--
--  The fix in both cases is a check that the person still exists.
--  Nothing is lost by it: there is no point maintaining a counter for
--  a deleted account, and nobody needs telling that a ghost left
--  their session.
-- ------------------------------------------------------------
create or replace function public.refresh_friend_count(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if target is null then
    return;
  end if;

  -- Mid-cascade, this is a profile that has already gone. Writing a
  -- counter row for it violates the foreign key and takes the whole
  -- deletion down with it.
  if not exists (select 1 from profiles p where p.id = target) then
    return;
  end if;

  select count(*) into n
    from friendships f
   where f.status = 'accepted'
     and (f.requester_id = target or f.addressee_id = target);

  insert into profile_stats (user_id, friends_now, friends_peak, friends_peak_at)
  values (target, n, n, case when n > 0 then now() end)
  on conflict (user_id) do update set
    friends_now     = n,
    friends_peak    = greatest(profile_stats.friends_peak, n),
    friends_peak_at = case
                        when n > profile_stats.friends_peak then now()
                        else profile_stats.friends_peak_at
                      end,
    updated_at      = now();
end;
$$;


create or replace function public.notify_session_left()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
begin
  select p.author_id into host from posts p where p.id = old.post_id;

  -- Nothing to say if the post itself is being deleted — the whole
  -- session is going, and the host is the one deleting it.
  if host is null then
    return old;
  end if;

  -- Nor if the person leaving is being deleted. The notification would
  -- name an account that no longer exists, and its actor_id would
  -- point at a row the cascade has already removed.
  if not exists (select 1 from profiles p where p.id = old.user_id) then
    return old;
  end if;

  perform public.push_notification(
    host, 'session_left', old.user_id, old.post_id);
  return old;
end;
$$;


-- ------------------------------------------------------------
--  And the deletion itself.
-- ------------------------------------------------------------
create or replace function public.delete_my_account(confirm_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  mine text;
begin
  if me is null then
    return 'signed_out';
  end if;

  select p.username into mine from profiles p where p.id = me;

  if mine is null then
    -- No profile but a valid session. Nothing to confirm against, so
    -- take the auth row and be done.
    delete from auth.users where id = me;
    return 'deleted';
  end if;

  -- Case-insensitive, trimmed: somebody typing their own name should
  -- not be defeated by a capital letter.
  if lower(btrim(coalesce(confirm_username, ''))) <> lower(mine) then
    return 'name_mismatch';
  end if;

  -- One statement, and the only one this function will ever run
  -- against auth.users. `me` comes from auth.uid() and nowhere else.
  delete from auth.users where id = me;

  return 'deleted';
end;
$$;

-- Authenticated only. There is nothing here for anon, and a function
-- that deletes accounts should not be reachable without a session.
--
-- The anon revoke is guarded: the role always exists on Supabase, but
-- a migration that dies on a missing role is one that cannot be run
-- anywhere else, including against a copy of the schema for testing.
revoke all on function public.delete_my_account(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.delete_my_account(text) from anon';
  end if;
end $$;

grant execute on function public.delete_my_account(text) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
