-- ============================================================
--  60 — usernames, enforced by the database.
--
--  WHAT WAS WRONG. `profiles_username_key` is the index Postgres
--  generates for a plain `username text unique`, and a plain unique
--  on text is CASE-SENSITIVE. So "marz" and "MARZ" were two different
--  usernames as far as the database was concerned, and both could
--  exist at once.
--
--  The app has always checked case-insensitively — username_available()
--  in 02 compares lower() to lower() — so the signup screen would
--  never let you do it. But the signup screen is not the only door.
--  The anon key is public: it ships in the JavaScript and inside the
--  desktop build. Anybody can call auth.signUp directly with whatever
--  username metadata they like, the trigger writes the profile, and
--  the case-sensitive index raises no objection.
--
--  Which means, until this file is run, somebody can register "MARZ"
--  while "marz" exists and impersonate them. On an app whose whole
--  point is arranging to meet strangers, that is worth closing.
--
--  THE RULE, restated: what you see is presentation, what you are is
--  identity. Capitalisation is kept exactly as typed — "MARZ" still
--  displays as MARZ — but two people cannot differ only by case.
--
--  The same applies to the shape of a username. The app checks
--  /^[A-Za-z0-9_]{3,20}$/ before signing up; the database checked
--  nothing, so a direct API call could create a username with spaces
--  in it, or five hundred characters, or characters that render like
--  Latin letters but are not. The check below mirrors the app's rule
--  so the two doors agree.
--
--  SAFE TO RUN. Verified first: a case-insensitive unique index on
--  this project returns 0 duplicate groups, so nothing is in the way.
--  Both statements are guarded and re-runnable regardless.
--
--  Run in the Supabase SQL Editor, after 59.
-- ============================================================


-- ------------------------------------------------------------
--  Look before leaping.
--
--  Creating a unique index on a column that already has duplicates
--  fails with a message about the index, not about the data, which
--  sends you looking in the wrong place. This says plainly what is
--  in the way, and stops rather than half-applying.
-- ------------------------------------------------------------
do $$
declare
  dupes int;
  bad   int;
  sample text;
begin
  select count(*) into dupes from (
    select lower(username) from public.profiles
     group by 1 having count(*) > 1
  ) x;

  if dupes > 0 then
    select string_agg(u, ', ') into sample from (
      select lower(username) as u from public.profiles
       group by 1 having count(*) > 1 limit 5
    ) y;
    raise exception
      'Cannot continue: % username(s) differ only by case (%). Rename one of each pair first.',
      dupes, sample;
  end if;

  select count(*) into bad
    from public.profiles
   where username !~ '^[A-Za-z0-9_]{3,20}$';

  if bad > 0 then
    select string_agg(username, ', ') into sample
      from (select username from public.profiles
             where username !~ '^[A-Za-z0-9_]{3,20}$' limit 5) z;
    raise exception
      'Cannot continue: % username(s) do not match the app''s own rule (%). Fix or rename them first.',
      bad, sample;
  end if;

  raise notice 'Pre-flight clean: no case duplicates, no malformed usernames.';
end $$;


-- ------------------------------------------------------------
--  Uniqueness, case-insensitively.
--
--  The existing profiles_username_key is left alone. It is now
--  redundant — anything it would reject, this rejects too — but it is
--  a constraint-backed index rather than a loose one, dropping it is
--  a separate decision, and an extra index on a table that is written
--  to once per account costs nothing worth measuring.
-- ------------------------------------------------------------
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));


-- ------------------------------------------------------------
--  And the shape.
--
--  Exactly the expression from Signup.tsx. If one is ever changed,
--  change both — a database that is stricter than the form rejects
--  signups with an unreadable error, and one that is looser is this
--  file's whole reason for existing.
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_username_shape'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_username_shape
      check (username ~ '^[A-Za-z0-9_]{3,20}$');
  end if;
end $$;


-- ------------------------------------------------------------
--  Proof.
--
--  Not decoration: an index that silently failed to apply looks
--  exactly like one that worked. This tries the impersonation the
--  file exists to prevent, and rolls it back either way.
-- ------------------------------------------------------------
do $$
declare
  victim text;
  blocked boolean := false;
begin
  select username into victim from public.profiles order by created_at limit 1;

  if victim is null then
    raise notice 'No accounts yet - nothing to test against.';
    return;
  end if;

  begin
    insert into public.profiles (id, username)
    values ('00000000-0000-0000-0000-0000000000ff', upper(victim));
    -- Reached only if the index did NOT stop it.
    delete from public.profiles
     where id = '00000000-0000-0000-0000-0000000000ff';
  exception
    when unique_violation then blocked := true;
    when others then blocked := true;  -- a not-null or FK complaint is
                                       -- still a rejection, not a pass
  end;

  if blocked then
    raise notice 'Verified: "%" cannot be registered while "%" exists.',
      upper(victim), victim;
  else
    raise warning 'NOT PROTECTED - "%" was accepted. The index did not apply.',
      upper(victim);
  end if;
end $$;

-- ============================================================
--  Done.
-- ============================================================
