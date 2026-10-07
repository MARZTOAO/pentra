-- ============================================================
--  105 — Giveaways.
--
--  One reusable feature for every giveaway (the GTA 6 copies first,
--  the gaming PC after). A developer sets one up in DevPanel →
--  Giveaways; while it's published and open, it shows at the top of
--  Home and at /giveaway (website and app).
--
--  HOW SOMEONE ENTERS
--    Opening the app is NOT entering. You're only in the draw after
--    you open the giveaway page, type your TikTok username, tick the
--    rules box and tap Enter. People who sign up without ever seeing
--    the giveaway are never drawn.
--    To enter you need: an account, at least one game in your Top 5,
--    and a date of birth on file showing you're 18 or over.
--    One entry per account and one per TikTok username.
--
--  BONUS ENTRIES
--    +1 for each person who joined with your invite link (46) during
--    the giveaway and started playing (a session, or 3 friends)
--    before it closed. Capped per giveaway (referral_cap). A fake
--    account earns nothing — same bar as invites already use.
--
--  FREE ENTRY BY EMAIL ("no purchase necessary")
--    Added by a developer by hand: name, email, TikTok. One entry.
--
--  THE DRAW
--    Only after the closing time. Picks one entry at random, weighted
--    by entry count, from everyone not already drawn. The developer
--    checks the winner followed and commented on TikTok, then marks
--    them confirmed or skipped and draws again as needed. Every draw
--    is saved with the odds it was made at.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================


-- ------------------------------------------------------------
--  1. Tables. Nobody reads them directly; everything goes through
--     the functions below.
-- ------------------------------------------------------------

create table if not exists public.giveaways (
  id                bigint generated always as identity primary key,
  title             text not null check (char_length(btrim(title)) between 1 and 80),
  prize             text not null check (char_length(btrim(prize)) between 1 and 300),
  prize_value_cents integer not null default 0 check (prize_value_cents >= 0),
  image_url         text check (image_url is null or char_length(image_url) <= 500),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  tiktok_handle     text not null check (tiktok_handle ~ '^[A-Za-z0-9._]{2,24}$'),
  referral_cap      integer not null default 10 check (referral_cap between 0 and 100),
  winners_count     integer not null default 1 check (winners_count between 1 and 100),
  rules             text not null default '' check (char_length(rules) <= 20000),
  published         boolean not null default false,
  created_at        timestamptz not null default now(),

  constraint giveaway_dates check (ends_at > starts_at)
);

create table if not exists public.giveaway_entries (
  id          bigint generated always as identity primary key,
  giveaway_id bigint not null references public.giveaways(id) on delete cascade,
  -- An app entry has a user; a free email entry has an email instead.
  user_id     uuid references public.profiles(id) on delete cascade,
  email       text check (email is null or char_length(email) <= 200),
  name        text check (name is null or char_length(name) <= 100),
  tiktok      text not null check (tiktok ~ '^[A-Za-z0-9._]{2,24}$'),
  entered_at  timestamptz not null default now(),

  constraint giveaway_entry_kind check ((user_id is null) <> (email is null))
);

create unique index if not exists giveaway_entries_user_idx
  on public.giveaway_entries (giveaway_id, user_id) where user_id is not null;
create unique index if not exists giveaway_entries_email_idx
  on public.giveaway_entries (giveaway_id, lower(email)) where email is not null;
-- One entry per TikTok account, however many Pentra accounts it has.
create unique index if not exists giveaway_entries_tiktok_idx
  on public.giveaway_entries (giveaway_id, lower(tiktok));

create table if not exists public.giveaway_winners (
  id          bigint generated always as identity primary key,
  giveaway_id bigint not null references public.giveaways(id) on delete cascade,
  entry_id    bigint not null unique references public.giveaway_entries(id) on delete cascade,
  -- The odds it was drawn at: this entry's weight and the whole pool.
  weight      integer not null,
  pool        integer not null,
  status      text not null default 'drawn' check (status in ('drawn', 'confirmed', 'skipped')),
  drawn_at    timestamptz not null default now(),
  drawn_by    uuid references public.profiles(id) on delete set null
);

alter table public.giveaways        enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_winners enable row level security;
revoke all on table public.giveaways        from public, anon, authenticated;
revoke all on table public.giveaway_entries from public, anon, authenticated;
revoke all on table public.giveaway_winners from public, anon, authenticated;


-- ------------------------------------------------------------
--  2. Counting entries.
-- ------------------------------------------------------------

-- Bonus entries for one account in one giveaway: invites made during
-- it that started playing before it closed, up to the cap.
create or replace function public.giveaway_bonus(p_giveaway bigint, p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(least(g.referral_cap, (
           select count(*)::int from public.referrals r
            where r.referrer_id = p_user
              and r.created_at >= g.starts_at and r.created_at < g.ends_at
              and r.qualified_at is not null and r.qualified_at < g.ends_at)), 0)
    from public.giveaways g where g.id = p_giveaway
$$;

revoke all on function public.giveaway_bonus(bigint, uuid) from public, anon, authenticated;

-- How many entries one entry row is worth.
create or replace function public.giveaway_weight(p_entry bigint)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select 1 + case when e.user_id is null then 0
                  else public.giveaway_bonus(e.giveaway_id, e.user_id) end
    from public.giveaway_entries e where e.id = p_entry
$$;

revoke all on function public.giveaway_weight(bigint) from public, anon, authenticated;

-- "@ Some.Name " → "Some.Name"; null if it isn't a TikTok username.
create or replace function public.clean_tiktok(p text)
returns text language sql immutable as $$
  select case when x ~ '^[A-Za-z0-9._]{2,24}$' then x end
    from (select btrim(regexp_replace(coalesce(p, ''), '^\s*@', '')) as x) s
$$;


-- ------------------------------------------------------------
--  3. For everyone: the giveaway that's on.
-- ------------------------------------------------------------

-- The newest published giveaway that has started and closed less
-- than two weeks ago (so "winners drawn" still shows for a while).
-- Signed out too: the website page works before you have an account.
create or replace function public.current_giveaway()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', g.id,
           'title', g.title,
           'prize', g.prize,
           'prize_value_cents', g.prize_value_cents,
           'image_url', g.image_url,
           'starts_at', g.starts_at,
           'ends_at', g.ends_at,
           'tiktok_handle', g.tiktok_handle,
           'referral_cap', g.referral_cap,
           'winners_count', g.winners_count,
           'open', now() >= g.starts_at and now() < g.ends_at)
    from public.giveaways g
   where g.published
     and g.starts_at <= now()
     and g.ends_at > now() - interval '14 days'
   order by g.starts_at desc
   limit 1
$$;

grant execute on function public.current_giveaway() to anon, authenticated;

-- The official rules of any published giveaway, for /giveaway/rules.
create or replace function public.giveaway_rules(p_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', g.id, 'title', g.title, 'rules', g.rules,
                            'starts_at', g.starts_at, 'ends_at', g.ends_at)
    from public.giveaways g
   where g.id = p_id and g.published
$$;

grant execute on function public.giveaway_rules(bigint) to anon, authenticated;


-- ------------------------------------------------------------
--  4. For a signed-in player: where you stand, and entering.
-- ------------------------------------------------------------

create or replace function public.my_giveaway(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  e   public.giveaway_entries;
  dob date;
  bonus int;
begin
  if me is null then
    return null;
  end if;

  select * into e from public.giveaway_entries
   where giveaway_id = p_id and user_id = me;
  select ap.birth_date into dob from public.account_private ap where ap.user_id = me;
  bonus := coalesce(public.giveaway_bonus(p_id, me), 0);

  return jsonb_build_object(
    'entered', e.id is not null,
    'tiktok', e.tiktok,
    'bonus', bonus,
    'entries', case when e.id is null then 0 else 1 + bonus end,
    'has_top5', exists (select 1 from public.top_five t where t.user_id = me),
    'age', case when dob is null then 'unknown'
                when dob <= (current_date - interval '18 years')::date then 'ok'
                else 'under' end);
end;
$$;

revoke all on function public.my_giveaway(bigint) from public, anon;
grant execute on function public.my_giveaway(bigint) to authenticated;


-- @returns 'entered', 'updated' (TikTok username changed), or a
-- sentence saying what's wrong.
create or replace function public.enter_giveaway(p_id bigint, p_tiktok text, p_agree boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  g   public.giveaways;
  tt  text := public.clean_tiktok(p_tiktok);
  dob date;
begin
  if me is null then
    return 'Sign in to enter.';
  end if;

  select * into g from public.giveaways where id = p_id and published;
  if g.id is null then
    return 'That giveaway isn''t running.';
  end if;
  if now() < g.starts_at or now() >= g.ends_at then
    return 'Entries are closed.';
  end if;
  if not coalesce(p_agree, false) then
    return 'Tick the box to agree to the official rules.';
  end if;
  if tt is null then
    return 'That doesn''t look like a TikTok username.';
  end if;
  if not exists (select 1 from public.top_five t where t.user_id = me) then
    return 'Add at least one game to your Top 5 first.';
  end if;

  select ap.birth_date into dob from public.account_private ap where ap.user_id = me;
  if dob is null then
    return 'Add your date of birth in Settings first.';
  end if;
  if dob > (current_date - interval '18 years')::date then
    return 'Giveaways are for players 18 and over.';
  end if;

  if exists (select 1 from public.giveaway_entries
              where giveaway_id = p_id and lower(tiktok) = lower(tt)
                and user_id is distinct from me) then
    return 'That TikTok username has already been entered.';
  end if;

  if exists (select 1 from public.giveaway_entries where giveaway_id = p_id and user_id = me) then
    update public.giveaway_entries set tiktok = tt
     where giveaway_id = p_id and user_id = me;
    return 'updated';
  end if;

  insert into public.giveaway_entries (giveaway_id, user_id, tiktok)
  values (p_id, me, tt);
  return 'entered';
end;
$$;

revoke all on function public.enter_giveaway(bigint, text, boolean) from public, anon;
grant execute on function public.enter_giveaway(bigint, text, boolean) to authenticated;


-- ------------------------------------------------------------
--  5. Developers (DevPanel → Giveaways).
-- ------------------------------------------------------------

create or replace function public.dev_giveaways()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return coalesce((
    select jsonb_agg(
             to_jsonb(g)
             || jsonb_build_object(
                  'entrants', (select count(*) from public.giveaway_entries e where e.giveaway_id = g.id),
                  'email_entrants', (select count(*) from public.giveaway_entries e where e.giveaway_id = g.id and e.email is not null),
                  'total_entries', (select coalesce(sum(public.giveaway_weight(e.id)), 0)
                                      from public.giveaway_entries e where e.giveaway_id = g.id),
                  'winners', coalesce((
                    select jsonb_agg(jsonb_build_object(
                             'id', w.id, 'status', w.status, 'drawn_at', w.drawn_at,
                             'weight', w.weight, 'pool', w.pool,
                             'tiktok', e.tiktok, 'username', p.username,
                             'email', e.email, 'name', e.name)
                           order by w.drawn_at)
                      from public.giveaway_winners w
                      join public.giveaway_entries e on e.id = w.entry_id
                      left join public.profiles p on p.id = e.user_id
                     where w.giveaway_id = g.id), '[]'::jsonb))
           order by g.starts_at desc)
      from public.giveaways g
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dev_giveaways() from public, anon;
grant execute on function public.dev_giveaways() to authenticated;


-- Create (p_id null) or update a giveaway.
-- @returns {"id": n} or {"error": "..."}.
create or replace function public.dev_giveaway_save(
  p_id bigint,
  p_title text,
  p_prize text,
  p_prize_value_cents integer,
  p_image_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_tiktok_handle text,
  p_referral_cap integer,
  p_winners_count integer,
  p_rules text,
  p_published boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text := public.clean_tiktok(p_tiktok_handle);
  new_id bigint;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_prize), '') = '' then
    return jsonb_build_object('error', 'Add a title and the prize.');
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return jsonb_build_object('error', 'The closing time has to be after the opening time.');
  end if;
  if handle is null then
    return jsonb_build_object('error', 'Add the TikTok username people should follow.');
  end if;
  if coalesce(p_published, false) and coalesce(btrim(p_rules), '') = '' then
    return jsonb_build_object('error', 'Write the official rules before publishing.');
  end if;

  if p_id is null then
    insert into public.giveaways (title, prize, prize_value_cents, image_url, starts_at, ends_at,
                                  tiktok_handle, referral_cap, winners_count, rules, published)
    values (btrim(p_title), btrim(p_prize), greatest(coalesce(p_prize_value_cents, 0), 0),
            nullif(btrim(coalesce(p_image_url, '')), ''), p_starts_at, p_ends_at, handle,
            coalesce(p_referral_cap, 10), coalesce(p_winners_count, 1),
            coalesce(p_rules, ''), coalesce(p_published, false))
    returning id into new_id;
  else
    update public.giveaways set
      title = btrim(p_title), prize = btrim(p_prize),
      prize_value_cents = greatest(coalesce(p_prize_value_cents, 0), 0),
      image_url = nullif(btrim(coalesce(p_image_url, '')), ''),
      starts_at = p_starts_at, ends_at = p_ends_at, tiktok_handle = handle,
      referral_cap = coalesce(p_referral_cap, 10), winners_count = coalesce(p_winners_count, 1),
      rules = coalesce(p_rules, ''), published = coalesce(p_published, false)
    where id = p_id
    returning id into new_id;
    if new_id is null then
      return jsonb_build_object('error', 'No such giveaway.');
    end if;
  end if;

  return jsonb_build_object('id', new_id);
end;
$$;

revoke all on function public.dev_giveaway_save(bigint, text, text, integer, text, timestamptz, timestamptz, text, integer, integer, text, boolean) from public, anon;
grant execute on function public.dev_giveaway_save(bigint, text, text, integer, text, timestamptz, timestamptz, text, integer, integer, text, boolean) to authenticated;


-- A free entry by email ("no purchase necessary").
-- @returns 'added', or a sentence saying what's wrong.
create or replace function public.dev_giveaway_add_email_entry(
  p_id bigint, p_name text, p_email text, p_tiktok text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tt text := public.clean_tiktok(p_tiktok);
  em text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;
  if not exists (select 1 from public.giveaways where id = p_id) then
    return 'No such giveaway.';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return 'That doesn''t look like an email address.';
  end if;
  if tt is null then
    return 'That doesn''t look like a TikTok username.';
  end if;
  if exists (select 1 from public.giveaway_entries where giveaway_id = p_id and lower(email) = em) then
    return 'That email has already entered.';
  end if;
  if exists (select 1 from public.giveaway_entries where giveaway_id = p_id and lower(tiktok) = lower(tt)) then
    return 'That TikTok username has already entered.';
  end if;

  insert into public.giveaway_entries (giveaway_id, email, name, tiktok)
  values (p_id, em, nullif(btrim(coalesce(p_name, '')), ''), tt);
  return 'added';
end;
$$;

revoke all on function public.dev_giveaway_add_email_entry(bigint, text, text, text) from public, anon;
grant execute on function public.dev_giveaway_add_email_entry(bigint, text, text, text) to authenticated;


-- Draw one winner, weighted by entries, from everyone not drawn yet.
-- @returns the winner, or {"error": "..."}.
create or replace function public.dev_giveaway_draw(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g      public.giveaways;
  pick   bigint;
  w      int;
  total  int;
  win_id bigint;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select * into g from public.giveaways where id = p_id for update;
  if g.id is null then
    return jsonb_build_object('error', 'No such giveaway.');
  end if;
  if now() < g.ends_at then
    return jsonb_build_object('error', 'Entries are still open. Draw after it closes.');
  end if;

  -- Weighted random pick: each entry's key is -ln(u)/weight and the
  -- smallest wins, so an entry worth 3 is exactly 3 times as likely as
  -- one worth 1. The pool is worked out once and used for both the pick
  -- and the total, so the saved odds match the draw.
  with pool as materialized (
    select e.id as entry_id, public.giveaway_weight(e.id) as weight
      from public.giveaway_entries e
     where e.giveaway_id = p_id
       and not exists (select 1 from public.giveaway_winners x where x.entry_id = e.id)
  ),
  picked as (
    select entry_id, weight from pool
     order by -ln(1 - random()) / weight
     limit 1
  )
  select picked.entry_id, picked.weight, (select sum(weight)::int from pool)
    into pick, w, total
    from picked;

  if pick is null then
    return jsonb_build_object('error', 'Nobody left to draw.');
  end if;

  insert into public.giveaway_winners (giveaway_id, entry_id, weight, pool, drawn_by)
  values (p_id, pick, w, total, auth.uid())
  returning id into win_id;

  return jsonb_build_object('id', win_id, 'weight', w, 'pool', total);
end;
$$;

revoke all on function public.dev_giveaway_draw(bigint) from public, anon;
grant execute on function public.dev_giveaway_draw(bigint) to authenticated;


-- Confirm a drawn winner (they followed and commented) or skip them.
create or replace function public.dev_giveaway_set_winner(p_winner bigint, p_status text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;
  if p_status not in ('drawn', 'confirmed', 'skipped') then
    return 'Unknown status.';
  end if;
  update public.giveaway_winners set status = p_status where id = p_winner;
  return case when found then 'saved' else 'No such winner.' end;
end;
$$;

revoke all on function public.dev_giveaway_set_winner(bigint, text) from public, anon;
grant execute on function public.dev_giveaway_set_winner(bigint, text) to authenticated;


-- Everyone who entered one giveaway, newest first (up to 1,000).
create or replace function public.dev_giveaway_entries(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return coalesce((
    select jsonb_agg(x order by (x->>'entered_at')::timestamptz desc)
      from (
        select jsonb_build_object(
                 'id', e.id, 'tiktok', e.tiktok, 'username', p.username,
                 'email', e.email, 'name', e.name, 'entered_at', e.entered_at,
                 'entries', public.giveaway_weight(e.id)) as x
          from public.giveaway_entries e
          left join public.profiles p on p.id = e.user_id
         where e.giveaway_id = p_id
         order by e.entered_at desc
         limit 1000
      ) s
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dev_giveaway_entries(bigint) from public, anon;
grant execute on function public.dev_giveaway_entries(bigint) to authenticated;


-- ------------------------------------------------------------
--  6. What's New.
-- ------------------------------------------------------------

insert into public.changelog_entries (title, body, kind, weight)
select v.title, v.body, v.kind, v.weight
from (values
    ('Giveaways',
     'Pentra now runs giveaways. When one is on, it shows at the top of Home: enter in a few taps, and earn bonus entries for every friend you invite who starts playing.',
     'feature', 1)
) as v(title, body, kind, weight)
where not exists (
  select 1 from public.changelog_entries c where c.title = v.title
);

-- ============================================================
--  Done.
-- ============================================================
