-- ============================================================
--  47 — FIX: the "New link" button never worked.
--
--  Symptom: clicking it did nothing. The button was disabled from the
--  moment the panel was first opened, and stayed that way for an
--  hour.
--
--  THE CAUSE. Both roll_referral_code() and referral_summary() rate
--  limited on `max(issued_at)` across all of your codes — "you can
--  change your code once an hour". But your FIRST code is issued the
--  instant you open the panel, because my_referral_code() creates it
--  lazily on the first ask. So the rate limit was already tripped
--  before anybody could press anything, by the very call that drew
--  the screen.
--
--  Reproduced in order: open the panel, ask the summary, try to roll.
--  can_roll comes back false and the roll is refused, on a code that
--  is one second old and has never been changed.
--
--  THE FIX. Rate limit on when you last RETIRED a code, which is what
--  "change your code" actually means. Never rolled, nothing retired,
--  so the first one is always free — and after a roll the hour
--  applies exactly as intended.
--
--  Run in the Supabase SQL Editor, after 46.
-- ============================================================

create or replace function public.roll_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me         uuid := auth.uid();
  last_rolled timestamptz;
  fresh      text;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  -- When a code of yours was last taken out of service. Null means
  -- you have never rolled, whatever age your current code is.
  select max(rc.retired_at) into last_rolled
    from referral_codes rc where rc.user_id = me;

  if last_rolled is not null and last_rolled > now() - interval '1 hour' then
    raise exception 'You can change your referral code once an hour';
  end if;

  update referral_codes
     set retired_at = now()
   where user_id = me and retired_at is null;

  fresh := public.generate_referral_code();

  insert into referral_codes (code, user_id) values (fresh, me);

  return fresh;
end;
$$;

grant execute on function public.roll_referral_code() to authenticated;


-- The same mistake, in the function that decides whether the button
-- is even clickable. Both had to agree, and both had to be wrong the
-- same way, which is why the button looked deliberate rather than
-- broken.
create or replace function public.referral_summary()
returns table (
  code       text,
  total      int,
  qualified  int,
  can_roll   boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me          uuid := auth.uid();
  mine        text;
  last_rolled timestamptz;
begin
  if me is null then
    return;
  end if;

  select rc.code into mine
    from referral_codes rc
   where rc.user_id = me and rc.retired_at is null;

  select max(rc.retired_at) into last_rolled
    from referral_codes rc where rc.user_id = me;

  return query
  select
    mine,
    (select count(*)::int from referrals r where r.referrer_id = me),
    (select count(*)::int from referrals r
      where r.referrer_id = me and r.qualified_at is not null),
    (last_rolled is null or last_rolled <= now() - interval '1 hour');
end;
$$;

grant execute on function public.referral_summary() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
