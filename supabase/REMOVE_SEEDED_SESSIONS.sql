-- ============================================================
--  Remove the sessions posted by seeded accounts.
--
--  Narrower than wiping the accounts: this deletes only their LFG
--  posts. The accounts stay, their profiles stay, their ordinary text
--  posts stay — so Find Players still looks populated, the feed still
--  has something in it, and only the sessions nobody was ever going
--  to turn up to are gone.
--
--  PERMANENT. NO UNDO. Run CHECK_SEEDED_SESSIONS.sql first and read
--  what it lists — that is exactly what this deletes.
--
--  Wrapped in a transaction that ends with COMMIT. Run it as one
--  block; if the counts near the end look wrong, run ROLLBACK;
--
--  What goes with each session, by foreign key:
--    session_players   the roster
--    session_invites   any pending invites
--    post_likes        likes on the session post
--    post_comments     replies to it
--    post_mentions     tags in its body
--    notifications     anything pointing at that post
--
--  What deliberately STAYS:
--    session_attendance  the play history. It has no foreign key to
--                        posts on purpose, so deleting a session does
--                        not erase the fact that people turned up to
--                        it. That is what keeps "sessions joined" and
--                        "played with" honest on real profiles.
--    profile_stats       lifetime counters only ever go up, so no
--                        real person's numbers fall.
--    achievements        already earned stays earned.
-- ============================================================


-- ============================================================
--  The delete.
-- ============================================================

begin;

-- Tidy the full-house ledger for those posts first. It has no foreign
-- key to posts (by design — it is a permanent record of what happened),
-- so nothing would clean it up automatically, and a row pointing at a
-- post that no longer exists is just litter.
delete from public.session_full_houses sfh
 where sfh.post_id in (
   select p.id from public.posts p
   join auth.users u on u.id = p.author_id
   where p.kind = 'lfg' and u.email like '%@example.test'
 );

-- The sessions themselves. Everything in the list at the top of this
-- file goes with them.
with doomed as (
  select p.id
    from public.posts p
    join auth.users u on u.id = p.author_id
   where p.kind = 'lfg'
     and u.email like '%@example.test'
)
delete from public.posts
 where id in (select id from doomed);

-- What is left, so you can check before committing.
select
  'after' as section,
  (select count(*) from public.posts p join auth.users u on u.id = p.author_id
    where p.kind = 'lfg' and u.email like '%@example.test')     as seeded_sessions_left,
  (select count(*) from public.posts p join auth.users u on u.id = p.author_id
    where p.kind = 'lfg' and u.email not like '%@example.test') as real_sessions,
  (select count(*) from public.posts p join auth.users u on u.id = p.author_id
    where p.kind = 'text' and u.email like '%@example.test')    as seeded_text_posts_kept;

commit;

-- ============================================================
--  Done. Seeded accounts and their ordinary posts are untouched.
-- ============================================================
