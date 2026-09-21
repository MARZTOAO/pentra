-- ============================================================
--  What sessions have the seeded accounts posted?
--
--  READ-ONLY. Changes nothing. Run this first; the companion file
--  REMOVE_SEEDED_SESSIONS.sql is the one that deletes.
-- ============================================================

-- ============================================================
--  A. LOOK FIRST — read-only.
-- ============================================================

select
  'A1. sessions that would be deleted' as section,
  u.email,
  p.id                                                   as post_id,
  left(p.body, 40)                                       as body,
  p.starts_at,
  p.starts_at > now()                                    as still_upcoming,
  (select count(*) from public.session_players sp
    where sp.post_id = p.id)                             as players_on_roster
from public.posts p
join auth.users u on u.id = p.author_id
where p.kind = 'lfg'
  and u.email like '%@example.test'
order by p.starts_at;


select
  'A2. totals' as section,
  count(*) filter (where u.email like '%@example.test')      as seeded_sessions,
  count(*) filter (where u.email not like '%@example.test')  as real_sessions_untouched
from public.posts p
join auth.users u on u.id = p.author_id
where p.kind = 'lfg';


-- The one to read carefully: real people who are on the roster of a
-- seeded session. They will quietly drop off it. Nothing of theirs is
-- lost — their attendance history and counters are untouched — but
-- the session itself disappears from their My Sessions list.
select
  'A3. real players on seeded sessions' as section,
  pr.username,
  count(*) as sessions_they_are_in
from public.session_players sp
join public.posts p   on p.id = sp.post_id
join auth.users host  on host.id = p.author_id
join public.profiles pr on pr.id = sp.user_id
join auth.users pu    on pu.id = sp.user_id
where p.kind = 'lfg'
  and host.email like '%@example.test'
  and pu.email not like '%@example.test'
group by pr.username
order by pr.username;


