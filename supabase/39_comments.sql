-- ============================================================
--  39 — comments on posts.
--
--  A reply under a post, and a notification to whoever wrote it.
--
--  Two decisions worth stating:
--
--  Deleting is HARD here, unlike messages. A deleted message leaves a
--  tombstone because a conversation someone is reporting has to stay
--  investigable, and because a gap in a thread you were part of is
--  confusing. A comment under a public post is neither: it simply
--  goes, the way it does everywhere else.
--
--  The post's author can delete comments on their own post. Somebody
--  has to be able to clear something abusive off their own wall
--  without waiting for a moderator, and there is no moderator.
--
--  Run in the Supabase SQL Editor, after 38.
-- ============================================================


create table if not exists public.post_comments (
  id         bigint generated always as identity primary key,
  post_id    bigint not null references public.posts(id)    on delete cascade,
  author_id  uuid   not null references public.profiles(id) on delete cascade,
  body       text   not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

-- Readable by anyone who can see the post, which is anyone signed in,
-- minus people you've blocked. The block check is what stops someone
-- you blocked reaching you in the replies of a post you can both see.
drop policy if exists "comments are readable" on public.post_comments;
create policy "comments are readable"
  on public.post_comments for select
  to authenticated
  using (not public.is_blocked(author_id));

drop policy if exists "write your own comments" on public.post_comments;
create policy "write your own comments"
  on public.post_comments for insert
  to authenticated
  with check (
    author_id = auth.uid()
    -- No commenting under someone who has blocked you, or who you
    -- have blocked. Enforced here rather than by hiding the box.
    and not exists (
      select 1 from posts p
      where p.id = post_id and public.is_blocked(p.author_id)
    )
  );

-- Your own comment, or any comment on your own post.
drop policy if exists "delete your own comments" on public.post_comments;
create policy "delete your own comments"
  on public.post_comments for delete
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
--  Notify the post's author.
--
--  push_notification() already refuses to notify someone about their
--  own action, so commenting on your own post is silent without a
--  special case here.
-- ------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check check (kind in (
    'friend_request', 'friend_accepted',
    'session_day', 'session_hour', 'friend_lfg',
    'post_mention', 'post_comment'));

alter table public.notification_settings
  add column if not exists post_comments boolean not null default true;

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
              when 'post_comment'    then post_comments
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


create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select p.author_id into owner from posts p where p.id = new.post_id;

  -- One notification per post per person, thanks to the unique index
  -- from 33. Somebody who comments five times on the same post does
  -- not ring the bell five times — the author already knows.
  perform public.push_notification(
    owner, 'post_comment', new.author_id, new.post_id);

  return new;
end;
$$;

drop trigger if exists comment_notifies_author on public.post_comments;
create trigger comment_notifies_author
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();


-- ------------------------------------------------------------
--  Reading them.
-- ------------------------------------------------------------
create or replace function public.get_comments(want_post bigint)
returns table (
  id            bigint,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  avatar_preset text,
  mine          boolean,
  can_delete    boolean
)
language sql
security invoker
set search_path = public
stable
as $$
  select
    c.id, c.body, c.created_at,
    c.author_id, a.username, a.display_name, a.avatar_url, a.avatar_preset,
    c.author_id = auth.uid() as mine,
    -- Mirrors the delete policy. The database is what enforces it;
    -- this is only so the interface knows whether to draw the button.
    (c.author_id = auth.uid()
     or exists (select 1 from posts p
                where p.id = c.post_id and p.author_id = auth.uid())) as can_delete
  from post_comments c
  join profiles a on a.id = c.author_id
  where c.post_id = want_post
    and not public.is_blocked(c.author_id)
  order by c.created_at asc;
$$;

grant execute on function public.get_comments(bigint) to authenticated;


-- ------------------------------------------------------------
--  Counts for a feed full of posts, in one call.
--
--  get_feed and get_post predate comments and return a fixed column
--  list; `create or replace` cannot change a function's return type,
--  so adding a count to them means dropping and recreating two long
--  functions. One batched lookup is a great deal less to disturb.
-- ------------------------------------------------------------
create or replace function public.comment_counts(ids bigint[])
returns table (post_id bigint, total bigint)
language sql
security invoker
set search_path = public
stable
as $$
  select c.post_id, count(*)
  from post_comments c
  where c.post_id = any(ids)
    and not public.is_blocked(c.author_id)
  group by c.post_id;
$$;

grant execute on function public.comment_counts(bigint[]) to authenticated;

-- ============================================================
--  Done.
-- ============================================================
