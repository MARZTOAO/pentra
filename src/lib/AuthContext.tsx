import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { claimStoredReferral } from "./referrals";

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True while we're still checking for a saved session on startup. */
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

/**
 * Wraps the app and keeps track of who is logged in.
 *
 * Two things happen here:
 *   1. On startup we ask Supabase whether a session was saved from last time.
 *   2. We subscribe to auth changes, so logging in or out anywhere in the app
 *      updates every screen at once.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // So a single session doesn't fire the referral claim on every auth
  // event — token refreshes come through onAuthStateChange too.
  const claimed = useRef(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Hand over the invite code, if they arrived on somebody's link.
   *
   * Here rather than in the signup form because with email
   * confirmation on, the account exists some time after the form was
   * submitted — often in a different tab. The database refuses
   * anything that isn't a genuinely new account, so calling it when
   * an existing user happens to sign in costs one no-op.
   */
  useEffect(() => {
    if (!session || claimed.current) return;
    claimed.current = true;
    claimStoredReferral();
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Read the current auth state from any component. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
