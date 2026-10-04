import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./AuthContext";
import { useIsDeveloper } from "./dev";

/**
 * Which players are seeded (fake) accounts — supabase/90.
 *
 * Developers only. The list is fetched once per page load, the first
 * time a developer's screen asks, and shared by every tag on the
 * page. For anyone else nothing is fetched and every answer is false,
 * so the "Seeded" tag never exists for them.
 */

export type SeededAccount = { id: string; username: string; created_at: string };

let cache: Set<string> | null = null;
let inFlight: Promise<Set<string>> | null = null;
const listeners = new Set<() => void>();

async function fetchSeeded(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("dev_test_accounts");
  if (error || !data) return new Set();
  return new Set((data as SeededAccount[]).map((a) => a.id));
}

function loadSeeded(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;
  inFlight = fetchSeeded().then((set) => {
    cache = set;
    inFlight = null;
    listeners.forEach((fn) => fn());
    return set;
  });
  return inFlight;
}

/** Is this player a seeded account? False for non-developers, always. */
export function useIsSeeded(userId: string | null | undefined): boolean {
  const { user } = useAuth();
  const isDev = useIsDeveloper(user?.id);
  const [set, setSet] = useState<Set<string> | null>(cache);

  useEffect(() => {
    if (!isDev) return;
    const fn = () => setSet(cache);
    listeners.add(fn);
    void loadSeeded().then(setSet);
    return () => {
      listeners.delete(fn);
    };
  }, [isDev]);

  return Boolean(isDev && userId && set?.has(userId));
}

/** The full list, for the Developer page. */
export async function listSeeded(): Promise<SeededAccount[] | null> {
  const { data, error } = await supabase.rpc("dev_test_accounts");
  if (error || !data) return null;
  return data as SeededAccount[];
}
