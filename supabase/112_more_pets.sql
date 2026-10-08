-- ============================================================
--  112 — Ten more pet species (MARZ, 2026-10-08).
--
--  Twenty species in the egg now. Nothing else changes: the egg still
--  picks one at random from pet_species, and the app draws each from
--  its `shape` (src/lib/petArt.ts) until the artwork arrives.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

insert into public.pet_species (id, name, trait, stage_names, shape, color, edge, sort_order) values
  ('moon',     'Moon',     'Night owl. Up late.',          '{Nib,Luna,Eclipse}',       'crescent', '#6366f1', '#c7d2fe', 11),
  ('bolt',     'Bolt',     'Hyper. Never powers down.',    '{Zap,Volt,Surge}',         'bolt',     '#f5b301', '#fde68a', 12),
  ('heart',    'Heart',    'Soft. Fierce about friends.',  '{Beat,Heart,Valor}',       'heart',    '#e11d48', '#fda4af', 13),
  ('leaf',     'Leaf',     'Patient. Grows on you.',       '{Sprout,Leaf,Grove}',      'leaf',     '#22c55e', '#bbf7d0', 14),
  ('ghost',    'Ghost',    'Shy. Vanishes when stared at.','{Boo,Wisp,Phantom}',       'ghost',    '#a7f3d0', '#ecfdf5', 15),
  ('mushroom', 'Mushroom', 'Odd. Smells like rain.',       '{Spore,Shroom,Elder}',     'mushroom', '#c08457', '#e8c39e', 16),
  ('skull',    'Skull',    'Spooky. Secretly sweet.',      '{Rattle,Skull,Grim}',      'skull',    '#94a3b8', '#e2e8f0', 17),
  ('cactus',   'Cactus',   'Prickly. Low maintenance.',    '{Prick,Cactus,Saguaro}',   'cactus',   '#65a30d', '#d9f99d', 18),
  ('flake',    'Snowflake','Cool. Literally.',             '{Flurry,Frost,Blizzard}',  'flake',    '#bae6fd', '#ffffff', 19),
  ('octo',     'Octo',     'Clever. Eight hugs at once.',  '{Squirt,Octo,Kraken}',     'octo',     '#1d4ed8', '#93c5fd', 20)
on conflict (id) do update set
  name = excluded.name, trait = excluded.trait, stage_names = excluded.stage_names,
  shape = excluded.shape, color = excluded.color, edge = excluded.edge, sort_order = excluded.sort_order;
