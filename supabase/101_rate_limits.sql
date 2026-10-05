-- ============================================================
--  101 — Rate limits: how fast one account can act.
--
--  Report, block and the moderation queue deal with a bad account once
--  somebody notices it. Nothing stopped one account — a bot, or a
--  person with a script — from sending hundreds of messages, friend
--  requests or posts a minute before then. These caps are far above
--  what a real player does, and low enough that a spam account does
--  little damage before it's reported.
--
--  Enforced here, on every way in (the app, the API, a script with the
--  public key), by a trigger before each insert. Not applied to the
--  service role (seed scripts, Edge Functions — auth.uid() is null
--  there) or to developers.
--
--  Over a limit, the insert fails with a message that starts "Slow
--  down" (errcode P0001), which the app shows as it is.
--
--  TO CHANGE A NUMBER: re-run the `create trigger` line for that table
--  with new arguments. Each trigger takes pairs of (limit, window).
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. One check for every table.
--
--  Trigger arguments: the column holding the acting account, then any
--  number of (limit, window) pairs. "15, 1 minute" means: refuse the
--  16th row this account adds within one minute.
-- ------------------------------------------------------------
create or replace function public.enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who_col text := tg_argv[0];
  who     uuid;
  i       int := 1;
  lim     int;
  win     interval;
  n       bigint;
begin
  if auth.uid() is null or public.am_i_developer() then
    return new;
  end if;

  execute format('select ($1).%I', who_col) into who using new;
  if who is null or who <> auth.uid() then
    return new;
  end if;

  while i < tg_nargs loop
    lim := tg_argv[i]::int;
    win := tg_argv[i + 1]::interval;
    execute format(
      'select count(*) from %I.%I where %I = $1 and created_at > now() - $2',
      tg_table_schema, tg_table_name, who_col)
      into n using who, win;
    if n >= lim then
      raise exception using
        errcode = 'P0001',
        message = 'Slow down — you''re doing that too fast. Try again in a few minutes.',
        hint = format('%s: %s per %s', tg_table_name, lim, win);
    end if;
    i := i + 2;
  end loop;

  return new;
end;
$$;

revoke all on function public.enforce_rate_limit() from public, anon, authenticated;


-- ------------------------------------------------------------
--  2. Messages: speed, and how many NEW people an account messages.
--
--  A spam bot's signature is writing to lots of people it has never
--  talked to. This counts conversations this account has written in
--  that were created in the last hour — so being messaged by lots of
--  people doesn't count against you, only reaching out does.
-- ------------------------------------------------------------
create or replace function public.enforce_new_conversation_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fresh_convos bigint;
begin
  if auth.uid() is null or new.sender_id is distinct from auth.uid()
     or public.am_i_developer() then
    return new;
  end if;

  -- Only matters when this message starts a new thread for them.
  if exists (select 1 from public.messages m
              where m.conversation_id = new.conversation_id
                and m.sender_id = new.sender_id) then
    return new;
  end if;

  select count(distinct m.conversation_id) into fresh_convos
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where m.sender_id = new.sender_id
     and m.created_at > now() - interval '1 hour'
     and c.created_at > now() - interval '1 hour';

  if fresh_convos >= 20 then
    raise exception using
      errcode = 'P0001',
      message = 'Slow down — you''ve started a lot of new chats this hour. Try again later.',
      hint = 'messages: 20 new conversations per hour';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_new_conversation_limit() from public, anon, authenticated;


-- ------------------------------------------------------------
--  3. Indexes, so each check is a quick lookup.
-- ------------------------------------------------------------
create index if not exists messages_sender_time_idx        on public.messages        (sender_id,   created_at);
create index if not exists friendships_requester_time_idx  on public.friendships     (requester_id, created_at);
create index if not exists posts_author_time_idx           on public.posts           (author_id,   created_at);
create index if not exists post_comments_author_time_idx   on public.post_comments   (author_id,   created_at);
create index if not exists post_likes_user_time_idx        on public.post_likes      (user_id,     created_at);
create index if not exists session_invites_inviter_time_idx on public.session_invites (inviter_id, created_at);
create index if not exists reports_reporter_time_idx       on public.reports         (reporter_id, created_at);
create index if not exists game_requests_user_time_idx     on public.game_requests   (user_id,     created_at);


-- ------------------------------------------------------------
--  4. The limits.
-- ------------------------------------------------------------

-- Chat: 15 a minute, 300 an hour; 20 new conversations an hour.
drop trigger if exists rate_limit on public.messages;
create trigger rate_limit before insert on public.messages
  for each row execute function public.enforce_rate_limit('sender_id', '15', '1 minute', '300', '1 hour');
drop trigger if exists rate_limit_new_chats on public.messages;
create trigger rate_limit_new_chats before insert on public.messages
  for each row execute function public.enforce_new_conversation_limit();

-- Friend requests: 30 an hour, 100 a day.
drop trigger if exists rate_limit on public.friendships;
create trigger rate_limit before insert on public.friendships
  for each row execute function public.enforce_rate_limit('requester_id', '30', '1 hour', '100', '1 day');

-- Posts and sessions: 10 an hour, 40 a day.
drop trigger if exists rate_limit on public.posts;
create trigger rate_limit before insert on public.posts
  for each row execute function public.enforce_rate_limit('author_id', '10', '1 hour', '40', '1 day');

-- Comments: 20 in ten minutes, 200 a day.
drop trigger if exists rate_limit on public.post_comments;
create trigger rate_limit before insert on public.post_comments
  for each row execute function public.enforce_rate_limit('author_id', '20', '10 minutes', '200', '1 day');

-- Likes: 100 in ten minutes (each one can notify somebody).
drop trigger if exists rate_limit on public.post_likes;
create trigger rate_limit before insert on public.post_likes
  for each row execute function public.enforce_rate_limit('user_id', '100', '10 minutes');

-- Session invites: 50 an hour.
drop trigger if exists rate_limit on public.session_invites;
create trigger rate_limit before insert on public.session_invites
  for each row execute function public.enforce_rate_limit('inviter_id', '50', '1 hour');

-- Reports: 20 an hour, so the moderation queue can't be flooded.
drop trigger if exists rate_limit on public.reports;
create trigger rate_limit before insert on public.reports
  for each row execute function public.enforce_rate_limit('reporter_id', '20', '1 hour');

-- Game requests: 10 a day.
drop trigger if exists rate_limit on public.game_requests;
create trigger rate_limit before insert on public.game_requests
  for each row execute function public.enforce_rate_limit('user_id', '10', '1 day');


-- ------------------------------------------------------------
--  5. What's New.
-- ------------------------------------------------------------
insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Keeping spam bots out',
     'Pentra now caps how fast one account can send messages, friend requests, posts and comments, and new accounts get a quick check that there''s a real person behind them. Normal play never comes close to the limits.',
     'improvement', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
