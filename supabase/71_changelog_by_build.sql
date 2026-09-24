-- ============================================================
--  71 — What's New only lists what YOUR copy of the app has.
--
--  Until now "While you were gone" listed every entry since you last
--  dismissed it. That's right on the website, which is always the
--  newest code, but wrong in the desktop app: someone on an old build
--  was told about features their copy doesn't have yet, and then —
--  because dismissing moved the marker to now — never told again once
--  they updated and actually had them.
--
--  THE RULE NOW. Every build knows when it was built (VITE_BUILT_AT,
--  set by vite.config.ts on Vercel and in the release workflow). The
--  app sends it, and an entry is shown only if it was written before
--  that build was made:
--
--      since last dismissed  <  shipped_at  <=  this build's time
--
--  Dismissing moves the marker to this build's time, not to now, so
--  anything newer is still waiting for you after you update.
--
--  WHAT THIS MEANS WHEN SHIPPING. An entry has to exist before the
--  build that contains its feature is made. So:
--
--      write the What's New entry  →  THEN push.
--
--  An entry written after the push only appears from the NEXT build.
--  That includes entries added through DevPanel → news.
--
--  Old copies of the app don't send a build time. For them both
--  functions behave exactly as before — they'll get this fix when
--  they next update.
--
--  Run in the Supabase SQL Editor, after 70. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  The two functions change shape (a new argument), so the old
--  versions are dropped first. Leaving them would give PostgREST two
--  candidates for every call and it would refuse both.
-- ------------------------------------------------------------
drop function if exists public.get_changelog(int);
drop function if exists public.get_changelog(int, timestamptz);
drop function if exists public.mark_changelog_seen();
drop function if exists public.mark_changelog_seen(timestamptz);


-- ------------------------------------------------------------
--  The cutoff for a given build.
--
--  Never later than now: a build clock a little ahead of the
--  database's must not reveal an entry written a second from now.
--  No build time (an old client) means now, i.e. the old behaviour.
-- ------------------------------------------------------------
create or replace function public.changelog_cutoff(built_at timestamptz)
returns timestamptz
language sql
stable
as $$
  select least(now(), coalesce(built_at, now()));
$$;


-- ------------------------------------------------------------
--  What did I miss — that this copy of the app actually has?
-- ------------------------------------------------------------
create function public.get_changelog(
  max_results int         default 20,
  built_at    timestamptz default null
)
returns table (
  id         bigint,
  title      text,
  body       text,
  kind       text,
  weight     int,
  shipped_at timestamptz,
  overflow   int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  since  timestamptz;
  upto   timestamptz := public.changelog_cutoff(built_at);
  missed int;
begin
  if me is null then
    return;
  end if;

  -- Never on top of the welcome dialog. One modal at a time.
  if public.needs_welcome() then
    return;
  end if;

  select pr.changelog_seen_at into since
    from profiles pr where pr.id = me;

  select count(*) into missed
    from changelog_entries e
   where (since is null or e.shipped_at > since)
     and e.shipped_at <= upto;

  if missed = 0 then
    return;
  end if;

  return query
  select e.id, e.title, e.body, e.kind, e.weight, e.shipped_at,
         greatest(0, missed - max_results) as overflow
    from changelog_entries e
   where (since is null or e.shipped_at > since)
     and e.shipped_at <= upto
   -- Biggest first, and newest within a weight.
   order by e.weight, e.shipped_at desc
   limit max_results;
end;
$$;


-- ------------------------------------------------------------
--  Dismissed. Move the marker to this build's time.
--
--  Only ever forwards: `greatest` means dismissing on an old copy
--  after dismissing on a new one can't wind the marker back and
--  re-announce things.
-- ------------------------------------------------------------
create function public.mark_changelog_seen(built_at timestamptz default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update profiles
     set changelog_seen_at = greatest(
           coalesce(changelog_seen_at, '-infinity'::timestamptz),
           public.changelog_cutoff(built_at))
   where id = auth.uid();
end;
$$;


revoke all on function public.get_changelog(int, timestamptz)    from public;
revoke all on function public.mark_changelog_seen(timestamptz)   from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.get_changelog(int, timestamptz) from anon';
    execute 'revoke all on function public.mark_changelog_seen(timestamptz) from anon';
  end if;
end $$;

grant execute on function public.get_changelog(int, timestamptz)  to authenticated;
grant execute on function public.mark_changelog_seen(timestamptz) to authenticated;

-- The update card's "what's in it" list reads changelog_entries
-- directly — the existing "changelog is readable" policy (49) already
-- lets any signed-in player select from it. Nothing to add here.


-- ------------------------------------------------------------
--  What's New. Written here, before the push, per the rule above.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('See what''s in an update',
     'When the desktop app has an update ready, it now shows what''s in it before you install.',
     'improvement', 2),
    ('What''s New matches your version',
     'The desktop app only lists changes your copy actually has. Anything newer waits until you update.',
     'fix', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
