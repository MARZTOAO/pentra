-- ============================================================
--  102 — Push notifications to phones (iPhone app).
--
--  How a push happens:
--
--    1. Something lands in `notifications` (already filtered by the
--       person's settings in push_notification(), 42) or in
--       `messages`.
--    2. A trigger here asks the 'push' Edge Function to deliver it,
--       sending only the table and the row id — nothing secret.
--    3. The function calls push_claim() below. That records the row
--       in push_sent (so nothing is ever pushed twice), and hands back
--       what the push should say and which phones to send it to.
--    4. The function sends it through Apple (APNs).
--
--  Because push_claim() only ever sends a real notification to its
--  real recipient, and only once, the Edge Function needs no password:
--  calling it by hand can't make it say or send anything new.
--
--  Phones register through register_push_token() when the app starts
--  signed in, and unregister on sign-out. A token is one app install
--  on one phone; signing in as someone else moves it to them.
--
--  ONE-TIME SETUP, after running this file (not in the repo — it's
--  your project's own address):
--
--    select vault.create_secret(
--      'https://<your-project>.supabase.co/functions/v1/push',
--      'push_function_url');
--
--  Until that secret exists, the triggers do nothing at all.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

create extension if not exists pg_net;


-- ------------------------------------------------------------
--  1. Phones.
-- ------------------------------------------------------------
create table if not exists public.push_tokens (
  token      text primary key check (token ~ '^[0-9a-f]{32,200}$'),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text not null default 'ios' check (platform in ('ios')),
  -- Which Apple push server knows this token. Builds from Xcode's Play
  -- button use the sandbox; TestFlight and the App Store use
  -- production. The Edge Function finds out on first send and fixes it.
  env        text not null default 'production' check (env in ('production', 'sandbox')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
revoke all on table public.push_tokens from public, anon, authenticated;


-- The app calls this with the token iOS gave it.
create or replace function public.register_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(coalesce(p_token, '')));
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if t !~ '^[0-9a-f]{32,200}$' then
    raise exception 'not a push token';
  end if;

  insert into push_tokens (token, user_id)
  values (t, auth.uid())
  on conflict (token) do update
    set user_id = excluded.user_id, updated_at = now();

  -- Ten phones per account is plenty; drop the stalest beyond that.
  delete from push_tokens
   where user_id = auth.uid()
     and token not in (select token from push_tokens
                        where user_id = auth.uid()
                        order by updated_at desc limit 10);
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from push_tokens
   where token = lower(btrim(coalesce(p_token, ''))) and user_id = auth.uid();
$$;

revoke all on function public.register_push_token(text)   from public, anon;
revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text)   to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;


-- ------------------------------------------------------------
--  2. What has been pushed.
-- ------------------------------------------------------------
create table if not exists public.push_sent (
  source  text   not null check (source in ('notifications', 'messages')),
  ref_id  bigint not null,
  sent_at timestamptz not null default now(),
  primary key (source, ref_id)
);

alter table public.push_sent enable row level security;
revoke all on table public.push_sent from public, anon, authenticated;


-- ------------------------------------------------------------
--  3. The claim: called by the Edge Function (service role only).
--
--  Returns what to say and where to send it, or null when there's
--  nothing to do (already pushed, too old, nobody with a phone).
-- ------------------------------------------------------------
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
    return null; -- already pushed
  end if;

  -- Housekeeping, now and then: the record only needs to outlive
  -- retries, not forever.
  if random() < 0.01 then
    delete from push_sent where sent_at < now() - interval '7 days';
  end if;

  if p_source = 'notifications' then
    select jsonb_build_object(
             'kind',      n.kind,
             'post_id',   n.post_id,
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
             'game',      g.name,
             'body',      left(m.body, 300),
             'tokens',    (select jsonb_agg(jsonb_build_object('token', t.token, 'env', t.env))
                             from conversation_members cm
                             join push_tokens t on t.user_id = cm.user_id
                            where cm.conversation_id = m.conversation_id
                              and cm.user_id <> m.sender_id
                              -- Not from someone they've blocked.
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

-- Token upkeep from the Edge Function: Apple says it's on the other
-- server ('sandbox'/'production'), or that it's dead (null → delete).
create or replace function public.push_token_update(p_token text, p_env text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_env is null then
    delete from push_tokens where token = p_token;
  else
    update push_tokens set env = p_env, updated_at = now() where token = p_token;
  end if;
end;
$$;

revoke all on function public.push_claim(text, bigint)        from public, anon, authenticated;
revoke all on function public.push_token_update(text, text)   from public, anon, authenticated;


-- ------------------------------------------------------------
--  4. The triggers: tell the Edge Function something happened.
--
--  Only bothers when somebody who'd receive it has a phone
--  registered, and never lets a problem here block the insert itself
--  — a notification without a push is fine, a lost message is not.
-- ------------------------------------------------------------
create or replace function public.push_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  url text;
begin
  if tg_table_name = 'notifications' then
    if not exists (select 1 from push_tokens where user_id = new.user_id) then
      return null;
    end if;
  else
    if not exists (select 1 from conversation_members cm
                     join push_tokens t on t.user_id = cm.user_id
                    where cm.conversation_id = new.conversation_id
                      and cm.user_id <> new.sender_id) then
      return null;
    end if;
  end if;

  select decrypted_secret into url
    from vault.decrypted_secrets where name = 'push_function_url' limit 1;
  if url is null then
    return null;
  end if;

  perform net.http_post(
    url     := url,
    body    := jsonb_build_object('source', tg_table_name, 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return null;
exception when others then
  return null;
end;
$$;

revoke all on function public.push_after_insert() from public, anon, authenticated;

drop trigger if exists push_after_insert on public.notifications;
create trigger push_after_insert after insert on public.notifications
  for each row execute function public.push_after_insert();

drop trigger if exists push_after_insert on public.messages;
create trigger push_after_insert after insert on public.messages
  for each row execute function public.push_after_insert();
