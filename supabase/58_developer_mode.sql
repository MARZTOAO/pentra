-- ============================================================
--  58 — developer mode, and flags for private test builds.
--
--  Three things:
--
--    developers       who gets the tools. You, and nobody else.
--    feature_flags    work that is live in the code but off.
--    flag_testers     the named people a flag is on for.
--
--  WHY A TABLE AND NOT A COLUMN ON profiles. A boolean on profiles
--  would be returned by every `select *` the app makes, so "is MARZ a
--  developer" would ship to every browser that looked at your profile.
--  Hiding it would then mean auditing every query forever. A separate
--  table cannot leak that way: there is no column to forget about.
--
--  WHY NOBODY CAN GRANT THEMSELVES. All three tables have row level
--  security on and NO POLICIES AT ALL, plus their grants revoked. That
--  combination makes them completely unreachable through the API — not
--  read, not written, by anon or by any signed-in account, forever.
--  The only way a row gets into `developers` is the SQL Editor, which
--  runs as the service role and bypasses RLS. That is the same shape
--  message_deletions uses in 28, for the same reason.
--
--  So there is no "become a developer" call to find, no policy to get
--  wrong, and no admin screen to break into. There is a database
--  console only you can log into.
--
--  WHAT THE FLAGS ARE FOR. The instinct is to build a separate test
--  copy of the app and share the link. That means a second deploy, a
--  second database, and two versions to keep in step — and the bugs
--  you most want to catch are the ones that only happen against real
--  data with real people. Flags invert it: the new code ships to
--  production switched off, and you turn it on for named people by
--  username. They use the real app, on the real database, and see the
--  new thing. Everybody else sees today's app. When it is right, one
--  toggle turns it on for everyone; when it is wrong, one toggle takes
--  it away without a deploy or a rollback.
--
--  Flag names are deliberately NOT readable by ordinary accounts. The
--  list of what you are working on is not something to hand out: an
--  account asks `my_flags()` and learns only which flags are on for
--  itself. It learns nothing about the ones that are not.
--
--  Run in the Supabase SQL Editor, after 57. Then run the INSERT at
--  the very bottom to make yourself the developer — it is commented
--  out on purpose so that running this file does not silently grant
--  anything.
-- ============================================================


-- ------------------------------------------------------------
--  Who the developers are.
-- ------------------------------------------------------------
create table if not exists public.developers (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  note       text,
  granted_at timestamptz not null default now()
);

alter table public.developers enable row level security;

-- No policies. Deliberate, and the whole security model: with RLS on
-- and nothing granting access, this table does not exist as far as
-- the API is concerned.
revoke all on public.developers from anon, authenticated;


-- ------------------------------------------------------------
--  Am I one?
--
--  No parameter, on purpose. A function that takes a user id would
--  let anybody test whether somebody else is a developer, one id at a
--  time. This one can only ever answer about its own caller.
-- ------------------------------------------------------------
create or replace function public.am_i_developer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.developers d where d.user_id = auth.uid()
  );
$$;

revoke all on function public.am_i_developer() from public;
grant execute on function public.am_i_developer() to authenticated;


-- ------------------------------------------------------------
--  Flags.
-- ------------------------------------------------------------
create table if not exists public.feature_flags (
  key             text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  description     text,
  -- The one switch that ships it to everybody.
  enabled_for_all boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.flag_testers (
  flag_key  text not null references public.feature_flags(key) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (flag_key, user_id)
);

alter table public.feature_flags enable row level security;
alter table public.flag_testers  enable row level security;

-- Same treatment. Everything goes through the functions below, which
-- decide what each caller is allowed to learn.
revoke all on public.feature_flags from anon, authenticated;
revoke all on public.flag_testers  from anon, authenticated;


-- ------------------------------------------------------------
--  What is switched on FOR ME.
--
--  The only flag function ordinary accounts can call, and it returns
--  nothing but a list of keys that are already on for them. There is
--  no way to ask what else exists.
-- ------------------------------------------------------------
create or replace function public.my_flags()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select f.key
  from public.feature_flags f
  where auth.uid() is not null
    and (
      f.enabled_for_all
      or exists (
        select 1 from public.flag_testers t
        where t.flag_key = f.key and t.user_id = auth.uid()
      )
    );
$$;

revoke all on function public.my_flags() from public;
grant execute on function public.my_flags() to authenticated;


-- ------------------------------------------------------------
--  Everything below is developer-only.
--
--  Each one checks am_i_developer() first and raises if not. Being
--  definer functions they bypass RLS, so that check is the ONLY thing
--  standing between an ordinary account and the flag table — it is
--  not decoration, and it must be the first statement in every one.
-- ------------------------------------------------------------
create or replace function public.dev_flags()
returns table (
  key             text,
  description     text,
  enabled_for_all boolean,
  testers         text[],
  updated_at      timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return query
    select
      f.key,
      f.description,
      f.enabled_for_all,
      coalesce(
        (select array_agg(p.username order by p.username)
         from public.flag_testers t
         join public.profiles p on p.id = t.user_id
         where t.flag_key = f.key),
        '{}'
      ),
      f.updated_at
    from public.feature_flags f
    order by f.created_at desc;
end;
$$;


create or replace function public.dev_set_flag(
  flag_key    text,
  note        text default null,
  for_all     boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  insert into public.feature_flags (key, description, enabled_for_all)
  values (flag_key, note, for_all)
  on conflict (key) do update set
    description     = coalesce(excluded.description, feature_flags.description),
    enabled_for_all = excluded.enabled_for_all,
    updated_at      = now();

  return flag_key;
end;
$$;


create or replace function public.dev_drop_flag(flag_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  -- Testers go with it, by the cascade on flag_testers.
  delete from public.feature_flags f where f.key = flag_key;
  return flag_key;
end;
$$;


-- By username rather than uuid. You know who you want to test
-- something; you do not know their id, and looking it up by hand is
-- how the wrong person ends up on the list.
create or replace function public.dev_add_tester(
  flag_key text,
  who      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target
  from public.profiles p
  where lower(p.username) = lower(btrim(who));

  if target is null then
    return 'no such player';
  end if;

  if not exists (select 1 from public.feature_flags f where f.key = flag_key) then
    return 'no such flag';
  end if;

  insert into public.flag_testers (flag_key, user_id)
  values (flag_key, target)
  on conflict do nothing;

  return 'added';
end;
$$;


create or replace function public.dev_remove_tester(
  flag_key text,
  who      text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select p.id into target
  from public.profiles p
  where lower(p.username) = lower(btrim(who));

  if target is null then
    return 'no such player';
  end if;

  delete from public.flag_testers t
   where t.flag_key = dev_remove_tester.flag_key
     and t.user_id  = target;

  return 'removed';
end;
$$;


revoke all on function public.dev_flags()                     from public;
revoke all on function public.dev_set_flag(text, text, boolean) from public;
revoke all on function public.dev_drop_flag(text)             from public;
revoke all on function public.dev_add_tester(text, text)      from public;
revoke all on function public.dev_remove_tester(text, text)   from public;

grant execute on function public.dev_flags()                     to authenticated;
grant execute on function public.dev_set_flag(text, text, boolean) to authenticated;
grant execute on function public.dev_drop_flag(text)             to authenticated;
grant execute on function public.dev_add_tester(text, text)      to authenticated;
grant execute on function public.dev_remove_tester(text, text)   to authenticated;
-- Granted to `authenticated` because that is the role every signed-in
-- caller arrives as; the am_i_developer() check inside each one is
-- what actually decides. There is no Postgres role to grant to
-- instead — Supabase gives every signed-in account the same one.


-- ============================================================
--  MAKING YOURSELF THE DEVELOPER
--
--  Run this ONE statement separately, with your own username. It is
--  not part of the migration because a file that grants privileges
--  when run is a file that grants privileges when re-run somewhere
--  you did not mean it to.
--
--    insert into public.developers (user_id, note)
--    select id, 'owner' from public.profiles
--     where lower(username) = lower('YOUR_USERNAME')
--    on conflict (user_id) do nothing;
--
--  Check it took:
--
--    select p.username, d.granted_at
--      from public.developers d
--      join public.profiles p on p.id = d.user_id;
--
--  To revoke, later:
--
--    delete from public.developers
--     where user_id = (select id from public.profiles
--                       where lower(username) = lower('YOUR_USERNAME'));
-- ============================================================
