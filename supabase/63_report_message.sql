-- ============================================================
--  63 — report an individual message.
--
--  Until now you could report a person or a post, but not the thing
--  they actually said. For a chat-first app that is the wrong gap to
--  have: "report this person" arrives in the queue with no evidence
--  attached, so the only way to find out what happened is to ask the
--  reporter, which nobody does.
--
--  WHAT THIS ADDS
--    * reports.target_message — which message
--    * reports.message_body   — WHAT IT SAID, captured server-side at
--                               the moment the report is filed
--    * file_report() takes a message and fills both in
--    * dev_report_queue() returns the reported text
--
--  WHY A SNAPSHOT RATHER THAN A JOIN. The sender can delete their
--  message straight after sending it, and 28_delete_message.sql
--  replaces the body with 'Message deleted' on the spot. The original
--  survives in message_deletions, so a join could still find it — but
--  that is one more table to remember, and a hard delete of the
--  message row would take the report's evidence with it. Copying the
--  text into the report makes it independent of both.
--
--  THE SNAPSHOT IS TAKEN BY THE DATABASE, never passed in by the
--  client. A body supplied by the reporter is a body the reporter
--  could have made up, and a moderation queue you cannot trust is
--  worse than none.
--
--  The queue's thresholds are unchanged: 3 distinct reporters, or 1
--  if the reason is severe. A message report sets target_user to the
--  sender, so it groups with everything else already filed about that
--  person rather than forming a separate pile.
--
--  Run in the Supabase SQL Editor, after 62.
-- ============================================================


-- ------------------------------------------------------------
--  1. The columns.
-- ------------------------------------------------------------
alter table public.reports
  add column if not exists target_message bigint
    references public.messages(id) on delete set null;

-- on delete SET NULL, not cascade: if the message row is ever removed
-- for real, the report and its captured text must survive. Cascade
-- here would quietly delete the evidence along with the message.

alter table public.reports
  add column if not exists message_body text;

create index if not exists reports_target_message_idx
  on public.reports (target_message)
  where target_message is not null;


-- The original constraint required a user or a post. A message report
-- always sets target_user as well, so this is belt and braces — but
-- leaving the old one in place would reject a message-only report if
-- that ever changes.
-- Found by what it says rather than by name: the original was written
-- inline in `create table`, so Postgres named it, and that name is an
-- implementation detail nobody should have to guess at.
do $$
declare c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.reports'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%target_user%'
       and pg_get_constraintdef(oid) like '%target_post%'
  loop
    execute format('alter table public.reports drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.reports add constraint reports_target_present
  check (
    target_user is not null
    or target_post is not null
    or target_message is not null
  );


-- ------------------------------------------------------------
--  2. file_report, now with messages.
--
--  The old four-argument version is DROPPED rather than left beside
--  this one. PostgREST resolves overloads by argument names, and two
--  candidates that both match a four-name call give
--  "could not choose best candidate function" at runtime — a failure
--  that only shows up when somebody files a report.
-- ------------------------------------------------------------
drop function if exists public.file_report(uuid, bigint, text, text);

create or replace function public.file_report(
  target_user_id    uuid   default null,
  target_post_id    bigint default null,
  reason            text   default 'other',
  detail            text   default null,
  target_message_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  msg      record;
  snapshot text;
  subject  uuid := target_user_id;
begin
  if target_user_id is null
     and target_post_id is null
     and target_message_id is null then
    raise exception 'Nothing to report';
  end if;

  if target_message_id is not null then
    select m.id, m.sender_id, m.body, m.deleted_at, m.conversation_id
      into msg
      from messages m
     where m.id = target_message_id;

    if not found then
      raise exception 'That message no longer exists';
    end if;

    -- You can only report a message you were actually sent. Without
    -- this, any id could be posted at this function to find out
    -- whether it exists.
    if not public.in_conversation(msg.conversation_id) then
      raise exception 'That message is not in one of your conversations';
    end if;

    if msg.sender_id = auth.uid() then
      raise exception 'You cannot report your own message';
    end if;

    -- If they deleted it first, the body column now reads
    -- 'Message deleted' and the real text is in message_deletions.
    -- Deleting a message must not be a way to erase what it said.
    if msg.deleted_at is not null then
      select d.original_body into snapshot
        from message_deletions d
       where d.message_id = msg.id;
    else
      snapshot := msg.body;
    end if;

    -- A message report is a report about whoever sent it, so it lands
    -- in the same pile as anything else filed about that person and
    -- the existing queue grouping needs no special case.
    subject := coalesce(subject, msg.sender_id);
  end if;

  if subject = auth.uid() then
    raise exception 'You cannot report yourself';
  end if;

  insert into reports (
    reporter_id, target_user, target_post, target_message,
    message_body, reason, detail
  )
  values (
    auth.uid(), subject, target_post_id, target_message_id,
    snapshot, reason, nullif(trim(detail), '')
  );
end;
$$;

-- SECURITY DEFINER because it reads `messages` to take the snapshot.
-- Everything it will read is gated on in_conversation() above, so it
-- can only ever copy text the caller was already shown.

grant execute on function
  public.file_report(uuid, bigint, text, text, bigint) to authenticated;


-- ------------------------------------------------------------
--  3. The queue shows what was said.
--
--  Dropped first: `create or replace` cannot change a function's
--  return columns (42P13), and this adds one.
-- ------------------------------------------------------------
drop function if exists public.dev_report_queue();

create or replace function public.dev_report_queue()
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  avatar_preset  text,
  reports        int,
  reporters      int,
  reasons        text[],
  details        text[],
  -- What they actually said, for the reports that named a message.
  quotes         text[],
  first_at       timestamptz,
  last_at        timestamptz,
  severe         boolean,
  banned_until   timestamptz,
  warn_count     int,
  last_action    text,
  last_action_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.am_i_developer() then
    raise exception 'not a developer';
  end if;

  return query
  with open_reports as (
    select
      coalesce(r.target_user, p.author_id) as subject,
      r.reporter_id,
      r.reason,
      r.detail,
      r.message_body,
      r.created_at
    from public.reports r
    left join public.posts p on p.id = r.target_post
    where r.status = 'open'
      and coalesce(r.target_user, p.author_id) is not null
  ),
  grouped as (
    select
      o.subject,
      count(*)::int                           as n,
      count(distinct o.reporter_id)::int      as people,
      array_agg(distinct o.reason)            as why,
      array_remove(array_agg(o.detail), null) as said,
      -- distinct: three people reporting the same message should
      -- show that message once, not three times.
      array_remove(array_agg(distinct o.message_body), null) as quoted,
      min(o.created_at)                       as first_at,
      max(o.created_at)                       as last_at,
      bool_or(o.reason in ('threats', 'underage', 'sexual')) as severe
    from open_reports o
    group by o.subject
  )
  select
    g.subject,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.avatar_preset,
    g.n,
    g.people,
    g.why,
    g.said,
    g.quoted,
    g.first_at,
    g.last_at,
    g.severe,
    pr.banned_until,
    pr.warn_count,
    (select m.action from public.moderation_actions m
      where m.target_id = g.subject order by m.created_at desc limit 1),
    (select m.created_at from public.moderation_actions m
      where m.target_id = g.subject order by m.created_at desc limit 1)
  from grouped g
  join public.profiles pr on pr.id = g.subject
  where g.people >= 3 or g.severe
  order by g.severe desc, g.people desc, g.last_at desc;
end;
$$;

grant execute on function public.dev_report_queue() to authenticated;

-- ============================================================
--  Done.
-- ============================================================
