-- ============================================================
--  "I can't find my game"
--  Run this in the Supabase SQL Editor, after 24_game_library.sql.
--
--  No catalogue is complete. Something will always be missing - an
--  indie release from last week, a regional title, a game with three
--  ratings on IGDB. The question is what happens when someone hits
--  that gap while filling in their profile.
--
--  Without this, the answer is: they leave the field blank and say
--  nothing. That's the bad outcome, because a half-filled profile is
--  what makes matching useless, and you never find out it happened.
--
--  So: they type the name, it lands here, and the sync job that
--  already runs daily looks it up and imports it. The catalogue grows
--  from what people actually play rather than from a guess about
--  where to draw the line.
-- ============================================================

create table if not exists public.game_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 2 and 120),
  status      text not null default 'pending'
              check (status in ('pending', 'imported', 'not_found')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  -- What it turned into, once the sync finds it.
  game_id     bigint references public.games(id) on delete set null
);

create index if not exists game_requests_pending_idx
  on public.game_requests (created_at)
  where status = 'pending';

create index if not exists game_requests_user_idx
  on public.game_requests (user_id, created_at desc);

-- Two people asking for the same game is one job, not two. Only
-- applies while a request is still pending, so the same name can be
-- asked for again later if the first attempt found nothing.
create unique index if not exists game_requests_no_duplicates
  on public.game_requests (lower(trim(name)))
  where status = 'pending';

alter table public.game_requests enable row level security;

-- You see your own requests and nobody else's. There's nothing useful
-- in another person's, and a public list of "games nobody has" is an
-- odd thing to publish.
drop policy if exists "see your own requests" on public.game_requests;
create policy "see your own requests"
  on public.game_requests for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "ask for a game" on public.game_requests;
create policy "ask for a game"
  on public.game_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- No update or delete policy. A request is a note to the importer,
-- not something to edit afterwards; only the sync (service role)
-- resolves them.


-- ------------------------------------------------------------
--  Ten pending at a time
--
--  Not really about abuse - it's about a stuck sync. If IGDB has
--  never heard of the thing someone is asking for, the request sits
--  pending forever, and without a ceiling one person could leave a
--  thousand of them for the importer to retry nightly.
-- ------------------------------------------------------------
create or replace function public.cap_game_requests()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  waiting int;
begin
  select count(*) into waiting
  from game_requests
  where user_id = new.user_id and status = 'pending';

  if waiting >= 10 then
    raise exception 'You have ten requests waiting already — give those a day first';
  end if;

  return new;
end;
$$;

drop trigger if exists cap_game_requests on public.game_requests;
create trigger cap_game_requests
  before insert on public.game_requests
  for each row execute function public.cap_game_requests();


-- ------------------------------------------------------------
--  Did my request land?
--
--  So the search box can say "we added it" next time someone looks,
--  rather than leaving them wondering whether it worked.
-- ------------------------------------------------------------
create or replace function public.my_game_requests()
returns table (
  id         bigint,
  name       text,
  status     text,
  created_at timestamptz,
  game_id    bigint,
  game_name  text
)
language sql
security invoker
set search_path = public
stable
as $$
  select r.id, r.name, r.status, r.created_at, r.game_id, g.name
  from game_requests r
  left join games g on g.id = r.game_id
  where r.user_id = auth.uid()
  order by r.created_at desc
  limit 25;
$$;

grant execute on function public.my_game_requests() to authenticated;

-- ============================================================
--  Done.
--
--  What's waiting on the importer:
--    select name, created_at from game_requests
--    where status = 'pending' order by created_at;
--
--  What people asked for that IGDB has never heard of - worth a
--  glance now and then, since it's usually a misspelling:
--    select name, count(*) from game_requests
--    where status = 'not_found' group by name order by count(*) desc;
-- ============================================================
