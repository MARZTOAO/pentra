-- ============================================================
--  87 — Pentra Pro billing: subscriptions, refunds, creator codes.
--
--  Money is handled by Stripe. Pentra never sees a card number. The
--  pieces here:
--
--    billing_customers      which Stripe customer is which player
--    billing_subscriptions  each player's Stripe subscription, as last
--                           reported by Stripe (plan, status, renewal)
--    billing_payments       one row per paid invoice — what turns Pro on
--    creator_codes          YouTuber / streamer partner codes
--    creator_payouts        what has been paid to each partner
--
--  All five are sealed (RLS on, no policies, no grants). Only the
--  'pro' Edge Function (supabase/functions/pro), running with the
--  service role, writes them — through the billing_* functions below,
--  which players can't call. Players read their own status through
--  my_billing(); developers read everything through dev_*.
--
--  THE RULES (MARZ, 2026-10-01/02 — see claude/pro-launch.md)
--    - $5.99 monthly or $59.88 yearly. Every paid invoice ADDS its
--      period to tier_expires_at (time stacks). A NULL expiry on a Pro
--      account means permanent (dev grants) and is never touched.
--    - Creator code: 25% off the first month or 30% off the first year,
--      first-time subscribers only. The partner earns, once per new
--      subscriber, $0.50 (monthly) / $10 (yearly) for their first 1,000
--      signups, then $1.00 / $15 — counted per creator.
--    - Refunds: full refund within 14 days of the first payment, one
--      refund per account, ever. A full refund takes the paid time back
--      off and cancels the subscription. Partners are only paid for
--      signups older than 14 days that weren't refunded.
--
--  SALES ARE SWITCHED OFF until launch: the flag `pro_sales` (off)
--  decides who can see the upgrade page and buy. While Stripe is in
--  test mode, add a test account as a tester (DevPanel → Flags) so
--  nobody else can "buy" Pro with a test card. On launch day, after
--  switching Stripe to live keys, turn it on for everyone. The Edge
--  Function checks the flag too — hiding the button isn't the lock.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  0. The sales switch.
-- ------------------------------------------------------------
insert into public.feature_flags (key, description, enabled_for_all)
values (
  'pro_sales',
  'Pentra Pro can be bought (upgrade page, Settings, links). Testers only while Stripe is in test mode; on for everyone at launch, after switching to live keys.',
  false
)
on conflict (key) do nothing;

-- Is buying open to this player?
create or replace function public.pro_sales_open(who uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.feature_flags f
     where f.key = 'pro_sales'
       and (f.enabled_for_all
            or exists (select 1 from public.flag_testers t
                        where t.flag_key = f.key and t.user_id = who)));
$$;

revoke all on function public.pro_sales_open(uuid) from public, anon, authenticated;

-- Is Pro on sale to the public? Only the "everyone" switch — testers
-- are not counted — so the website can show pricing from launch day
-- without a deploy, and says nothing about it before. Callable signed
-- out: it gives away nothing but the price list.
create or replace function public.pro_on_sale()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select f.enabled_for_all from public.feature_flags f where f.key = 'pro_sales'),
    false);
$$;

grant execute on function public.pro_on_sale() to anon, authenticated;


-- ------------------------------------------------------------
--  1. Tables (sealed).
-- ------------------------------------------------------------
create table if not exists public.billing_customers (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id                   text primary key,          -- Stripe subscription id
  user_id              uuid not null references public.profiles(id) on delete cascade,
  plan                 text not null check (plan in ('monthly', 'yearly')),
  status               text not null,
  cancel_at_period_end boolean not null default false,
  current_period_end   timestamptz,
  creator_code         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id, updated_at desc);

create table if not exists public.creator_codes (
  code         text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  creator_name text not null check (char_length(btrim(creator_name)) between 1 and 80),
  contact      text check (contact is null or char_length(contact) <= 200),
  active       boolean not null default true,
  notes        text check (notes is null or char_length(notes) <= 500),
  created_at   timestamptz not null default now()
);

create table if not exists public.billing_payments (
  invoice_id        text primary key,               -- Stripe invoice id
  -- Kept (set null) if the account is deleted, so a partner's
  -- signup history and earnings don't vanish with it.
  user_id           uuid references public.profiles(id) on delete set null,
  subscription_id   text,
  plan              text not null check (plan in ('monthly', 'yearly')),
  amount_cents      integer not null check (amount_cents >= 0),
  currency          text not null,
  payment_intent_id text unique,
  -- The account's first ever payment. Only these count for partners.
  first_payment     boolean not null default false,
  creator_code      text references public.creator_codes(code) on update cascade,
  paid_at           timestamptz not null default now(),
  refunded_at       timestamptz
);

create index if not exists billing_payments_user_idx
  on public.billing_payments (user_id, paid_at);
create index if not exists billing_payments_creator_idx
  on public.billing_payments (creator_code, paid_at) where creator_code is not null;

create table if not exists public.creator_payouts (
  id           bigint generated always as identity primary key,
  code         text not null references public.creator_codes(code) on update cascade,
  amount_cents integer not null check (amount_cents > 0),
  note         text check (note is null or char_length(note) <= 300),
  paid_at      timestamptz not null default now(),
  recorded_by  uuid references public.profiles(id) on delete set null
);

alter table public.billing_customers     enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_payments      enable row level security;
alter table public.creator_codes         enable row level security;
alter table public.creator_payouts       enable row level security;

revoke all on table public.billing_customers     from public, anon, authenticated;
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_payments      from public, anon, authenticated;
revoke all on table public.creator_codes         from public, anon, authenticated;
revoke all on table public.creator_payouts       from public, anon, authenticated;


-- ------------------------------------------------------------
--  2. The numbers, in one place each.
-- ------------------------------------------------------------

-- Days a payment can still be refunded; partners are paid after it.
create or replace function public.refund_window_days()
returns integer language sql immutable as $$ select 14 $$;

-- What one plan's payment adds to someone's Pro time.
create or replace function public.billing_period(p_plan text)
returns interval language sql immutable as $$
  select case p_plan when 'yearly' then interval '1 year' else interval '1 month' end
$$;

-- A partner's earning for their n-th paid signup on a plan, in cents.
create or replace function public.creator_rate_cents(p_plan text, p_n bigint)
returns integer language sql immutable as $$
  select case
           when p_plan = 'yearly' then case when p_n <= 1000 then 1000 else 1500 end
           else                        case when p_n <= 1000 then 50   else 100  end
         end
$$;

-- Codes are case-insensitive for the person typing them.
create or replace function public.normalize_creator_code(p_code text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

grant execute on function public.refund_window_days() to authenticated;


-- ------------------------------------------------------------
--  3. For the Edge Function only (service role).
-- ------------------------------------------------------------

-- Everything checkout needs to decide, in one call.
create or replace function public.billing_checkout_context(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  norm text := public.normalize_creator_code(p_code);
  c    public.creator_codes;
begin
  select * into c from public.creator_codes cc where cc.code = norm and cc.active;

  return jsonb_build_object(
    'customer_id', (select stripe_customer_id from public.billing_customers where user_id = p_user),
    'active_subscription', exists (
      select 1 from public.billing_subscriptions s
       where s.user_id = p_user
         and s.status in ('active', 'trialing', 'past_due', 'incomplete', 'unpaid')),
    'permanent', exists (
      select 1 from public.profiles p
       where p.id = p_user and p.tier = 'plus' and p.tier_expires_at is null),
    'first_time', not exists (select 1 from public.billing_payments where user_id = p_user),
    'sales_open', public.pro_sales_open(p_user),
    'code', norm,
    'code_ok', c.code is not null,
    'creator_name', c.creator_name
  );
end;
$$;

create or replace function public.billing_set_customer(p_user uuid, p_customer text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.billing_customers (user_id, stripe_customer_id)
  values (p_user, p_customer)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id;
$$;

-- A paid invoice. Idempotent: Stripe can deliver the same event twice.
-- @returns 'applied' or 'duplicate'.
create or replace function public.billing_apply_payment(
  p_invoice  text,
  p_user     uuid,
  p_sub      text,
  p_plan     text,
  p_amount   integer,
  p_currency text,
  p_pi       text,
  p_code     text,
  p_paid_at  timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
  v_code   text;
begin
  if p_plan not in ('monthly', 'yearly') then
    raise exception 'unknown plan %', p_plan;
  end if;

  if exists (select 1 from public.billing_payments where invoice_id = p_invoice) then
    return 'duplicate';
  end if;

  is_first := not exists (select 1 from public.billing_payments where user_id = p_user);

  -- A partner only gets credit for a first payment, and only for a
  -- code that exists.
  v_code := case when is_first then public.normalize_creator_code(p_code) end;
  if v_code is not null and not exists (select 1 from public.creator_codes cc where cc.code = v_code) then
    v_code := null;
  end if;

  insert into public.billing_payments
    (invoice_id, user_id, subscription_id, plan, amount_cents, currency,
     payment_intent_id, first_payment, creator_code, paid_at)
  values
    (p_invoice, p_user, p_sub, p_plan, coalesce(p_amount, 0), coalesce(p_currency, 'usd'),
     p_pi, is_first, v_code, coalesce(p_paid_at, now()));

  -- Add the paid period. Permanent Pro (NULL expiry) is left alone.
  perform set_config('pentra.tier_write', 'on', true);
  update public.profiles
     set tier = 'plus',
         tier_expires_at = greatest(coalesce(tier_expires_at, now()), now())
                           + public.billing_period(p_plan)
   where id = p_user
     and not (tier = 'plus' and tier_expires_at is null);

  return 'applied';
end;
$$;

-- A full refund. Takes the paid period back off (never into the
-- past) and returns the subscription to cancel, or null if the
-- payment isn't known or was already refunded.
create or replace function public.billing_apply_refund(p_pi text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay public.billing_payments;
begin
  update public.billing_payments
     set refunded_at = now()
   where payment_intent_id = p_pi and refunded_at is null
  returning * into pay;

  if pay.invoice_id is null then
    return null;
  end if;

  perform set_config('pentra.tier_write', 'on', true);
  update public.profiles
     set tier_expires_at = greatest(now(), tier_expires_at - public.billing_period(pay.plan))
   where id = pay.user_id
     and tier = 'plus'
     and tier_expires_at is not null;

  return jsonb_build_object('subscription_id', pay.subscription_id, 'user_id', pay.user_id);
end;
$$;

create or replace function public.billing_sync_subscription(
  p_sub        text,
  p_user       uuid,
  p_plan       text,
  p_status     text,
  p_cancel     boolean,
  p_period_end timestamptz,
  p_code       text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.billing_subscriptions
    (id, user_id, plan, status, cancel_at_period_end, current_period_end, creator_code)
  values
    (p_sub, p_user, p_plan, p_status, coalesce(p_cancel, false), p_period_end,
     public.normalize_creator_code(p_code))
  on conflict (id) do update
    set plan                 = excluded.plan,
        status               = excluded.status,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_end   = excluded.current_period_end,
        updated_at           = now();
$$;

revoke all on function public.billing_checkout_context(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_set_customer(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_apply_payment(text, uuid, text, text, integer, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_apply_refund(text) from public, anon, authenticated;
revoke all on function public.billing_sync_subscription(text, uuid, text, text, boolean, timestamptz, text) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.billing_checkout_context(uuid, text) to service_role;
    grant execute on function public.billing_set_customer(uuid, text) to service_role;
    grant execute on function public.billing_apply_payment(text, uuid, text, text, integer, text, text, text, timestamptz) to service_role;
    grant execute on function public.billing_apply_refund(text) to service_role;
    grant execute on function public.billing_sync_subscription(text, uuid, text, text, boolean, timestamptz, text) to service_role;
  end if;
end $$;


-- ------------------------------------------------------------
--  4. For players.
-- ------------------------------------------------------------

-- Your own Pro status, for Settings and the upgrade page.
create or replace function public.my_billing()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  p  public.profiles;
  s  public.billing_subscriptions;
begin
  if me is null then
    return null;
  end if;

  select * into p from public.profiles where id = me;
  select * into s from public.billing_subscriptions
   where user_id = me
   order by (status in ('active', 'trialing', 'past_due')) desc, updated_at desc
   limit 1;

  return jsonb_build_object(
    'pro',        public.row_has_plus(p.tier, p.tier_expires_at),
    'permanent',  p.tier = 'plus' and p.tier_expires_at is null,
    'expires_at', p.tier_expires_at,
    'has_customer', exists (select 1 from public.billing_customers where user_id = me),
    'first_time', not exists (select 1 from public.billing_payments where user_id = me),
    'subscription', case when s.id is null then null else jsonb_build_object(
        'plan', s.plan,
        'status', s.status,
        'cancel_at_period_end', s.cancel_at_period_end,
        'current_period_end', s.current_period_end) end
  );
end;
$$;

revoke all on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;


-- Is this code real? Shown on the upgrade page as you type it.
create or replace function public.check_creator_code(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'ok', c.code is not null,
    'code', public.normalize_creator_code(p_code),
    'creator_name', c.creator_name,
    'first_time', not exists (select 1 from public.billing_payments where user_id = auth.uid())
  )
  from (select 1) one
  left join public.creator_codes c
    on c.code = public.normalize_creator_code(p_code) and c.active
  where auth.uid() is not null;
$$;

revoke all on function public.check_creator_code(text) from public, anon;
grant execute on function public.check_creator_code(text) to authenticated;


-- ------------------------------------------------------------
--  5. The partner program, for developers (DevPanel → Creators).
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
    with signups as (
      select bp.creator_code as code, bp.plan, bp.paid_at, bp.refunded_at,
             bp.refunded_at is null
               and bp.paid_at <= now() - make_interval(days => public.refund_window_days()) as payable,
             bp.refunded_at is null
               and bp.paid_at >  now() - make_interval(days => public.refund_window_days()) as pending
        from public.billing_payments bp
       where bp.first_payment and bp.creator_code is not null
    ),
    ranked as (
      -- The 1,000 is per creator, monthly and yearly together, in the
      -- order the signups became payable.
      select code, plan,
             row_number() over (partition by code order by paid_at) as n
        from signups where payable
    ),
    earned as (
      select code, sum(public.creator_rate_cents(plan, n))::bigint as cents
        from ranked group by code
    ),
    paid as (
      select code, sum(amount_cents)::bigint as cents, max(paid_at) as last_paid
        from public.creator_payouts group by code
    )
    select jsonb_agg(jsonb_build_object(
             'code', c.code,
             'creator_name', c.creator_name,
             'contact', c.contact,
             'active', c.active,
             'notes', c.notes,
             'created_at', c.created_at,
             'monthly', (select count(*) from signups s where s.code = c.code and s.plan = 'monthly' and s.refunded_at is null),
             'yearly',  (select count(*) from signups s where s.code = c.code and s.plan = 'yearly'  and s.refunded_at is null),
             'pending', (select count(*) from signups s where s.code = c.code and s.pending),
             'refunded',(select count(*) from signups s where s.code = c.code and s.refunded_at is not null),
             'payable', (select count(*) from signups s where s.code = c.code and s.payable),
             'earned_cents', coalesce(e.cents, 0),
             'paid_cents',   coalesce(pd.cents, 0),
             'owed_cents',   coalesce(e.cents, 0) - coalesce(pd.cents, 0),
             'last_paid_at', pd.last_paid)
           order by c.active desc, c.created_at desc)
      from public.creator_codes c
      left join earned e on e.code = c.code
      left join paid pd on pd.code = c.code
  ), '[]'::jsonb);
end;
$$;

-- @returns 'added', or a sentence saying what's wrong.
create or replace function public.dev_creator_add(p_code text, p_name text, p_contact text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  norm text := public.normalize_creator_code(p_code);
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if norm is null or norm !~ '^[A-Z0-9]{3,20}$' then
    return 'Codes are 3 to 20 letters and numbers.';
  end if;
  if p_name is null or btrim(p_name) = '' then
    return 'Add the creator''s name.';
  end if;
  if exists (select 1 from public.creator_codes where code = norm) then
    return 'That code is already taken.';
  end if;

  insert into public.creator_codes (code, creator_name, contact)
  values (norm, btrim(p_name), nullif(btrim(coalesce(p_contact, '')), ''));
  return 'added';
end;
$$;

create or replace function public.dev_creator_set_active(p_code text, p_active boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;
  update public.creator_codes set active = p_active
   where code = public.normalize_creator_code(p_code);
  return case when found then 'saved' else 'no such code' end;
end;
$$;

-- Record money sent to a partner (sent outside Pentra — PayPal etc.).
create or replace function public.dev_creator_payout(p_code text, p_amount_cents integer, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  norm text := public.normalize_creator_code(p_code);
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return 'Enter an amount above zero.';
  end if;
  if not exists (select 1 from public.creator_codes where code = norm) then
    return 'no such code';
  end if;
  insert into public.creator_payouts (code, amount_cents, note, recorded_by)
  values (norm, p_amount_cents, nullif(btrim(coalesce(p_note, '')), ''), auth.uid());
  return 'recorded';
end;
$$;

-- One player's payments: for answering a refund request (14 days,
-- one refund per account) before refunding them in Stripe.
create or replace function public.dev_billing_lookup(who text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target uuid;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select id into target from public.profiles where lower(username) = lower(btrim(who));
  if target is null then
    return null;
  end if;

  return jsonb_build_object(
    'username', (select username from public.profiles where id = target),
    'customer_id', (select stripe_customer_id from public.billing_customers where user_id = target),
    'refunds_used', (select count(*) from public.billing_payments where user_id = target and refunded_at is not null),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invoice_id', bp.invoice_id,
               'plan', bp.plan,
               'amount_cents', bp.amount_cents,
               'currency', bp.currency,
               'paid_at', bp.paid_at,
               'first_payment', bp.first_payment,
               'creator_code', bp.creator_code,
               'refunded_at', bp.refunded_at,
               'refundable', bp.refunded_at is null
                             and bp.first_payment
                             and bp.paid_at > now() - make_interval(days => public.refund_window_days())
                             and not exists (select 1 from public.billing_payments x
                                              where x.user_id = target and x.refunded_at is not null))
             order by bp.paid_at desc)
        from public.billing_payments bp where bp.user_id = target), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.dev_creator_codes() from public, anon;
revoke all on function public.dev_creator_add(text, text, text) from public, anon;
revoke all on function public.dev_creator_set_active(text, boolean) from public, anon;
revoke all on function public.dev_creator_payout(text, integer, text) from public, anon;
revoke all on function public.dev_billing_lookup(text) from public, anon;
grant execute on function public.dev_creator_codes() to authenticated;
grant execute on function public.dev_creator_add(text, text, text) to authenticated;
grant execute on function public.dev_creator_set_active(text, boolean) to authenticated;
grant execute on function public.dev_creator_payout(text, integer, text) to authenticated;
grant execute on function public.dev_billing_lookup(text) to authenticated;

-- ============================================================
--  Done. No What's New entry yet — that's written on launch day,
--  together with switching on the free_session_limits flag.
--
--  Check (read-only):
--    select count(*) from public.billing_payments;
-- ============================================================
