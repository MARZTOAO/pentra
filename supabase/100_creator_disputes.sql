-- ============================================================
--  100 — Creator codes: bank disputes don't earn a partner money.
--
--  A refund (charge.refunded) already drops a signup from a partner's
--  earnings. A DISPUTE didn't: if a subscriber skipped the refund and
--  told their bank the charge was wrong, the payment still counted as
--  payable, and the partner could be paid for money Pentra lost.
--
--  Now the 'pro' Edge Function listens for disputes too:
--    charge.dispute.created  → the payment is marked disputed
--    charge.dispute.closed   → won (or an inquiry closed without a
--                              chargeback): the mark comes off and the
--                              signup counts again. Lost: it stays.
--
--  A disputed signup earns nothing. Disputes can arrive months after a
--  payment — after the 14-day window, after the partner was paid. Then
--  "earned" drops below "paid" and the Creators tab shows the partner
--  as OVERPAID; take it off their next payout.
--
--  Pro time is NOT taken back on a dispute here. (A lost dispute means
--  the money went back to them; deciding what that does to their Pro
--  is a separate call.)
--
--  ALSO NEEDED, once: Stripe Dashboard → Developers → Webhooks → the
--  Pentra endpoint → add events charge.dispute.created and
--  charge.dispute.closed. Then deploy the updated 'pro' function.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

alter table public.billing_payments
  add column if not exists disputed_at timestamptz;


-- Called by the 'pro' Edge Function only (service role).
-- p_open true: a dispute was opened. false: it was closed in Pentra's
-- favour. Returns whether a payment matched.
create or replace function public.billing_apply_dispute(p_pi text, p_open boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.billing_payments
     set disputed_at = case when p_open then coalesce(disputed_at, now()) end
   where payment_intent_id = p_pi;
  return found;
end;
$$;

revoke all on function public.billing_apply_dispute(text, boolean) from public, anon, authenticated;


-- The Creators tab. Same as 87, except a disputed signup is neither
-- pending nor payable, and is counted on its own.
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
      select bp.creator_code as code, bp.plan, bp.paid_at, bp.refunded_at, bp.disputed_at,
             bp.refunded_at is null and bp.disputed_at is null
               and bp.paid_at <= now() - make_interval(days => public.refund_window_days()) as payable,
             bp.refunded_at is null and bp.disputed_at is null
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
             'monthly', (select count(*) from signups s where s.code = c.code and s.plan = 'monthly' and s.refunded_at is null and s.disputed_at is null),
             'yearly',  (select count(*) from signups s where s.code = c.code and s.plan = 'yearly'  and s.refunded_at is null and s.disputed_at is null),
             'pending', (select count(*) from signups s where s.code = c.code and s.pending),
             'refunded',(select count(*) from signups s where s.code = c.code and s.refunded_at is not null),
             'disputed',(select count(*) from signups s where s.code = c.code and s.disputed_at is not null and s.refunded_at is null),
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

revoke all on function public.dev_creator_codes() from public, anon;
grant execute on function public.dev_creator_codes() to authenticated;
