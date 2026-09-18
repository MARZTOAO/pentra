-- ============================================================
--  Customisable profile backgrounds
--  Run this in the Supabase SQL Editor.
--
--  Two ways to set one:
--    background  - the key of a built-in gradient. Free, instant,
--                  nothing to moderate.
--    banner_url  - an uploaded image, stored like avatars.
--
--  An uploaded image wins when both are set.
-- ============================================================

alter table public.profiles
  add column if not exists background text,
  add column if not exists banner_url text;

alter table public.profiles
  drop constraint if exists background_length;
alter table public.profiles
  add constraint background_length check (char_length(background) <= 40);


-- ------------------------------------------------------------
--  Storage for uploaded banners. Same shape as avatars: files
--  live in a folder named with the owner's id, and that first
--  path segment is what the rules check.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

drop policy if exists "banners are publicly readable" on storage.objects;
create policy "banners are publicly readable"
  on storage.objects for select
  using (bucket_id = 'banners');

drop policy if exists "upload your own banner" on storage.objects;
create policy "upload your own banner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "replace your own banner" on storage.objects;
create policy "replace your own banner"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete your own banner" on storage.objects;
create policy "delete your own banner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'banners'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
--  Done.
-- ============================================================
