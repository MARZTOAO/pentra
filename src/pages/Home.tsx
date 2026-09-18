import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";
import { Button, FullScreenLoader } from "../components/ui";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
};

/**
 * Placeholder home screen for Phase 1.
 *
 * Its only real job is to prove the whole chain works: you are logged in,
 * the app can read your row out of the database, and the session survives
 * a restart. Phase 2 replaces this with the real profile screen.
 */
export default function Home() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setProfile(data);
        setLoading(false);
      });
  }, [user]);

  if (loading) return <FullScreenLoader />;

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-2 text-3xl font-bold tracking-tight">
          <span className="text-accent">▲</span> Gamer Social
        </div>

        <h1 className="mb-1 text-2xl font-semibold">
          You're in, {profile?.display_name ?? profile?.username ?? "player"}.
        </h1>

        <p className="mb-8 text-sm text-muted">
          Signed in as {user?.email}
        </p>

        {error && (
          <p className="mb-6 text-sm text-danger">
            Couldn't load your profile: {error}
          </p>
        )}

        <div className="mb-8 rounded-xl border border-line bg-surface p-5 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Your profile row
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Username</dt>
              <dd className="font-medium">{profile?.username ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Display name</dt>
              <dd className="font-medium">{profile?.display_name ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <p className="mb-6 text-sm text-muted">
          Next up: your profile and the Top 5.
        </p>

        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
