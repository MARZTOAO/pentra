import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Feature flags — how a private test build works here.
 *
 * The instinct is to deploy a second copy of the app and share the
 * link. That means two deploys, two databases and two versions to
 * keep in step, and the bugs worth catching are the ones that only
 * happen against real data with real people in the session.
 *
 * So instead: the new code ships to production switched off. You turn
 * it on by username from the developer panel. Those people use the
 * real app, on the real database, and see the new thing. Everybody
 * else sees today's app. When it works, one toggle ships it to
 * everyone; when it doesn't, one toggle takes it away with no deploy
 * and no rollback.
 *
 * my_flags() returns ONLY the keys that are on for you, so an
 * ordinary account cannot learn what unreleased work exists. See
 * supabase/58_developer_mode.sql.
 *
 * Usage:
 *
 *     const voice = useFlag("voice_chat");
 *     ...
 *     {voice && <VoiceRoom postId={post.id} />}
 *
 * Both branches have to keep working. A flag is a switch, not a
 * branch you tidy up later — the old path is what everyone is still
 * using.
 */

let cache: Set<string> | null = null;
let inFlight: Promise<Set<string>> | null = null;

async function load(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("my_flags");
  if (error || !data) return new Set();
  return new Set((data as string[]) ?? []);
}

/**
 * Fetched once per page load and shared by every caller.
 *
 * Without the in-flight promise, ten components mounting together
 * would each fire their own request for the same list.
 */
export async function loadFlags(force = false): Promise<Set<string>> {
  if (cache && !force) return cache;
  if (inFlight && !force) return inFlight;

  inFlight = load().then((set) => {
    cache = set;
    inFlight = null;
    return set;
  });

  return inFlight;
}

/** Call after toggling something, so the panel reflects it at once. */
export function clearFlagCache() {
  cache = null;
  inFlight = null;
}

/**
 * Is this on for me?
 *
 * Starts false and flips true once the list arrives, so a flagged
 * feature appears a moment late rather than flashing on for everyone
 * and then disappearing. Off is the safe default in both directions:
 * signed out, offline, or a failed request all mean "you don't have
 * it", which is also what an ordinary account should see.
 */
export function useFlag(key: string): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let active = true;
    loadFlags().then((set) => {
      if (active) setOn(set.has(key));
    });
    return () => {
      active = false;
    };
  }, [key]);

  return on;
}
