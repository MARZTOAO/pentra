-- ============================================================
--  65 — commendations and player rating.
--
--  Two separate numbers that are easy to confuse, so they are named
--  and stored separately:
--
--    commendation_count — how many times players have vouched for you.
--                         Cumulative, never goes down, shown on every
--                         profile. One per person per WEEK, so a
--                         regular group can keep saying so without
--                         two accounts being able to farm it.
--
--    rating             — starts at 100 and only ever moves DOWN when
--                         a moderator actions a report about you.
--                         Commendations earned afterwards repair it,
--                         capped back at 100. A clean account sits at
--                         100 forever and the number says nothing
--                         about them.
--
--  So a commendation does two things at once: it always adds to the
--  count, and it repairs the rating if there is damage to repair.
--
--  WHY REPORTS ALONE DO NOTHING. Anyone can report anyone. If a report
--  moved the rating by itself, five friends could destroy a stranger's
--  standing in a minute, from alt accounts, with no appeal and without
--  the target ever learning who did it. The rating moves only when a
--  human has looked and acted — which is exactly what
--  moderation_actions already records.
--
--  Run in the Supabase SQL Editor, after 64.
-- ============================================================


-- ------------------------------------------------------------
--  1. The two columns.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists rating smallint not null default 100,
  add column if not exists commendation_count integer not null default 0;

alter table public.profiles drop constraint if exists profiles_rating_range;
alter table public.profiles add constraint profiles_rating_range
  check (rating between 0 and 100);

-- Everyone who already exists starts clean. This is the whole design:
-- you are trusted until somebody demonstrates otherwise.
update public.profiles set rating = 100 where rating is null;


-- ------------------------------------------------------------
--  2. Who has vouched for whom.
--
--  ONE PER PERSON PER WEEK. Not once for all time — regulars who play
--  together every Thursday should be able to keep saying so — and not
--  once per session, which two friends could farm by spinning up
--  sessions back to back.
--
--  The cost of the weekly rule is that the count means "times vouched
--  for", not "people who vouched for me". A single dedicated friend
--  can add 52 a year. That is the trade for letting real regulars
--  keep vouching; if the number ever starts looking inflated, the
--  distinct-people figure is one query away.
-- ------------------------------------------------------------

-- An earlier draft of this migration made the pair the primary key —
-- one commendation per person, for all time. If that table is still
-- here and empty, replace it. If it has rows, leave it alone and say
-- so rather than quietly dropping somebody's data.
do $$
begin
  if to_regclass('public.commendations') is not null then
    if exists (select 1 from public.commendations) then
      raise notice
        'commendations already has rows - not replacing it. If it still has the old (from_id, to_id) primary key, the weekly rule cannot apply until that is dropped.';
    else
      drop table public.commendations;
    end if;
  end if;
end $$;

create table if not exists public.commendations (
  id         bigint generated always as identity primary key,
  from_id    uuid   not null references public.profiles(id) on delete cascade,
  to_id      uuid   not null references public.profiles(id) on delete cascade,
  -- Which session it came out of. Kept for auditing a suspicious
  -- cluster later; set null rather than cascade so deleting an old
  -- session does not erase the vouch.
  post_id    bigint references public.posts(id) on delete set null,
  created_at timestamptz not null default now(),

  check (from_id <> to_id)
);

-- The index the weekly check reads, in the order it reads it.
create index if not exists commendations_pair_idx
  on public.commendations (from_id, to_id, created_at desc);

create index if not exists commendations_to_idx
  on public.commendations (to_id, created_at desc);

alter table public.commendations enable row level security;

-- You can see the ones you gave, so the button can show as already
-- pressed. Nobody can see who commended THEM, which keeps the feature
-- from turning into a popularity scoreboard with names attached.
drop policy if exists "see your own commendations" on public.commendations;
create policy "see your own commendations"
  on public.commendations for select
  to authenticated
  using (from_id = auth.uid());

-- No insert policy. commend() is the only way in, and it checks
-- things a policy cannot.


-- ------------------------------------------------------------
--  3. What a moderator action costs.
--
--  A trigger on moderation_actions rather than an edit to
--  dev_warn_user and dev_ban_user: those functions already do several
--  things, and anything added to them would be missed by a third one
--  written later. Every route that records an action pays the cost.
--
--  'unbanned' and 'dismissed' cost nothing. Dismissing means nothing
--  happened. Unbanning means you decided they can come back — not
--  that the original offence is erased, which is why the penalty
--  stays and has to be earned off.
-- ------------------------------------------------------------
create or replace function public.apply_moderation_penalty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Tuning lives here. A warning takes three commendations to work
  -- off, a ban takes eight.
  warn_cost int := 15;
  ban_cost  int := 40;
  cost      int;
begin
  cost := case new.action
            when 'warned' then warn_cost
            when 'banned' then ban_cost
            else 0
          end;

  if cost > 0 then
    update public.profiles
       set rating = greatest(0, rating - cost)
     where id = new.target_id;
  end if;

  return new;
end;
$$;

drop trigger if exists moderation_penalty on public.moderation_actions;
create trigger moderation_penalty
  after insert on public.moderation_actions
  for each row execute function public.apply_moderation_penalty();


-- ------------------------------------------------------------
--  4. Giving one.
--
--  Returns 'commended', or 'already' when you have vouched for this
--  person within the last week. Everything else raises, because
--  everything else is either a mistake in the client or somebody
--  poking at the API.
-- ------------------------------------------------------------
create or replace function public.commend(other uuid, session bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  repair   int      := 5;
  cooldown interval := interval '7 days';
  post     record;
  last_one timestamptz;
begin
  if other = auth.uid() then
    raise exception 'You cannot commend yourself';
  end if;

  select p.id, p.author_id, p.kind, p.starts_at
    into post
    from public.posts p
   where p.id = session;

  if not found or post.kind <> 'session' then
    raise exception 'That session does not exist';
  end if;

  -- Not before it has started. Commending somebody for a session that
  -- has not happened is just a button two accounts can press at each
  -- other on a schedule.
  if post.starts_at is null or post.starts_at > now() then
    raise exception 'You can commend people once the session has started';
  end if;

  -- Both of you have to have actually been in it. The host counts as
  -- a participant even though they are not in session_players.
  if not (
    auth.uid() = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = auth.uid())
  ) then
    raise exception 'You were not in that session';
  end if;

  if not (
    other = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = other)
  ) then
    raise exception 'They were not in that session';
  end if;

  -- Blocking runs both ways; vouching for somebody you have blocked
  -- would be strange in either direction.
  if public.is_blocked(other) then
    raise exception 'You cannot commend that player';
  end if;

  -- Serialise this pair for the rest of the transaction. The check
  -- below reads and then writes, and two clicks landing at the same
  -- moment would otherwise both read "no recent one" and both insert.
  -- A double-click is the likely cause, but it is a hole either way.
  perform pg_advisory_xact_lock(
    hashtext(least(auth.uid()::text, other::text)),
    hashtext(greatest(auth.uid()::text, other::text))
  );

  select max(c.created_at) into last_one
    from public.commendations c
   where c.from_id = auth.uid() and c.to_id = other;

  if last_one is not null and last_one > now() - cooldown then
    return 'already';
  end if;

  insert into public.commendations (from_id, to_id, post_id)
  values (auth.uid(), other, post.id);

  -- The count always grows. The rating only has somewhere to go if
  -- something knocked it down.
  update public.profiles
     set commendation_count = commendation_count + 1,
         rating = least(100, rating + repair)
   where id = other;

  return 'commended';
end;
$$;

grant execute on function public.commend(uuid, bigint) to authenticated;


-- ------------------------------------------------------------
--  5. Who is commendable in this session, and who you already did.
--
--  One call so the UI does not have to work out the roster and the
--  already-pressed state separately and get them out of step.
-- ------------------------------------------------------------
create or replace function public.session_commendables(session bigint)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  -- True while the weekly cooldown is still running.
  commended     boolean,
  -- When you could commend them again. Null when you can right now.
  available_at  timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  post record;
begin
  select p.id, p.author_id, p.kind, p.starts_at
    into post
    from public.posts p
   where p.id = session;

  if not found or post.kind <> 'session' then
    return;
  end if;

  -- Nothing to show before it starts, and nothing to show to somebody
  -- who was not there.
  if post.starts_at is null or post.starts_at > now() then
    return;
  end if;

  if not (
    auth.uid() = post.author_id
    or exists (select 1 from public.session_players sp
                where sp.post_id = post.id and sp.user_id = auth.uid())
  ) then
    return;
  end if;

  return query
  with roster as (
    select post.author_id as id
    union
    select sp.user_id from public.session_players sp where sp.post_id = post.id
  )
  select
    pr.id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.avatar_preset,
    (last.at is not null and last.at > now() - interval '7 days'),
    case when last.at is not null and last.at > now() - interval '7 days'
         then last.at + interval '7 days' end
  from roster r
  join public.profiles pr on pr.id = r.id
  left join lateral (
    select max(c.created_at) as at
      from public.commendations c
     where c.from_id = auth.uid() and c.to_id = pr.id
  ) last on true
  where r.id <> auth.uid()
    and not public.is_blocked(r.id)
  order by pr.username;
end;
$$;

grant execute on function public.session_commendables(bigint) to authenticated;

-- ============================================================
--  Done.
--
--  Tuning, all in one place if you want to change it:
--    apply_moderation_penalty() — warn_cost 15, ban_cost 40
--    commend()                  — repair 5, cooldown 7 days
--                                 (session_commendables repeats the
--                                  7 days; change both together)
-- ============================================================
