import { useState } from "react";
import { Link } from "react-router-dom";
import {
  deletePost,
  toggleLike,
  postTime,
  type Post,
} from "../lib/feed";
import { Avatar } from "./Avatar";
import { Linkify } from "./Linkify";
import { PostMediaGrid } from "./PostMediaGrid";
import { SessionCard } from "./SessionCard";
import { ReportDialog } from "./SafetyMenu";
import { Comments } from "./Comments";
import { ProCard } from "./ProCard";
import { ProBadge } from "./ProBadge";
import { useIsPro } from "../lib/frames";
import { useDevMode } from "../lib/devMode";
import { devDeletePost } from "../lib/dev";

/**
 * One post, everywhere a post is shown.
 *
 * Lifted out of Home so a single post can have its own page — the one
 * a notification opens. Rendering a cut-down copy there instead would
 * mean the join button, the like count or the session roster quietly
 * behaving differently depending on how you arrived, which is the kind
 * of difference nobody notices until it is a bug report.
 */
export function PostCard({
  post,
  onChange,
  onPickGame,
  commentCount = 0,
  openComments = false,
}: {
  post: Post;
  onChange: () => void;
  /** Filters the feed to this game. Absent on a single-post page,
   *  where there is no feed to filter — the tag then renders flat. */
  onPickGame?: (id: number) => void;
  /** From the feed's batched lookup, so a feed of thirty posts costs
   *  one query rather than thirty. */
  commentCount?: number;
  /** The post's own page opens the thread straight away. */
  openComments?: boolean;
}) {
  // Flip the heart immediately, then tell the server. Waiting for a
  // round trip to acknowledge a like makes the whole app feel slow.
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(Number(post.likes));
  const [reporting, setReporting] = useState(false);
  // Pentra Pro members' posts and sessions are gold (ProCard). Looked
  // up by username through the avatar-frame cache, so a feed of thirty
  // posts is one request, not thirty.
  const pro = useIsPro(post.username);

  async function like() {
    const next = !liked;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));

    const { error } = await toggleLike(post.id);

    if (error) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }

  async function remove() {
    await deletePost(post.id);
    onChange();
  }

  // Developer mode (lib/devMode): delete anyone's post. Two clicks,
  // because it is somebody else's and there is no undo.
  const devMode = useDevMode();
  const [devConfirm, setDevConfirm] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);

  async function devRemove() {
    const problem = await devDeletePost(post.id);
    if (problem) {
      setDevError(problem);
      setDevConfirm(false);
      return;
    }
    onChange();
  }

  return (
    <ProCard pro={pro} className="p-4">
      <div className="flex gap-3">
        <Link to={`/u/${post.username}`} className="shrink-0">
          <Avatar of={post} size={40} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link
              to={`/u/${post.username}`}
              className="truncate text-sm font-semibold hover:text-accent"
            >
              {post.display_name || post.username}
            </Link>
            {pro && (
              <span className="shrink-0 self-center">
                <ProBadge />
              </span>
            )}
            <span className="truncate text-xs text-muted">
              @{post.username} · {postTime(post.created_at)}
            </span>

            {post.mine ? (
              <button
                onClick={remove}
                title="Delete"
                className="ml-auto shrink-0 text-xs text-muted transition hover:text-danger"
              >
                Delete
              </button>
            ) : devMode ? (
              devConfirm ? (
                <span className="ml-auto flex shrink-0 items-center gap-2 text-xs">
                  <span className="text-muted">Delete their post?</span>
                  <button onClick={devRemove} className="font-semibold text-danger hover:underline">
                    Yes
                  </button>
                  <button onClick={() => setDevConfirm(false)} className="text-muted hover:text-ink">
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setDevConfirm(true)}
                  title="Developer: delete this post"
                  className="ml-auto shrink-0 text-xs font-semibold text-accent transition hover:text-danger"
                >
                  Delete · dev
                </button>
              )
            ) : (
              <button
                onClick={() => setReporting(true)}
                title="Report this post"
                className="ml-auto shrink-0 text-xs text-muted transition hover:text-danger"
              >
                Report
              </button>
            )}
          </div>
          {devError && <p className="mt-1 text-xs text-danger">{devError}</p>}

          {post.body && (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">
              <Linkify text={post.body} />
            </p>
          )}

          <PostMediaGrid media={post.media ?? []} />

          {/* Clicking the tag filters the feed to that game - the fastest
              path from "someone mentioned this" to "who else wants it". */}
          {post.game_name && post.game_id && (
            <button
              type="button"
              disabled={!onPickGame}
              onClick={() => onPickGame?.(post.game_id as number)}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-3 transition enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-default"
            >
              {post.game_cover && (
                <img
                  src={post.game_cover}
                  alt=""
                  className="h-6 w-4 notch-sm object-cover"
                />
              )}
              <span className="text-xs">{post.game_name}</span>
            </button>
          )}

          {post.kind === "lfg" && (
            <SessionCard post={post} onChange={onChange} />
          )}

          <div className="mt-3 flex items-center gap-4">
            <button
              onClick={like}
              className={
                "flex items-center gap-1.5 text-xs transition " +
                (liked ? "text-danger" : "text-muted hover:text-ink")
              }
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20s-6.8-4.3-6.8-9A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 6.8 2.6c0 4.7-6.8 9-6.8 9z" />
              </svg>
              {likes > 0 ? likes : "Like"}
            </button>
          </div>

          <Comments
            postId={post.id}
            count={commentCount}
            startOpen={openComments}
          />
        </div>
      </div>

      {reporting && (
        <ReportDialog
          username={post.username}
          userId={post.author_id}
          postId={post.id}
          onClose={() => setReporting(false)}
        />
      )}
    </ProCard>
  );
}
