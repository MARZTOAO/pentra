-- ============================================================
--  109 — Chess in the Arcade.
--
--  MARZ (2026-10-08): single-player or multiplayer; pick who you
--  play; turn-based, so nobody has to be on at the same time; a
--  notification when it's your move; the host calls a coin flip to
--  decide who goes first.
--
--  The rules of chess run in the app (chess.js, src/arcade/chess*).
--  The database keeps the games between two players: who's in it,
--  whose move it is, the position, the move list, and the result.
--  Single-player games against the computer never touch the database.
--
--  WHAT THE DATABASE CHECKS, AND WHAT IT TRUSTS. It checks the game
--  is yours, that it's your turn, and that the position you send has
--  handed the move to the other side. It does NOT re-check that the
--  move itself was legal chess — that would mean a chess engine in
--  SQL. A game is between two people who chose each other, so the
--  worst a cheat achieves is spoiling their own friend's game.
--
--  THE COIN FLIP. The host calls heads or tails when they send the
--  challenge; the database flips. Call it right and the host is
--  white (moves first); wrong and the opponent is. Both see the call
--  and the result, so there's nothing to argue about.
--
--  NOTIFICATIONS. Four new kinds — challenged, accepted, your turn,
--  game over — with one new toggle ("Arcade games") and a new
--  `ref_id` column pointing at the chess game. Pushes go through the
--  existing push function (102), which learns the new kinds in its
--  next deploy.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The Arcade entry. No score per run, so no per-second cap.
-- ------------------------------------------------------------
insert into public.arcade_games (slug, name, tagline, max_per_second, hard_cap, sort_order)
values ('chess', 'Chess',
        'The old one. Play the computer, or challenge a friend and take your turns whenever.',
        0, 1, 5)
on conflict (slug) do update
  set name = excluded.name,
      tagline = excluded.tagline,
      max_per_second = excluded.max_per_second,
      sort_order = excluded.sort_order;


-- ------------------------------------------------------------
--  2. Games between two players.
-- ------------------------------------------------------------
create table if not exists public.chess_games (
  id            bigint generated always as identity primary key,
  host_id       uuid not null references public.profiles(id) on delete cascade,
  opponent_id   uuid not null references public.profiles(id) on delete cascade,
  -- The coin flip: what the host called, what came up, and who it made white.
  host_call     text not null check (host_call in ('heads', 'tails')),
  flip          text not null check (flip in ('heads', 'tails')),
  white_id      uuid not null references public.profiles(id) on delete cascade,
  black_id      uuid not null references public.profiles(id) on delete cascade,
  status        text not null default 'invited'
                  check (status in ('invited', 'active', 'finished', 'declined', 'cancelled')),
  -- The position, in FEN. Its second field says whose move it is.
  fen           text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  -- Every move so far, in standard notation, in order.
  moves         text[] not null default '{}',
  result        text check (result in ('white', 'black', 'draw')),
  result_reason text check (result_reason in ('checkmate', 'stalemate', 'resigned', 'draw_agreed',
                                              'insufficient', 'repetition', 'fifty_moves', 'timeout')),
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  last_move_at  timestamptz,
  finished_at   timestamptz,

  constraint chess_two_people check (host_id <> opponent_id),
  constraint chess_colours check (
    (white_id = host_id and black_id = opponent_id) or (white_id = opponent_id and black_id = host_id))
);

create index if not exists chess_games_host_idx     on public.chess_games (host_id, status);
create index if not exists chess_games_opponent_idx on public.chess_games (opponent_id, status);

alter table public.chess_games enable row level security;
revoke all on table public.chess_games from public, anon, authenticated;


-- ------------------------------------------------------------
--  3. Notifications: new kinds, a toggle, and a pointer to the game.
-- ------------------------------------------------------------
alter table public.notifications
  add column if not exists ref_id bigint;

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'friend_request', 'friend_accepted',
    'session_day', 'session_hour', 'friend_lfg',
    'post_mention', 'post_comment',
    'session_joined', 'session_left',
    'session_invite',
    'chess_challenge', 'chess_accepted', 'chess_turn', 'chess_result'));

alter table public.notification_settings
  add column if not exists arcade_games boolean not null default true;

-- Tell someone about a chess game, if their settings allow it.
create or replace function public.chess_notify(recipient uuid, n_kind text, actor uuid, game bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if recipient is null or recipient = actor then
    return;
  end if;
  if not coalesce((select arcade_games from notification_settings where user_id = recipient), true) then
    return;
  end if;
  insert into notifications (user_id, kind, actor_id, ref_id)
  values (recipient, n_kind, actor, game);
end;
$$;

revoke all on function public.chess_notify(uuid, text, uuid, bigint) from public, anon, authenticated;


-- The bell's list (33), plus ref_id. The return type changes, so the
-- old one is dropped first.
drop function if exists public.get_notifications(int);

create function public.get_notifications(max_results int default 30)
returns table (
  id            bigint,
  kind          text,
  created_at    timestamptz,
  read_at       timestamptz,
  actor_id      uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  post_id       bigint,
  game_name     text,
  starts_at     timestamptz,
  ref_id        bigint
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    n.id, n.kind, n.created_at, n.read_at,
    n.actor_id, a.username, a.display_name, a.avatar_url, a.avatar_preset,
    n.post_id, g.name, p.starts_at, n.ref_id
  from notifications n
  left join profiles a on a.id = n.actor_id
  left join posts    p on p.id = n.post_id
  left join games    g on g.id = p.game_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit max_results;
$$;

revoke all on function public.get_notifications(int) from public, anon;
grant execute on function public.get_notifications(int) to authenticated;


-- The push claim (102), plus ref_id on a notification. Same as 102
-- otherwise.
create or replace function public.push_claim(p_source text, p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  out jsonb;
begin
  if p_source not in ('notifications', 'messages') then
    return null;
  end if;

  insert into push_sent (source, ref_id) values (p_source, p_id)
  on conflict do nothing;
  if not found then
    return null;
  end if;

  if random() < 0.01 then
    delete from push_sent where sent_at < now() - interval '7 days';
  end if;

  if p_source = 'notifications' then
    select jsonb_build_object(
             'kind',      n.kind,
             'post_id',   n.post_id,
             'ref_id',    n.ref_id,
             'actor',     coalesce(nullif(btrim(a.display_name), ''), a.username),
             'actor_username', a.username,
             'game',      g.name,
             'tokens',    (select jsonb_agg(jsonb_build_object('token', t.token, 'env', t.env))
                             from push_tokens t where t.user_id = n.user_id))
      into out
      from notifications n
      left join profiles a on a.id = n.actor_id
      left join posts p    on p.id = n.post_id
      left join games g    on g.id = p.game_id
     where n.id = p_id
       and n.created_at > now() - interval '1 hour';
  else
    select jsonb_build_object(
             'kind',      'message',
             'conversation_id', m.conversation_id,
             'session',   c.kind <> 'direct',
             'actor',     coalesce(nullif(btrim(s.display_name), ''), s.username),
             'game',      coalesce(g.name, c.title),
             'body',      left(m.body, 300),
             'tokens',    (select jsonb_agg(jsonb_build_object('token', t.token, 'env', t.env))
                             from conversation_members cm
                             join push_tokens t on t.user_id = cm.user_id
                            where cm.conversation_id = m.conversation_id
                              and cm.user_id <> m.sender_id
                              and not exists (select 1 from blocks b
                                               where b.blocker_id = cm.user_id
                                                 and b.blocked_id = m.sender_id)))
      into out
      from messages m
      join conversations c on c.id = m.conversation_id
      left join profiles s on s.id = m.sender_id
      left join posts p    on p.id = c.post_id
      left join games g    on g.id = p.game_id
     where m.id = p_id
       and m.created_at > now() - interval '1 hour';
  end if;

  if out is null or out->'tokens' is null or out->'tokens' = 'null'::jsonb then
    return null;
  end if;
  return out;
end;
$$;

revoke all on function public.push_claim(text, bigint) from public, anon, authenticated;


-- ------------------------------------------------------------
--  4. One game, as either player sees it.
-- ------------------------------------------------------------
create or replace function public.chess_game_json(g public.chess_games)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'status', g.status,
    'fen', g.fen,
    'moves', to_jsonb(g.moves),
    'host_id', g.host_id,
    'opponent_id', g.opponent_id,
    'host_call', g.host_call,
    'flip', g.flip,
    'white_id', g.white_id,
    'black_id', g.black_id,
    'turn_id', case when g.status <> 'active' then null
                    when split_part(g.fen, ' ', 2) = 'w' then g.white_id else g.black_id end,
    'result', g.result,
    'result_reason', g.result_reason,
    'created_at', g.created_at,
    'started_at', g.started_at,
    'last_move_at', g.last_move_at,
    'finished_at', g.finished_at,
    'white', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                        'avatar_url', p.avatar_url, 'avatar_preset', p.avatar_preset)
                from profiles p where p.id = g.white_id),
    'black', (select jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
                                        'avatar_url', p.avatar_url, 'avatar_preset', p.avatar_preset)
                from profiles p where p.id = g.black_id))
$$;

revoke all on function public.chess_game_json(public.chess_games) from public, anon, authenticated;


create or replace function public.chess_game(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.chess_game_json(g)
    from chess_games g
   where g.id = p_id
     and auth.uid() in (g.host_id, g.opponent_id)
$$;

revoke all on function public.chess_game(bigint) from public, anon;
grant execute on function public.chess_game(bigint) to authenticated;


-- Your games: your move first, then waiting on them, then challenges,
-- then the last 20 finished.
create or replace function public.my_chess_games()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.chess_game_json(g) order by
           case when g.status = 'active'
                 and ((split_part(g.fen, ' ', 2) = 'w' and g.white_id = auth.uid())
                   or (split_part(g.fen, ' ', 2) = 'b' and g.black_id = auth.uid())) then 0
                when g.status = 'active' then 1
                when g.status = 'invited' then 2
                else 3 end,
           coalesce(g.last_move_at, g.created_at) desc), '[]'::jsonb)
    from (
      select * from chess_games x
       where auth.uid() in (x.host_id, x.opponent_id)
         and (x.status in ('invited', 'active')
              or x.finished_at > now() - interval '30 days')
       order by coalesce(x.finished_at, x.last_move_at, x.created_at) desc
       limit 60
    ) g
$$;

revoke all on function public.my_chess_games() from public, anon;
grant execute on function public.my_chess_games() to authenticated;


-- Wins, losses and draws against people, for the Arcade card.
create or replace function public.chess_record(p_user uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'wins',   count(*) filter (where (g.result = 'white' and g.white_id = u) or (g.result = 'black' and g.black_id = u)),
    'losses', count(*) filter (where (g.result = 'white' and g.black_id = u) or (g.result = 'black' and g.white_id = u)),
    'draws',  count(*) filter (where g.result = 'draw'))
    from (select coalesce(p_user, auth.uid()) as u) me
    cross join chess_games g
   where g.status = 'finished' and me.u in (g.white_id, g.black_id)
$$;

revoke all on function public.chess_record(uuid) from public, anon;
grant execute on function public.chess_record(uuid) to authenticated;


-- ------------------------------------------------------------
--  5. Challenging someone.
-- ------------------------------------------------------------
create or replace function public.chess_challenge(p_opponent uuid, p_call text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  coin text;
  g    public.chess_games;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  if p_opponent is null or p_opponent = me then
    return jsonb_build_object('error', 'Pick someone else to play.');
  end if;
  if p_call not in ('heads', 'tails') then
    return jsonb_build_object('error', 'Call heads or tails.');
  end if;
  if not public.can_message(p_opponent) then
    return jsonb_build_object('error', 'You can''t challenge that player.');
  end if;
  if exists (select 1 from chess_games
              where status in ('invited', 'active')
                and ((host_id = me and opponent_id = p_opponent)
                  or (host_id = p_opponent and opponent_id = me))) then
    return jsonb_build_object('error', 'You already have a game going with them.');
  end if;
  if (select count(*) from chess_games where host_id = me and status = 'invited') >= 10 then
    return jsonb_build_object('error', 'You have 10 challenges waiting already.');
  end if;

  coin := case when random() < 0.5 then 'heads' else 'tails' end;

  insert into chess_games (host_id, opponent_id, host_call, flip, white_id, black_id)
  values (me, p_opponent, p_call, coin,
          case when coin = p_call then me else p_opponent end,
          case when coin = p_call then p_opponent else me end)
  returning * into g;

  perform public.chess_notify(p_opponent, 'chess_challenge', me, g.id);

  return public.chess_game_json(g);
end;
$$;

revoke all on function public.chess_challenge(uuid, text) from public, anon;
grant execute on function public.chess_challenge(uuid, text) to authenticated;


-- Accept or decline a challenge; the host can cancel one.
create or replace function public.chess_respond(p_id bigint, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  g  public.chess_games;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or me not in (g.host_id, g.opponent_id) then
    return jsonb_build_object('error', 'No such game.');
  end if;
  if g.status <> 'invited' then
    return jsonb_build_object('error', 'That challenge has already been answered.');
  end if;

  if me = g.host_id then
    if p_accept then
      return jsonb_build_object('error', 'Waiting on them, not you.');
    end if;
    update chess_games set status = 'cancelled', finished_at = now() where id = p_id returning * into g;
    return public.chess_game_json(g);
  end if;

  if p_accept then
    update chess_games set status = 'active', started_at = now() where id = p_id returning * into g;
    perform public.chess_notify(g.host_id, 'chess_accepted', me, g.id);
    -- If the host is white, it's their move now.
    if g.white_id = g.host_id then
      perform public.chess_notify(g.host_id, 'chess_turn', me, g.id);
    end if;
  else
    update chess_games set status = 'declined', finished_at = now() where id = p_id returning * into g;
  end if;

  return public.chess_game_json(g);
end;
$$;

revoke all on function public.chess_respond(bigint, boolean) from public, anon;
grant execute on function public.chess_respond(bigint, boolean) to authenticated;


-- ------------------------------------------------------------
--  6. Moving. The app sends the move and the position after it, and
--     the result if that move ended the game.
-- ------------------------------------------------------------
create or replace function public.chess_move(
  p_id bigint, p_san text, p_fen text, p_result text default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  g     public.chess_games;
  turn  text;
  other uuid;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or me not in (g.host_id, g.opponent_id) then
    return jsonb_build_object('error', 'No such game.');
  end if;
  if g.status <> 'active' then
    return jsonb_build_object('error', 'That game isn''t in play.');
  end if;

  turn := split_part(g.fen, ' ', 2);
  if (turn = 'w' and me <> g.white_id) or (turn = 'b' and me <> g.black_id) then
    return jsonb_build_object('error', 'It''s not your move.');
  end if;

  -- The new position must hand the move over, and look like a FEN.
  if p_fen is null or array_length(string_to_array(p_fen, ' '), 1) <> 6
     or split_part(p_fen, ' ', 2) = turn
     or split_part(p_fen, ' ', 2) not in ('w', 'b') then
    return jsonb_build_object('error', 'That position doesn''t follow from the last one.');
  end if;
  if p_san is null or p_san !~ '^[KQRBNOa-h0-9x+#=\-]{2,10}$' then
    return jsonb_build_object('error', 'That isn''t a chess move.');
  end if;
  if p_result is not null and p_result not in ('white', 'black', 'draw') then
    return jsonb_build_object('error', 'Unknown result.');
  end if;

  other := case when me = g.white_id then g.black_id else g.white_id end;

  update chess_games
     set fen = p_fen,
         moves = array_append(moves, p_san),
         last_move_at = now(),
         status = case when p_result is null then 'active' else 'finished' end,
         result = p_result,
         result_reason = case when p_result is null then null
                              else coalesce(p_reason, case when p_result = 'draw' then 'stalemate' else 'checkmate' end) end,
         finished_at = case when p_result is null then null else now() end
   where id = p_id
   returning * into g;

  if g.status = 'finished' then
    perform public.chess_notify(other, 'chess_result', me, g.id);
  else
    perform public.chess_notify(other, 'chess_turn', me, g.id);
  end if;

  return public.chess_game_json(g);
end;
$$;

revoke all on function public.chess_move(bigint, text, text, text, text) from public, anon;
grant execute on function public.chess_move(bigint, text, text, text, text) to authenticated;


-- Resign. The other player wins.
create or replace function public.chess_resign(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me    uuid := auth.uid();
  g     public.chess_games;
  other uuid;
begin
  select * into g from chess_games where id = p_id for update;
  if g.id is null or me not in (g.host_id, g.opponent_id) then
    return jsonb_build_object('error', 'No such game.');
  end if;
  if g.status <> 'active' then
    return jsonb_build_object('error', 'That game isn''t in play.');
  end if;

  other := case when me = g.white_id then g.black_id else g.white_id end;

  update chess_games
     set status = 'finished',
         result = case when me = g.white_id then 'black' else 'white' end,
         result_reason = 'resigned',
         finished_at = now()
   where id = p_id
   returning * into g;

  perform public.chess_notify(other, 'chess_result', me, g.id);
  return public.chess_game_json(g);
end;
$$;

revoke all on function public.chess_resign(bigint) from public, anon;
grant execute on function public.chess_resign(bigint) to authenticated;


-- ------------------------------------------------------------
--  7. What's New.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('New in the Arcade: Chess',
     'Play the computer at three levels, or challenge a friend. Friend games are turn-based: take your move whenever, and get a notification when it''s your turn. The host calls a coin flip for who plays white.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
