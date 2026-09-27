-- ============================================================
--  78 — Avatar frames: the first Pentra Pro perk.
--
--  MARZ: "premium members to be able to add a frame to their avatar
--  icon" — and "slow rotation on some would be insane".
--
--  WHAT THIS ADDS
--    profiles.avatar_frame   the key of a built-in frame (drawn in the
--                            app — src/lib/frames.ts — nothing hosted),
--                            or null for no frame.
--
--  WHO MAY SET ONE
--    Only a current Pro member (has_plus: tier 'plus' and not expired).
--    The "update your own profile" policy covers every column, so this
--    is enforced by a trigger, not left to the UI:
--      - a player picks a frame without Pro      → refused, with a
--                                                  message the app shows
--      - Pro lapses or is revoked                → the frame is cleared
--                                                  the next time the row
--                                                  is written (revoke
--                                                  writes it immediately)
--    The app also only DRAWS a frame when the profile is currently Pro,
--    so a lapsed member's frame disappears at once even before their
--    row is next written.
--
--  The trigger is written to grow: moving backgrounds (next) will add a
--  second column and a second check to the same function.
--
--  Run in the Supabase SQL Editor BEFORE pushing: the app asks for
--  avatar_frame when it loads a profile. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The column.
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_frame text;

alter table public.profiles drop constraint if exists avatar_frame_length;
alter table public.profiles add constraint avatar_frame_length
  check (avatar_frame is null or char_length(avatar_frame) between 1 and 40);


-- ------------------------------------------------------------
--  2. Is this ROW currently Pro?
--
--  has_plus(uuid) from 10 reads the table, which inside a BEFORE
--  trigger would see the old row. The trigger needs to judge the row
--  as it is about to be written — dev_revoke_pro sets tier to 'free'
--  and the frame must go in the same statement — so this takes the
--  values directly.
-- ------------------------------------------------------------
create or replace function public.row_has_plus(
  row_tier       public.account_tier,
  row_expires_at timestamptz
)
returns boolean
language sql
stable   -- not immutable: it reads now()
as $$
  select row_tier = 'plus'
     and (row_expires_at is null or row_expires_at > now());
$$;


-- ------------------------------------------------------------
--  3. The guard.
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

  if not is_pro and new.avatar_frame is not null then
    if tg_op = 'UPDATE' and new.avatar_frame is not distinct from old.avatar_frame then
      -- Unchanged frame on a row that is no longer Pro: it lapsed.
      -- Clear it quietly.
      new.avatar_frame := null;
    else
      -- Picking one without Pro.
      raise exception 'Avatar frames are a Pentra Pro perk'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_pro_perks on public.profiles;
create trigger profiles_guard_pro_perks
  before insert or update on public.profiles
  for each row execute function public.guard_pro_perks();


-- ------------------------------------------------------------
--  4. Anyone who somehow has a frame without Pro (there's nobody
--     today; this is for re-runs after a data fix).
-- ------------------------------------------------------------
update public.profiles
   set avatar_frame = null
 where avatar_frame is not null
   and not public.row_has_plus(tier, tier_expires_at);

-- ============================================================
--  Done. No What's New entry: nothing changes for anyone who isn't
--  Pro, and Pro isn't announced yet — one "Pentra Pro is here" entry
--  will cover every perk when it launches.
--
--  Check (read-only):
--    select username, avatar_frame, tier, tier_expires_at
--      from public.profiles where avatar_frame is not null;
-- ============================================================
