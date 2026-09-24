-- ============================================================
--  69 — date of birth, minimum age 16, birthday and anniversary
--       greetings.
--
--  THREE THINGS, ONE TABLE.
--
--    1. Signup requires a date of birth, and the database refuses
--       anyone under 16. The refusal happens inside the signup
--       itself, so a refused signup stores NOTHING — no account, no
--       email, no date of birth. That matters: keeping the details
--       of someone too young to be here is the one thing worse than
--       not asking.
--
--    2. Accounts that existed before this are asked once, and can
--       skip. Once a date is set it is locked — a correction goes
--       through support@pentra.gg. Otherwise the age check is one
--       edit away from meaningless.
--
--    3. Once a year, on the day, a birthday greeting. Once a year,
--       on the day you joined, a thank-you. "The day" is the
--       player's OWN calendar day — the app sends its time zone —
--       not UTC's, or someone in Sydney would get wished happy
--       birthday at 10am the day after.
--
--  WHERE THE DATE LIVES. Not on profiles. Everything on profiles is
--  a column away from being shown to other people — PUBLIC_COLUMNS
--  in the app is a list someone could extend without thinking. So
--  it goes in account_private: RLS on, no policies, no grants.
--  Nothing can read it through the API at all; the only doors are
--  the functions below, and every one of them answers only about
--  auth.uid().
--
--  FEB 29. Celebrated on Feb 28 in years without one.
--
--  Run in the Supabase SQL Editor, after 68. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  0. The minimum age, in one place.
--
--  Legal.tsx and Signup.tsx carry the same number for display and a
--  fast client-side check. This is the one that is enforced.
-- ------------------------------------------------------------
create or replace function public.minimum_age()
returns int
language sql
immutable
as $$ select 16 $$;


-- ------------------------------------------------------------
--  1. The sealed table.
--
--  Keyed to auth.users rather than profiles so that it cascades on
--  account deletion (53 deletes the auth row) and does not depend on
--  the profiles trigger having run yet.
-- ------------------------------------------------------------
create table if not exists public.account_private (
  -- DEFERRABLE because the signup check below writes this row in a
  -- BEFORE trigger, a moment before the auth.users row it points at
  -- exists. The key is checked at commit instead, by which point it
  -- does — and if the signup fails, both roll back together.
  user_id                 uuid primary key
                            references auth.users(id) on delete cascade
                            deferrable initially deferred,
  birth_date              date,
  -- The calendar year each greeting was last dismissed in. A year
  -- rather than a timestamp so "once a year" is exact regardless of
  -- time zone or what time of day it was shown.
  birthday_seen_year      int,
  anniversary_seen_year   int,
  -- Existing accounts are asked for a date of birth once. Skipping
  -- stamps this, and they are not asked again (Settings still has it).
  dob_prompt_dismissed_at timestamptz,
  created_at              timestamptz not null default now(),

  constraint account_private_birth_date_sane
    check (birth_date is null or birth_date >= date '1900-01-01')
);

alter table public.account_private enable row level security;
revoke all on public.account_private from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.account_private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.account_private from authenticated';
  end if;
end $$;


-- ------------------------------------------------------------
--  2. Is this date old enough?
--
--  "Tomorrow minus 16 years", not "today minus 16 years": the server
--  runs on UTC, and on someone's 16th birthday in Auckland it is
--  still the day before in UTC. A day of leeway in their favour is
--  the honest reading of "they are 16 today".
-- ------------------------------------------------------------
create or replace function public.old_enough(d date)
returns boolean
language sql
stable
as $$
  select d is not null
     and d >= date '1900-01-01'
     and d <= ((current_date + 1) - make_interval(years => public.minimum_age()))::date;
$$;


-- ------------------------------------------------------------
--  3. The signup check.
--
--  Fires on every new auth.users row, BEFORE it is written. Reads
--  birth_date from the signup metadata (Signup.tsx sends it as
--  options.data.birth_date), refuses a missing, malformed or
--  under-age date, and otherwise moves it into account_private.
--
--  MOVES, not copies. Supabase puts signup metadata into every
--  access token the account is issued and into the user object the
--  app holds. Taking birth_date out of the metadata before the row
--  is written leaves account_private as the only copy — the locked
--  one.
--
--  Raising here aborts the whole signup, so nothing is kept. The
--  auth API reports it as "Database error saving new user", which is
--  why Signup.tsx checks the age itself first and only a tampered or
--  broken request ever reaches this.
--
--  SEED SCRIPTS AND THE DASHBOARD. Anything that creates a user has
--  to pass a birth_date in user_metadata now. scripts/seed-players.mjs
--  does. The Supabase dashboard's "Add user" button does not, so it
--  will fail — that is the price of the check having no back door.
-- ------------------------------------------------------------
create or replace function public.check_new_user_birth_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw text := btrim(coalesce(new.raw_user_meta_data->>'birth_date', ''));
  d   date;
begin
  if raw !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'A date of birth is required to sign up.'
      using errcode = 'check_violation';
  end if;

  begin
    d := raw::date;
  exception when others then
    raise exception 'That date of birth is not a real date.'
      using errcode = 'check_violation';
  end;

  if not public.old_enough(d) then
    raise exception 'This account can''t be created.'
      using errcode = 'check_violation';
  end if;

  insert into account_private (user_id, birth_date)
  values (new.id, d)
  on conflict (user_id) do update set birth_date = excluded.birth_date;

  new.raw_user_meta_data := new.raw_user_meta_data - 'birth_date';

  return new;
end;
$$;

drop trigger if exists on_auth_user_birth_date on auth.users;
create trigger on_auth_user_birth_date
  before insert on auth.users
  for each row execute function public.check_new_user_birth_date();



-- ------------------------------------------------------------
--  4. Your own date of birth.
-- ------------------------------------------------------------
create or replace function public.my_birth_date()
returns date
language sql
security definer
set search_path = public
stable
as $$
  select ap.birth_date
  from account_private ap
  where ap.user_id = auth.uid();
$$;


-- ------------------------------------------------------------
--  5. Setting it, for accounts made before this existed.
--
--  Only when it's empty. Returns one of:
--    'saved'        stored
--    'already_set'  locked; changes go through support
--    'too_young'    not stored — nothing about the answer is kept
--    'invalid'      null, before 1900, or in the future
--    'signed_out'
-- ------------------------------------------------------------
create or replace function public.set_birth_date(d date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return 'signed_out';
  end if;

  if d is null or d < date '1900-01-01' or d > current_date + 1 then
    return 'invalid';
  end if;

  if exists (
    select 1 from account_private
    where user_id = me and birth_date is not null
  ) then
    return 'already_set';
  end if;

  if not public.old_enough(d) then
    return 'too_young';
  end if;

  insert into account_private (user_id, birth_date)
  values (me, d)
  on conflict (user_id) do update
    set birth_date = excluded.birth_date
    where account_private.birth_date is null;

  return 'saved';
end;
$$;


-- ------------------------------------------------------------
--  6. Skipping the prompt.
-- ------------------------------------------------------------
create or replace function public.dismiss_birth_date_prompt()
returns void
language sql
security definer
set search_path = public
as $$
  insert into account_private (user_id, dob_prompt_dismissed_at)
  select auth.uid(), now()
  where auth.uid() is not null
  on conflict (user_id) do update
    set dob_prompt_dismissed_at = coalesce(
      account_private.dob_prompt_dismissed_at, now());
$$;


-- ------------------------------------------------------------
--  7. Same day of the year?
--
--  Feb 29 matches Feb 28 in a year that has no Feb 29.
-- ------------------------------------------------------------
create or replace function public.same_day_of_year(d date, today date)
returns boolean
language sql
immutable
as $$
  select case
    when d is null or today is null then false
    when extract(month from d) = extract(month from today)
     and extract(day   from d) = extract(day   from today) then true
    when extract(month from d) = 2 and extract(day from d) = 29
     and extract(month from today) = 2 and extract(day from today) = 28
     -- No Feb 29 this year: Mar 1 minus a day is Feb 28.
     and extract(day from (make_date(extract(year from today)::int, 3, 1) - 1)) = 28
      then true
    else false
  end;
$$;


-- ------------------------------------------------------------
--  8. Today, in the player's own time zone.
--
--  A zone the database doesn't know (or garbage) falls back to UTC
--  rather than failing the whole call.
-- ------------------------------------------------------------
create or replace function public.local_today(tz text)
returns date
language plpgsql
stable
as $$
begin
  return (now() at time zone coalesce(nullif(btrim(tz), ''), 'UTC'))::date;
exception when others then
  return (now() at time zone 'UTC')::date;
end;
$$;


-- ------------------------------------------------------------
--  9. What to celebrate right now.
--
--    birthday           today is your birthday and you haven't
--                       dismissed this year's greeting
--    anniversary_years  1 or more if today is the day you joined and
--                       you haven't dismissed this year's; 0 otherwise
--    needs_birth_date   no date on file and you haven't skipped the
--                       prompt
--
--  "The day you joined" is also read in your own time zone, so an
--  account made at 11pm in Chicago has its anniversary on the day
--  it was made in Chicago.
-- ------------------------------------------------------------
drop function if exists public.my_celebrations(text);

create function public.my_celebrations(tz text default 'UTC')
returns table (
  birthday          boolean,
  anniversary_years int,
  needs_birth_date  boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me     uuid := auth.uid();
  today  date := public.local_today(tz);
  zone   text;
  yr     int  := extract(year from today)::int;
  ap     account_private%rowtype;
  joined date;
  years  int;
begin
  if me is null then
    return;
  end if;

  select * into ap from account_private where user_id = me;

  -- Same fallback as local_today(): an unknown zone reads as UTC.
  begin
    perform now() at time zone tz;
    zone := coalesce(nullif(btrim(tz), ''), 'UTC');
  exception when others then
    zone := 'UTC';
  end;

  select (p.created_at at time zone zone)::date into joined
  from profiles p where p.id = me;

  years := yr - extract(year from joined)::int;

  birthday := ap.birth_date is not null
          and public.same_day_of_year(ap.birth_date, today)
          and coalesce(ap.birthday_seen_year, 0) < yr;

  anniversary_years := case
    when joined is not null
     and years >= 1
     and public.same_day_of_year(joined, today)
     and coalesce(ap.anniversary_seen_year, 0) < yr
      then years
    else 0
  end;

  needs_birth_date := ap.birth_date is null
                  and ap.dob_prompt_dismissed_at is null;

  return next;
end;
$$;


-- ------------------------------------------------------------
--  10. Dismissing the greeting.
--
--  Stamps this year for whichever of the two applies today, so a
--  birthday that falls on your anniversary is one dialog and one
--  dismissal.
-- ------------------------------------------------------------
create or replace function public.dismiss_celebrations(tz text default 'UTC')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  c  record;
  yr int := extract(year from public.local_today(tz))::int;
begin
  if me is null then
    return;
  end if;

  select * into c from public.my_celebrations(tz);

  if coalesce(c.birthday, false) or coalesce(c.anniversary_years, 0) > 0 then
    insert into account_private (user_id) values (me)
    on conflict (user_id) do nothing;

    update account_private
       set birthday_seen_year =
             case when c.birthday then yr else birthday_seen_year end,
           anniversary_seen_year =
             case when c.anniversary_years > 0 then yr else anniversary_seen_year end
     where user_id = me;
  end if;
end;
$$;


-- ------------------------------------------------------------
--  11. Who can call what.
--
--  Everything signed-in only. The helpers are harmless but there is
--  no reason for anon to have them either.
-- ------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_birth_date()',
    'public.set_birth_date(date)',
    'public.dismiss_birth_date_prompt()',
    'public.my_celebrations(text)',
    'public.dismiss_celebrations(text)',
    'public.check_new_user_birth_date()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', fn);
    end if;
  end loop;
end $$;

grant execute on function public.my_birth_date()               to authenticated;
grant execute on function public.set_birth_date(date)          to authenticated;
grant execute on function public.dismiss_birth_date_prompt()   to authenticated;
grant execute on function public.my_celebrations(text)         to authenticated;
grant execute on function public.dismiss_celebrations(text)    to authenticated;


-- ------------------------------------------------------------
--  12. What's New.
--
--  The age limit isn't announced here on purpose: a neutral age
--  question doesn't say the answer it's looking for. The Terms page
--  states it.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Birthday greetings',
     'Add your date of birth and we''ll wish you a happy birthday on the day. It stays private — it never appears on your profile, and nobody else can see it.',
     'feature', 1),
    ('Pentra anniversaries',
     'Every year on the day you joined, a thank-you from us for being part of the community.',
     'feature', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);


-- ------------------------------------------------------------
--  13. Self-check.
-- ------------------------------------------------------------
do $$
begin
  assert public.same_day_of_year(date '2000-06-15', date '2031-06-15'),     'same day';
  assert not public.same_day_of_year(date '2000-06-15', date '2031-06-16'), 'different day';
  assert public.same_day_of_year(date '2008-02-29', date '2027-02-28'),     'leapling, non-leap year';
  assert not public.same_day_of_year(date '2008-02-29', date '2028-02-28'), 'leapling, leap year - wait for the 29th';
  assert public.same_day_of_year(date '2008-02-29', date '2028-02-29'),     'leapling, leap year';
  assert not public.same_day_of_year(date '2008-02-28', date '2028-02-29'), 'Feb 28 is not Feb 29';
  assert public.old_enough(date '1990-01-01'),     'adult';
  assert not public.old_enough(current_date - 365 * 10), 'ten-year-old';
  assert not public.old_enough(null),              'null';
  assert not public.old_enough(date '1899-12-31'), 'before 1900';
end $$;

-- ============================================================
--  Done. Check:
--    select count(*) from public.account_private;
-- ============================================================
