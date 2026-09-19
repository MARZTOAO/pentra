-- ============================================================
--  31 — the welcome, shown once.
--
--  A new account lands on an empty feed with no Top 5, no platforms
--  and no availability, which is precisely the state in which Find
--  can't do anything useful for them. The welcome exists to get them
--  past that in the first minute, while they still care.
--
--  "Once" has to be a fact about the ACCOUNT, not the device. Sign up
--  on the desktop app, open the web build later, and a browser-stored
--  flag would show the tour a second time; reinstall and it shows a
--  third. So it lives on the profile row.
--
--  Run in the Supabase SQL Editor, after 30.
-- ============================================================


-- ------------------------------------------------------------
--  The column, plus a one-time backfill.
--
--  Every account that already exists has, in effect, already been
--  welcomed — they've been using the thing. Adding a null column
--  without backfilling would pop the tour for all of them on next
--  open, which is the exact opposite of what a welcome is for.
--
--  The backfill is inside the "was it just created" branch rather
--  than a bare `where welcomed_at is null`, so re-running this file
--  can't quietly stamp someone who genuinely hasn't seen it yet.
-- ------------------------------------------------------------
do $$
declare
  already_there boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'welcomed_at'
  ) into already_there;

  if not already_there then
    alter table public.profiles add column welcomed_at timestamptz;
    update public.profiles set welcomed_at = coalesce(created_at, now());
  end if;
end $$;


-- ------------------------------------------------------------
--  Whether to show it.
--
--  A function rather than a column on the client's profile select:
--  this is a one-off question asked once per app load, and routing it
--  through the Profile type would mean plumbing a field that nothing
--  else ever reads.
-- ------------------------------------------------------------
create or replace function public.needs_welcome()
returns boolean
language sql
security invoker
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and welcomed_at is null
  );
$$;

grant execute on function public.needs_welcome() to authenticated;


-- ------------------------------------------------------------
--  Mark it seen.
--
--  `and welcomed_at is null` keeps the first timestamp rather than
--  overwriting it on a repeat call, so the column stays an honest
--  record of when someone actually started.
-- ------------------------------------------------------------
create or replace function public.mark_welcomed()
returns void
language sql
security invoker
set search_path = public
as $$
  update profiles
     set welcomed_at = now()
   where id = auth.uid()
     and welcomed_at is null;
$$;

grant execute on function public.mark_welcomed() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
