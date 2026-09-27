-- ============================================================
--  79 — Moving backgrounds: Pentra Pro perk #2.
--
--  MARZ: "premium members to have moving backgrounds".
--
--  Nothing new to store. A moving background is a built-in preset
--  like the others, kept in profiles.background (09); the app draws
--  it with CSS animation. What's new is the rule: every preset whose
--  key starts with `motion-` is Pro only. A prefix rather than a list
--  in the database, so adding a background is an app change, not a
--  migration.
--
--  guard_pro_perks() from 78 grows to cover it, the same way it
--  covers frames:
--    - a player picks a motion- background without Pro → refused
--    - Pro lapses or is revoked                         → cleared on
--                                                         the next write
--  The app also only ANIMATES for a profile that is Pro right now, and
--  shows the preset's still colour otherwise.
--
--  Run in the Supabase SQL Editor before pushing. Re-runnable.
-- ============================================================

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

  return new;
end;
$$;

-- The trigger from 78 already calls this function; nothing to re-create.


-- Anyone who somehow has one without Pro (nobody today).
update public.profiles
   set background = null
 where background like 'motion-%'
   and not public.row_has_plus(tier, tier_expires_at);

-- ============================================================
--  Done. No What's New entry yet — see 78.
--
--  Check (read-only):
--    select username, background, tier from public.profiles
--     where background like 'motion-%';
-- ============================================================
