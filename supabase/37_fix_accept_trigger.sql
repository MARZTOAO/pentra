-- ============================================================
--  37 — FIX: accepting a friend request was failing.
--
--  Symptom: accepting a request errored with
--      invalid input value for enum friendship_status: ""
--  and the friendship stayed pending. Introduced by 33_notifications.
--
--  The cause. `friendships.status` is a Postgres ENUM, not text, and
--  the trigger added in 33 guarded its "only fire on the transition"
--  check like this:
--
--      coalesce(old.status, '') <> 'accepted'
--
--  To evaluate that, Postgres has to coerce the empty string to
--  friendship_status — and '' is not one of its labels, so it throws
--  before the comparison ever happens. The coalesce was pointless as
--  well as fatal: this is an AFTER UPDATE trigger, so OLD always
--  exists and old.status is never null.
--
--  `is distinct from` does the same job with no literal to coerce,
--  and is null-safe by definition. It is the right idiom for this
--  comparison whatever the column type.
--
--  Nothing else needs changing: the other triggers in 33 and 34 only
--  ever compare against real enum labels or plain text columns.
--
--  Run in the Supabase SQL Editor, after 36. Urgent — friend requests
--  cannot be accepted until this is applied.
-- ============================================================

create or replace function public.notify_friend_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on the transition into 'accepted'. send_friend_request() can
  -- touch this row for other reasons, and re-notifying on every write
  -- would tell the requester "accepted" more than once.
  --
  -- `is distinct from` rather than a coalesce: status is an enum, and
  -- comparing it to a placeholder string makes Postgres try to coerce
  -- that string into the enum, which fails at runtime. See the note
  -- at the top of this file.
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.push_notification(
      new.requester_id, 'friend_accepted', new.addressee_id);
  end if;

  return new;
end;
$$;

-- ============================================================
--  Done. Accepting a request works again, and still notifies once.
-- ============================================================
