-- ============================================================
--  Friend codes and player search
--  Run this in the Supabase SQL Editor.
--
--  Safe to run again if you've run an earlier version of this file.
--  It repairs whatever state it finds.
--
--  Two things that go together:
--
--  1. Every profile gets a permanent code like A1B2C-3D4E5. You give
--     it to people you already know so they can find you without
--     guessing at usernames. Steam friend codes, PSN IDs and Discord
--     tags all exist for the same reason: usernames are taken,
--     misspelled, and shared by thousands of people.
--
--  2. A search that takes either a code or a name, so one box does
--     both jobs.
--
--  Three rules the database enforces, not the app:
--
--    * Everyone has one. A profile without a code cannot exist.
--    * Nobody can change theirs, including to a code they've seen
--      someone else use. There is no "new code" button by design.
--    * A code is never handed out twice. Not to two people at once,
--      and not to a newcomer after the original owner leaves - see
--      the registry below.
--
--  The alphabet leaves out I, L, O and U on purpose. I/1, L/1 and
--  O/0 get misread when someone reads a code aloud over voice chat,
--  and leaving U out keeps accidental words from forming.
-- ============================================================


-- ============================================================
--  The registry: every code ever issued
--
--  This is what makes "never reused" true rather than merely likely.
--  Checking a new code against the profiles table only tells you
--  who's here NOW - delete an account and its code quietly becomes
--  available again, and a stranger inherits whatever that code was
--  written down next to.
--
--  So codes are claimed here, permanently, and this table is never
--  cleaned up. A row outlives the account it was issued to: when a
--  profile goes, user_id is emptied and the code stays spoken for.
--
--  No foreign key on user_id on purpose. The claim happens before
--  the profile row exists, and this is an append-only ledger rather
--  than a child table - a reference would fight both of those.
-- ============================================================
create table if not exists public.friend_code_registry (
  code      text primary key,
  user_id   uuid,
  issued_at timestamptz not null default now()
);

create index if not exists friend_code_registry_user_idx
  on public.friend_code_registry (user_id);

alter table public.friend_code_registry enable row level security;

-- No policies, deliberately: nothing in the app reads or writes this.
-- Only the claiming function below touches it, and it runs as the
-- table's owner.

-- When an account is deleted the code stays claimed - it just stops
-- pointing at anyone.
create or replace function public.release_friend_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update friend_code_registry
     set user_id = null
   where user_id = old.id;

  return old;
end;
$$;

drop trigger if exists release_friend_code on public.profiles;
create trigger release_friend_code
  after delete on public.profiles
  for each row execute function public.release_friend_code();


-- ------------------------------------------------------------
--  Generating a code
--
--  Ten characters from a 32-symbol alphabet: 1,125,899,906,842,624
--  possibilities. At a million accounts, the chance a freshly drawn
--  code is already taken is about one in a billion.
-- ------------------------------------------------------------
create or replace function public.gen_friend_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- 32 characters
  code text := '';
  i int;
begin
  for i in 1..10 loop
    code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;
  return code;
end;
$$;


-- ------------------------------------------------------------
--  Reading a code someone typed
--
--  People will type it with the dash, without it, in lower case, or
--  with an I where the 1 is. All of those should find the right
--  person rather than "no results".
-- ------------------------------------------------------------
create or replace function public.normalize_friend_code(raw text)
returns text
language sql
immutable
as $$
  select translate(
    upper(regexp_replace(coalesce(raw, ''), '[^0-9A-Za-z]', '', 'g')),
    'ILO',
    '110'
  );
$$;

grant execute on function public.normalize_friend_code(text) to authenticated;


-- ------------------------------------------------------------
--  Claiming one
--
--  The claim is the insert. Checking "is this code taken?" and then
--  inserting it would leave a gap between the two where a second
--  signup could claim the same code; letting the primary key decide,
--  and retrying when it says no, closes that gap without locking
--  anything.
--
--  The attempt limit will never be reached. It's there so that a
--  fault in the generator fails a signup loudly instead of spinning
--  forever.
-- ------------------------------------------------------------
create or replace function public.claim_friend_code(owner uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  tries int := 0;
begin
  loop
    tries := tries + 1;
    candidate := public.gen_friend_code();

    insert into friend_code_registry (code, user_id)
    values (candidate, owner)
    on conflict (code) do nothing;

    exit when found;

    if tries > 100 then
      raise exception 'Could not allocate a friend code after % attempts', tries;
    end if;
  end loop;

  return candidate;
end;
$$;


-- ------------------------------------------------------------
--  The column
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists friend_code text;


-- ------------------------------------------------------------
--  Codes are permanent
--
--  The profiles update policy lets you write your own row, which
--  would otherwise let anyone set their code to whatever they liked -
--  including one they'd seen someone else hand out.
--
--  No exception for service_role, and no escape hatch: a code that
--  can be swapped isn't an identity, it's a nickname. Changing one
--  means switching this trigger off at the table, which takes
--  database access - which is exactly the bar it should clear.
-- ------------------------------------------------------------
create or replace function public.guard_friend_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.friend_code is distinct from old.friend_code then
    raise exception 'Friend codes are permanent and cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_friend_code on public.profiles;
create trigger guard_friend_code
  before update on public.profiles
  for each row execute function public.guard_friend_code();


-- ------------------------------------------------------------
--  Issue codes to everyone who needs one
--
--  Covers first-time setup and anyone still holding a code from an
--  earlier version of this file. The guard above has to stand down
--  for the length of this block, since it exists to stop exactly
--  what this is doing.
-- ------------------------------------------------------------
alter table public.profiles disable trigger guard_friend_code;

do $$
declare
  r record;
begin
  -- Anything already valid stays exactly as it is, and gets recorded
  -- in the registry if it isn't there yet.
  insert into public.friend_code_registry (code, user_id)
  select p.friend_code, p.id
  from public.profiles p
  where p.friend_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'
  on conflict (code) do nothing;

  for r in
    select id from public.profiles
    where friend_code is null
       or friend_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$'
  loop
    update public.profiles
       set friend_code = public.claim_friend_code(r.id)
     where id = r.id;
  end loop;
end;
$$;

alter table public.profiles enable trigger guard_friend_code;


create unique index if not exists profiles_friend_code_idx
  on public.profiles (friend_code);

alter table public.profiles
  alter column friend_code set not null;

alter table public.profiles
  drop constraint if exists friend_code_shape;
alter table public.profiles
  add constraint friend_code_shape
  check (friend_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$');


-- ------------------------------------------------------------
--  New profiles get one automatically
--
--  A trigger rather than a column default, because a default can't
--  retry on collision - it would just fail the signup. It also
--  ignores any code handed to it, so no insert path anywhere can
--  choose its own.
-- ------------------------------------------------------------
create or replace function public.assign_friend_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.friend_code := public.claim_friend_code(new.id);
  return new;
end;
$$;

drop trigger if exists assign_friend_code on public.profiles;
create trigger assign_friend_code
  before insert on public.profiles
  for each row execute function public.assign_friend_code();


-- Removed: codes used to be re-rollable. They aren't any more, and
-- the function that did it is gone rather than left lying around.
drop function if exists public.regenerate_friend_code();


-- ============================================================
--  Search
--
--  Two jobs, deliberately kept on two separate paths.
--
--  A complete friend code is an exact match on a unique index: one
--  index hit, the same cost at ten million accounts as at ten. A name
--  is a substring match, which needs a trigram index instead.
--
--  Doing both in one query with OR was the first version, and it was
--  the wrong shape: a planner that sees "code = x OR name like y"
--  can't use either index and reads every row. Branching first means
--  each path gets the index built for it.
--
--  security invoker on purpose: the read policy on profiles already
--  hides people you've blocked and people who've blocked you, and
--  running as the caller means search inherits that for free rather
--  than re-implementing it and drifting out of step.
--
--  Nobody else's friend_code comes back in the results. A code isn't
--  a secret - it's a locator, and searching by name finds the same
--  person anyway - but there's no reason for the app to hand them out.
-- ============================================================

-- Trigram indexing is what makes "contains this text" searchable
-- rather than a full scan. It ships with Postgres; Supabase just
-- needs it switched on.
create extension if not exists pg_trgm;

-- Supabase usually installs extensions into a schema called
-- `extensions` rather than `public`, so the operator class may be
-- named either way. Try the plain name first and fall back.
do $$
begin
  begin
    execute 'create index if not exists profiles_username_trgm_idx
               on public.profiles using gin (username gin_trgm_ops)';
    execute 'create index if not exists profiles_display_name_trgm_idx
               on public.profiles using gin (display_name gin_trgm_ops)';
  exception when undefined_object then
    execute 'create index if not exists profiles_username_trgm_idx
               on public.profiles using gin (username extensions.gin_trgm_ops)';
    execute 'create index if not exists profiles_display_name_trgm_idx
               on public.profiles using gin (display_name extensions.gin_trgm_ops)';
  end;
end;
$$;

-- The earlier prefix index is no longer used by anything.
drop index if exists public.profiles_username_search_idx;


drop function if exists public.search_players(text, int);

create or replace function public.search_players(q text, limit_n int default 25)
returns table (
  user_id          uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  avatar_preset    text,
  primary_platform text,
  location_city    text,
  location_state   text,
  location_country text,
  last_seen_at     timestamptz,
  friend_status    text,
  matched_code     boolean
)
language plpgsql
security invoker
set search_path = public
stable
as $$
declare
  term text := nullif(trim(q), '');
  code text := public.normalize_friend_code(q);
  pat  text;
  cap  int  := greatest(1, least(coalesce(limit_n, 25), 50));
begin
  if term is null then
    return;
  end if;

  -- ---- Path 1: a complete friend code ----
  if code ~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    return query
    select
      p.id, p.username, p.display_name, p.avatar_url, p.avatar_preset,
      p.primary_platform, p.location_city, p.location_state,
      p.location_country, p.last_seen_at,
      public.get_friend_status(p.id),
      true
    from profiles p
    where p.friend_code = code
      and p.id <> auth.uid();

    -- A code that matched is the answer. A code-shaped string that
    -- matched nothing falls through - it might be someone's username.
    if found then
      return;
    end if;
  end if;

  -- ---- Path 2: a name ----
  if length(term) < 2 then
    return;
  end if;

  -- % and _ mean something to ILIKE. Someone typing them is looking
  -- for those characters, not building a pattern.
  pat := replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select
    p.id, p.username, p.display_name, p.avatar_url, p.avatar_preset,
    p.primary_platform, p.location_city, p.location_state,
    p.location_country, p.last_seen_at,
    public.get_friend_status(p.id),
    false
  from profiles p
  where p.id <> auth.uid()
    and (p.username     ilike '%' || pat || '%'
      or p.display_name ilike '%' || pat || '%')
  order by
    -- Exact name, then starts-with, then whoever was here most recently.
    (lower(p.username) = lower(term)) desc,
    (p.username ilike pat || '%')     desc,
    p.last_seen_at desc nulls last,
    p.username
  limit cap;
end;
$$;

grant execute on function public.search_players(text, int) to authenticated;


-- ============================================================
--  Done.
--
--  To see your own code:
--    select username, friend_code from profiles where id = auth.uid();
--
--  To see how many codes have ever been issued, and how many belong
--  to accounts that no longer exist:
--    select count(*) as issued,
--           count(*) filter (where user_id is null) as retired
--    from friend_code_registry;
-- ============================================================
