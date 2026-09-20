-- ============================================================
--  43 — profile stats.
--
--  The numbers on a profile: posts, comments, likes, sessions,
--  friends, how long you've been here.
--
--  THE DECISION THIS FILE MAKES, because it is not obvious and it is
--  hard to change later: these are COUNTERS, not queries.
--
--  Counting live — `select count(*) from posts where author_id = you`
--  — is simpler and can never drift. But it answers the wrong
--  question. Delete a post and its comments and likes cascade away
--  with it, so a live count of "posts made" goes DOWN. Somebody who
--  has posted two hundred things and tidied up shows twelve. A
--  lifetime total that moves backwards is not a lifetime total.
--
--  So every counter here goes up when the thing happens and is not
--  touched when it is undone. The exception is friends_now, which is
--  a live figure by definition — and which is exactly why
--  friends_peak has to be recorded as it moves. A friendship row is
--  deleted on unfriend, so the peak cannot be recovered afterwards
--  from anything. It is only knowable while it is happening.
--
--  The cost of counters is drift: if a trigger is ever wrong, the
--  number is wrong until somebody notices. The backfill at the bottom
--  is written so it can be re-run to re-seed everything that IS still
--  derivable, which limits how bad that can get.
--
--  Run in the Supabase SQL Editor, after 42.
-- ============================================================


-- ------------------------------------------------------------
--  Who played with whom, kept forever.
--
--  session_players is the current roster: leave a session and the row
--  is gone. That is right for a roster and useless as history — it
--  means "sessions joined" would fall when somebody drops out, and
--  "people you've played with" would forget them entirely.
--
--  So joining also writes here, and nothing ever deletes it. No
--  foreign key to posts on purpose: a host deleting last Tuesday's
--  session should not erase the fact that five people turned up to
--  it.
-- ------------------------------------------------------------
create table if not exists public.session_attendance (
  post_id     bigint not null,
  user_id     uuid   not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),

  primary key (post_id, user_id)
);

create index if not exists session_attendance_user_idx
  on public.session_attendance (user_id);

alter table public.session_attendance enable row level security;

drop policy if exists "attendance is readable" on public.session_attendance;
create policy "attendance is readable"
  on public.session_attendance for select
  to authenticated
  using (true);

-- No write policy. The trigger below is the only writer.


-- ------------------------------------------------------------
--  The counters.
-- ------------------------------------------------------------
create table if not exists public.profile_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  -- Lifetime. These only ever go up.
  posts_made       int not null default 0,
  comments_made    int not null default 0,
  likes_given      int not null default 0,
  likes_received   int not null default 0,
  sessions_hosted  int not null default 0,
  sessions_joined  int not null default 0,
  invites_sent     int not null default 0,
  invites_accepted int not null default 0,

  -- Live, and its high-water mark.
  friends_now      int not null default 0,
  friends_peak     int not null default 0,
  friends_peak_at  timestamptz,

  updated_at timestamptz not null default now()
);

alter table public.profile_stats enable row level security;

drop policy if exists "stats are readable" on public.profile_stats;
create policy "stats are readable"
  on public.profile_stats for select
  to authenticated
  using (true);

-- Again, no write policy: the triggers are security definer and are
-- the only things that write. Nothing the client sends can inflate
-- somebody's numbers.


-- ------------------------------------------------------------
--  A row for everyone, including people who arrive later.
-- ------------------------------------------------------------
create or replace function public.seed_profile_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profile_stats (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_seed_stats on public.profiles;
create trigger profiles_seed_stats
  after insert on public.profiles
  for each row execute function public.seed_profile_stats();


-- ------------------------------------------------------------
--  Posting.
--
--  Every trigger below uses the same insert-or-increment shape. It
--  means a missing stats row — an account that predates this file, or
--  one created some way that skipped the trigger above — repairs
--  itself on the owner's next action rather than throwing.
-- ------------------------------------------------------------
create or replace function public.stats_on_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profile_stats (user_id, posts_made, sessions_hosted)
  values (new.author_id, 1, case when new.kind = 'lfg' then 1 else 0 end)
  on conflict (user_id) do update set
    posts_made      = profile_stats.posts_made + 1,
    sessions_hosted = profile_stats.sessions_hosted
                      + case when new.kind = 'lfg' then 1 else 0 end,
    updated_at      = now();
  return new;
end;
$$;

drop trigger if exists posts_count_stats on public.posts;
create trigger posts_count_stats
  after insert on public.posts
  for each row execute function public.stats_on_post();


-- ------------------------------------------------------------
--  Commenting.
-- ------------------------------------------------------------
create or replace function public.stats_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profile_stats (user_id, comments_made)
  values (new.author_id, 1)
  on conflict (user_id) do update set
    comments_made = profile_stats.comments_made + 1,
    updated_at    = now();
  return new;
end;
$$;

drop trigger if exists comments_count_stats on public.post_comments;
create trigger comments_count_stats
  after insert on public.post_comments
  for each row execute function public.stats_on_comment();


-- ------------------------------------------------------------
--  Likes, both directions.
--
--  Given and received are counted separately because they are worth
--  very different amounts. Likes you gave out say nothing about you
--  that you did not decide unilaterally; likes you received needed
--  somebody else to agree. If any of this ever feeds an XP system,
--  that distinction is the whole ballgame.
-- ------------------------------------------------------------
create or replace function public.stats_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
begin
  insert into profile_stats (user_id, likes_given)
  values (new.user_id, 1)
  on conflict (user_id) do update set
    likes_given = profile_stats.likes_given + 1,
    updated_at  = now();

  select p.author_id into author from posts p where p.id = new.post_id;

  -- Liking your own post is allowed, and is not a like received.
  if author is not null and author <> new.user_id then
    insert into profile_stats (user_id, likes_received)
    values (author, 1)
    on conflict (user_id) do update set
      likes_received = profile_stats.likes_received + 1,
      updated_at     = now();
  end if;

  return new;
end;
$$;

drop trigger if exists likes_count_stats on public.post_likes;
create trigger likes_count_stats
  after insert on public.post_likes
  for each row execute function public.stats_on_like();


-- ------------------------------------------------------------
--  An invite going out.
-- ------------------------------------------------------------
create or replace function public.stats_on_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profile_stats (user_id, invites_sent)
  values (new.inviter_id, 1)
  on conflict (user_id) do update set
    invites_sent = profile_stats.invites_sent + 1,
    updated_at   = now();
  return new;
end;
$$;

drop trigger if exists invites_count_stats on public.session_invites;
create trigger invites_count_stats
  after insert on public.session_invites
  for each row execute function public.stats_on_invite();


-- ------------------------------------------------------------
--  An invite landing.
--
--  BEFORE INSERT, deliberately. There is an AFTER INSERT trigger on
--  session_players (from 42) that deletes the matching invite, and
--  AFTER triggers fire in alphabetical order by name — so reading the
--  invite from another AFTER trigger would be a race decided by what
--  somebody happened to call their trigger. BEFORE always runs first.
--
--  It credits the inviter however the invite was taken up: pressing
--  Accept, pressing Join instead, or the host seating them outright.
--  All three mean the same thing — the invite worked.
-- ------------------------------------------------------------
create or replace function public.stats_on_invite_taken()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender uuid;
begin
  select i.inviter_id into sender
    from session_invites i
   where i.post_id = new.post_id and i.invitee_id = new.user_id;

  if sender is not null then
    insert into profile_stats (user_id, invites_accepted)
    values (sender, 1)
    on conflict (user_id) do update set
      invites_accepted = profile_stats.invites_accepted + 1,
      updated_at       = now();
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_credit_inviter on public.session_players;
create trigger session_players_credit_inviter
  before insert on public.session_players
  for each row execute function public.stats_on_invite_taken();


-- ------------------------------------------------------------
--  Joining a session.
--
--  The attendance row is what decides whether this counts. Joining a
--  session you have already been in — left and came back — conflicts
--  and increments nothing, so leaving and rejoining in a loop is not
--  a way to run the number up.
--
--  The host is skipped: they are seated by a trigger the moment they
--  post, and that is already counted as a session hosted.
-- ------------------------------------------------------------
create or replace function public.stats_on_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  host    uuid;
  is_new  boolean := false;
begin
  select p.author_id into host from posts p where p.id = new.post_id;

  if host = new.user_id then
    return new;
  end if;

  insert into session_attendance (post_id, user_id)
  values (new.post_id, new.user_id)
  on conflict (post_id, user_id) do nothing;

  get diagnostics is_new = row_count;

  if is_new then
    insert into profile_stats (user_id, sessions_joined)
    values (new.user_id, 1)
    on conflict (user_id) do update set
      sessions_joined = profile_stats.sessions_joined + 1,
      updated_at      = now();
  end if;

  return new;
end;
$$;

drop trigger if exists session_players_count_stats on public.session_players;
create trigger session_players_count_stats
  after insert on public.session_players
  for each row execute function public.stats_on_join();


-- ------------------------------------------------------------
--  Friends, and the high-water mark.
--
--  Recomputed rather than incremented. A friendship row changes
--  status as well as appearing and disappearing — pending, accepted,
--  declined — and an increment that has to follow all of that
--  correctly is an increment that will eventually be wrong. Two
--  indexed counts on a table this size cost nothing.
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

create or replace function public.stats_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_friend_count(old.requester_id);
    perform public.refresh_friend_count(old.addressee_id);
    return old;
  end if;

  perform public.refresh_friend_count(new.requester_id);
  perform public.refresh_friend_count(new.addressee_id);
  return new;
end;
$$;

drop trigger if exists friendships_count_stats on public.friendships;
create trigger friendships_count_stats
  after insert or update or delete on public.friendships
  for each row execute function public.stats_on_friendship();


-- ------------------------------------------------------------
--  Two functions from 42, adjusted so the trigger above can see.
--
--  Both accept_session_invite() and join_session() deleted the
--  invite BEFORE inserting the session_players row. They had a good
--  reason: a pending invite holds a slot, so counting the session
--  without dropping your own hold first would find it full of you.
--
--  But it means the invite is already gone by the time anything
--  watching the insert can look at it, and the credit above never
--  happens. Found by testing it, not by reading it.
--
--  The fix is to stop deleting early and subtract the held slot from
--  the count instead. The invite then survives until the insert, the
--  BEFORE trigger reads it, and 42's own AFTER trigger clears it —
--  one path in, one credit, and no dependence on what order any of
--  this happens in.
--
--  Otherwise these are the functions from 42 unchanged.
-- ------------------------------------------------------------
create or replace function public.accept_session_invite(post bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  p     posts%rowtype;
  taken int;
begin
  if me is null then
    return 'signed_out';
  end if;

  perform pg_advisory_xact_lock(post);

  if not exists (
    select 1 from session_invites where post_id = post and invitee_id = me
  ) then
    return 'no_invite';
  end if;

  select * into p from posts where id = post;

  if p.id is null        then return 'missing'; end if;
  if p.kind <> 'lfg'     then return 'not_session'; end if;
  if p.starts_at < now() then return 'past'; end if;

  if exists (
    select 1 from session_players where post_id = post and user_id = me
  ) then
    delete from session_invites where post_id = post and invitee_id = me;
    return 'already';
  end if;

  -- Our own held slot is the one we are about to fill, so it does not
  -- count against us. Subtracted rather than deleted — see above.
  taken := public.session_taken(post) - 1;

  if taken >= p.slots then
    -- Somebody got there first. Give the slot up; a promise about a
    -- slot that no longer exists is not worth keeping.
    delete from session_invites where post_id = post and invitee_id = me;
    return 'full';
  end if;

  -- The insert clears the invite, via the trigger in 42.
  insert into session_players (post_id, user_id) values (post, me);
  return 'joined';
end;
$$;

grant execute on function public.accept_session_invite(bigint) to authenticated;


create or replace function public.join_session(post bigint)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  p     posts%rowtype;
  taken int;
  held  boolean;
begin
  -- An advisory lock rather than `for update` on the post: `for
  -- update` is filtered by the UPDATE policy, and we may not modify
  -- somebody else's post. See the note at the top of 40.
  perform pg_advisory_xact_lock(post);

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

  -- Pressing Join while holding an invite is the same act as pressing
  -- Accept. The slot you are holding is the slot you are taking, so it
  -- doesn't count against you — and leaving the invite in place until
  -- the insert is what lets whoever sent it get the credit.
  held := exists (
    select 1 from session_invites
    where post_id = post and invitee_id = auth.uid()
  );

  taken := public.session_taken(post) - case when held then 1 else 0 end;

  if taken >= p.slots then
    return 'full';
  end if;

  insert into session_players (post_id, user_id) values (post, auth.uid());
  return 'joined';
end;
$$;

grant execute on function public.join_session(bigint) to authenticated;


-- ------------------------------------------------------------
--  Reading them.
--
--  The stored counters, plus the two figures that are cheaper to work
--  out on the spot than to maintain: how long they have been here,
--  and how many different people they have played with.
-- ------------------------------------------------------------
create or replace function public.get_profile_stats(target uuid)
returns table (
  member_since     timestamptz,
  days_member      int,
  posts_made       int,
  comments_made    int,
  likes_given      int,
  likes_received   int,
  sessions_hosted  int,
  sessions_joined  int,
  invites_sent     int,
  invites_accepted int,
  played_with      int,
  friends_now      int,
  friends_peak     int,
  friends_peak_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(pr.created_at, now())                                as member_since,
    greatest(0, (current_date - coalesce(pr.created_at, now())::date)) as days_member,
    coalesce(s.posts_made, 0),
    coalesce(s.comments_made, 0),
    coalesce(s.likes_given, 0),
    coalesce(s.likes_received, 0),
    coalesce(s.sessions_hosted, 0),
    coalesce(s.sessions_joined, 0),
    coalesce(s.invites_sent, 0),
    coalesce(s.invites_accepted, 0),
    (select count(distinct a2.user_id)::int
       from session_attendance a1
       join session_attendance a2
         on a2.post_id = a1.post_id and a2.user_id <> target
      where a1.user_id = target)                                  as played_with,
    coalesce(s.friends_now, 0),
    coalesce(s.friends_peak, 0),
    s.friends_peak_at
  from profiles pr
  left join profile_stats s on s.user_id = pr.id
  where pr.id = target;
$$;

grant execute on function public.get_profile_stats(uuid) to authenticated;


-- ============================================================
--  BACKFILL
--
--  Everything below seeds the counters from what is still derivable
--  today. Safe to re-run: it recomputes rather than adds, so if a
--  trigger is ever found to have been wrong, running this again
--  repairs every number that can still be worked out.
--
--  What it CANNOT recover, and never will:
--
--    * posts, comments and likes that were deleted. Those rows are
--      gone; the counters start from what survives.
--    * friends_peak. It is seeded to the current friend count, which
--      is a floor, not the true peak. Real peaks only start being
--      recorded from now on.
--    * attendance at sessions somebody has since left.
-- ============================================================

-- Everybody gets a row.
insert into public.profile_stats (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- Attendance, from whoever is currently on a roster.
insert into public.session_attendance (post_id, user_id, joined_at)
select sp.post_id, sp.user_id, coalesce(sp.joined_at, now())
  from public.session_players sp
  join public.posts p on p.id = sp.post_id
 where sp.user_id <> p.author_id
on conflict (post_id, user_id) do nothing;

with counted as (
  select
    pr.id as user_id,
    (select count(*) from posts p
      where p.author_id = pr.id)                        as posts_made,
    (select count(*) from posts p
      where p.author_id = pr.id and p.kind = 'lfg')     as sessions_hosted,
    (select count(*) from post_comments c
      where c.author_id = pr.id)                        as comments_made,
    (select count(*) from post_likes l
      where l.user_id = pr.id)                          as likes_given,
    (select count(*) from post_likes l
      join posts p on p.id = l.post_id
      where p.author_id = pr.id and l.user_id <> pr.id) as likes_received,
    (select count(*) from session_attendance a
      where a.user_id = pr.id)                          as sessions_joined,
    (select count(*) from session_invites i
      where i.inviter_id = pr.id)                       as invites_sent,
    (select count(*) from friendships f
      where f.status = 'accepted'
        and (f.requester_id = pr.id or f.addressee_id = pr.id)) as friends_now
  from profiles pr
)
update public.profile_stats s
   set posts_made      = c.posts_made,
       sessions_hosted = c.sessions_hosted,
       comments_made   = c.comments_made,
       likes_given     = c.likes_given,
       likes_received  = c.likes_received,
       sessions_joined = c.sessions_joined,
       invites_sent    = c.invites_sent,
       friends_now     = c.friends_now,
       -- A floor, not the truth. See the note above.
       friends_peak    = greatest(s.friends_peak, c.friends_now),
       updated_at      = now()
  from counted c
 where c.user_id = s.user_id;

-- invites_accepted is deliberately NOT backfilled. An invite that was
-- accepted has been deleted, and the session_players row it became
-- looks identical to somebody who joined off the feed. Guessing would
-- put a number on a profile that is not true. It starts at zero and
-- counts from here.

-- ============================================================
--  Done.
-- ============================================================
