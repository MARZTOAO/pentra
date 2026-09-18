-- ============================================================
--  Adds location to profiles
--  Run this in the Supabase SQL Editor.
--
--  Stored as three separate columns rather than one text field, so
--  everyone's location comes out in the same shape: "Austin, TX".
--  One free-text box would give you "Austin, Texas", "austin tx" and
--  "ATX" as three different places.
--
--  This is for display. Matching uses `region`, the fixed list.
-- ============================================================

alter table public.profiles
  add column if not exists location_city text,
  add column if not exists location_state text,
  add column if not exists location_country text;

alter table public.profiles
  drop constraint if exists location_city_length;
alter table public.profiles
  add constraint location_city_length check (char_length(location_city) <= 60);

-- Two-letter US state code, or nothing.
alter table public.profiles
  drop constraint if exists location_state_format;
alter table public.profiles
  add constraint location_state_format
  check (location_state is null or location_state ~ '^[A-Z]{2}$');

alter table public.profiles
  drop constraint if exists location_country_length;
alter table public.profiles
  add constraint location_country_length
  check (char_length(location_country) <= 60);

-- ============================================================
--  Done.
-- ============================================================
