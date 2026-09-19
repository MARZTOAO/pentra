-- ============================================================
--  Why can't anyone join a session?
--
--  join_session() returns a status rather than raising an error, and
--  the card only says something for two of them ('full' and 'past').
--  Every other outcome refreshes the feed and looks, from the outside,
--  exactly like nothing happening.
--
--  This changes nothing. Paste it into the Supabase SQL Editor and
--  read the `would_join_return` column.
-- ============================================================

select
  p.id,
  left(p.body, 30)                              as post,
  g.name                                        as game,
  p.starts_at,
  p.slots,
  count(sp.user_id)                             as taken,
  case
    when p.kind <> 'lfg'                then 'not a session'
    when p.starts_at < now()            then '>>> past — cannot be joined'
    when count(sp.user_id) >= p.slots   then '>>> full'
    else 'joinable'
  end                                           as would_join_return
from posts p
left join session_players sp on sp.post_id = p.id
left join games g            on g.id = p.game_id
where p.kind = 'lfg'
group by p.id, p.body, g.name, p.starts_at, p.slots, p.kind
order by p.starts_at desc
limit 30;


-- ------------------------------------------------------------
--  And a summary, which is the line that matters.
-- ------------------------------------------------------------
select
  count(*)                                            as sessions_total,
  count(*) filter (where starts_at > now())           as still_in_the_future,
  count(*) filter (where starts_at <= now())          as already_started,
  min(starts_at)                                      as earliest,
  max(starts_at)                                      as latest,
  now()                                               as right_now
from posts
where kind = 'lfg';
