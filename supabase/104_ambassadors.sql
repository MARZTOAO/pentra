-- ============================================================
--  104 — Ambassadors: creators see their own numbers in the app.
--
--  Until now only a developer could see what a creator code had
--  brought in (DevPanel → Creators). Now a code can be linked to the
--  creator's own Pentra account, and that account gets an Ambassador
--  page showing exactly what the developer sees for that one code:
--  sign-ups, Pro subscribers, what's pending, earned, paid and owed.
--  Nobody else can see it, and an ambassador sees only their own code
--  (plus the top 3 of last month, names and counts only).
--
--  WHAT CHANGES
--    1. New payout rates (MARZ, 2026-10-07):
--         $1.00 per monthly / $10 per yearly subscriber for a
--         creator's first 100, then $1.50 / $15.
--       (Was $0.50 / $10 for the first 1,000, then $1.00 / $15.)
--       Earnings are worked out from the rates each time they're
--       shown, so signups already counted move to the new rates too.
--       Every rate went up or stayed the same, so nobody's total goes
--       down and nobody turns "overpaid".
--    2. creator_codes.user_id — the creator's own account (optional).
--    3. creator_signups — new accounts that arrived through a creator's
--       link (pentra.gg/?creator=CODE). Before this, a creator link
--       only pre-filled the code at checkout; free sign-ups through it
--       weren't counted anywhere. Same rules as player invites (46):
--       new accounts only (7 days), once per account, and the creator
--       only gets credit for "started playing" once the person has
--       played a session or made 3 friends.
--    4. Functions: record_creator_signup (the app), am_i_ambassador,
--       my_ambassador, ambassador_leaderboard (ambassadors),
--       dev_creator_link and an updated dev_creator_codes (developers).
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. The rates.
-- ------------------------------------------------------------

create or replace function public.creator_rate_cents(p_plan text, p_n bigint)
returns integer language sql immutable as $$
  select case
           when p_plan = 'yearly' then case when p_n <= 100 then 1000 else 1500 end
           else                        case when p_n <= 100 then 100  else 150  end
         end
$$;

-- The tier size, for the pages that explain it.
create or replace function public.creator_tier_size()
returns integer language sql immutable as $$ select 100 $$;


-- ------------------------------------------------------------
--  2. Linking a code to an account.
-- ------------------------------------------------------------

alter table public.creator_codes
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

-- One code per account: an ambassador page shows one code.
create unique index if not exists creator_codes_user_idx
  on public.creator_codes (user_id) where user_id is not null;


-- ------------------------------------------------------------
--  3. Sign-ups through a creator's link.
-- ------------------------------------------------------------

create table if not exists public.creator_signups (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  code       text not null references public.creator_codes(code) on update cascade,
  created_at timestamptz not null default now()
);

create index if not exists creator_signups_code_idx
  on public.creator_signups (code, created_at);

alter table public.creator_signups enable row level security;
revoke all on table public.creator_signups from public, anon, authenticated;


-- "Started playing": the same bar as player invites (46) — a session
-- played or 3 friends made. Worked out when asked, from profile_stats.
create or replace function public.is_playing(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select s.sessions_joined >= 1 or s.friends_peak >= 3
      from public.profile_stats s where s.user_id = target
  ), false)
$$;

revoke all on function public.is_playing(uuid) from public, anon, authenticated;


-- Called by the app once someone is signed in, if they arrived on a
-- creator link. Returns what happened; only 'recorded' means anything.
create or replace function public.record_creator_signup(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  norm   text := public.normalize_creator_code(p_code);
  joined timestamptz;
begin
  if me is null then
    return 'signed_out';
  end if;
  if norm is null then
    return 'no_code';
  end if;

  if exists (select 1 from public.creator_signups where user_id = me) then
    return 'already';
  end if;

  -- New accounts only: an old account opening a creator link isn't a
  -- sign-up that creator brought in.
  select coalesce(pr.created_at, now()) into joined
    from public.profiles pr where pr.id = me;
  if not found then
    return 'no_profile';
  end if;
  if joined < now() - interval '7 days' then
    return 'too_late';
  end if;

  if not exists (select 1 from public.creator_codes c where c.code = norm and c.active) then
    return 'unknown_code';
  end if;

  -- A creator's own account doesn't count as their sign-up.
  if exists (select 1 from public.creator_codes c where c.code = norm and c.user_id = me) then
    return 'self';
  end if;

  insert into public.creator_signups (user_id, code) values (me, norm)
  on conflict (user_id) do nothing;
  return 'recorded';
end;
$$;

revoke all on function public.record_creator_signup(text) from public, anon;
grant execute on function public.record_creator_signup(text) to authenticated;


-- ------------------------------------------------------------
--  4. One code's numbers. Shared by the developer list and the
--     ambassador page, so the two can never disagree.
-- ------------------------------------------------------------

create or replace function public.creator_stats(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  win interval := make_interval(days => public.refund_window_days());
  this_month timestamptz := date_trunc('month', now());
  last_month timestamptz := date_trunc('month', now()) - interval '1 month';
begin
  return (
    with subs as (
      select bp.invoice_id, bp.plan, bp.paid_at, bp.refunded_at, bp.disputed_at,
             bp.refunded_at is null and bp.disputed_at is null
               and bp.paid_at <= now() - win as payable,
             bp.refunded_at is null and bp.disputed_at is null
               and bp.paid_at >  now() - win as pending
        from public.billing_payments bp
       where bp.first_payment and bp.creator_code = p_code
    ),
    ranked as (
      -- The tier counts per creator, monthly and yearly together, in
      -- the order the signups became payable.
      select plan, row_number() over (order by paid_at, invoice_id) as n
        from subs where payable
    ),
    joined as (
      select cs.created_at, public.is_playing(cs.user_id) as playing
        from public.creator_signups cs where cs.code = p_code
    )
    select jsonb_build_object(
      'signups',            (select count(*) from joined),
      'signups_playing',    (select count(*) from joined where playing),
      'signups_this_month', (select count(*) from joined where created_at >= this_month),
      'signups_last_month', (select count(*) from joined where created_at >= last_month and created_at < this_month),
      'monthly',  (select count(*) from subs where plan = 'monthly' and refunded_at is null and disputed_at is null),
      'yearly',   (select count(*) from subs where plan = 'yearly'  and refunded_at is null and disputed_at is null),
      'pending',  (select count(*) from subs where pending),
      'payable',  (select count(*) from subs where payable),
      'refunded', (select count(*) from subs where refunded_at is not null),
      'disputed', (select count(*) from subs where disputed_at is not null and refunded_at is null),
      'pro_this_month', (select count(*) from subs where paid_at >= this_month and refunded_at is null and disputed_at is null),
      'pro_last_month', (select count(*) from subs where paid_at >= last_month and paid_at < this_month and refunded_at is null and disputed_at is null),
      'earned_cents', coalesce((select sum(public.creator_rate_cents(plan, n)) from ranked), 0),
      'paid_cents',   coalesce((select sum(amount_cents) from public.creator_payouts where code = p_code), 0),
      'last_paid_at', (select max(paid_at) from public.creator_payouts where code = p_code)
    )
  );
end;
$$;

revoke all on function public.creator_stats(text) from public, anon, authenticated;


-- ------------------------------------------------------------
--  5. Developers: the Creators tab, now with the linked account
--     and sign-ups. Same fields as before (100) plus new ones.
-- ------------------------------------------------------------

create or replace function public.dev_creator_codes()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'code', c.code,
               'creator_name', c.creator_name,
               'contact', c.contact,
               'active', c.active,
               'notes', c.notes,
               'created_at', c.created_at,
               'username', p.username)
             || s.stats
             || jsonb_build_object(
               'owed_cents', (s.stats->>'earned_cents')::bigint - (s.stats->>'paid_cents')::bigint)
           order by c.active desc, c.created_at desc)
      from public.creator_codes c
      left join public.profiles p on p.id = c.user_id
      cross join lateral (select public.creator_stats(c.code) as stats) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dev_creator_codes() from public, anon;
grant execute on function public.dev_creator_codes() to authenticated;


-- Link a code to a Pentra account by username; an empty username
-- unlinks it. @returns 'saved', or a sentence saying what's wrong.
create or replace function public.dev_creator_link(p_code text, p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  norm   text := public.normalize_creator_code(p_code);
  target uuid;
  other  text;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;
  if not exists (select 1 from public.creator_codes where code = norm) then
    return 'No such code.';
  end if;

  if p_username is null or btrim(p_username) = '' then
    update public.creator_codes set user_id = null where code = norm;
    return 'saved';
  end if;

  select id into target from public.profiles
   where lower(username) = lower(trim(both '@' from btrim(p_username)));
  if target is null then
    return 'No player with that username.';
  end if;

  select code into other from public.creator_codes
   where user_id = target and code <> norm;
  if other is not null then
    return 'That account is already linked to ' || other || '.';
  end if;

  update public.creator_codes set user_id = target where code = norm;
  return 'saved';
end;
$$;

revoke all on function public.dev_creator_link(text, text) from public, anon;
grant execute on function public.dev_creator_link(text, text) to authenticated;


-- ------------------------------------------------------------
--  6. Ambassadors: their own page.
-- ------------------------------------------------------------

-- For showing the link to the page. Cheap; false for nearly everyone.
create or replace function public.am_i_ambassador()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.creator_codes where user_id = auth.uid())
$$;

revoke all on function public.am_i_ambassador() from public, anon;
grant execute on function public.am_i_ambassador() to authenticated;


-- Your code and its numbers, or null if you aren't an ambassador.
-- Counts only: never who signed up.
create or replace function public.my_ambassador()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  c public.creator_codes;
  s jsonb;
begin
  select * into c from public.creator_codes where user_id = auth.uid();
  if c.code is null then
    return null;
  end if;

  s := public.creator_stats(c.code);

  return jsonb_build_object(
      'code', c.code,
      'creator_name', c.creator_name,
      'active', c.active,
      'tier_size', public.creator_tier_size(),
      'rates', jsonb_build_object(
        'monthly', public.creator_rate_cents('monthly', 1),
        'yearly',  public.creator_rate_cents('yearly', 1),
        'monthly_after', public.creator_rate_cents('monthly', public.creator_tier_size() + 1),
        'yearly_after',  public.creator_rate_cents('yearly', public.creator_tier_size() + 1)),
      'refund_days', public.refund_window_days(),
      'payouts', coalesce((
        select jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'paid_at', p.paid_at)
                         order by p.paid_at desc)
          from (select amount_cents, paid_at from public.creator_payouts
                 where code = c.code order by paid_at desc limit 12) p
      ), '[]'::jsonb))
    || s
    || jsonb_build_object(
      'owed_cents', greatest(0, (s->>'earned_cents')::bigint - (s->>'paid_cents')::bigint));
end;
$$;

revoke all on function public.my_ambassador() from public, anon;
grant execute on function public.my_ambassador() to authenticated;


-- Top 3 of last calendar month, by sign-ups through their link who
-- started playing (a fake account can't climb it). Ambassadors only;
-- names and counts, nothing else. Also says where you placed.
create or replace function public.ambassador_leaderboard()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  mine text;
  from_ts timestamptz := date_trunc('month', now()) - interval '1 month';
  to_ts   timestamptz := date_trunc('month', now());
begin
  select code into mine from public.creator_codes where user_id = auth.uid();
  if mine is null then
    return null;
  end if;

  return (
    with counts as (
      select c.code, c.creator_name,
             count(cs.user_id) filter (where public.is_playing(cs.user_id)) as playing,
             min(cs.created_at) as first_at
        from public.creator_codes c
        join public.creator_signups cs
          on cs.code = c.code and cs.created_at >= from_ts and cs.created_at < to_ts
       where c.user_id is not null
       group by c.code, c.creator_name
    ),
    ranked as (
      select code, creator_name, playing,
             rank() over (order by playing desc) as place
        from counts where playing > 0
    )
    select jsonb_build_object(
      'month', to_char(from_ts, 'FMMonth YYYY'),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('place', place, 'name', creator_name,
                                            'count', playing, 'me', code = mine)
                         order by place, creator_name)
          from ranked where place <= 3), '[]'::jsonb),
      'my_place', (select place from ranked where code = mine),
      'my_count', coalesce((select playing from ranked where code = mine), 0))
  );
end;
$$;

revoke all on function public.ambassador_leaderboard() from public, anon;
grant execute on function public.ambassador_leaderboard() to authenticated;


-- ------------------------------------------------------------
--  7. What's New.
-- ------------------------------------------------------------

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Ambassador dashboard',
     'Pentra''s creator partners can now see their own numbers in the app: sign-ups through their link, Pro subscribers, and what they''ve earned. Find it in Settings if you''re an ambassador.',
     'feature', 2)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
