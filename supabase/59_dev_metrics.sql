-- ============================================================
--  59 — the numbers, for developers only.
--
--    dev_metrics()   one call, one jsonb object, four sections
--
--  WHY jsonb AND NOT A TABLE. Because this will grow. Changing a
--  function's RETURNS TABLE needs a DROP first — Postgres refuses to
--  replace one in place — so every new metric would mean dropping and
--  recreating, and any client still asking for the old shape breaks
--  in between. A json object gains a key and nothing else notices.
--
--  WHAT THIS DELIBERATELY DOES NOT DO. It counts. It does not read
--  anybody's messages, it does not name who talked to whom, and it
--  does not show what any individual is doing. That is a line worth
--  drawing on purpose rather than discovering later: an owner who
--  cannot read private messages cannot be pressured into it, cannot
--  leak them, and cannot be tempted at 1am. The numbers below answer
--  "is Pentra working" without answering "what is this person doing",
--  and the second question is not one the product needs.
--
--  ACTIVITY MEANS last_seen_at. Worth knowing what that measures:
--  going invisible stops it being updated (see 32_presence.sql), so
--  an invisible regular reads as inactive here. At small numbers that
--  is a rounding error; if it ever is not, this is where to fix it.
--
--  Run in the Supabase SQL Editor, after 58.
-- ============================================================

create or replace function public.dev_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  out jsonb;
begin
  -- Not decoration. This is a definer function, so it reads straight
  -- past row level security; this check is the only thing between an
  -- ordinary account and every count in the database.
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  select jsonb_build_object(

    'generated_at', now(),

    -- ------------------------------------------------------
    --  Growth
    -- ------------------------------------------------------
    'growth', (
      select jsonb_build_object(
        'accounts',        count(*),
        'new_today',       count(*) filter (where p.created_at >= current_date),
        'new_7d',          count(*) filter (where p.created_at >= now() - interval '7 days'),
        'new_30d',         count(*) filter (where p.created_at >= now() - interval '30 days'),
        'active_24h',      count(*) filter (where p.last_seen_at >= now() - interval '24 hours'),
        'active_7d',       count(*) filter (where p.last_seen_at >= now() - interval '7 days'),
        'active_30d',      count(*) filter (where p.last_seen_at >= now() - interval '30 days')
      )
      from public.profiles p
    ),

    -- ------------------------------------------------------
    --  Engagement
    -- ------------------------------------------------------
    'engagement', jsonb_build_object(
      'posts',            (select count(*) from public.posts where kind = 'text'),
      'posts_7d',         (select count(*) from public.posts
                            where kind = 'text' and created_at >= now() - interval '7 days'),
      'sessions',         (select count(*) from public.posts where kind = 'lfg'),
      'sessions_7d',      (select count(*) from public.posts
                            where kind = 'lfg' and created_at >= now() - interval '7 days'),
      'comments',         (select count(*) from public.post_comments),
      'comments_7d',      (select count(*) from public.post_comments
                            where created_at >= now() - interval '7 days'),
      'likes',            (select count(*) from public.post_likes),
      'messages_7d',      (select count(*) from public.messages
                            where created_at >= now() - interval '7 days'),
      'friendships',      (select count(*) from public.friendships where status = 'accepted'),
      'session_joins',    (select count(*) from public.session_players),

      -- The one that actually says whether sessions work. A session
      -- nobody joins is a post; the point of the feature is the
      -- second person. Host-only sessions are counted separately
      -- rather than folded into an average, because an average fill
      -- rate hides them and they are the number that matters.
      'sessions_past',    (select count(*) from public.posts
                            where kind = 'lfg' and starts_at < now()),
      'sessions_host_only', (
        select count(*)
        from public.posts p
        where p.kind = 'lfg'
          and p.starts_at < now()
          and (select count(*) from public.session_players s
                where s.post_id = p.id) <= 1
      ),
      'avg_fill_pct', (
        select round(avg(
          least(1.0, (select count(*) from public.session_players s where s.post_id = p.id)
                     / nullif(p.slots, 0)::numeric)
        ) * 100)
        from public.posts p
        where p.kind = 'lfg' and p.starts_at < now()
      )
    ),

    -- ------------------------------------------------------
    --  Retention — the section that decides whether this works
    -- ------------------------------------------------------
    'retention', jsonb_build_object(

      -- Of the people who were around the week before last, how many
      -- came back last week. Anything else is a vanity metric.
      'returned_pct', (
        select case
                 when count(*) = 0 then null
                 else round(
                   100.0 * count(*) filter (
                     where p.last_seen_at >= now() - interval '7 days')
                   / count(*)
                 )
               end
        from public.profiles p
        where p.created_at < now() - interval '7 days'
      ),

      -- Signed up over a month ago and still turning up. The real
      -- test, and the one that takes longest to earn.
      'month_old_still_active', (
        select count(*)
        from public.profiles p
        where p.created_at < now() - interval '30 days'
          and p.last_seen_at >= now() - interval '7 days'
      ),

      -- Signed up and never really arrived. Watch this one: it is
      -- usually an onboarding problem, not a product one.
      'never_returned', (
        select count(*)
        from public.profiles p
        where p.created_at < now() - interval '7 days'
          and (p.last_seen_at is null
               or p.last_seen_at < p.created_at + interval '1 day')
      ),

      'gone_quiet_14d', (
        select count(*)
        from public.profiles p
        where p.created_at < now() - interval '14 days'
          and (p.last_seen_at is null
               or p.last_seen_at < now() - interval '14 days')
      ),

      -- How many finished setting up. An empty profile cannot match
      -- anybody, so this is a leading indicator for everything else.
      'with_top_five', (
        select count(distinct t.user_id) from public.top_five t
      )
    ),

    -- ------------------------------------------------------
    --  Referrals
    -- ------------------------------------------------------
    'referrals', jsonb_build_object(
      'codes_live',    (select count(*) from public.referral_codes
                         where retired_at is null and user_id is not null),
      'signups',       (select count(*) from public.referrals),
      'signups_7d',    (select count(*) from public.referrals
                         where created_at >= now() - interval '7 days'),
      'qualified',     (select count(*) from public.referrals
                         where qualified_at is not null),
      -- Of the people who arrived by a link, how many actually
      -- played. A referral that never qualifies brought a signup,
      -- not a player.
      'qualified_pct', (
        select case
                 when count(*) = 0 then null
                 else round(100.0 * count(*) filter (where qualified_at is not null)
                            / count(*))
               end
        from public.referrals
      )
    )

  ) into out;

  return out;
end;
$$;

revoke all on function public.dev_metrics() from public;
grant execute on function public.dev_metrics() to authenticated;


-- ------------------------------------------------------------
--  A small one: what this database actually is.
--
--  Cheap, and it answers the question you will ask most often when
--  something looks wrong — "am I even pointed at the right project?"
-- ------------------------------------------------------------
create or replace function public.dev_environment()
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

  return jsonb_build_object(
    'database',     current_database(),
    'postgres',     version(),
    'server_time',  now(),
    'timezone',     current_setting('TimeZone'),
    'tables',       (select count(*) from information_schema.tables
                      where table_schema = 'public'),
    'functions',    (select count(*) from pg_proc p
                      join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'),
    'oldest_account', (select min(created_at) from public.profiles)
  );
end;
$$;

revoke all on function public.dev_environment() from public;
grant execute on function public.dev_environment() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
