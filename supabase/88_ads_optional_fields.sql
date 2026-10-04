-- ============================================================
--  88. Ads: every field optional.
--
--  MARZ (2026-10-03): "when posting an ad I don't want a link to be
--  mandatory. All fields should be optional."
--
--  So an ad can now be:
--    - a picture or video, with or without text, with or without a link;
--    - text alone (a sponsored post with no picture), with or without a
--      link.
--  The one thing it can't be is nothing: either some text or some media
--  has to be there. The media columns go together — a picture needs its
--  width and height — which the check below enforces.
--
--  Without a link the card isn't clickable and counts no clicks; it
--  still counts views.
--
--  Replaces dev_ad_create from 85 with the same signature. The feed's
--  get_live_ads and the manager's dev_ads already return these columns
--  and need no change — they just start carrying nulls.
--
--  Run in the Supabase SQL Editor BEFORE pushing. Re-runnable.
-- ============================================================

alter table public.ads
  alter column media_kind drop not null,
  alter column media_path drop not null,
  alter column width      drop not null,
  alter column height     drop not null,
  alter column link_url   drop not null;

-- The column checks from 85 were written as `col ~ ...`, which already
-- lets a null through (null ~ x is null, and a check only fails on
-- false). Only the cross-column rules are new.
alter table public.ads drop constraint if exists ad_media_complete;
alter table public.ads add constraint ad_media_complete check (
  (media_kind is null and media_path is null and width is null and height is null)
  or
  (media_kind is not null and media_path is not null and width is not null and height is not null)
);

alter table public.ads drop constraint if exists ad_has_something;
alter table public.ads add constraint ad_has_something check (
  media_path is not null or (body is not null and btrim(body) <> '')
);


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
  span    interval;
  new_id  bigint;
  v_body  text := nullif(btrim(coalesce(body, '')), '');
  v_link  text := nullif(btrim(coalesce(link_url, '')), '');
  has_media boolean := media_path is not null;
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

  if not has_media and v_body is null then
    return 'An ad needs a picture, a video or some text.';
  end if;

  if has_media and (media_kind is null or width is null or height is null) then
    return 'The picture or video is missing its size.';
  end if;

  if v_link is not null and v_link !~* '^https?://[^[:space:]]+$' then
    return 'The link has to be a web address starting with https://';
  end if;

  insert into public.ads (sponsor, body, media_kind, media_path, width, height,
                          link_url, starts_at, ends_at, created_by)
  values (coalesce(nullif(btrim(sponsor), ''), 'Pentra'),
          v_body,
          case when has_media then media_kind else null end,
          media_path,
          case when has_media then width  else null end,
          case when has_media then height else null end,
          v_link, now(), now() + span, auth.uid())
  returning id into new_id;

  return new_id::text;
end;
$$;

revoke all on function public.dev_ad_create(text, text, text, text, integer, integer, text, integer, text) from public, anon;
grant execute on function public.dev_ad_create(text, text, text, text, integer, integer, text, integer, text) to authenticated;
