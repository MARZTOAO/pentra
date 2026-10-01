-- ============================================================
--  86 — how far apart ads are in the feed, set from the ads manager.
--
--  MARZ: "give me the option to tweak how many posts show between ads
--  … if I only have 1 or 2 advertisers it's going to be extremely
--  repetitive."
--
--  85 hard-coded it in the app: four posts, then an ad. Now it's one
--  number in the database — POSTS BETWEEN ADS — that DevPanel → Ads
--  changes and every feed reads. Default 4, the same as before, so
--  running this changes nothing until he changes the number.
--
--    ad_settings          one row, sealed
--    ad_posts_between()   for the feed (signed-in)
--    dev_set_ad_spacing() developers only
--
--  Run in the Supabase SQL Editor. Re-runnable. Either order with the
--  push: until this runs, the app falls back to 4.
-- ============================================================

create table if not exists public.ad_settings (
  -- Always true: the primary key on a constant is what makes this a
  -- table of exactly one row.
  only_row      boolean primary key default true check (only_row),
  posts_between integer not null default 4 check (posts_between between 1 and 50),
  updated_at    timestamptz not null default now()
);

insert into public.ad_settings (only_row) values (true)
on conflict (only_row) do nothing;

alter table public.ad_settings enable row level security;
revoke all on table public.ad_settings from public, anon, authenticated;


create or replace function public.ad_posts_between()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select posts_between from public.ad_settings where only_row), 4);
$$;

revoke all on function public.ad_posts_between() from public, anon;
grant execute on function public.ad_posts_between() to authenticated;


-- @returns 'saved', or a sentence saying what's wrong.
create or replace function public.dev_set_ad_spacing(posts integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if posts is null or posts < 1 or posts > 50 then
    return 'Pick a number from 1 to 50.';
  end if;

  insert into public.ad_settings (only_row, posts_between, updated_at)
  values (true, posts, now())
  on conflict (only_row) do update
    set posts_between = excluded.posts_between,
        updated_at    = now();

  return 'saved';
end;
$$;

revoke all on function public.dev_set_ad_spacing(integer) from public, anon;
grant execute on function public.dev_set_ad_spacing(integer) to authenticated;

-- ============================================================
--  Done. Check (read-only):
--    select posts_between, updated_at from public.ad_settings;
-- ============================================================
