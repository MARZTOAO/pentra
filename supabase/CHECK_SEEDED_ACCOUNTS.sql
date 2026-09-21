-- ============================================================
--  What would `npm run seed-players -- --wipe` actually delete?
--
--  Read-only. Changes nothing. Run this BEFORE the wipe, because the
--  wipe is permanent and there is no undo.
--
--  The seed scripts only ever create accounts on @example.test — a
--  reserved domain that cannot receive mail, which is exactly why it
--  was chosen as the marker. The wipe keys off the same thing, so
--  what section A lists below is precisely what goes.
-- ============================================================


-- ------------------------------------------------------------
--  A. The seeded accounts, and what each one is carrying.
--
--  Everything in these columns disappears with the account: deleting
--  the auth user cascades through profiles, posts, comments, likes,
--  session rosters and friendships.
-- ------------------------------------------------------------
select
  'A. would be deleted' as section,
  u.email,
  p.username,
  p.created_at,
  (select count(*) from public.posts        x where x.author_id = p.id) as posts,
  (select count(*) from public.post_comments x where x.author_id = p.id) as comments,
  (select count(*) from public.friendships  f
    where f.requester_id = p.id or f.addressee_id = p.id)                as friendships
from auth.users u
join public.profiles p on p.id = u.id
where u.email like '%@example.test'
order by p.created_at;


-- ------------------------------------------------------------
--  B. The one line that matters: fake versus real.
--
--  If `real_accounts` is not the number of actual people you expect,
--  STOP and do not run the wipe.
-- ------------------------------------------------------------
select
  'B. totals' as section,
  count(*) filter (where u.email like '%@example.test')     as seeded_accounts,
  count(*) filter (where u.email not like '%@example.test')  as real_accounts
from auth.users u;


-- ------------------------------------------------------------
--  C. Where real accounts are entangled with the fake ones.
--
--  These rows belong to real people and will ALSO go, because they
--  point at an account that is about to stop existing. None of it is
--  damage — a friendship with somebody who no longer exists is not a
--  friendship — but it is worth seeing before rather than after.
--
--  Lifetime counters are unaffected by design: posts_made and
--  sessions_joined only ever go up, so nobody's stats fall. Live
--  figures do move — friends_now drops, and "played with" drops for
--  anyone whose only sessions were with seeded accounts.
-- ------------------------------------------------------------
select
  'C. real accounts affected' as section,
  p.username,
  (select count(*) from public.friendships f
    join auth.users fu
      on fu.id = case when f.requester_id = p.id then f.addressee_id
                      else f.requester_id end
    where (f.requester_id = p.id or f.addressee_id = p.id)
      and fu.email like '%@example.test')                as friendships_lost,
  (select count(*) from public.session_attendance a
    join auth.users au on au.id = a.user_id
    where a.post_id in (select post_id from public.session_attendance
                         where user_id = p.id)
      and au.email like '%@example.test')                as co_players_lost
from public.profiles p
join auth.users u on u.id = p.id
where u.email not like '%@example.test'
order by p.username;
