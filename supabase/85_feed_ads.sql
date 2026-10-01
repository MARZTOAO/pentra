-- ============================================================
--  85 — ads in the feed.
--
--  MARZ: "Every 5th post in the feed should be an ad … an image or
--  video … set the duration … days, weeks, months or years … write a
--  post if need be … if someone clicks the image or video it links to
--  a url and automatically opens it in their browser. If there are no
--  ads currently then they shouldn't show in feed. … run multiple ads
--  at once and … auto rotate between them at an equal rate."
--  And: "a views and clicks number per ad but it shouldn't be displayed
--  to the public but instead tracked in the in app ads manager for devs
--  only." Decided: everyone sees ads, Pro included.
--
--  WHAT THIS ADDS
--    ads            the ads. Sealed: only developers write them (dev_*
--                   functions) and players read live ones through
--                   get_live_ads().
--    ad_stats       views and clicks per ad per day — NUMBERS ONLY.
--                   Nothing records who saw or clicked anything.
--    'ads' bucket   the images and videos. Public to read (like post
--                   pictures); only developers can upload or delete.
--
--  Where an ad goes in the feed (every 5th item) and which ad fills
--  each slot (rotating evenly) is decided in the app — lib/ads.ts.
--  The database only says which ads are live right now.
--
--  An ad is live from the moment it's made until its end time. "End
--  now" moves the end time to now; delete removes it and its numbers.
--
--  Run in the Supabase SQL Editor. Re-runnable. Safe before or after
--  the push: the old app never asks for ads, and the new one shows
--  none until this has run.
-- ============================================================


-- ------------------------------------------------------------
--  1. The ads.
-- ------------------------------------------------------------
create table if not exists public.ads (
  id          bigint generated always as identity primary key,
  -- Shown as the name on the card: who the ad is for.
  sponsor     text not null default 'Pentra'
              check (char_length(btrim(sponsor)) between 1 and 40),
  -- The optional post text above the picture.
  body        text check (body is null or char_length(body) <= 500),
  media_kind  text not null check (media_kind in ('image', 'video')),
  -- A file in the 'ads' bucket: a random name the app chose. The
  -- pattern stops an ad pointing at anything else.
  media_path  text not null
              check (media_path ~ '^[0-9a-f-]{36}\.(webp|jpg|jpeg|png|gif|avif|mp4|webm)$'),
  width       integer not null check (width  between 1 and 10000),
  height      integer not null check (height between 1 and 10000),
  -- Where a click goes. Web addresses only.
  link_url    text not null
              check (char_length(link_url) <= 2000
                     and link_url ~* '^https?://[^[:space:]]+$'),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id) on delete set null,

  constraint ad_runs_forward check (ends_at > starts_at)
);

create index if not exists ads_live_idx on public.ads (ends_at, starts_at);

alter table public.ads enable row level security;
revoke all on table public.ads from public, anon, authenticated;


-- ------------------------------------------------------------
--  2. The numbers. One row per ad per day; totals are a sum.
-- ------------------------------------------------------------
create table if not exists public.ad_stats (
  ad_id  bigint  not null references public.ads(id) on delete cascade,
  day    date    not null,
  views  integer not null default 0 check (views  >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  primary key (ad_id, day)
);

alter table public.ad_stats enable row level security;
revoke all on table public.ad_stats from public, anon, authenticated;


-- ------------------------------------------------------------
--  3. The bucket. 50 MB a file (Supabase's free-plan ceiling) and
--     pictures and videos only.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 52428800,
        array['image/webp','image/jpeg','image/png','image/gif','image/avif',
              'video/mp4','video/webm'])
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ad media is publicly readable" on storage.objects;
create policy "ad media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'ads');

drop policy if exists "developers upload ad media" on storage.objects;
create policy "developers upload ad media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ads' and public.am_i_developer());

drop policy if exists "developers delete ad media" on storage.objects;
create policy "developers delete ad media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ads' and public.am_i_developer());

-- No update policy: a file is written once. A new picture is a new ad.


-- ------------------------------------------------------------
--  4. For the feed: the ads running right now.
-- ------------------------------------------------------------
create or replace function public.get_live_ads()
returns table (
  id         bigint,
  sponsor    text,
  body       text,
  media_kind text,
  media_path text,
  width      integer,
  height     integer,
  link_url   text
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.sponsor, a.body, a.media_kind, a.media_path,
         a.width, a.height, a.link_url
    from public.ads a
   where auth.uid() is not null
     and a.starts_at <= now()
     and a.ends_at   >  now()
   order by a.id;
$$;

revoke all on function public.get_live_ads() from public, anon;
grant execute on function public.get_live_ads() to authenticated;


-- ------------------------------------------------------------
--  5. Counting. The app calls this when an ad has been on screen for
--     a second ('view') and when it's clicked ('click'). Adds one to
--     today's number; stores nothing about who.
--
--  Honest limit: anyone signed in could call this by hand and pad the
--  numbers. Stopping that means remembering who has seen what, which
--  is the thing this is built not to do. Treat them as good estimates.
-- ------------------------------------------------------------
create or replace function public.record_ad_event(ad bigint, what text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or what not in ('view', 'click') then
    return;
  end if;

  -- Only ads that are running (or ended in the last few minutes — a
  -- click on a card that was on screen as it ended still counts).
  if not exists (
    select 1 from public.ads a
     where a.id = ad
       and a.starts_at <= now()
       and a.ends_at   >  now() - interval '10 minutes'
  ) then
    return;
  end if;

  insert into public.ad_stats as s (ad_id, day, views, clicks)
  values (ad, (now() at time zone 'UTC')::date,
          case when what = 'view'  then 1 else 0 end,
          case when what = 'click' then 1 else 0 end)
  on conflict (ad_id, day) do update
    set views  = s.views  + excluded.views,
        clicks = s.clicks + excluded.clicks;
end;
$$;

revoke all on function public.record_ad_event(bigint, text) from public, anon;
grant execute on function public.record_ad_event(bigint, text) to authenticated;


-- ------------------------------------------------------------
--  6. The ads manager (DevPanel → Ads). Developers only; each checks
--     am_i_developer() first — they're definer functions, so that
--     check is all that stands between a player and these.
-- ------------------------------------------------------------

-- Every ad, newest first, with its totals.
create or replace function public.dev_ads()
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
    select jsonb_agg(jsonb_build_object(
             'id',         a.id,
             'sponsor',    a.sponsor,
             'body',       a.body,
             'media_kind', a.media_kind,
             'media_path', a.media_path,
             'width',      a.width,
             'height',     a.height,
             'link_url',   a.link_url,
             'starts_at',  a.starts_at,
             'ends_at',    a.ends_at,
             'created_at', a.created_at,
             'live',       a.starts_at <= now() and a.ends_at > now(),
             'views',      coalesce(t.views, 0),
             'clicks',     coalesce(t.clicks, 0),
             'views_today',  coalesce(d.views, 0),
             'clicks_today', coalesce(d.clicks, 0))
           order by (a.ends_at > now()) desc, a.created_at desc)
      from public.ads a
      left join (select ad_id, sum(views) as views, sum(clicks) as clicks
                   from public.ad_stats group by ad_id) t on t.ad_id = a.id
      left join public.ad_stats d
             on d.ad_id = a.id and d.day = (now() at time zone 'UTC')::date
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.dev_ads() from public, anon;
grant execute on function public.dev_ads() to authenticated;


-- Make one. Runs from now for run_for × unit.
-- Returns the new id, or a sentence saying what's wrong.
create or replace function public.dev_ad_create(
  sponsor    text,
  body       text,
  media_kind text,
  media_path text,
  width      integer,
  height     integer,
  link_url   text,
  run_for    integer,
  unit       text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  span   interval;
  new_id bigint;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  if run_for is null or run_for < 1 then
    return 'The duration has to be at least 1.';
  end if;

  span := case unit
            when 'days'   then make_interval(days   => run_for)
            when 'weeks'  then make_interval(weeks  => run_for)
            when 'months' then make_interval(months => run_for)
            when 'years'  then make_interval(years  => run_for)
          end;
  if span is null then
    return 'Pick days, weeks, months or years.';
  end if;
  if now() + span > now() + interval '10 years' then
    return 'That''s longer than 10 years.';
  end if;

  if link_url is null or link_url !~* '^https?://[^[:space:]]+$' then
    return 'The link has to be a web address starting with https://';
  end if;

  insert into public.ads (sponsor, body, media_kind, media_path, width, height,
                          link_url, starts_at, ends_at, created_by)
  values (coalesce(nullif(btrim(sponsor), ''), 'Pentra'),
          nullif(btrim(body), ''),
          media_kind, media_path, width, height,
          btrim(link_url), now(), now() + span, auth.uid())
  returning id into new_id;

  return new_id::text;
end;
$$;

revoke all on function public.dev_ad_create(text, text, text, text, integer, integer, text, integer, text) from public, anon;
grant execute on function public.dev_ad_create(text, text, text, text, integer, integer, text, integer, text) to authenticated;


-- Stop one now. Its numbers stay.
create or replace function public.dev_ad_end(ad bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  update public.ads
     set ends_at = greatest(now(), starts_at + interval '1 second')
   where id = ad and ends_at > now();

  return case when found then 'ended' else 'not running' end;
end;
$$;

revoke all on function public.dev_ad_end(bigint) from public, anon;
grant execute on function public.dev_ad_end(bigint) to authenticated;


-- Remove one and its numbers. Returns the file's path so the app can
-- delete the picture too, or null if there was no such ad.
create or replace function public.dev_ad_delete(ad bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gone text;
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  delete from public.ads where id = ad returning media_path into gone;
  return gone;
end;
$$;

revoke all on function public.dev_ad_delete(bigint) from public, anon;
grant execute on function public.dev_ad_delete(bigint) to authenticated;

-- ============================================================
--  Done. No What's New entry: the first ad speaks for itself, and the
--  Privacy page (updated with this) explains what's counted.
--
--  Check (read-only):
--    select id, sponsor, ends_at, ends_at > now() as live from public.ads;
-- ============================================================
