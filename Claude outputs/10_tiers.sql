-- ============================================================
--  Account tiers
--  Run this in the Supabase SQL Editor.
--
--  This does nothing yet. Everyone is 'free' and no feature checks
--  it. That's the point: the expensive moment to add entitlements
--  is after a dozen screens already exist and a live database full
--  of users needs migrating. The cheap moment is now.
--
--  When the paid tier arrives, gating a feature becomes a one-line
--  check instead of a schema change across a running app.
-- ============================================================

do $$ begin
  create type account_tier as enum ('free', 'plus');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists tier account_tier not null default 'free',
  -- When the current paid period runs out. Null for free accounts and
  -- for any comped account that shouldn't expire.
  add column if not exists tier_expires_at timestamptz;


-- ------------------------------------------------------------
--  Is this person currently entitled to paid features?
--
--  Separate function rather than reading the column directly, so
--  expiry is handled in exactly one place. A row can say 'plus'
--  while the paid period has already lapsed.
-- ------------------------------------------------------------
create or replace function public.has_plus(who uuid default auth.uid())
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = who
      and p.tier = 'plus'
      and (p.tier_expires_at is null or p.tier_expires_at > now())
  );
$$;

grant execute on function public.has_plus(uuid) to authenticated;


-- ------------------------------------------------------------
--  IMPORTANT: tier is deliberately NOT writable by users.
--
--  The existing "users update their own profile" policy would let
--  anyone set their own tier to 'plus' with one API call, since the
--  anon key ships inside the app. This trigger blocks that: only the
--  service role (your billing webhook, running server-side) can
--  change it.
-- ------------------------------------------------------------
create or replace function public.guard_tier_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.tier is distinct from old.tier
      or new.tier_expires_at is distinct from old.tier_expires_at)
     and auth.role() <> 'service_role'
  then
    raise exception 'tier can only be changed by billing';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_tier on public.profiles;
create trigger profiles_guard_tier
  before update on public.profiles
  for each row execute function public.guard_tier_changes();

-- ============================================================
--  Done. Everyone is 'free'; nothing behaves differently yet.
--
--  To test a paid account later, run this as the service role
--  (SQL Editor counts):
--    update public.profiles set tier = 'plus' where username = 'you';
-- ============================================================
