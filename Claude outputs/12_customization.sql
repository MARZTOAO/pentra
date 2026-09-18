-- ============================================================
--  App theme
--  Run this in the Supabase SQL Editor.
--
--  Which colour palette this person uses. It's a personal setting,
--  not something other people see, but it lives on the profile
--  rather than only in local storage so it follows them to another
--  machine instead of resetting.
-- ============================================================

alter table public.profiles
  add column if not exists app_theme text;

alter table public.profiles
  drop constraint if exists app_theme_length;
alter table public.profiles
  add constraint app_theme_length check (char_length(app_theme) <= 40);

-- ============================================================
--  Done.
-- ============================================================
