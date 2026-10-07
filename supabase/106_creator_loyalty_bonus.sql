-- ============================================================
--  106 — Creator loyalty bonus.
--
--  On top of the one-time payment for a new subscriber (104), a
--  creator now earns a one-time bonus when that subscriber sticks
--  around (MARZ, 2026-10-07):
--    - started monthly: +$2 once they've paid 3 times
--      (their 3rd monthly payment, i.e. into month 3)
--    - started yearly:  +$10 once they've paid twice
--      (they renewed for a second year)
--  Counted payments are the subscriber's own, not refunded and not
--  disputed. Switching plans along the way still counts. The bonus
--  needs the original signup to count for the creator too (past the
--  refund window, not refunded or disputed).
--
--  Like the rest of the earnings, it's worked out each time it's
--  shown, so a later dispute on a counted payment takes it back off.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

-- The bonus for a subscriber who started on this plan, in cents.
create or replace function public.creator_loyalty_cents(p_plan text)
returns integer language sql immutable as $$
  select case when p_plan = 'yearly' then 1000 else 200 end
$$;

-- How many paid payments it takes to earn it.
create or replace function public.creator_loyalty_after(p_plan text)
returns integer language sql immutable as $$
  select case when p_plan = 'yearly' then 2 else 3 end
$$;


-- One code's numbers (as in 104), now with loyalty bonuses.
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
      select bp.invoice_id, bp.user_id, bp.plan, bp.paid_at, bp.refunded_at, bp.disputed_at,
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
    loyal as (
      -- Counted signups whose subscriber has now paid enough times.
      select s.plan
        from subs s
       where s.payable and s.user_id is not null
         and (select count(*) from public.billing_payments p
               where p.user_id = s.user_id
                 and p.refunded_at is null and p.disputed_at is null)
             >= public.creator_loyalty_after(s.plan)
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
      'loyalty_count', (select count(*) from loyal),
      'loyalty_cents', coalesce((select sum(public.creator_loyalty_cents(plan)) from loyal), 0),
      'earned_cents', coalesce((select sum(public.creator_rate_cents(plan, n)) from ranked), 0)
                    + coalesce((select sum(public.creator_loyalty_cents(plan)) from loyal), 0),
      'paid_cents',   coalesce((select sum(amount_cents) from public.creator_payouts where code = p_code), 0),
      'last_paid_at', (select max(paid_at) from public.creator_payouts where code = p_code)
    )
  );
end;
$$;

revoke all on function public.creator_stats(text) from public, anon, authenticated;


-- The ambassador page explains the bonus with these numbers.
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
      'loyalty', jsonb_build_object(
        'monthly', public.creator_loyalty_cents('monthly'),
        'yearly',  public.creator_loyalty_cents('yearly'),
        'monthly_after', public.creator_loyalty_after('monthly'),
        'yearly_after',  public.creator_loyalty_after('yearly')),
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


insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Ambassador loyalty bonus',
     'Ambassadors now earn a bonus when the subscribers they bring in stay: $2 when a monthly subscriber reaches their third month, and $10 when a yearly subscriber renews.',
     'improvement', 3)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);
