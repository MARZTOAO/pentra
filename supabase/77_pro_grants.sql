-- ============================================================
--  77 — Pentra Pro grants: the developer can give Pro for free.
--
--  MARZ: "I should have pro level regardless and I should always
--  have the power to grant pro level for free."
--
--  TWO KINDS OF PRO, ONE COLUMN PAIR
--    profiles.tier = 'plus'  (the tier's internal name since 10;
--                             "Pro" everywhere a player sees it)
--    profiles.tier_expires_at
--      null            → permanent. A grant with no end date. Billing
--                        must NEVER shorten this — when Stripe arrives,
--                        its webhook adds time to an expiry that exists
--                        and leaves a null one alone.
--      a timestamp     → paid or granted time; Pro ends when it passes.
--
--  WHO CAN CHANGE IT
--    10's guard let only the service role touch tier. That's still the
--    rule for players. Developers now get two functions:
--      dev_grant_pro(who, months)   months null = forever; otherwise
--                                   adds to whatever time they have
--      dev_revoke_pro(who)          back to free, immediately
--    Both check am_i_developer() first, like every dev_* function, and
--    set a transaction-local flag the guard recognises. Every grant is
--    written to pro_grants so there's a record of who gave what.
--
--  Run in the Supabase SQL Editor, BEFORE pushing (DevPanel calls the
--  new functions). Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The record of grants. Sealed: only the functions write it, and
--     dev_pro_grants() reads it back for the panel.
-- ------------------------------------------------------------
create table if not exists public.pro_grants (
  id         bigint generated always as identity primary key,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  months     int,            -- null = permanent
  note       text,
  created_at timestamptz not null default now()
);

create index if not exists pro_grants_target_idx
  on public.pro_grants (target_id, created_at desc);

alter table public.pro_grants enable row level security;
revoke all on public.pro_grants from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.pro_grants from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.pro_grants from authenticated';
  end if;
end $$;


-- ------------------------------------------------------------
--  2. The guard from 10, with one more door.
--
--  `pentra.tier_write` is set for the current transaction only, by
--  the two functions below, after am_i_developer() has passed. A
--  player calling the API directly never has it.
-- ------------------------------------------------------------
create or replace function public.guard_tier_changes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (new.tier is distinct from old.tier
      or new.tier_expires_at is distinct from old.tier_expires_at)
     and coalesce(auth.role(), '') <> 'service_role'
     and coalesce(current_setting('pentra.tier_write', true), '') <> 'on'
  then
    raise exception 'tier can only be changed by billing';
  end if;

  return new;
end;
$$;


-- ------------------------------------------------------------
--  3. Grant.
--
--  Returns 'granted', 'no such player', or 'not a developer' never —
--  that one raises, like every dev_* function.
--
--  Adding time: if they already have Pro with time left, the months
--  go on the end of it (stacking, the same rule paid time will use).
--  If they have a PERMANENT grant, a timed grant changes nothing —
--  there's nothing to add to forever.
-- ------------------------------------------------------------
create or replace function public.dev_grant_pro(
  who    text,
  months int  default null,
  note   text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  cur_tier text;
  cur_exp  timestamptz;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if months is not null and months < 1 then
    return 'months must be at least 1';
  end if;

  select p.id, p.tier::text, p.tier_expires_at
    into target, cur_tier, cur_exp
    from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  perform set_config('pentra.tier_write', 'on', true);

  if months is null then
    update public.profiles
       set tier = 'plus', tier_expires_at = null
     where id = target;
  elsif cur_tier = 'plus' and cur_exp is null then
    -- Already permanent. Record the grant, change nothing.
    null;
  else
    update public.profiles
       set tier = 'plus',
           tier_expires_at =
             greatest(coalesce(cur_exp, now()), now())
             + make_interval(months => months)
     where id = target;
  end if;

  insert into public.pro_grants (target_id, granted_by, months, note)
  values (target, auth.uid(), months, nullif(btrim(coalesce(note, '')), ''));

  return 'granted';
end;
$$;


-- ------------------------------------------------------------
--  4. Revoke. Back to free now, whatever they had.
-- ------------------------------------------------------------
create or replace function public.dev_revoke_pro(who text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target from public.profiles p
   where lower(p.username) = lower(btrim(who));
  if target is null then return 'no such player'; end if;

  perform set_config('pentra.tier_write', 'on', true);

  update public.profiles
     set tier = 'free', tier_expires_at = null
   where id = target;

  insert into public.pro_grants (target_id, granted_by, months, note)
  values (target, auth.uid(), 0, 'revoked');

  return 'revoked';
end;
$$;


-- ------------------------------------------------------------
--  5. Who has Pro right now, for the panel.
-- ------------------------------------------------------------
drop function if exists public.dev_pro_members();

create function public.dev_pro_members()
returns table (
  username   text,
  expires_at timestamptz,   -- null = permanent
  granted    boolean        -- true if any grant row exists (vs paid)
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return query
  select p.username,
         p.tier_expires_at,
         exists (select 1 from public.pro_grants g
                  where g.target_id = p.id and coalesce(g.months, 1) <> 0)
    from public.profiles p
   where p.tier = 'plus'
     and (p.tier_expires_at is null or p.tier_expires_at > now())
   order by p.tier_expires_at nulls first, p.username;
end;
$$;


-- ------------------------------------------------------------
--  6. Grants.
-- ------------------------------------------------------------
revoke all on function public.dev_grant_pro(text, int, text) from public;
revoke all on function public.dev_revoke_pro(text)           from public;
revoke all on function public.dev_pro_members()              from public;

grant execute on function public.dev_grant_pro(text, int, text) to authenticated;
grant execute on function public.dev_revoke_pro(text)           to authenticated;
grant execute on function public.dev_pro_members()              to authenticated;


-- ------------------------------------------------------------
--  7. MARZ's own account: permanent Pro.
--
--  The developer row is the one in `developers` (58). Every developer
--  gets a permanent grant here, and re-running this is harmless.
-- ------------------------------------------------------------
do $$
declare
  dev uuid;
begin
  for dev in select user_id from public.developers loop
    perform set_config('pentra.tier_write', 'on', true);
    update public.profiles
       set tier = 'plus', tier_expires_at = null
     where id = dev and not (tier = 'plus' and tier_expires_at is null);
    if not exists (select 1 from public.pro_grants
                    where target_id = dev and months is null) then
      insert into public.pro_grants (target_id, granted_by, months, note)
      values (dev, dev, null, 'developer');
    end if;
  end loop;
end $$;

-- ============================================================
--  Done. Check:
--    select username, tier, tier_expires_at from public.profiles
--     where tier = 'plus';
-- ============================================================
