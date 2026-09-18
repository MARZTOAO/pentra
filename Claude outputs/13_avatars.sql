-- ============================================================
--  Premade avatars
--  Run this in the Supabase SQL Editor.
--
--  Stores which premade avatar someone picked, as "shape.colour"
--  (for example "bolt.ember"). The artwork itself is drawn in the
--  app as SVG, so nothing is uploaded and nothing is hosted.
--
--  An uploaded photo still wins when both are set.
-- ============================================================

alter table public.profiles
  add column if not exists avatar_preset text;

alter table public.profiles
  drop constraint if exists avatar_preset_format;
alter table public.profiles
  add constraint avatar_preset_format
  check (avatar_preset is null or avatar_preset ~ '^[a-z]+\.[a-z]+$');

-- ============================================================
--  Done.
-- ============================================================
