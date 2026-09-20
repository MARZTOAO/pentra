import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

/**
 * "Tell me when anything happens to this post's rows."
 *
 * Comments and session rosters both have the same problem: the person
 * who clicked sees the change immediately because their own call
 * returns, and everybody else sees yesterday's screen until they
 * reload. Both fixes are the same subscription with a different table
 * name, so it lives here once.
 *
 * Requires the table to be published to realtime — see
 * supabase/41_live_sessions_and_comments.sql. Without that the
 * subscription succeeds and simply never fires, which is a quiet way
 * to lose an afternoon.
 */

/** Each subscription needs its own channel name, or they collide. */
let nextChannelId = 0;

export type RowEvent = "INSERT" | "UPDATE" | "DELETE";

export function useLiveRows(
  table: "post_comments" | "session_players",
  postId: number,
  onChange: (event: RowEvent) => void,
  /** Pass false to stand the subscription down without unmounting. */
  active = true,
) {
  // The callback is held in a ref rather than listed as a dependency.
  // Callers pass an inline arrow function, which is a new value every
  // render — as a dependency it would tear the channel down and open
  // it again several times a second. The ref means the effect keeps
  // one channel and always calls the newest callback, so no stale
  // closure either.
  const latest = useRef(onChange);
  latest.current = onChange;

  useEffect(() => {
    if (!active) return;

    // A name of our own, so two cards watching the same post — the
    // feed and a dialog, say — don't fight over one channel.
    const name = `live-${table}-${postId}-${nextChannelId++}`;

    const channel = supabase
      .channel(name)
      .on(
        "postgres_changes",
        {
          // Inserts, deletes and the occasional edit all mean the same
          // thing to the caller: what you are showing is now wrong.
          event: "*",
          schema: "public",
          table,
          filter: `post_id=eq.${postId}`,
        },
        (payload) => latest.current(payload.eventType as RowEvent),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, postId, active]);
}
