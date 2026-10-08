-- ============================================================
--  110 — Pentra Pets.
--
--  MARZ (2026-10-08): a Tamagotchi-style pet on every profile. You
--  get an egg; it hatches into one of ten species; three stages; you
--  feed it and play with it. Built now, SWITCHED OFF: nothing shows
--  until the `pets` flag is turned on in DevPanel → Flags (for testers
--  first, then everyone). Run 111_pets_launch.sql for the What's New
--  line when it goes live.
--
--  THE RULES (defaults picked to be changed later; each is one number
--  in pet_rules() below)
--    - The egg hatches after your first Pentra session, or 24 hours
--      after you got it, whichever is first. Tapping it ("warming")
--      once a day means it hatches in a good mood.
--    - Species: one of ten, at random. One pet per person.
--    - Three meters, 0–100: hunger empties over 3 days, mood over 4,
--      energy refills over a day. Feed +35 hunger (costs a snack),
--      Play +25 mood −20 energy (every 4 hours), Rest fills energy
--      (every 6 hours).
--    - Snacks: one free every 8 hours, held up to 3. Earned: +2 for a
--      session you turn up to, +1 a day for the Arcade, +5 when an
--      invite of yours starts playing.
--    - XP: +20 a day for care (the first feed or play of the day),
--      +50 per session attended, +10 per commendation received,
--      +5 a day for the Arcade. Stage 2 at 500, stage 3 at 2000.
--      A pet whose hunger has hit 0 earns nothing until fed.
--    - Pets never die and never lose a stage. Left alone, it naps.
--    - Friends can cheer a pet once a day (+10 mood).
--
--  Meters aren't ticked by a clock; they're worked out from the time
--  since the last check whenever anyone looks (pet_settle), so an
--  untouched pet costs nothing.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  0. The switch. Off.
-- ------------------------------------------------------------
insert into public.feature_flags (key, description, enabled_for_all)
values ('pets',
        'Pentra Pets: the egg and pet card on profiles, feeding, playing, growth. Testers first, then everyone. Run 111_pets_launch.sql when it goes live.',
        false)
on conflict (key) do nothing;

create or replace function public.pets_open(who uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.feature_flags f
     where f.key = 'pets'
       and (f.enabled_for_all
            or exists (select 1 from public.flag_testers t
                        where t.flag_key = f.key and t.user_id = who)));
$$;

revoke all on function public.pets_open(uuid) from public, anon, authenticated;


-- ------------------------------------------------------------
--  1. The numbers, in one place.
-- ------------------------------------------------------------
create or replace function public.pet_rules()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'hatch_hours', 24,
    'hunger_days', 3,       -- full to empty
    'mood_days', 4,
    'energy_refill_hours', 24,
    'feed_hunger', 35,
    'play_mood', 25,
    'play_energy', 20,
    'play_cooldown_hours', 4,
    'rest_cooldown_hours', 6,
    'snack_free_hours', 8,
    'snack_cap', 3,
    'xp_care', 20,
    'xp_session', 50,
    'xp_commend', 10,
    'xp_arcade', 5,
    'stage2_xp', 500,
    'stage3_xp', 2000,
    'cheer_mood', 10)
$$;


-- ------------------------------------------------------------
--  2. Species and pets.
-- ------------------------------------------------------------
create table if not exists public.pet_species (
  id          text primary key check (id ~ '^[a-z]{2,20}$'),
  name        text not null,
  trait       text not null,
  -- The pet's own name at each stage, until its owner renames it.
  stage_names text[] not null check (array_length(stage_names, 1) = 3),
  -- For the built-in drawing until the artwork arrives.
  shape       text not null,
  color       text not null,
  edge        text not null,
  sort_order  int not null default 0
);

alter table public.pet_species enable row level security;
drop policy if exists "pet_species_read" on public.pet_species;
create policy "pet_species_read" on public.pet_species
  for select to authenticated using (true);

insert into public.pet_species (id, name, trait, stage_names, shape, color, edge, sort_order) values
  ('pentagon', 'Pentagon', 'The house pet. Loyal.',        '{Pentling,Pent,Pentarch}', 'pent',   '#ff7a2f', '#ffb27a', 1),
  ('blip',     'Blip',     'Bounces. Never still.',        '{Blip,Blop,Orb}',          'circle', '#2ad4c8', '#9df0ea', 2),
  ('cube',     'Cube',     'Stubborn. Sits where put.',    '{Bit,Byte,Block}',         'square', '#a66cff', '#d1b3ff', 3),
  ('spike',    'Spike',    'Pointy and proud.',            '{Spark,Spike,Shard}',      'tri',    '#ff6b6b', '#ffb0b0', 4),
  ('gem',      'Gem',      'Shiny. Vain about it.',        '{Chip,Gem,Prism}',         'gem',    '#5aa9ff', '#b3d4ff', 5),
  ('hex',      'Hex',      'Busy. Builds things.',         '{Hex,Hive,Hexarch}',       'hex',    '#8bff3a', '#ccff9e', 6),
  ('blob',     'Blob',     'Squishy. Hugs back.',          '{Goo,Blob,Glob}',          'blob',   '#ff4fa3', '#ffa6d0', 7),
  ('star',     'Star',     'Bright. Shows off.',           '{Twinkle,Star,Nova}',      'star',   '#ffd23f', '#ffe89a', 8),
  ('drop',     'Drop',     'Calm. Goes with the flow.',    '{Drip,Drop,Tide}',         'drop',   '#38bdf8', '#a5e3fc', 9),
  ('pill',     'Pill',     'Chill. Always napping.',       '{Pip,Pill,Capsule}',       'pill',   '#e9ebee', '#ffffff', 10)
on conflict (id) do update set
  name = excluded.name, trait = excluded.trait, stage_names = excluded.stage_names,
  shape = excluded.shape, color = excluded.color, edge = excluded.edge, sort_order = excluded.sort_order;


create table if not exists public.pets (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  species        text references public.pet_species(id),
  -- Null until hatched: that's the egg.
  hatched_at     timestamptz,
  egg_at         timestamptz not null default now(),
  -- sessions_joined when the egg arrived; one more than this hatches it.
  sessions_at_egg int not null default 0,
  warmed_days    int not null default 0,
  warmed_on      date,
  pet_name       text check (pet_name is null or char_length(btrim(pet_name)) between 1 and 20),
  hunger         numeric not null default 100 check (hunger between 0 and 100),
  mood           numeric not null default 100 check (mood between 0 and 100),
  energy         numeric not null default 100 check (energy between 0 and 100),
  settled_at     timestamptz not null default now(),
  xp             int not null default 0 check (xp >= 0),
  snacks         int not null default 3 check (snacks >= 0),
  snack_at       timestamptz not null default now(),   -- when the free-snack clock last ticked
  fed_at         timestamptz,
  played_at      timestamptz,
  rested_at      timestamptz,
  care_on        date,                                  -- last day care XP was given
  arcade_on      date,                                  -- last day the Arcade bonus was given
  created_at     timestamptz not null default now()
);

create table if not exists public.pet_cheers (
  pet_user_id uuid not null references public.profiles(id) on delete cascade,
  by_user_id  uuid not null references public.profiles(id) on delete cascade,
  on_day      date not null default current_date,
  primary key (pet_user_id, by_user_id, on_day)
);

alter table public.pets       enable row level security;
alter table public.pet_cheers enable row level security;
revoke all on table public.pets       from public, anon, authenticated;
revoke all on table public.pet_cheers from public, anon, authenticated;


-- ------------------------------------------------------------
--  3. Settling: bring the meters up to date, hatch an egg that's
--     ready, tick the free-snack clock. Called before any read or
--     change. Returns the current row.
-- ------------------------------------------------------------
create or replace function public.pet_stage(p_xp int)
returns int language sql immutable as $$
  select case when p_xp >= (public.pet_rules()->>'stage3_xp')::int then 3
              when p_xp >= (public.pet_rules()->>'stage2_xp')::int then 2
              else 1 end
$$;

create or replace function public.pet_settle(p_user uuid)
returns public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  rules  jsonb := public.pet_rules();
  p      public.pets;
  hrs    numeric;
  free   int;
  played int;
  snack_hrs int := (rules->>'snack_free_hours')::int;
begin
  select * into p from pets where user_id = p_user for update;
  if p.user_id is null then
    return null;
  end if;

  -- An egg: hatch when it's time or once they've played a session.
  if p.hatched_at is null then
    select coalesce(s.sessions_joined, 0) into played from profile_stats s where s.user_id = p_user;
    if now() >= p.egg_at + make_interval(hours => (rules->>'hatch_hours')::int)
       or coalesce(played, 0) > p.sessions_at_egg then
      update pets
         set hatched_at = now(),
             species = (select id from pet_species order by random() limit 1),
             mood = case when warmed_days >= 1 then 100 else 70 end,
             hunger = 100, energy = 100, settled_at = now(), snack_at = now()
       where user_id = p_user
       returning * into p;
    end if;
    return p;
  end if;

  hrs := extract(epoch from (now() - p.settled_at)) / 3600;
  if hrs < 0.05 then
    return p;
  end if;

  -- Free snacks: one per 8 hours on the snack clock (its own clock, so
  -- checking the pet often doesn't reset it), held up to the cap. When
  -- the pouch is full the clock just waits.
  free := floor(extract(epoch from (now() - p.snack_at)) / 3600 / snack_hrs);
  if free > 0 and p.snacks < (rules->>'snack_cap')::int then
    p.snacks := least((rules->>'snack_cap')::int, p.snacks + free);
    p.snack_at := p.snack_at + make_interval(hours => free * snack_hrs);
  elsif p.snacks >= (rules->>'snack_cap')::int then
    p.snack_at := now();
  end if;

  update pets
     set hunger = greatest(0, hunger - hrs * 100 / ((rules->>'hunger_days')::int * 24)),
         mood   = greatest(0, mood   - hrs * 100 / ((rules->>'mood_days')::int * 24)),
         energy = least(100, energy + hrs * 100 / (rules->>'energy_refill_hours')::int),
         snacks = p.snacks,
         snack_at = p.snack_at,
         settled_at = now()
   where user_id = p_user
   returning * into p;
  return p;
end;
$$;

revoke all on function public.pet_settle(uuid) from public, anon, authenticated;


-- Add XP, unless the pet is starving (hunger 0) or still an egg.
create or replace function public.pet_award(p_user uuid, p_xp int, p_snacks int default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pets;
begin
  p := public.pet_settle(p_user);
  if p.user_id is null or p.hatched_at is null then
    return;
  end if;
  update pets
     set xp = xp + case when round(hunger) <= 0 then 0 else greatest(0, p_xp) end,
         snacks = snacks + greatest(0, p_snacks)
   where user_id = p_user;
end;
$$;

revoke all on function public.pet_award(uuid, int, int) from public, anon, authenticated;


-- ------------------------------------------------------------
--  4. What a pet looks like to the app.
-- ------------------------------------------------------------
create or replace function public.pet_json(p public.pets, viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.user_id is null then null else jsonb_build_object(
    'user_id', p.user_id,
    'is_egg', p.hatched_at is null,
    'egg_at', p.egg_at,
    'hatches_at', p.egg_at + make_interval(hours => (public.pet_rules()->>'hatch_hours')::int),
    'warmed_today', coalesce(p.warmed_on = current_date, false),
    'warmed_days', p.warmed_days,
    'species', p.species,
    'species_name', s.name,
    'trait', s.trait,
    'shape', s.shape,
    'color', s.color,
    'edge', s.edge,
    'stage', public.pet_stage(p.xp),
    'name', coalesce(p.pet_name, s.stage_names[public.pet_stage(p.xp)]),
    'stage_name', s.stage_names[public.pet_stage(p.xp)],
    'hunger', round(p.hunger),
    'mood', round(p.mood),
    'energy', round(p.energy),
    'xp', p.xp,
    'next_stage_xp', case public.pet_stage(p.xp)
                       when 1 then (public.pet_rules()->>'stage2_xp')::int
                       when 2 then (public.pet_rules()->>'stage3_xp')::int end,
    'snacks', p.snacks,
    'hatched_at', p.hatched_at,
    'fed_at', p.fed_at,
    'played_at', p.played_at,
    'age_days', case when p.hatched_at is null then 0
                     else floor(extract(epoch from (now() - p.hatched_at)) / 86400)::int end,
    'can_play_at', coalesce(p.played_at, 'epoch'::timestamptz) + make_interval(hours => (public.pet_rules()->>'play_cooldown_hours')::int),
    'can_rest_at', coalesce(p.rested_at, 'epoch'::timestamptz) + make_interval(hours => (public.pet_rules()->>'rest_cooldown_hours')::int),
    'cared_today', coalesce(p.care_on = current_date, false),
    'napping', p.hatched_at is not null and (round(p.hunger) <= 0 or round(p.mood) <= 0),
    'cheered_today', exists (select 1 from pet_cheers c
                              where c.pet_user_id = p.user_id and c.by_user_id = viewer and c.on_day = current_date),
    'cheers_today', (select count(*) from pet_cheers c where c.pet_user_id = p.user_id and c.on_day = current_date),
    'rules', public.pet_rules())
  end
  from (select 1) x
  left join pet_species s on s.id = p.species
$$;

revoke all on function public.pet_json(public.pets, uuid) from public, anon, authenticated;


-- Anyone's pet (for their profile). Makes yours (the egg) the first
-- time you ask for your own while the feature is on for you.
create or replace function public.get_pet(p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  who uuid := coalesce(p_user, me);
  p   public.pets;
begin
  if me is null then
    return null;
  end if;
  if not public.pets_open(me) then
    return null;
  end if;
  if who = me and not exists (select 1 from pets where user_id = me) then
    insert into pets (user_id, sessions_at_egg)
    values (me, coalesce((select s.sessions_joined from profile_stats s where s.user_id = me), 0))
    on conflict do nothing;
  end if;
  if who <> me and public.is_blocked(who) then
    return null;
  end if;
  p := public.pet_settle(who);
  return public.pet_json(p, me);
end;
$$;

revoke all on function public.get_pet(uuid) from public, anon;
grant execute on function public.get_pet(uuid) to authenticated;


-- ------------------------------------------------------------
--  5. Looking after it. Each returns the pet, or {"error": "..."}.
-- ------------------------------------------------------------
create or replace function public.pet_act(p_action text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  rules jsonb := public.pet_rules();
  p     public.pets;
  cared boolean;
begin
  if me is null or not public.pets_open(me) then
    return jsonb_build_object('error', 'Pets aren''t switched on for you yet.');
  end if;
  p := public.pet_settle(me);
  if p.user_id is null then
    return jsonb_build_object('error', 'You don''t have a pet yet.');
  end if;

  if p_action = 'warm' then
    if p.hatched_at is not null then
      return jsonb_build_object('error', 'It''s already hatched.');
    end if;
    if p.warmed_on = current_date then
      return jsonb_build_object('error', 'Already warm today. Come back tomorrow.');
    end if;
    update pets set warmed_days = warmed_days + 1, warmed_on = current_date where user_id = me returning * into p;
    return public.pet_json(p, me);
  end if;

  if p.hatched_at is null then
    return jsonb_build_object('error', 'It hasn''t hatched yet.');
  end if;

  cared := p.care_on is distinct from current_date;

  if p_action = 'feed' then
    if p.snacks <= 0 then
      return jsonb_build_object('error', 'No snacks left. One comes free every ' || (rules->>'snack_free_hours') || ' hours, or earn them by playing.');
    end if;
    if round(p.hunger) >= 100 then
      return jsonb_build_object('error', 'Not hungry right now.');
    end if;
    update pets
       set snacks = snacks - 1,
           hunger = least(100, hunger + (rules->>'feed_hunger')::int),
           fed_at = now(),
           xp = xp + case when cared then (rules->>'xp_care')::int else 0 end,
           care_on = current_date
     where user_id = me returning * into p;

  elsif p_action = 'play' then
    if now() < coalesce(p.played_at, 'epoch'::timestamptz) + make_interval(hours => (rules->>'play_cooldown_hours')::int) then
      return jsonb_build_object('error', 'Still catching its breath. Try again later.');
    end if;
    if round(p.energy) < (rules->>'play_energy')::int then
      return jsonb_build_object('error', 'Too tired to play. Let it rest first.');
    end if;
    update pets
       set mood = least(100, mood + (rules->>'play_mood')::int),
           energy = greatest(0, energy - (rules->>'play_energy')::int),
           played_at = now(),
           xp = xp + case when cared and round(hunger) > 0 then (rules->>'xp_care')::int else 0 end,
           care_on = current_date
     where user_id = me returning * into p;

  elsif p_action = 'rest' then
    if now() < coalesce(p.rested_at, 'epoch'::timestamptz) + make_interval(hours => (rules->>'rest_cooldown_hours')::int) then
      return jsonb_build_object('error', 'It rested not long ago.');
    end if;
    update pets set energy = 100, rested_at = now() where user_id = me returning * into p;

  elsif p_action = 'rename' then
    if p_name is null or char_length(btrim(p_name)) not between 1 and 20 then
      return jsonb_build_object('error', 'A name is 1 to 20 characters.');
    end if;
    update pets set pet_name = btrim(p_name) where user_id = me returning * into p;

  else
    return jsonb_build_object('error', 'Unknown action.');
  end if;

  return public.pet_json(p, me);
end;
$$;

revoke all on function public.pet_act(text, text) from public, anon;
grant execute on function public.pet_act(text, text) to authenticated;


-- A visitor's cheer: +mood once a day per visitor (anyone not blocked).
create or replace function public.pet_cheer(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  p  public.pets;
begin
  if me is null or not public.pets_open(me) or p_user = me or public.is_blocked(p_user) then
    return jsonb_build_object('error', 'Can''t cheer that pet.');
  end if;
  p := public.pet_settle(p_user);
  if p.user_id is null or p.hatched_at is null then
    return jsonb_build_object('error', 'Nothing to cheer yet.');
  end if;
  insert into pet_cheers (pet_user_id, by_user_id) values (p_user, me)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('error', 'You already cheered it today.');
  end if;
  update pets
     set mood = least(100, mood + (public.pet_rules()->>'cheer_mood')::int)
   where user_id = p_user returning * into p;
  return public.pet_json(p, me);
end;
$$;

revoke all on function public.pet_cheer(uuid) from public, anon;
grant execute on function public.pet_cheer(uuid) to authenticated;


-- ------------------------------------------------------------
--  6. Growing from playing Pentra. Triggers on things that already
--     happen; each is a no-op for people without a pet.
-- ------------------------------------------------------------

-- A session attended (profile_stats.sessions_joined goes up).
create or replace function public.pet_on_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- On insert OLD is null, so the first session counts as 0 → 1.
  if new.sessions_joined > coalesce(case when tg_op = 'UPDATE' then old.sessions_joined end, 0) then
    perform public.pet_award(new.user_id, (public.pet_rules()->>'xp_session')::int, 2);
  end if;
  return null;
end;
$$;

drop trigger if exists pet_on_session on public.profile_stats;
create trigger pet_on_session after insert or update of sessions_joined on public.profile_stats
  for each row execute function public.pet_on_session();

-- A commendation received.
create or replace function public.pet_on_commend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pet_award(new.to_id, (public.pet_rules()->>'xp_commend')::int, 0);
  return null;
end;
$$;

drop trigger if exists pet_on_commend on public.commendations;
create trigger pet_on_commend after insert on public.commendations
  for each row execute function public.pet_on_commend();

-- The Arcade, once a day.
create or replace function public.pet_on_arcade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pets;
begin
  p := public.pet_settle(new.user_id);
  if p.user_id is not null and p.hatched_at is not null and p.arcade_on is distinct from current_date then
    update pets set arcade_on = current_date where user_id = new.user_id;
    perform public.pet_award(new.user_id, (public.pet_rules()->>'xp_arcade')::int, 1);
  end if;
  return null;
end;
$$;

drop trigger if exists pet_on_arcade on public.arcade_scores;
create trigger pet_on_arcade after insert or update on public.arcade_scores
  for each row execute function public.pet_on_arcade();

-- An invite of yours started playing: snacks for you.
create or replace function public.pet_on_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.qualified_at is not null and old.qualified_at is null then
    perform public.pet_award(new.referrer_id, 0, 5);
  end if;
  return null;
end;
$$;

drop trigger if exists pet_on_referral on public.referrals;
create trigger pet_on_referral after update of qualified_at on public.referrals
  for each row execute function public.pet_on_referral();

revoke all on function public.pet_on_session()  from public, anon, authenticated;
revoke all on function public.pet_on_commend()  from public, anon, authenticated;
revoke all on function public.pet_on_arcade()   from public, anon, authenticated;
revoke all on function public.pet_on_referral() from public, anon, authenticated;

-- ============================================================
--  Done. No What's New line here: the feature is off. See 111.
-- ============================================================
