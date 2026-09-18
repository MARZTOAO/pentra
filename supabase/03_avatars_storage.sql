-- ============================================================
--  Avatar storage
--  Run this in the Supabase SQL Editor after the first two files.
--
--  Creates a public bucket for profile pictures, plus rules that
--  let each person write only inside their own folder. Files are
--  stored as  <user-id>/avatar.png , so the first path segment
--  being your own id is what the rules check.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;


-- Anyone signed in can view any avatar - they're shown on profiles.
drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');


-- You may upload only into a folder named with your own user id.
drop policy if exists "upload your own avatar" on storage.objects;
create policy "upload your own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "replace your own avatar" on storage.objects;
create policy "replace your own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "delete your own avatar" on storage.objects;
create policy "delete your own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
--  Done.
-- ============================================================
