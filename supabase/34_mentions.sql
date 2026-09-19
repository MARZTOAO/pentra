-- ============================================================
--  34 — tagging friends in a post.
--
--  Typing "@nightowl_92" in a post links to that profile and tells
--  them about it.
--
--  The tags are derived from the post body by a trigger rather than
--  passed in alongside it. Two reasons:
--
--    1. create_post() doesn't have to change. Adding a parameter to
--       it means dropping and recreating a function several screens
--       already call, for a field the body already contains.
--
--    2. The text and the tags cannot disagree. If the client sent a
--       list, a bug could notify someone whose name never appears in
--       the post — or link a name that notifies nobody. Reading the
--       body is the only version where what you see is what happened.
--
--  This is only safe because usernames are immutable in this app
--  (see the profile screen: "Your username can't be changed for now").
--  If that ever changes, mentions have to be stored as ids at compose
--  time instead, and this file needs revisiting.
--
--  Run in the Supabase SQL Editor, after 33.
-- ============================================================


-- ------------------------------------------------------------
--  Who was tagged in what.
--
--  Kept as rows rather than left implicit in the text so that "posts
--  I'm tagged in" is a query rather than a scan of every post body.
-- ------------------------------------------------------------
create table if not exists public.post_mentions (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid   not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create index if not exists post_mentions_user_idx
  on public.post_mentions (user_id);

alter table public.post_mentions enable row level security;

-- Tags are part of a post, and posts are public to signed-in players,
-- so these are readable by anyone who can read the post. There is no
-- write policy: the trigger below is the only writer.
drop policy if exists "mentions are readable" on public.post_mentions;
create policy "mentions are readable"
  on public.post_mentions for select
  to authenticated using (true);


-- ------------------------------------------------------------
--  Let notifications carry the new kind.
--
--  The check constraint has to be replaced rather than added to.
-- ------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'friend_request', 'friend_accepted',
    'session_day', 'session_hour', 'friend_lfg',
    'post_mention'));

alter table public.notification_settings
  add column if not exists post_mentions boolean not null default true;

-- push_notification() needs to know about the new setting. Replaced
-- whole rather than patched, since a plpgsql body can't be amended.
create or replace function public.push_notification(
  recipient uuid,
  n_kind    text,
  actor     uuid   default null,
  post      bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  if recipient is null or recipient = actor then
    return;
  end if;

  select coalesce(
    (select case n_kind
              when 'friend_request'  then friend_requests
              when 'friend_accepted' then friend_accepted
              when 'session_day'     then session_reminders
              when 'session_hour'    then session_reminders
              when 'friend_lfg'      then friend_lfg
              when 'post_mention'    then post_mentions
              else true
            end
       from notification_settings where user_id = recipient),
    true) into allowed;

  if not allowed then
    return;
  end if;

  insert into notifications (user_id, kind, actor_id, post_id)
  values (recipient, n_kind, actor, post)
  on conflict do nothing;
end;
$$;


-- ------------------------------------------------------------
--  Read the tags out of the body.
--
--  Only accepted friends are tagged. Anyone can write any name in a
--  post — that's just text — but a stranger's name does not become a
--  row here and does not reach their bell. Being able to put an
--  arbitrary player's name into a notification is a spam and
--  harassment tool, and the friend check is what closes it.
--
--  The pattern matches the signup rule in 02_username_check.sql:
--  3–20 of letters, digits and underscore. Comparison is
--  case-insensitive because people type names the way they remember
--  them, not the way they were registered.
-- ------------------------------------------------------------
create or replace function public.record_post_mentions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
  tagged uuid;
begin
  for handle in
    select distinct lower(m[1])
    from regexp_matches(new.body, '@([A-Za-z0-9_]{3,20})', 'g') as m
  loop
    select p.id into tagged
    from profiles p
    where lower(p.username) = handle
      and p.id <> new.author_id
      -- Friends only, in either direction.
      and exists (
        select 1 from friendships f
        where f.status = 'accepted'
          and ((f.requester_id = new.author_id and f.addressee_id = p.id)
            or (f.requester_id = p.id and f.addressee_id = new.author_id))
      )
      and not public.is_blocked(p.id);

    if tagged is not null then
      insert into post_mentions (post_id, user_id)
      values (new.id, tagged)
      on conflict do nothing;

      perform public.push_notification(
        tagged, 'post_mention', new.author_id, new.id);
    end if;

    tagged := null;
  end loop;

  return new;
end;
$$;

drop trigger if exists post_records_mentions on public.posts;
create trigger post_records_mentions
  after insert on public.posts
  for each row execute function public.record_post_mentions();


-- ------------------------------------------------------------
--  Who can I tag?
--
--  Feeds the composer's autocomplete. Returns accepted friends whose
--  name or display name starts with what's been typed, so the list
--  narrows the way people expect rather than matching mid-word.
-- ------------------------------------------------------------
create or replace function public.mentionable_friends(prefix text default '')
returns table (
  id            uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text
)
language sql
security invoker
set search_path = public
stable
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.avatar_preset
  from friendships f
  join profiles p
    on p.id = case when f.requester_id = auth.uid()
                   then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
    and (
      prefix = ''
      or p.username     ilike prefix || '%'
      or p.display_name ilike prefix || '%'
    )
  order by p.username
  limit 6;
$$;

grant execute on function public.mentionable_friends(text) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
