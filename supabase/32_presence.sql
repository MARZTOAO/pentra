-- ============================================================
--  32 — choosing how you appear.
--
--  Four states, the way Steam does it:
--
--    online     the default
--    away       you're here, but don't wait on a reply
--    invisible  you're using the app; nobody can tell
--    offline    you're not using it, and it stays that way
--
--  The interesting one is invisible, and it's the reason this is a
--  migration rather than a dropdown.
--
--  Presence is currently derived from profiles.last_seen_at, which a
--  heartbeat touches every minute and which every client can read.
--  A status picker that only changed what the interface draws would be
--  theatre: anyone could query the row, see a last_seen_at from four
--  seconds ago, and know you were lying. Worse, storing the literal
--  word 'invisible' on a publicly readable row tells everyone you are
--  hiding, which is the one fact invisibility exists to conceal.
--
--  So the choice is split in two:
--
--    presence_settings.status   the truth. Private, RLS to the owner.
--    profiles.presence          what everyone else may see. Only ever
--                               'online', 'away' or 'offline'.
--
--  Invisible and offline both surface as 'offline' in the public
--  column, and the heartbeat stops touching last_seen_at while you're
--  in either, so the underlying timestamp goes stale on its own. An
--  invisible player is indistinguishable from one who closed the app —
--  through the interface, through the API, and to the match scoring.
--
--  Run in the Supabase SQL Editor, after 31.
-- ============================================================


-- ------------------------------------------------------------
--  The real choice. Nobody reads this but its owner.
-- ------------------------------------------------------------
create table if not exists public.presence_settings (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  status     text not null default 'online'
             check (status in ('online', 'away', 'invisible', 'offline')),
  updated_at timestamptz not null default now()
);

alter table public.presence_settings enable row level security;

-- Read your own and nobody else's. There is deliberately no insert,
-- update or delete policy: set_presence() below is the only writer,
-- and it runs as definer, so the choice can't be written from the API
-- in a way that skips keeping the public column in step.
drop policy if exists "read your own presence choice" on public.presence_settings;
create policy "read your own presence choice"
  on public.presence_settings for select
  to authenticated
  using (user_id = auth.uid());


-- ------------------------------------------------------------
--  What everyone else sees.
--
--  Deliberately a narrower vocabulary than the setting above — there
--  is no public value that means "hiding".
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists presence text not null default 'online';

do $$
begin
  alter table public.profiles
    add constraint profiles_presence_check
    check (presence in ('online', 'away', 'offline'));
exception
  when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
--  Set your status.
--
--  Definer, because it writes the private table that has no write
--  policy. The two writes are one statement apart in one function, so
--  the public column can never drift from the private choice.
-- ------------------------------------------------------------
create or replace function public.set_presence(choice text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  public_value text;
begin
  if choice not in ('online', 'away', 'invisible', 'offline') then
    raise exception 'Unknown status: %', choice;
  end if;

  -- Hiding and being away are different intentions but the same
  -- appearance, and this is the line that makes that true.
  public_value := case
    when choice in ('invisible', 'offline') then 'offline'
    else choice
  end;

  insert into presence_settings (user_id, status, updated_at)
  values (auth.uid(), choice, now())
  on conflict (user_id)
  do update set status = excluded.status, updated_at = now();

  update profiles
     set presence = public_value,
         -- Going invisible has to take effect NOW. Leaving last_seen_at
         -- alone would keep you readable as online for the two minutes
         -- it takes to go stale, which is exactly the window someone
         -- goes invisible to avoid.
         last_seen_at = case
           when public_value = 'offline'
             then now() - interval '1 hour'
           else now()
         end
   where id = auth.uid();
end;
$$;

grant execute on function public.set_presence(text) to authenticated;


-- ------------------------------------------------------------
--  Read your own choice back.
--
--  Returns the private four-way value, so the picker can show
--  "Invisible" ticked rather than the "offline" everyone else sees.
-- ------------------------------------------------------------
create or replace function public.my_presence()
returns text
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(
    (select status from presence_settings where user_id = auth.uid()),
    'online'
  );
$$;

grant execute on function public.my_presence() to authenticated;


-- ------------------------------------------------------------
--  The heartbeat, taught to respect the choice.
--
--  Replaces the version in 06_matching.sql. While you're invisible or
--  offline this does nothing at all, so last_seen_at ages out and you
--  drop off every online list, every match score and every direct read
--  of the table without anything having to remember to hide you.
-- ------------------------------------------------------------
create or replace function public.touch_last_seen()
returns void
language sql
security invoker
set search_path = public
as $$
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and coalesce(
       (select status from presence_settings where user_id = auth.uid()),
       'online'
     ) in ('online', 'away');
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
