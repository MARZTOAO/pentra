-- ============================================================
--  Username availability check
--  Run this in the Supabase SQL Editor after schema.sql.
--
--  Why it's needed: profiles are only readable by signed-in users,
--  but the signup screen has to check a username BEFORE an account
--  exists. This function is "security definer", meaning it runs with
--  the database owner's permissions rather than the caller's - so it
--  can look at the profiles table without exposing it.
--
--  It answers one yes/no question and reveals nothing else.
-- ============================================================

create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(candidate))
  );
$$;

-- Anyone reaching the signup screen is not logged in yet, so both
-- anon and authenticated need permission to call it.
grant execute on function public.username_available(text) to anon, authenticated;

-- ============================================================
--  Done. "Success. No rows returned." is what you want.
-- ============================================================
