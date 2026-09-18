-- ============================================================
--  Blocking and reporting
--  Run this in the Supabase SQL Editor.
--
--  The blocks table has existed since the first schema, and every
--  query in the app already filters through is_blocked(). This adds
--  the actions on top of it, plus reports.
--
--  Blocking is one-directional in intent but two-directional in
--  effect: if you block someone, neither of you sees the other. A
--  block that only hides them from you leaves them able to watch and
--  message you, which is not what anyone means by the word.
-- ============================================================


-- ------------------------------------------------------------
--  Block someone. Also tears down the friendship, because staying
--  "friends" with someone you've blocked is a contradiction that
--  would leave their gamer tags visible to you and yours to them.
-- ------------------------------------------------------------
create or replace function public.block_user(other uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if other = auth.uid() then
    raise exception 'You cannot block yourself';
  end if;

  insert into blocks (blocker_id, blocked_id)
  values (auth.uid(), other)
  on conflict do nothing;

  delete from friendships
  where (requester_id = auth.uid() and addressee_id = other)
     or (requester_id = other and addressee_id = auth.uid());

  -- Their slot in any session you're hosting goes too.
  delete from session_players sp
  using posts p
  where sp.post_id = p.id
    and p.author_id = auth.uid()
    and sp.user_id = other;
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;


create or replace function public.unblock_user(other uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from blocks
  where blocker_id = auth.uid() and blocked_id = other;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;


-- ------------------------------------------------------------
--  Who you've blocked, for the settings screen.
-- ------------------------------------------------------------
drop function if exists public.get_blocked();

create or replace function public.get_blocked()
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  created_at    timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  -- security definer because the profiles read policy hides blocked
  -- people from you - which is right everywhere except the one screen
  -- whose whole job is listing them.
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_preset,
    b.created_at
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.get_blocked() to authenticated;


-- ============================================================
--  Reports
--
--  Users can file them and cannot read them back - not even their
--  own. That's deliberate: a report queue readable by its subject
--  is a harassment vector, and "who reported me" is exactly the
--  question you never want answerable.
-- ============================================================

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  -- Who or what is being reported. At least one must be set.
  target_user uuid   references public.profiles(id) on delete cascade,
  target_post bigint references public.posts(id)    on delete cascade,
  reason      text not null,
  detail      text check (char_length(detail) <= 1000),
  status      text not null default 'open',
  created_at  timestamptz default now(),

  check (target_user is not null or target_post is not null),
  check (reason in (
    'harassment', 'spam', 'hate', 'sexual', 'threats',
    'impersonation', 'underage', 'other'
  ))
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "file your own reports" on public.reports;
create policy "file your own reports"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- No select policy at all. Reports are readable only with the service
-- key, which means only you, reviewing them.


create or replace function public.file_report(
  target_user_id uuid   default null,
  target_post_id bigint default null,
  reason         text   default 'other',
  detail         text   default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if target_user_id is null and target_post_id is null then
    raise exception 'Nothing to report';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  insert into reports (reporter_id, target_user, target_post, reason, detail)
  values (auth.uid(), target_user_id, target_post_id, reason, nullif(trim(detail), ''));
end;
$$;

grant execute on function public.file_report(uuid, bigint, text, text) to authenticated;

-- ============================================================
--  Done.
--
--  To review reports, run this in the SQL Editor:
--    select r.*, rep.username as reporter, tgt.username as reported
--    from reports r
--    join profiles rep on rep.id = r.reporter_id
--    left join profiles tgt on tgt.id = r.target_user
--    where r.status = 'open'
--    order by r.created_at desc;
-- ============================================================
