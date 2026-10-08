-- ============================================================
--  114 — Ten more pet species, the third set (MARZ, 2026-10-08).
--
--  Thirty species in the egg. Drawn by shape in src/lib/petArt.ts
--  until the artwork arrives (public/pets/README.md). Melon and Bell
--  were in an earlier draft of this file and are swapped for Penguin
--  and Dino; anyone who hatched one of those is moved over.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

insert into public.pet_species (id, name, trait, stage_names, shape, color, edge, sort_order) values
  ('flame',   'Flame',   'Hot-headed. Warm-hearted.',    '{Ember,Blaze,Inferno}',      'flame',   '#ff4500', '#ffb088', 21),
  ('pad',     'Pad',     'Born to game.',                '{Joy,Pad,Deck}',             'pad',     '#c026d3', '#f0abfc', 22),
  ('rocket',  'Rocket',  'Impatient. Always leaving.',   '{Pop,Rocket,Orbit}',         'rocket',  '#cbd5e1', '#f8fafc', 23),
  ('penguin', 'Penguin', 'Formal. Waddles.',             '{Pebble,Penguin,Emperor}',   'penguin', '#334155', '#cbd5e1', 24),
  ('dino',    'Dino',    'Stomps about. Means well.',    '{Nub,Dino,Rex}',             'dino',    '#10b981', '#a7f3d0', 25),
  ('fish',    'Fish',    'Quiet. Big thoughts.',         '{Fin,Fish,Leviathan}',       'fish',    '#06b6d4', '#a5f3fc', 26),
  ('bat',     'Bat',     'Hangs around. Upside down.',   '{Flit,Bat,Nocturne}',        'bat',     '#7c3aed', '#c4b5fd', 27),
  ('bot',     'Bot',     'Logical. Mostly.',             '{Beep,Bot,Mech}',            'bot',     '#0f766e', '#5eead4', 28),
  ('crown',   'Crown',   'Royal. Says so.',              '{Tiara,Crown,Monarch}',      'crown',   '#d4a017', '#ffe680', 29),
  ('shield',  'Shield',  'Steady. Has your back.',       '{Buckler,Shield,Bastion}',   'shield',  '#166534', '#86efac', 30)
on conflict (id) do update set
  name = excluded.name, trait = excluded.trait, stage_names = excluded.stage_names,
  shape = excluded.shape, color = excluded.color, edge = excluded.edge, sort_order = excluded.sort_order;

-- Retire Melon and Bell (from the first draft of this file).
update public.pets set species = 'penguin' where species = 'bell';
update public.pets set species = 'dino'    where species = 'melon';
delete from public.pet_species where id in ('melon', 'bell');
