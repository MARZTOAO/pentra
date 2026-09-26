-- ============================================================
--  76 — Pentra OG: a permanent, numbered badge for the first 1,000
--       real players.
--
--  MARZ's rules: the first 1,000 profiles get a "Pentra OG" badge,
--  shown with their number ("#42 of 1,000"), and none of the fake
--  seeded accounts get one.
--
--  HOW A NUMBER IS GIVEN
--    - Stored on profiles.og_number, 1 to 1,000, unique. Once given it
--      never changes and is never handed to anyone else — not even if
--      that account is deleted. A counter row, not max()+1, is what
--      guarantees that: max()+1 would give #1,000 out twice if the
--      first #1,000 deleted their account.
--    - Given when the account's email is CONFIRMED, not at signup.
--      Otherwise a burst of throwaway signups that never confirm
--      could use up the 1,000 without a single real player behind
--      them. So the order is the order people actually got in.
--    - Seeded accounts (@example.test) are skipped, always.
--
--  EXISTING ACCOUNTS are numbered once, below, in the order they were
--  created — confirmed, real accounts only.
--
--  NOBODY CAN SET THEIR OWN. A signed-in player updating their profile
--  through the API gets refused if they touch og_number, the same way
--  tier is protected in 10.
--
--  Run in the Supabase SQL Editor BEFORE pushing: the new app asks
--  for og_number when it loads a profile, and every profile would
--  fail to load if the column weren't there yet. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The column.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists og_number smallint;

alter table public.profiles drop constraint if exists profiles_og_number_range;
alter table public.profiles add constraint profiles_og_number_range
  check (og_number is null or og_number between 1 and 1000);

create unique index if not exists profiles_og_number_key
  on public.profiles (og_number)
  where og_number is not null;


-- ------------------------------------------------------------
--  2. How many there are, in one place.
-- ------------------------------------------------------------
create or replace function public.og_limit()
returns int
language sql
immutable
as $$ select 1000 $$;


-- ------------------------------------------------------------
--  3. The counter. One row: the last number handed out.
--
--  Sealed (RLS on, no policies, no grants) — only the function below
--  touches it. Updating the single row takes a row lock, so two
--  confirmations at the same instant can't get the same number.
-- ------------------------------------------------------------
create table if not exists public.og_counter (
  id   boolean primary key default true check (id),
  last int not null default 0
);

insert into public.og_counter (id, last) values (true, 0)
on conflict (id) do nothing;

alter table public.og_counter enable row level security;
revoke all on public.og_counter from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.og_counter from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.og_counter from authenticated';
  end if;
end $$;


-- ------------------------------------------------------------
--  4. Give someone their number, if they're owed one.
--
--  Does nothing when: they already have one, their email isn't
--  confirmed, they're a seeded @example.test account, there's no
--  profile yet, or all 1,000 are gone.
-- ------------------------------------------------------------
create or replace function public.assign_og_number(who uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if who is null then
    return null;
  end if;

  if exists (select 1 from profiles where id = who and og_number is not null) then
    return (select og_number from profiles where id = who);
  end if;

  if not exists (select 1 from profiles where id = who) then
    return null;
  end if;

  if not exists (
    select 1 from auth.users u
     where u.id = who
       and u.email_confirmed_at is not null
       and lower(coalesce(u.email, '')) not like '%@example.test'
  ) then
    return null;
  end if;

  update og_counter
     set last = last + 1
   where id and last < public.og_limit()
  returning last into n;

  if n is null then
    return null;   -- all 1,000 given out
  end if;

  update profiles
     set og_number = n
   where id = who and og_number is null;

  return n;
end;
$$;

revoke all on function public.assign_og_number(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.assign_og_number(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.assign_og_number(uuid) from authenticated';
  end if;
end $$;


-- ------------------------------------------------------------
--  5. When it happens: the moment an email is confirmed.
--
--  On INSERT too, for accounts created already confirmed (the admin
--  API, or if confirmation is ever switched off). The trigger's name
--  sorts after on_auth_user_created, so the profile row exists by the
--  time it runs.
-- ------------------------------------------------------------
create or replace function public.og_on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    perform public.assign_og_number(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_og on auth.users;
create trigger on_auth_user_og
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.og_on_auth_user();


-- ------------------------------------------------------------
--  6. Players can't set or change their own.
--
--  The "update your own profile" policy covers every column, so
--  without this anyone could give themselves #1 with one request.
--  Only signed-in API callers are stopped; the functions above run
--  outside that and are unaffected.
-- ------------------------------------------------------------
create or replace function public.guard_og_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.og_number := null;
    elsif new.og_number is distinct from old.og_number then
      raise exception 'og_number is given by Pentra, not set by players';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_og on public.profiles;
create trigger profiles_guard_og
  before insert or update on public.profiles
  for each row execute function public.guard_og_number();


-- ------------------------------------------------------------
--  7. Number everyone already here, oldest first.
--
--  Real, confirmed accounts without a number, in the order their
--  profiles were created. Re-running only numbers people who don't
--  have one yet, continuing from the counter.
-- ------------------------------------------------------------
do $$
declare
  person uuid;
begin
  for person in
    select p.id
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.og_number is null
       and u.email_confirmed_at is not null
       and lower(coalesce(u.email, '')) not like '%@example.test'
     order by p.created_at, p.id
  loop
    exit when public.assign_og_number(person) is null
          and (select last from public.og_counter) >= public.og_limit();
  end loop;
end $$;


-- ------------------------------------------------------------
--  8. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Pentra OG',
     'The first 1,000 players get a permanent Pentra OG badge on their profile, numbered in the order they joined. If you''re one of them, check your profile.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Check (read-only):
--    select og_number, username from public.profiles
--     where og_number is not null order by og_number limit 20;
--    select last as numbers_given from public.og_counter;
-- ============================================================
