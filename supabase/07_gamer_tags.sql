-- ============================================================
--  Gamer tags (Steam ID, Gamertag, PSN ID, and so on)
--  Run this in the Supabase SQL Editor.
--
--  These are private: only you and your accepted friends can read
--  them. That rule lives in the database, not in the app - so even
--  if a screen forgets to hide them, or someone queries the API
--  directly with the public key, the rows simply aren't returned.
--
--  Getting this wrong is how an app leaks contact handles to
--  strangers, which for an app that connects strangers is the whole
--  ballgame.
-- ============================================================

create table if not exists public.gamer_tags (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  network    text not null,
  handle     text not null check (char_length(handle) between 1 and 100),
  updated_at timestamptz default now(),

  primary key (user_id, network)
);

create index if not exists gamer_tags_user_idx on public.gamer_tags (user_id);


-- ------------------------------------------------------------
--  Helper: are these two people actually friends?
--  security definer so the check works the same for everyone,
--  regardless of what rows the caller can otherwise see.
-- ------------------------------------------------------------
create or replace function public.is_friend(other uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = other)
        or (f.requester_id = other and f.addressee_id = auth.uid()))
  );
$$;

grant execute on function public.is_friend(uuid) to authenticated;


-- ------------------------------------------------------------
--  Row level security
-- ------------------------------------------------------------
alter table public.gamer_tags enable row level security;

-- Read: yourself, or someone you're actually friends with. Nobody else.
drop policy if exists "gamer tags visible to self and friends" on public.gamer_tags;
create policy "gamer tags visible to self and friends"
  on public.gamer_tags for select
  to authenticated
  using (
    user_id = auth.uid()
    or (public.is_friend(user_id) and not public.is_blocked(user_id))
  );

-- Write: your own only.
drop policy if exists "manage your own gamer tags" on public.gamer_tags;
create policy "manage your own gamer tags"
  on public.gamer_tags for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ------------------------------------------------------------
--  Save them all in one go, same reasoning as set_top_five:
--  one atomic replace rather than a sequence of edits.
-- ------------------------------------------------------------
create or replace function public.set_gamer_tags(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  delete from public.gamer_tags where user_id = auth.uid();

  insert into public.gamer_tags (user_id, network, handle)
  select
    auth.uid(),
    item->>'network',
    trim(item->>'handle')
  from jsonb_array_elements(items) as item
  where coalesce(trim(item->>'handle'), '') <> '';
end;
$$;

grant execute on function public.set_gamer_tags(jsonb) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
