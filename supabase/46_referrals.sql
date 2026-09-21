-- ============================================================
--  46 — referrals.
--
--  A code you paste in a Discord server, and credit when somebody
--  who used it actually turns up and plays.
--
--  WHY NOT THE FRIEND CODE. It would have worked and cost nothing,
--  and it is still the wrong call. A friend code is handed to people
--  you already know and is welded to your identity for good — 20
--  deliberately gives you no way to change it. A referral code gets
--  pasted somewhere public. Using one code for both means your
--  friend code ends up scraped into a spam list, and everyone who
--  ever saw your invite link can look you up forever. So: a second
--  code, shaped differently so the two are never confused, and one
--  you can throw away.
--
--  THE ABUSE PROBLEM, which decides everything else here. A reward
--  paid on signup is a reward paid for making accounts, and people
--  will make accounts. There is no fingerprinting or IP matching on
--  this stack and pretending otherwise would be worse than not
--  trying, so the defence is the bar instead: a referral pays
--  nothing until the person referred has actually used the app. A
--  script can create accounts. It will not play Helldivers with
--  strangers for a week.
--
--  And the reward is cosmetic — a badge, nothing that confers any
--  advantage over anyone else. The moment spamming invites is a way
--  to get ahead, spamming invites is what the app is for.
--
--  Run in the Supabase SQL Editor, after 45.
-- ============================================================


-- ------------------------------------------------------------
--  The registry.
--
--  Every code ever issued, kept forever, same as the friend code
--  registry in 20 and for the same reason: a code that stops working
--  must never be handed to somebody else. Rolling your code retires
--  the old row rather than deleting it, so an old link fails cleanly
--  instead of quietly crediting a stranger.
--
--  Six characters and no separator, where a friend code is 5-5 with
--  a dash. Nobody should ever have to work out which one they are
--  looking at.
-- ------------------------------------------------------------
create table if not exists public.referral_codes (
  code       text primary key,
  user_id    uuid references public.profiles(id) on delete set null,
  issued_at  timestamptz not null default now(),
  -- Null while it is the owner's current code.
  retired_at timestamptz,

  constraint referral_code_shape check (code ~ '^[A-Z0-9]{6}$')
);

-- One live code per person. Retired ones are unlimited.
create unique index if not exists referral_codes_active_owner
  on public.referral_codes (user_id)
  where retired_at is null and user_id is not null;

create index if not exists referral_codes_owner_idx
  on public.referral_codes (user_id);

alter table public.referral_codes enable row level security;

-- Your own codes only. A readable table would let anybody map codes
-- to accounts, which is most of what makes a public code safe to
-- paste in the first place. Looking one up goes through the function
-- below, which answers about exactly one code at a time.
drop policy if exists "your own referral codes" on public.referral_codes;
create policy "your own referral codes"
  on public.referral_codes for select
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
--  Who referred whom.
--
--  Keyed on the person referred, so being referred is once and for
--  ever: there is no row to update and no second referrer to add.
-- ------------------------------------------------------------
create table if not exists public.referrals (
  referred_id  uuid primary key references public.profiles(id) on delete cascade,
  referrer_id  uuid not null references public.profiles(id) on delete cascade,
  -- The code as used, kept even after it is rolled, so the trail
  -- still makes sense later.
  code         text not null,
  created_at   timestamptz not null default now(),
  -- Set when the person referred actually started using the app.
  -- Null means it counts for nothing yet.
  qualified_at timestamptz,

  constraint no_self_referral check (referred_id <> referrer_id)
);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_id, qualified_at);

alter table public.referrals enable row level security;

-- You can see referrals you made, and the one that brought you in.
drop policy if exists "your own referrals" on public.referrals;
create policy "your own referrals"
  on public.referrals for select
  to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid());

-- No insert policy: record_referral() below is the only way in.


alter table public.profile_stats
  add column if not exists referrals_qualified int not null default 0;


-- ------------------------------------------------------------
--  Making a code.
--
--  The alphabet leaves out I, L, O and U, exactly as 20 does — I/1,
--  L/1 and O/0 get misread when somebody reads a code out on voice
--  chat, and dropping U keeps accidental words from forming.
--
--  32^6 is a little over a billion, so the collision loop is a
--  formality rather than a hot path. It is here because "a formality"
--  is not "impossible".
-- ------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';
  candidate text;
  tries int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (
      select 1 from referral_codes rc where rc.code = candidate
    );

    tries := tries + 1;
    if tries > 50 then
      raise exception 'Could not allocate a referral code';
    end if;
  end loop;

  return candidate;
end;
$$;


/**
 * Your current code, made on first ask.
 *
 * Lazily rather than for everybody at signup: most accounts will
 * never invite anyone, and a billion-row table of codes nobody has
 * ever looked at is not worth having.
 */
create or replace function public.my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me       uuid := auth.uid();
  existing text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select rc.code into existing
    from referral_codes rc
   where rc.user_id = me and rc.retired_at is null;

  if existing is not null then
    return existing;
  end if;

  existing := public.generate_referral_code();

  insert into referral_codes (code, user_id) values (existing, me);

  return existing;
end;
$$;

grant execute on function public.my_referral_code() to authenticated;


/**
 * A new one, and the old one stops working.
 *
 * The whole point of a separate code. Limited to once an hour —
 * not because the space could run out, but because a button that
 * silently breaks every link you have ever shared should be a
 * little harder to lean on.
 */
create or replace function public.roll_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  last_at timestamptz;
  fresh   text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select max(rc.issued_at) into last_at
    from referral_codes rc where rc.user_id = me;

  if last_at is not null and last_at > now() - interval '1 hour' then
    raise exception 'You can change your referral code once an hour';
  end if;

  update referral_codes
     set retired_at = now()
   where user_id = me and retired_at is null;

  fresh := public.generate_referral_code();

  insert into referral_codes (code, user_id) values (fresh, me);

  return fresh;
end;
$$;

grant execute on function public.roll_referral_code() to authenticated;


-- ------------------------------------------------------------
--  Using one.
--
--  Called by the person who just signed up, with the code from the
--  link. It takes the CODE and looks up the owner — never a user id
--  from the browser, which would make this a "type anybody's name
--  here for free stuff" button.
--
--  Returns a word rather than raising, the same way join_session
--  does, so the app can stay quiet about the ordinary failures. Most
--  of them are not worth telling anybody about: somebody arriving
--  through an old link does not need a lecture.
-- ------------------------------------------------------------
create or replace function public.record_referral(want_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  owner  uuid;
  joined timestamptz;
begin
  if me is null then
    return 'signed_out';
  end if;

  if want_code is null or btrim(want_code) = '' then
    return 'no_code';
  end if;

  want_code := upper(btrim(want_code));

  -- Once, ever.
  if exists (select 1 from referrals r where r.referred_id = me) then
    return 'already_referred';
  end if;

  -- New accounts only. Without this, anybody could paste a code into
  -- a link a year after signing up and hand somebody credit for a
  -- user they never brought in.
  select coalesce(pr.created_at, now()) into joined
    from profiles pr where pr.id = me;

  if joined < now() - interval '7 days' then
    return 'too_late';
  end if;

  select rc.user_id into owner
    from referral_codes rc
   where rc.code = want_code and rc.retired_at is null;

  if owner is null then
    return 'unknown_code';
  end if;

  if owner = me then
    return 'self';
  end if;

  insert into referrals (referred_id, referrer_id, code)
  values (me, owner, want_code);

  -- It may already be earned: somebody could join a session before
  -- the app gets round to recording where they came from.
  perform public.check_referral_qualified(me);

  return 'recorded';
end;
$$;

grant execute on function public.record_referral(text) to authenticated;


-- ------------------------------------------------------------
--  Qualifying.
--
--  A referral counts once the person referred has done one of the
--  two things that are tedious to fake: played a session, or made a
--  few friends. Either is a person; neither is a script.
--
--  Deliberately not "filled in a profile" or "logged in twice",
--  which are five seconds of work each and would make the bar
--  decorative.
-- ------------------------------------------------------------
create or replace function public.check_referral_qualified(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  sponsor uuid;
  played  int;
  friends int;
begin
  if target is null then
    return;
  end if;

  select r.referrer_id into sponsor
    from referrals r
   where r.referred_id = target and r.qualified_at is null;

  if sponsor is null then
    return;
  end if;

  select s.sessions_joined, s.friends_peak into played, friends
    from profile_stats s where s.user_id = target;

  if coalesce(played, 0) < 1 and coalesce(friends, 0) < 3 then
    return;
  end if;

  update referrals
     set qualified_at = now()
   where referred_id = target and qualified_at is null;

  -- Nothing to count if the update found nothing — two sessions
  -- finishing at once would otherwise credit the referrer twice.
  if not found then
    return;
  end if;

  insert into profile_stats (user_id, referrals_qualified)
  values (sponsor, 1)
  on conflict (user_id) do update set
    referrals_qualified = profile_stats.referrals_qualified + 1,
    updated_at          = now();
end;
$$;


-- Rides on the stats, like the achievements do: every counter in 43
-- is written through profile_stats, so watching that one table
-- catches both qualifying routes without a trigger for each.
create or replace function public.stats_check_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_referral_qualified(new.user_id);
  return new;
end;
$$;

drop trigger if exists stats_qualify_referral on public.profile_stats;
create trigger stats_qualify_referral
  after insert or update on public.profile_stats
  for each row execute function public.stats_check_referral();


-- ------------------------------------------------------------
--  The panel.
--
--  One call for everything the screen shows: the code, how many
--  people have used it, and how many of those turned into somebody
--  who actually plays.
-- ------------------------------------------------------------
create or replace function public.referral_summary()
returns table (
  code       text,
  total      int,
  qualified  int,
  can_roll   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  mine    text;
  last_at timestamptz;
begin
  if me is null then
    return;
  end if;

  -- stable, so it cannot create one; the panel calls
  -- my_referral_code() first.
  select rc.code into mine
    from referral_codes rc
   where rc.user_id = me and rc.retired_at is null;

  select max(rc.issued_at) into last_at
    from referral_codes rc where rc.user_id = me;

  return query
  select
    mine,
    (select count(*)::int from referrals r where r.referrer_id = me),
    (select count(*)::int from referrals r
      where r.referrer_id = me and r.qualified_at is not null),
    (last_at is null or last_at <= now() - interval '1 hour');
end;
$$;

grant execute on function public.referral_summary() to authenticated;


-- ------------------------------------------------------------
--  The reward.
--
--  Badges, and nothing else. See the note at the top: a referral
--  reward that confers any advantage turns invite spam into a
--  winning strategy, and the people it attracts are exactly the
--  people you do not want.
--
--  Unlocking premium backgrounds would be the obvious next step and
--  is deliberately NOT done here — those are the paid tier, and
--  giving them away for referrals is a pricing decision rather than
--  a technical one.
-- ------------------------------------------------------------
insert into public.achievements
  (code, name, description, category, stat_key, threshold, secret, sort_order)
values
  ('referral_1',  'Brought a Friend', 'Somebody joined on your invite and started playing.',
     'social', 'referrals_qualified', 1,  false, 330),
  ('referral_5',  'Ambassador',       'Five people joined on your invite and started playing.',
     'social', 'referrals_qualified', 5,  false, 331),
  ('referral_25', 'Pied Piper',       'Twenty-five people joined on your invite and started playing.',
     'social', 'referrals_qualified', 25, false, 332)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  stat_key    = excluded.stat_key,
  threshold   = excluded.threshold,
  secret      = excluded.secret,
  sort_order  = excluded.sort_order;


-- And teach stat_value about the new counter, or the three rows
-- above would sit at zero for ever.
create or replace function public.stat_value(target uuid, key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case key
    when 'posts_made'       then s.posts_made
    when 'comments_made'    then s.comments_made
    when 'likes_given'      then s.likes_given
    when 'likes_received'   then s.likes_received
    when 'sessions_hosted'  then s.sessions_hosted
    when 'sessions_joined'  then s.sessions_joined
    when 'invites_sent'     then s.invites_sent
    when 'invites_accepted' then s.invites_accepted
    when 'friends_now'      then s.friends_now
    when 'friends_peak'     then s.friends_peak
    when 'full_houses'      then s.full_houses
    when 'short_notices'    then s.short_notices
    when 'referrals_qualified' then s.referrals_qualified

    when 'played_with'      then (
      select count(distinct a2.user_id)::int
        from session_attendance a1
        join session_attendance a2
          on a2.post_id = a1.post_id and a2.user_id <> target
       where a1.user_id = target)

    when 'days_member'      then (
      select greatest(0, current_date - coalesce(pr.created_at, now())::date)
        from profiles pr where pr.id = target)

    when 'games_owned'      then (
      select count(*)::int from game_library gl where gl.user_id = target)

    when 'distinct_games_played' then (
      select count(distinct p.game_id)::int
        from session_attendance a
        join posts p on p.id = a.post_id
       where a.user_id = target and p.game_id is not null)

    when 'week_streak'      then (
      select coalesce(max(run), 0)::int
        from (
          select count(*) as run
            from (
              select w,
                     (w - (row_number() over (order by w)::int * 7)) as island
                from (
                  select distinct date_trunc('week', a.joined_at)::date as w
                    from session_attendance a
                   where a.user_id = target
                ) weeks
            ) grouped
           group by island
        ) runs)

    else null
  end
  from profile_stats s
  where s.user_id = target;
$$;

-- ============================================================
--  Done.
-- ============================================================
