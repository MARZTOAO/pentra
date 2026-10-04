import { useCallback, useEffect, useState } from "react";
import { getProfileFeed, type Post } from "../lib/feed";
import { getCommentCounts } from "../lib/comments";
import { PostCard } from "./PostCard";

const PAGE = 20;

/**
 * The feed at the foot of a profile — supabase/91.
 *
 * Everything this player is part of, newest first, the way a timeline
 * works: their posts, the sessions they host or joined, and the posts
 * they were tagged in. Comment tags don't count — a tag in a comment
 * is about the conversation, not the person's page.
 *
 * Same cards as the home feed, so liking, joining, commenting and
 * (for the author) deleting all work here too. Paged twenty at a
 * time behind a "Show more".
 */
export function ProfileFeed({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (before?: number) => {
      setLoading(true);
      const rows = await getProfileFeed(userId, before);
      const fresh = await getCommentCounts(rows.map((p) => p.id));
      setPosts((current) => (before && current ? [...current, ...rows] : rows));
      setCounts((current) => ({ ...current, ...fresh }));
      setMore(rows.length === PAGE);
      setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    setPosts(null);
    void load();
  }, [load]);

  // After a like, join, delete or comment: reload from the top so the
  // list reflects it. Cheap at this size.
  const refresh = () => void load();

  return (
    <section className="mt-8">
      <h2 className="on-art mb-4 label-wide text-muted">
        {isSelf ? "Your activity" : "Activity"}
      </h2>

      {posts === null ? (
        <p className="on-art text-sm text-muted">Loading…</p>
      ) : posts.length === 0 ? (
        <div className="notch border border-dashed border-line bg-surface/60 p-6 text-center backdrop-blur-sm">
          <p className="text-sm text-muted">
            {isSelf
              ? "Nothing yet. Your posts, sessions and the posts you're tagged in will show up here."
              : "Nothing yet — no posts, sessions or tags."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onChange={refresh}
              commentCount={counts[post.id] ?? 0}
            />
          ))}
          {more && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(posts[posts.length - 1].id)}
              className="w-full notch-md border border-line bg-surface/85 px-4 py-2.5 text-sm font-medium text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {loading ? "Loading…" : "Show more"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
