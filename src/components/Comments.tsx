import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  addComment,
  deleteComment,
  getComments,
  type Comment,
} from "../lib/comments";
import { postTime } from "../lib/feed";
import { useLiveRows } from "../lib/live";
import { Avatar } from "./Avatar";
import { Linkify } from "./Linkify";
import { MentionBox } from "./MentionBox";

/**
 * The replies under a post.
 *
 * Collapsed behind the count by default. A feed where every post
 * carries its whole comment thread is a feed you cannot scroll, and
 * most posts are read without their replies being wanted.
 *
 * The thread is only fetched when it is opened, so a feed of thirty
 * posts costs one batched count query rather than thirty thread
 * queries — see getCommentCounts.
 */
export function Comments({
  postId,
  count,
  startOpen = false,
}: {
  postId: number;
  /** From the feed's batched lookup. Shown before the thread loads. */
  count: number;
  /** The post's own page opens the thread immediately. */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * How far the feed's count has drifted since it was fetched. Only
   * used while the thread is closed — once it is open, the list is
   * the count.
   */
  const [delta, setDelta] = useState(0);

  const load = useCallback(async () => {
    setComments(await getComments(postId));
  }, [postId]);

  useEffect(() => {
    if (open && comments === null) load();
  }, [open, comments, load]);

  // Somebody else commented, or deleted one. Reload the thread if it
  // is open; otherwise just move the number, so a closed thread still
  // shows the right count without fetching the whole conversation.
  //
  // Subscribed whether or not the thread is open: the count is on
  // screen either way, and a number that is only right after you
  // click it is the thing being complained about.
  useLiveRows("post_comments", postId, (event) => {
    if (open) {
      load();
      return;
    }
    if (event === "INSERT") setDelta((d) => d + 1);
    if (event === "DELETE") setDelta((d) => d - 1);
    // An edit is neither. Comments can't be edited today, and if they
    // ever can, an edit still isn't one more comment.
  });

  // The drift is only ever relative to one fetched count. Opening the
  // thread replaces the estimate with the real list, and a fresh count
  // from the feed already includes everything that has happened — so
  // either one makes the drift wrong rather than stale, and it has to
  // go back to zero.
  useEffect(() => {
    setDelta(0);
  }, [open, count]);

  // Once it's open the thread is the truth; before that, the count
  // from the feed plus whatever has happened since.
  const total =
    open && comments ? comments.length : Math.max(0, count + delta);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);

    const { error: problem } = await addComment(postId, text);
    setBusy(false);

    if (problem) {
      setError(problem.message);
      return;
    }

    setBody("");
    load();
  }

  async function remove(id: number) {
    // Optimistic: the row goes now, and comes back if the delete failed.
    const before = comments;
    setComments((current) => current?.filter((c) => c.id !== id) ?? null);

    const { error: problem } = await deleteComment(id);
    if (problem) {
      setComments(before ?? null);
      setError("Couldn't delete that.");
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted transition hover:text-ink"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
        </svg>
        {total === 0 ? "Comment" : total === 1 ? "1 comment" : `${total} comments`}
      </button>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {comments === null ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : (
            <ul className="mb-3 space-y-3">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  <Link to={`/u/${c.username}`} className="shrink-0">
                    <Avatar of={c} size={28} />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <Link
                        to={`/u/${c.username}`}
                        className="text-xs font-semibold hover:text-accent"
                      >
                        {c.display_name || c.username}
                      </Link>
                      <span className="numeric text-[11px] text-muted">
                        {postTime(c.created_at)}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm">
                      <Linkify text={c.body} />
                    </p>
                  </div>

                  {c.can_delete && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      aria-label="Delete comment"
                      title={c.mine ? "Delete" : "Delete from your post"}
                      // Visible rather than hover-only: a hover-only
                      // control does not exist on a touch screen.
                      className="shrink-0 p-1 text-muted opacity-60 transition hover:text-danger hover:opacity-100"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mb-2 text-xs text-danger">{error}</p>}

          {/* The same @ tagging as a post: a reply is where you are
              most likely to want to pull someone in. */}
          <MentionBox
            value={body}
            onChange={setBody}
            maxLength={500}
            rows={2}
            placeholder="Write a comment…"
            className="w-full resize-none notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={busy || body.trim().length === 0}
              className="label-wide notch-sm bg-accent px-4 py-1.5 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
