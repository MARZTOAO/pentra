import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPost, type Post } from "../lib/feed";
import { PostCard } from "../components/PostCard";
import { FullScreenLoader } from "../components/ui";

/**
 * A single post, on its own page.
 *
 * This is where notifications land. Everything about it is the feed's
 * post — the same component, the same data — so a session you open
 * from a reminder has the same join button and the same roster it
 * would have had in the feed.
 */
export default function PostPage() {
  const { id } = useParams<{ id: string }>();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const numeric = Number(id);
    if (!Number.isFinite(numeric)) {
      setPost(null);
      setLoading(false);
      return;
    }

    setPost(await getPost(numeric));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      <Link
        to="/home"
        className="label-wide mb-4 inline-flex items-center gap-1.5 text-muted transition hover:text-accent"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Feed
      </Link>

      {post ? (
        // No onPickGame: there's no feed on this page to filter, so the
        // game tag renders flat rather than as a button that does nothing.
        <PostCard post={post} onChange={load} />
      ) : (
        <div className="notch border border-dashed border-line p-10 text-center">
          <h1 className="mb-2 display text-xl">This post is gone</h1>
          <p className="mx-auto max-w-sm text-sm text-muted">
            It may have been deleted, or it belongs to someone you've
            blocked.{" "}
            <Link to="/home" className="text-accent underline underline-offset-2">
              Back to the feed
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
