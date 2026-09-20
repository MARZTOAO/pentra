-- ============================================================
--  50 — the library cap goes from 20 to 28.
--
--  The number lives in two places and they have to agree: this
--  trigger, and MAX_LIBRARY in src/lib/library.ts. The trigger is the
--  one that actually enforces it — the policy on game_library lets
--  the app write to the table directly, so anything the app can do,
--  anything else holding the same key can do. The constant in the app
--  only decides what the counter says and when the Add button stops
--  offering. Move one without the other and you get a UI that invites
--  you to add a 21st game and a database that refuses it.
--
--  A SIDE EFFECT WORTH NOTING, and the reason this is a good change
--  rather than a neutral one: the "Collector" achievement from
--  migration 45 wants 25 games in a library. With the cap at 20 that
--  was unreachable — nobody could ever have earned it. At 28 it is a
--  real target again with a bit of headroom above it.
--
--  Run in the Supabase SQL Editor, after 49.
-- ============================================================

create or replace function public.cap_game_library()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  held int;
begin
  select count(*) into held
  from game_library
  where user_id = new.user_id;

  if held >= 28 then
    raise exception 'Twenty-eight games is the limit — remove one first';
  end if;

  return new;
end;
$$;

-- The trigger itself is unchanged and still points at this function,
-- so replacing the function is the whole job. Re-created anyway so
-- this file repairs a database where it was somehow dropped.
drop trigger if exists cap_game_library on public.game_library;
create trigger cap_game_library
  before insert on public.game_library
  for each row execute function public.cap_game_library();

-- ============================================================
--  Done. Nobody's existing library is touched — this only changes
--  where the ceiling is.
-- ============================================================
