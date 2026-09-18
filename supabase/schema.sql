-- ============================================================
--  Gamer Social App - database schema
--  Paste this whole file into the Supabase SQL Editor and Run.
--  Safe to re-run: everything is guarded with IF NOT EXISTS
--  or dropped-then-created.
-- ============================================================


-- ------------------------------------------------------------
--  1. PROFILES
--  One row per user. Linked to Supabase's built-in auth.users
--  table, which holds the email and password. Anything the app
--  needs to *display* about a person lives here instead.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  bio           text check (char_length(bio) <= 500),
  region        text,
  timezone      text,
  platforms     text[] default '{}',     -- e.g. {'PC','PS5'}
  availability  text[] default '{}',     -- e.g. {'weeknights','weekends'}
  last_seen_at  timestamptz default now(),
  created_at    timestamptz default now()
);

-- Usernames: 3-20 chars, letters/numbers/underscore only.
alter table public.profiles
  drop constraint if exists username_format;
alter table public.profiles
  add constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$');


-- ------------------------------------------------------------
--  2. GAMES
--  The shared catalogue. Everyone picks from this list so that
--  "Elden Ring" is always the same row - free-text game names
--  would break matching entirely.
--  Populated later by an import script from IGDB.
-- ------------------------------------------------------------
create table if not exists public.games (
  id          bigint generated always as identity primary key,
  igdb_id     bigint unique,
  name        text not null,
  cover_url   text,
  genres      text[] default '{}',
  platforms   text[] default '{}',
  popularity  numeric default 0,
  created_at  timestamptz default now()
);

-- Fast case-insensitive search as the user types.
create index if not exists games_name_search
  on public.games using gin (to_tsvector('english', name));
create index if not exists games_popularity_idx
  on public.games (popularity desc);


-- ------------------------------------------------------------
--  3. TOP FIVE
--  Exactly what it says: up to five ranked games per person.
--  The two unique constraints are what enforce the rules -
--  one game per slot, and no duplicate games in one person's list.
-- ------------------------------------------------------------
create table if not exists public.top_five (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  game_id    bigint not null references public.games(id) on delete cascade,
  rank       smallint not null check (rank between 1 and 5),
  platform   text,
  note       text check (char_length(note) <= 100),
  updated_at timestamptz default now(),

  unique (user_id, rank),
  unique (user_id, game_id)
);

create index if not exists top_five_user_idx on public.top_five (user_id);
create index if not exists top_five_game_idx on public.top_five (game_id);


-- ------------------------------------------------------------
--  4. FRIENDSHIPS
--  One row per pair, not two. status tracks the request.
--  The unique index uses least()/greatest() so that A->B and
--  B->A can't both exist as separate pending requests.
-- ------------------------------------------------------------
do $$ begin
  create type friendship_status as enum ('pending', 'accepted', 'declined');
exception when duplicate_object then null;
end $$;

create table if not exists public.friendships (
  id            bigint generated always as identity primary key,
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        friendship_status not null default 'pending',
  created_at    timestamptz default now(),
  responded_at  timestamptz,

  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);


-- ------------------------------------------------------------
--  5. CONVERSATIONS
--  A 1-on-1 thread. user_a is always the smaller uuid, which
--  guarantees one conversation per pair rather than two.
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id              bigint generated always as identity primary key,
  user_a          uuid not null references public.profiles(id) on delete cascade,
  user_b          uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz default now(),
  created_at      timestamptz default now(),

  check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists conversations_user_a_idx on public.conversations (user_a);
create index if not exists conversations_user_b_idx on public.conversations (user_b);


-- ------------------------------------------------------------
--  6. MESSAGES
-- ------------------------------------------------------------
create table if not exists public.messages (
  id              bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 2000),
  created_at      timestamptz default now(),
  read_at         timestamptz
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);


-- ------------------------------------------------------------
--  7. BLOCKS
--  Checked by every query that returns people.
-- ------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),

  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);


-- ============================================================
--  AUTO-CREATE A PROFILE ON SIGNUP
--  When someone registers, Supabase adds a row to auth.users.
--  This trigger immediately creates their matching profile row
--  so the app never has a logged-in user with no profile.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      'player_' || substr(new.id::text, 1, 8)
    ),
    coalesce(new.raw_user_meta_data->>'display_name', 'New Player')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================
--  ROW LEVEL SECURITY
--  With RLS on, the database itself enforces who can see what.
--  This is why the anon key is safe to ship in the app: even if
--  someone reads your code, these rules still apply to them.
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.games         enable row level security;
alter table public.top_five      enable row level security;
alter table public.friendships   enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.blocks        enable row level security;


-- Helper: is there a block in either direction between me and them?
create or replace function public.is_blocked(other uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  );
$$;


-- ---- profiles -------------------------------------------------
drop policy if exists "profiles are readable by signed-in users" on public.profiles;
create policy "profiles are readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (not public.is_blocked(id));

drop policy if exists "users update their own profile" on public.profiles;
create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---- games ----------------------------------------------------
-- Read-only for everyone. Only the import script (service key) writes.
drop policy if exists "games are readable by signed-in users" on public.games;
create policy "games are readable by signed-in users"
  on public.games for select
  to authenticated
  using (true);


-- ---- top_five -------------------------------------------------
drop policy if exists "top five is publicly readable" on public.top_five;
create policy "top five is publicly readable"
  on public.top_five for select
  to authenticated
  using (not public.is_blocked(user_id));

drop policy if exists "users manage their own top five" on public.top_five;
create policy "users manage their own top five"
  on public.top_five for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ---- friendships ----------------------------------------------
drop policy if exists "see friendships you are part of" on public.friendships;
create policy "see friendships you are part of"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "send your own friend requests" on public.friendships;
create policy "send your own friend requests"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid() and not public.is_blocked(addressee_id));

drop policy if exists "respond to friendships you are part of" on public.friendships;
create policy "respond to friendships you are part of"
  on public.friendships for update
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "remove friendships you are part of" on public.friendships;
create policy "remove friendships you are part of"
  on public.friendships for delete
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());


-- ---- conversations --------------------------------------------
drop policy if exists "see your own conversations" on public.conversations;
create policy "see your own conversations"
  on public.conversations for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists "start a conversation you are in" on public.conversations;
create policy "start a conversation you are in"
  on public.conversations for insert
  to authenticated
  with check (
    (user_a = auth.uid() or user_b = auth.uid())
    and not public.is_blocked(case when user_a = auth.uid() then user_b else user_a end)
  );


-- ---- messages --------------------------------------------------
drop policy if exists "read messages in your conversations" on public.messages;
create policy "read messages in your conversations"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

drop policy if exists "send messages as yourself" on public.messages;
create policy "send messages as yourself"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
        and not public.is_blocked(case when c.user_a = auth.uid() then c.user_b else c.user_a end)
    )
  );


-- ---- blocks ----------------------------------------------------
drop policy if exists "see your own blocks" on public.blocks;
create policy "see your own blocks"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "manage your own blocks" on public.blocks;
create policy "manage your own blocks"
  on public.blocks for all
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());


-- ============================================================
--  REALTIME
--  Lets the chat screen receive new messages instantly instead
--  of polling. RLS still applies to realtime, so people only
--  receive messages from their own conversations.
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null;
end $$;


-- ============================================================
--  Done. You should see "Success. No rows returned."
-- ============================================================
