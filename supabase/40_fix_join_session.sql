-- ============================================================
--  40 — FIX: nobody could join anybody else's session.
--
--  Symptom: clicking Join did nothing. No error, no change. The
--  function was returning 'missing', which the card says nothing
--  about, so the feed just refreshed.
--
--  THE CAUSE, and it is a good trap.
--
--  join_session() starts by locking the post:
--
--      select * into p from posts where id = post for update;
--
--  Under row-level security, `SELECT ... FOR UPDATE` is filtered by
--  the table's UPDATE policy, not its SELECT policy. That is correct
--  behaviour — you are asking to lock a row for modification, so
--  Postgres checks whether you may modify it — but it is not what
--  anyone writing this line expects.
--
--  `posts` has the ordinary pair of policies: anyone signed in may
--  read a post, only its author may update one. So that line returns
--  a row when you look at your own post and NO ROW when you look at
--  anybody else's. p.id is null, and the function answers 'missing'.
--
--  Which means joining only ever worked on your own sessions — and
--  you are already in those, as the host. Hence: nobody can join.
--
--  Verified against a real Postgres: a non-owner sees 1 row from a
--  plain select on the same post and 0 rows from `for update`.
--
--  THE FIX. The lock has to stay. Two people tapping Join on the last
--  slot at the same moment is the ordinary case, not an edge case,
--  and without serialisation both get in. So the row lock is replaced
--  with a transaction-scoped advisory lock keyed on the post id:
--  same serialisation, no UPDATE-policy check, and the function stays
--  `security invoker` so nothing about who-may-do-what changes.
--
--  22_session_guests.sql has the same line in add_session_players().
--  It is NOT currently broken — only the host calls it, and the host
--  owns the post, so the UPDATE policy lets them through. It is fixed
--  here anyway rather than left as a trap for whoever reads it next.
--  That function is otherwise untouched: its body below is the one
--  from 22 with only the lock changed, not a rewrite.
--
--  Run in the Supabase SQL Editor, after 39. Urgent.
-- ============================================================

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
  -- Serialise everyone joining THIS post, so two people cannot take
  -- the same last slot. Transaction-scoped, so it is released when
  -- this statement's transaction ends, however it ends.
  --
  -- An advisory lock rather than `for update` on the post: see the
  -- note at the top of this file. `for update` would ask Postgres
  -- whether we may MODIFY the post, and we may not — we are only
  -- joining it.
  perform pg_advisory_xact_lock(post);

  -- A plain read, governed by the read policy, which does let you see
  -- other people's posts.
  select * into p from posts where id = post;

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
--  The same line, in the host's add-guests path.
--
--  Not currently broken — the host owns the post, so the UPDATE
--  policy lets them through — but it is the identical trap, and the
--  next person to read it will draw the wrong conclusion about what
--  `for update` does here.
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
  --
  -- An advisory lock rather than `select ... for update`, since that
  -- form is filtered by the UPDATE policy on posts. It happens to
  -- work here — the host owns the post — but it is the same trap
  -- that broke join_session, and leaving it would mislead whoever
  -- reads this next. See the note at the top of 40.
  perform pg_advisory_xact_lock(post);

  select * into p from posts where id = post;

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

-- ============================================================
--  Done. Joining other people's sessions works again.
-- ============================================================
