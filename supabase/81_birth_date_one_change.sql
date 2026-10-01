-- ============================================================
--  81 — One self-service correction to your date of birth.
--
--  MARZ: "I also want users to have the ability to change their
--  birthday one time. In case they accidentally put it in wrong the
--  first time when setting up account they can correct it."
--
--  Until now (69) a date of birth was locked the moment it was set,
--  and support@pentra.gg was the only way to fix a typo. Now each
--  account gets ONE change of its own. After that it's locked again
--  and support is the way, as before.
--
--  THE RULES (all here, none of them only in the app)
--    - Only a date already on file can be changed. Adding one for the
--      first time is still set_birth_date (69).
--    - The new date must pass the same age check as signup
--      (old_enough, minimum 16). An under-age answer is refused, stored
--      nowhere, and does NOT use up the change — the same as signup:
--      a refusal keeps nothing about the person.
--    - Picking the date you already have changes nothing and does not
--      use up the change.
--    - Otherwise: the date is replaced and birth_date_changed_at is
--      stamped. A second attempt returns 'no_change_left'.
--
--  account_private stays sealed (RLS on, no policies, no grants).
--
--  Run in the Supabase SQL Editor BEFORE pushing (Settings calls the
--  new functions). Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. When the one change was used. Null = still available.
-- ------------------------------------------------------------
alter table public.account_private
  add column if not exists birth_date_changed_at timestamptz;


-- ------------------------------------------------------------
--  2. What Settings needs to know: the date, and whether the change
--     is still available. Only ever about the signed-in account.
-- ------------------------------------------------------------
drop function if exists public.my_birth_date_status();

create function public.my_birth_date_status()
returns table (
  birth_date date,
  can_change boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select ap.birth_date,
         ap.birth_date is not null and ap.birth_date_changed_at is null
    from account_private ap
   where ap.user_id = auth.uid();
$$;


-- ------------------------------------------------------------
--  3. The change.
--
--  Returns one of:
--    'changed'         stored; the change is now used
--    'no_change_left'  already used; corrections go through support
--    'not_set'         nothing on file to change (use set_birth_date)
--    'same'            that's the date already on file; nothing used
--    'too_young'       refused, nothing stored, nothing used
--    'invalid'         null, before 1900, or in the future
--    'signed_out'
-- ------------------------------------------------------------
create or replace function public.change_birth_date(d date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  cur account_private%rowtype;
begin
  if me is null then
    return 'signed_out';
  end if;

  if d is null or d < date '1900-01-01' or d > current_date + 1 then
    return 'invalid';
  end if;

  -- Lock the row so two clicks at once can't both get through.
  select * into cur from account_private where user_id = me for update;

  if cur.user_id is null or cur.birth_date is null then
    return 'not_set';
  end if;

  if cur.birth_date_changed_at is not null then
    return 'no_change_left';
  end if;

  if d = cur.birth_date then
    return 'same';
  end if;

  if not public.old_enough(d) then
    return 'too_young';
  end if;

  update account_private
     set birth_date = d,
         birth_date_changed_at = now()
   where user_id = me;

  return 'changed';
end;
$$;


-- ------------------------------------------------------------
--  4. Grants. Signed-in players only, like the rest of 69.
-- ------------------------------------------------------------
revoke all on function public.my_birth_date_status() from public;
revoke all on function public.change_birth_date(date) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.my_birth_date_status() from anon';
    execute 'revoke all on function public.change_birth_date(date) from anon';
  end if;
end $$;

grant execute on function public.my_birth_date_status()  to authenticated;
grant execute on function public.change_birth_date(date) to authenticated;


-- ------------------------------------------------------------
--  5. What's New. Before the push, per 71.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Fix your date of birth',
     'Typed your birthday wrong at signup? You can now correct it once yourself, in Settings. After that, email support@pentra.gg.',
     'improvement', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
--
--  Check (read-only): how many accounts have used their change —
--    select count(*) from public.account_private
--     where birth_date_changed_at is not null;
--
--  Support giving someone a second change after an email: clear the
--  stamp for that account in the SQL Editor, then they can use the
--  Settings button again.
-- ============================================================
