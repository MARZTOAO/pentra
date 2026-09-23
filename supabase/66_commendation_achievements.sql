-- ============================================================
--  66 — achievements for commendations received.
--
--  Seven rungs: 1, 10, 50, 100, 500, 1,000, 10,000. The top three are
--  meant to be rare — 10,000 is a number almost nobody reaches, and
--  that is the point of having it.
--
--  These are ordinary threshold achievements, so they ride on the
--  machinery from 44: a stat_key, a threshold, and
--  award_threshold_achievements() doing the comparison. Two things
--  had to be added for that to work:
--
--    1. stat_value() learns the key 'commendations', read from
--       profiles.commendation_count (65).
--    2. A trigger on profiles, because the count lives there and not
--       on profile_stats — the same gap 52 closed for derived stats.
--       Without it, the badge would sit unawarded until some unrelated
--       action happened to run the check.
--
--  Nothing in the app changes. The grid reads this table.
--
--  Run in the Supabase SQL Editor, after 65.
-- ============================================================


-- ------------------------------------------------------------
--  1. stat_value() gains 'commendations'.
--
--  The new key is answered from profiles directly, OUTSIDE the read
--  of profile_stats, so it works for an account that has never had a
--  stats row. Everything else is the body from 44, unchanged.
-- ------------------------------------------------------------
create or replace function public.stat_value(target uuid, key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case key
    when 'commendations' then (
      select pr.commendation_count from profiles pr where pr.id = target)
    else (
      select case key
        when 'posts_made'       then s.posts_made
        when 'comments_made'    then s.comments_made
        when 'likes_given'      then s.likes_given
        when 'likes_received'   then s.likes_received
        when 'sessions_hosted'  then s.sessions_hosted
        when 'sessions_joined'  then s.sessions_joined
        when 'invites_sent'     then s.invites_sent
        when 'invites_accepted' then s.invites_accepted
        when 'friends_now'      then s.friends_now
        when 'friends_peak'     then s.friends_peak
        when 'played_with'      then (
          select count(distinct a2.user_id)::int
            from session_attendance a1
            join session_attendance a2
              on a2.post_id = a1.post_id and a2.user_id <> target
           where a1.user_id = target)
        when 'days_member'      then (
          select greatest(0, current_date - coalesce(pr.created_at, now())::date)
            from profiles pr where pr.id = target)
        else null
      end
      from profile_stats s
      where s.user_id = target)
  end;
$$;


-- ------------------------------------------------------------
--  2. The rungs.
--
--  sort_order 230+ sits in the social group, after played_with (210)
--  and friends (220), so "Show all" keeps reading as a ladder.
-- ------------------------------------------------------------
insert into public.achievements
  (code, name, description, category, stat_key, threshold, secret, sort_order)
values
  ('commended_1',     'Vouched For',
     'Received your first commendation.',
     'social', 'commendations', 1,     false, 230),
  ('commended_10',    'Good Company',
     'Received 10 commendations.',
     'social', 'commendations', 10,    false, 231),
  ('commended_50',    'Team Player',
     'Received 50 commendations.',
     'social', 'commendations', 50,    false, 232),
  ('commended_100',   'Pillar of the Community',
     'Received 100 commendations.',
     'social', 'commendations', 100,   false, 233),
  ('commended_500',   'Beloved',
     'Received 500 commendations.',
     'social', 'commendations', 500,   false, 234),
  ('commended_1000',  'Legend',
     'Received 1,000 commendations.',
     'social', 'commendations', 1000,  false, 235),
  ('commended_10000', 'Hall of Fame',
     'Received 10,000 commendations.',
     'social', 'commendations', 10000, false, 236)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  category    = excluded.category,
  stat_key    = excluded.stat_key,
  threshold   = excluded.threshold,
  secret      = excluded.secret,
  sort_order  = excluded.sort_order;


-- ------------------------------------------------------------
--  3. Check when the count moves.
--
--  Only upward: a count that never falls cannot un-earn anything, so
--  there is nothing to do on the way down and no way down anyway.
--  award_threshold_achievements writes profile_achievements, which
--  nothing here watches — no recursion.
-- ------------------------------------------------------------
create or replace function public.commendations_check_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commendation_count > coalesce(old.commendation_count, 0) then
    perform public.award_threshold_achievements(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_commendation_award on public.profiles;
create trigger profiles_commendation_award
  after update of commendation_count on public.profiles
  for each row execute function public.commendations_check_achievements();


-- ------------------------------------------------------------
--  4. Award what anybody is already owed.
--
--  Cheap today, since 65 shipped minutes before this and the counts
--  are all zero. Kept so re-running after a manual fix to somebody's
--  count does the right thing.
-- ------------------------------------------------------------
do $$
declare
  person uuid;
begin
  for person in
    select id from public.profiles where commendation_count > 0
  loop
    perform public.award_threshold_achievements(person);
  end loop;
end $$;

-- ============================================================
--  Done.
-- ============================================================
