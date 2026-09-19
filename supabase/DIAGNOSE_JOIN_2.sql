-- ============================================================
--  Round two. Seven sessions are still in the future, so "past" is
--  not the reason. That leaves two possibilities:
--
--    A. join_session() returns a status the card says nothing about
--       ('already', 'unavailable', 'not_session', 'missing') and the
--       feed just refreshes, which looks like a dead button.
--
--    B. The insert itself is being rejected or is throwing — most
--       likely in the AFTER INSERT trigger added by 27_session_chat,
--       which creates the session's group chat.
--
--  Check A first, then B. Replace YOUR_USERNAME in both.
--  Nothing here changes any data: B runs inside a transaction that
--  is rolled back.
-- ============================================================


-- ------------------------------------------------------------
--  A. What would join_session return for you, per session?
-- ------------------------------------------------------------
with me as (
  select id from profiles where username = 'YOUR_USERNAME'
)
select
  p.id,
  left(p.body, 28)                 as post,
  p.starts_at,
  p.slots,
  (select count(*) from session_players sp where sp.post_id = p.id) as taken,
  case
    when p.kind <> 'lfg'    then 'not_session'
    when p.starts_at < now() then 'past'
    when exists (
      select 1 from session_players sp
      where sp.post_id = p.id and sp.user_id = (select id from me)
    )                        then '>>> already — you are in this one'
    when (select count(*) from session_players sp where sp.post_id = p.id)
         >= p.slots          then '>>> full'
    else 'should join fine'
  end                              as join_would_return
from posts p
where p.kind = 'lfg'
  and p.starts_at > now()
order by p.starts_at;


-- ------------------------------------------------------------
--  B. Does the insert actually work?
--
--  This is the real test: it exercises the row-level security policy
--  AND the group-chat trigger. If something is throwing, the error
--  appears here with the function name in it.
--
--  Put a session id from A above into <SESSION_ID>. Rolled back, so
--  it leaves nothing behind either way.
-- ------------------------------------------------------------
begin;

insert into session_players (post_id, user_id)
values (
  <SESSION_ID>,
  (select id from profiles where username = 'YOUR_USERNAME')
);

-- If you get here, the insert and the trigger both worked.
select 'insert + trigger both OK' as result;

rollback;
