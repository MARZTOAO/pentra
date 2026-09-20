import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  headsetLabel,
  joinSession,
  leaveSession,
  removeSessionPlayer,
  sessionTime,
  startsIn,
  type Post,
} from "../lib/feed";
import {
  acceptSessionInvite,
  cancelSessionInvite,
  declineSessionInvite,
  getSessionInvites,
  type SessionInvite,
} from "../lib/invites";
import { useLiveRows } from "../lib/live";
import { useAuth } from "../lib/AuthContext";
import { Avatar } from "./Avatar";
import { InviteFriends } from "./InviteFriends";

/**
 * The session panel inside a post: when, who's in, and the slots
 * still open.
 *
 * Empty slots are drawn as dashed circles rather than written as
 * "2 spaces left". Seeing three gaps where faces should be is a far
 * stronger prompt to join than a number is.
 *
 * A slot can also be *held*: someone in the session has invited a
 * friend, and that friend hasn't answered yet. Those render as a
 * dimmed face rather than an empty circle, because the slot is
 * genuinely spoken for — the database counts it as taken until the
 * invite is answered or the session starts.
 */
export function SessionCard({
  post,
  onChange,
}: {
  post: Post;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [invites, setInvites] = useState<SessionInvite[]>([]);
  const [picking, setPicking] = useState(false);

  const loadInvites = useCallback(async () => {
    setInvites(await getSessionInvites([post.id]));
  }, [post.id]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  // Somebody joined or left. The roster, the slot count and the dashed
  // gaps all come from the post, so the honest fix is to refetch it
  // rather than patch three things by hand — and it keeps two people
  // looking at the same session from seeing different numbers, which
  // is how both of them end up taking the last slot.
  //
  // Not while busy: our own call is already in flight and about to
  // call onChange itself.
  useLiveRows("session_players", post.id, () => {
    if (!busy) onChange();
    // Joining clears any invite the joiner was holding, so the held
    // slots are stale now whoever caused this.
    loadInvites();
  });

  useLiveRows("session_invites", post.id, () => {
    loadInvites();
  });

  const slots = post.slots ?? 0;
  const taken = Number(post.taken ?? 0);
  // Held slots are taken slots. This has to match session_taken() in
  // the database, or the card offers a Join that the database refuses.
  const open = Math.max(0, slots - taken - invites.length);
  const started = post.starts_at
    ? new Date(post.starts_at).getTime() < Date.now()
    : false;

  /** In the session, so allowed to invite. The host always is. */
  const inSession = post.mine || post.i_joined;
  const myInvite = invites.find((i) => i.mine) ?? null;

  async function join() {
    setBusy(true);
    setNote(null);

    const { data, error } = await joinSession(post.id);

    setBusy(false);

    if (error) {
      setNote(error.message);
      return;
    }

    // join_session reports what happened rather than raising, so every
    // outcome needs a sentence. Saying nothing for the ones we did not
    // expect is how a real bug hid for a day: the function was
    // returning 'missing' for everyone and the card just refreshed,
    // which is indistinguishable from a dead button.
    switch (data) {
      case "joined":
        onChange();
        break;
      case "already":
        setNote("You're already in this one.");
        onChange();
        break;
      case "full":
        setNote("That filled up first.");
        break;
      case "past":
        setNote("That session has already started.");
        break;
      case "unavailable":
        setNote("That player isn't available.");
        break;
      case "missing":
      case "not_session":
        setNote("That session has gone.");
        break;
      default:
        // Something the function learned to say after this was written.
        setNote("Couldn't join that — try again?");
    }
  }

  async function accept() {
    setBusy(true);
    setNote(null);

    const { data, error } = await acceptSessionInvite(post.id);

    setBusy(false);
    loadInvites();

    if (error) {
      setNote(error.message);
      return;
    }

    // Same discipline as join(): a status for every answer, including
    // the ones we don't expect.
    switch (data) {
      case "joined":
      case "already":
        onChange();
        break;
      case "full":
        setNote("Somebody took that slot first.");
        onChange();
        break;
      case "past":
        setNote("That session has already started.");
        break;
      case "no_invite":
        setNote("That invite has been taken back.");
        break;
      case "missing":
      case "not_session":
        setNote("That session has gone.");
        break;
      default:
        setNote("Couldn't accept that — try again?");
    }
  }

  async function decline() {
    setBusy(true);
    setNote(null);

    const { error } = await declineSessionInvite(post.id);

    setBusy(false);

    if (error) setNote(error.message);
    else loadInvites();
  }

  /** Taking an invite back. The host, or whoever sent it. */
  async function cancelInvite(userId: string) {
    setBusy(true);
    setNote(null);

    const { error } = await cancelSessionInvite(post.id, userId);

    setBusy(false);

    if (error) setNote(error.message);
    else loadInvites();
  }

  async function drop(userId: string) {
    setBusy(true);
    setNote(null);

    const { error } = await removeSessionPlayer(post.id, userId);

    setBusy(false);

    if (error) setNote(error.message);
    else onChange();
  }

  async function leave() {
    setBusy(true);
    setNote(null);

    const { error } = await leaveSession(post.id);

    setBusy(false);

    if (error) setNote(error.message);
    else onChange();
  }

  const countdown = post.starts_at ? startsIn(post.starts_at) : null;

  return (
    <div
      className={
        "mt-3 notch border p-3 " +
        (started
          ? "border-line bg-surface-2/50 opacity-70"
          : open > 0
            ? "border-accent/40 bg-accent/5"
            : "border-ok/40 bg-ok/5")
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {post.starts_at ? sessionTime(post.starts_at) : "No time set"}
        </span>

        {countdown && !started && (
          <span className="numeric notch-sm bg-accent-dim px-2 py-0.5 text-xs font-bold text-accent">
            {countdown}
          </span>
        )}

        {/* Players, then held slots separately. Folding invites into
            the first number would say "3/3 players" about a session
            that has two. */}
        <span className="numeric ml-auto text-xs text-muted">
          {taken}/{slots} players
          {invites.length > 0 && ` · ${invites.length} invited`}
        </span>
      </div>

      {/* What it's played on, and whether anyone needs to talk.
          Both are optional and both are newer than the sessions
          already posted — a session with no answer says nothing
          rather than guessing one. A required headset is the only
          one drawn in colour, because it's the only one that can
          stop somebody joining who otherwise would. */}
      {(post.platform || post.headset) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {post.platform && (
            <span className="notch-sm border border-line bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {post.platform}
            </span>
          )}
          {post.headset && (
            <span
              className={
                "notch-sm px-2 py-0.5 text-xs " +
                (post.headset === "required"
                  ? "border border-accent/50 bg-accent-dim font-semibold text-accent"
                  : "border border-line bg-surface-2 text-muted")
              }
            >
              {headsetLabel(post.headset)}
            </span>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {post.players.map((player) => (
          <span key={player.username} className="group relative">
            <Link
              to={`/u/${player.username}`}
              title={
                (player.display_name || player.username) +
                (player.is_host ? " (host)" : "")
              }
              className="block"
            >
              <Avatar
                of={{
                  username: player.username,
                  avatar_url: player.avatar_url,
                  avatar_preset: player.avatar_preset,
                }}
                size={32}
                className={player.is_host ? "ring-2 ring-accent" : ""}
              />
            </Link>

            {/* The host's undo for adding the wrong person. Hidden
                until hover so the line of faces stays clean. */}
            {post.mine && !player.is_host && !started && (
              <button
                onClick={() => drop(player.user_id)}
                disabled={busy}
                aria-label={`Remove ${player.display_name || player.username}`}
                title={`Remove ${player.display_name || player.username}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white group-hover:flex"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* Held: invited, hasn't answered. Dimmed and ringed rather
            than solid, so it reads as "expected" and not "here". */}
        {invites.map((invite) => (
          <span key={`invite-${invite.invitee_id}`} className="group relative">
            <Link
              to={`/u/${invite.username}`}
              title={`${invite.display_name || invite.username} — invited by ${
                invite.inviter_name ?? "someone"
              }, waiting on an answer`}
              className="block"
            >
              <Avatar
                of={{
                  username: invite.username,
                  avatar_url: invite.avatar_url,
                  avatar_preset: invite.avatar_preset,
                }}
                size={32}
                className="opacity-40"
              />

              {/* A small clock, so the dimming reads as "waiting"
                  rather than as a rendering fault. */}
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-surface bg-surface-2 text-muted"
                aria-hidden="true"
              >
                <svg
                  className="h-2.5 w-2.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
            </Link>

            {/* Whoever sent it, and the host, can take it back. The
                database enforces the same pair — this only decides
                whether the × is worth drawing. */}
            {(post.mine || invite.inviter_id === user?.id) && !started && (
              <button
                onClick={() => cancelInvite(invite.invitee_id)}
                disabled={busy}
                aria-label={`Cancel invite to ${invite.display_name || invite.username}`}
                title={`Cancel invite to ${invite.display_name || invite.username}`}
                className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white group-hover:flex"
              >
                ×
              </button>
            )}
          </span>
        ))}

        {/* The gaps. Clickable: for somebody in the session it opens
            the friend picker, and for everybody else it does what the
            circle looks like it should do and joins. */}
        {Array.from({ length: open }).map((_, i) => (
          <button
            key={`open-${i}`}
            type="button"
            onClick={() => (inSession ? setPicking(true) : join())}
            disabled={busy || started}
            title={
              started
                ? "Open slot"
                : inSession
                  ? "Invite a friend"
                  : "Join this session"
            }
            aria-label={
              inSession ? "Invite a friend to this session" : "Join this session"
            }
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-line text-xs text-muted transition hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-60"
          >
            +
          </button>
        ))}
      </div>

      {note && <p className="mb-2 text-xs text-danger">{note}</p>}

      {started ? (
        <p className="text-xs text-muted">This session has started.</p>
      ) : myInvite ? (
        // Someone put your name on a slot. It's being held until you
        // answer, so the answer is the only thing this card should be
        // asking you for.
        <div>
          <p className="mb-2 text-xs text-muted">
            <span className="font-semibold text-ink">
              {myInvite.inviter_name ?? "Someone"}
            </span>{" "}
            invited you. Your slot is held until you answer.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={accept}
              disabled={busy}
              className="notch-md bg-accent px-4 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
            >
              {busy ? "…" : "Accept"}
            </button>
            <button
              onClick={decline}
              disabled={busy}
              className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {post.mine ? (
            <p className="text-xs text-muted">
              You're hosting. Delete the post to cancel it.
            </p>
          ) : post.i_joined ? (
            <button
              onClick={leave}
              disabled={busy}
              className="notch-md border border-ok/50 px-3 py-1.5 text-xs font-semibold text-ok transition hover:border-danger hover:text-danger disabled:opacity-50"
            >
              {busy ? "…" : "You're in — leave"}
            </button>
          ) : open > 0 ? (
            <button
              onClick={join}
              disabled={busy}
              className="notch-md bg-accent px-4 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-50"
            >
              {busy
                ? "Joining…"
                : `Join — ${open} ${open === 1 ? "slot" : "slots"} left`}
            </button>
          ) : (
            <p className="text-xs text-muted">Full.</p>
          )}

          {/* The + on an empty circle does this too. Spelled out as a
              button as well, because a dashed circle is a hint and
              some people won't take it. */}
          {inSession && open > 0 && (
            <button
              onClick={() => setPicking(true)}
              disabled={busy}
              className="notch-md border border-accent/50 px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent/10 disabled:opacity-50"
            >
              Invite friends
            </button>
          )}
        </div>
      )}

      {picking && (
        <InviteFriends
          postId={post.id}
          slotsFree={open}
          unavailable={[
            ...post.players.map((p) => p.user_id),
            ...invites.map((i) => i.invitee_id),
          ]}
          onDone={() => {
            loadInvites();
            onChange();
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
