-- ============================================================
--  90. Which accounts are seeded (fake) — developers only.
--
--  MARZ (2026-10-03): "as a developer I want to be able to see which
--  accounts are seeded (fake). Nobody else should see this."
--
--  The seed scripts only ever create @example.test accounts (see
--  scripts/seed-players.mjs), and 84's is_test_account() already uses
--  that rule for the metrics. This exposes the list — ids and
--  usernames only, never emails — to developers, so the app can mark
--  those players as "Seeded" for you. Everyone else gets 'not a
--  developer' and sees nothing different.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

create or replace function public.dev_test_accounts()
returns table (id uuid, username text, created_at timestamptz)
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
    select p.id, p.username, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where lower(u.email) like '%@example.test'
     order by p.username;
end;
$$;

revoke all on function public.dev_test_accounts() from public, anon;
grant execute on function public.dev_test_accounts() to authenticated;
