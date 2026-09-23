-- ============================================================
--  67 — retune the moderation penalties.
--
--  A warning now costs 20 (was 15); a ban costs 60 (was 40).
--
--  MARZ's reasoning on the ban: "if a player is banned their rating is
--  irrelevant." A ban is already the strongest thing a moderator can
--  do, so the number after it is not meant to be a fair starting point
--  for recovery — it is meant to say what happened. Sixty takes an
--  account from 100 to 40, which is "Poor standing", and needs twelve
--  commendations from other players to earn back. A warning takes
--  four.
--
--  Replaces the trigger function from 65 wholesale. The trigger itself
--  is unchanged and keeps pointing at the same function name, so
--  nothing else needs to move.
--
--  Run in the Supabase SQL Editor, after 66.
-- ============================================================

create or replace function public.apply_moderation_penalty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  warn_cost int := 20;
  ban_cost  int := 60;
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

-- ============================================================
--  Done. Current tuning across 65 + 67:
--    warning -20, ban -60, commendation +5, cooldown 7 days.
-- ============================================================
