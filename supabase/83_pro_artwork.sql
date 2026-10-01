-- ============================================================
--  83 — Pentra Pro artwork: avatars and backgrounds.
--
--  MARZ made 50 avatars and 40 backgrounds for Pro members. The
--  images ship inside the app (public/pro/, compressed); the profile
--  stores which one by key, the same columns as the free ones:
--
--    avatar_preset  'pro.<key>'   e.g. 'pro.alien-1'
--    background     'pro-<key>'   e.g. 'pro-cosmic-1'
--
--  The prefix is the rule, like 'motion-' in 79 — adding more artwork
--  is an app change, not a migration.
--
--  WHAT THIS CHANGES
--    - avatar_preset's format check (13) only allowed "shape.colour"
--      (letters only). It now also allows 'pro.<letters, digits, dashes>'.
--    - guard_pro_perks() (78, 79) gains the two new rules, the same way
--      as frames and moving backgrounds:
--        picking one without Pro            → refused
--        Pro lapses or is revoked           → cleared on the next write
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. Let avatar_preset hold a Pro artwork key.
-- ------------------------------------------------------------
alter table public.profiles
  drop constraint if exists avatar_preset_format;
alter table public.profiles
  add constraint avatar_preset_format
  check (
    avatar_preset is null
    or avatar_preset ~ '^[a-z]+\.[a-z]+$'
    or avatar_preset ~ '^pro\.[a-z0-9-]{1,40}$'
  );


-- ------------------------------------------------------------
--  2. The guard, with the two new perks.
--
--  79's function, unchanged except for the two blocks marked 83.
-- ------------------------------------------------------------
create or replace function public.guard_pro_perks()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_pro boolean := public.row_has_plus(new.tier, new.tier_expires_at);
begin
  -- Blank string means none. Saves the app a special case.
  if new.avatar_frame is not null and btrim(new.avatar_frame) = '' then
    new.avatar_frame := null;
  end if;

  -- Avatar frame (78).
  if not is_pro and new.avatar_frame is not null then
    if tg_op = 'UPDATE' and new.avatar_frame is not distinct from old.avatar_frame then
      new.avatar_frame := null;          -- lapsed: clear quietly
    else
      raise exception 'Avatar frames are a Pentra Pro perk'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Moving background (79).
  if not is_pro and new.background like 'motion-%' then
    if tg_op = 'UPDATE' and new.background is not distinct from old.background then
      new.background := null;            -- lapsed: back to the plain surface
    else
      raise exception 'Moving backgrounds are a Pentra Pro perk'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Pro artwork background (83).
  if not is_pro and new.background like 'pro-%' then
    if tg_op = 'UPDATE' and new.background is not distinct from old.background then
      new.background := null;
    else
      raise exception 'That background is a Pentra Pro perk'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Pro artwork avatar (83).
  if not is_pro and new.avatar_preset like 'pro.%' then
    if tg_op = 'UPDATE' and new.avatar_preset is not distinct from old.avatar_preset then
      new.avatar_preset := null;         -- lapsed: back to their initial
    else
      raise exception 'That avatar is a Pentra Pro perk'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

-- The trigger from 78 already calls this function; nothing to re-create.


-- Anyone who somehow has one without Pro (nobody today).
update public.profiles
   set background = null
 where background like 'pro-%'
   and not public.row_has_plus(tier, tier_expires_at);

update public.profiles
   set avatar_preset = null
 where avatar_preset like 'pro.%'
   and not public.row_has_plus(tier, tier_expires_at);

-- ============================================================
--  Done. No What's New entry yet: one "Pentra Pro is here" entry will
--  cover every perk at launch.
--
--  Check (read-only):
--    select username, avatar_preset, background from public.profiles
--     where avatar_preset like 'pro.%' or background like 'pro-%';
-- ============================================================
