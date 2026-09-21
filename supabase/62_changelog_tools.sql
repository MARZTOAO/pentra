-- ============================================================
--  62 — writing What's New without writing a migration.
--
--  THE PROBLEM THIS FIXES. Adding one line to the changelog needed a
--  whole migration file, which meant it needed me, a deploy, and
--  somebody remembering. So it drifted out of date, which is exactly
--  what you caught: 57 stopped at migration 56, and two releases have
--  shipped since.
--
--  A changelog that only updates when somebody writes SQL is a
--  changelog that stops updating.
--
--  WHY THIS ISN'T FULLY AUTOMATIC, and shouldn't be. An entry is a
--  sentence saying what changed and why a player should care. Nothing
--  in the database can derive "Game search that forgives" from a
--  function definition, and publishing commit messages straight
--  through would show people "Moderation: report queue, warnings and
--  bans" — true, internal, and meaningless to them. Most commits are
--  not worth announcing at all.
--
--  So the sentence still needs a person. What changes is the cost:
--  from "write a migration" to "type it into a box", which is the
--  difference between a thing that happens and a thing that doesn't.
--
--  Everything here is developer-only, gated on am_i_developer() —
--  see 58. `changelog_entries` keeps no insert policy of its own, so
--  these functions remain the only way in.
--
--  Run in the Supabase SQL Editor, after 61.
-- ============================================================


-- ------------------------------------------------------------
--  Writing one.
-- ------------------------------------------------------------
create or replace function public.dev_changelog_add(
  entry_title text,
  entry_body  text,
  entry_kind  text default 'feature',
  entry_weight int  default 2
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if btrim(coalesce(entry_title, '')) = ''
     or btrim(coalesce(entry_body, '')) = '' then
    return 'needs a title and a sentence';
  end if;

  -- The table's own checks are the real limits (80 and 300). Saying
  -- so here means a long paragraph comes back as a sentence rather
  -- than a constraint violation.
  if char_length(btrim(entry_title)) > 80 then
    return 'title is too long (80 characters)';
  end if;

  if char_length(btrim(entry_body)) > 300 then
    return 'body is too long (300 characters)';
  end if;

  if entry_kind not in ('feature', 'improvement', 'fix') then
    return 'kind must be feature, improvement or fix';
  end if;

  if entry_weight not between 1 and 3 then
    return 'weight must be 1, 2 or 3';
  end if;

  insert into public.changelog_entries (title, body, kind, weight)
  values (btrim(entry_title), btrim(entry_body), entry_kind, entry_weight);

  return 'added';
end;
$$;


-- ------------------------------------------------------------
--  Reviewing, and undoing a typo.
--
--  Deleting is for a mistake made minutes ago. Anything people have
--  already seen is better corrected with a new entry than quietly
--  removed — a changelog that edits its own history is not one.
-- ------------------------------------------------------------
create or replace function public.dev_changelog_list(how_many int default 20)
returns table (
  id         bigint,
  title      text,
  body       text,
  kind       text,
  weight     int,
  shipped_at timestamptz
)
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
    select c.id, c.title, c.body, c.kind, c.weight, c.shipped_at
    from public.changelog_entries c
    order by c.shipped_at desc
    limit greatest(1, least(coalesce(how_many, 20), 100));
end;
$$;


create or replace function public.dev_changelog_delete(which bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  delete from public.changelog_entries where id = which;
  return 'deleted';
end;
$$;


-- ------------------------------------------------------------
--  Is it stale?
--
--  The thing that stops this quietly rotting again. The panel
--  compares the newest entry against the build it is running in — if
--  the app you deployed is newer than the last thing you announced,
--  something shipped that nobody was told about.
--
--  Returns the date; the app supplies the comparison, because only
--  the app knows when it was built.
-- ------------------------------------------------------------
create or replace function public.dev_changelog_status()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return (
    select jsonb_build_object(
      'entries',     count(*),
      'newest_at',   max(shipped_at),
      'newest_title', (select c.title from public.changelog_entries c
                        order by c.shipped_at desc limit 1)
    )
    from public.changelog_entries
  );
end;
$$;


revoke all on function public.dev_changelog_add(text, text, text, int) from public;
revoke all on function public.dev_changelog_list(int)                  from public;
revoke all on function public.dev_changelog_delete(bigint)             from public;
revoke all on function public.dev_changelog_status()                   from public;

grant execute on function public.dev_changelog_add(text, text, text, int) to authenticated;
grant execute on function public.dev_changelog_list(int)                  to authenticated;
grant execute on function public.dev_changelog_delete(bigint)             to authenticated;
grant execute on function public.dev_changelog_status()                   to authenticated;


-- ------------------------------------------------------------
--  Catching up: what shipped after 57 was written.
--
--  The LAST time entries are added by a migration. From here they go
--  in through the panel.
--
--  58 and 59 — the developer tools and the metrics — get no entry on
--  purpose. They are yours, not theirs, and announcing them would
--  only tell people a panel exists that they cannot open.
-- ------------------------------------------------------------
do $$
declare
  added int := 0;
begin
  if to_regclass('public.changelog_entries') is null then
    raise notice 'No changelog table - run 49 first.';
    return;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Reporting someone now goes somewhere') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Reporting someone now goes somewhere',
     'Reports used to land in a table nobody read. They now reach a queue that gets looked at, and people who keep at it get a warning and then lose their account. Reports stay anonymous — nobody is ever told who reported them.',
     'feature', 1);
    added := added + 1;
  end if;

  if not exists (select 1 from public.changelog_entries
                  where title = 'Nobody can copy your username') then
    insert into public.changelog_entries (title, body, kind, weight) values
    ('Nobody can copy your username',
     'Someone could previously register your name with different capitalisation and look identical to you. They can''t now — and usernames using lookalike characters from other alphabets are refused too.',
     'fix', 2);
    added := added + 1;
  end if;

  raise notice 'Changelog: % new entries added.', added;
end $$;

-- ============================================================
--  Done.
-- ============================================================
