import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useIsDeveloper } from "./dev";

/**
 * Developer mode — the switch that turns on the "I can do anything"
 * controls: delete any post or comment, ban, warn, edit any profile.
 * See supabase/89_developer_mode.sql for the functions behind them.
 *
 * It is a switch, not a permission. The database decides who may call
 * those functions (am_i_developer(), every time); this only decides
 * whether the buttons are drawn, so a developer can use the app as an
 * ordinary player without a Delete button on every post. Per machine,
 * like the other device switches, and off by default.
 *
 * Nobody but a developer ever sees it on: useDevMode() is false unless
 * the database says you are one.
 */

const KEY = "pentra.devMode";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let on = read();
const listeners = new Set<() => void>();

export function devModeStored(): boolean {
  return on;
}

export function setDevMode(value: boolean) {
  on = value;
  try {
    localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* Lives for this session only, then. */
  }
  listeners.forEach((fn) => fn());
}

/** True only for a developer who has switched it on, on this machine. */
export function useDevMode(): boolean {
  const { user } = useAuth();
  const isDev = useIsDeveloper(user?.id);
  const [value, setValue] = useState(on);

  useEffect(() => {
    const fn = () => setValue(on);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return isDev && value;
}
