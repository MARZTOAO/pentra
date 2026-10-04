import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { getProfile, updateProfile, type Profile } from "../lib/profile";
import { Alert, FullScreenLoader } from "../components/ui";
import { Avatar } from "../components/Avatar";
import { getBlocked, unblockUser, type BlockedUser } from "../lib/safety";
import { NotificationSettingsPanel } from "../components/NotificationSettingsPanel";
import { DeleteAccount } from "../components/DeleteAccount";
import { ChangePassword } from "../components/ChangePassword";
import { BirthDateSection } from "../components/BirthDateSection";
import { Link } from "react-router-dom";
import { useIsDeveloper } from "../lib/dev";
import { DesktopSection } from "../components/DesktopSection";
import { ProSection } from "../components/ProSection";

export default function Settings() {
  const { user, signOut } = useAuth();
  // For the link at the foot of the page: on a phone there is no
  // sidebar, so this is how a developer reaches /dev.
  const isDev = useIsDeveloper(user?.id);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      if (data) setProfile(data as Profile);
      setLoading(false);
    });
    getBlocked().then(setBlocked);
  }, [user]);

  async function setPrivacy(value: "everyone" | "friends" | "nobody") {
    if (!user) return;
    setError(null);

    const { data, error } = await updateProfile(user.id, {
      message_privacy: value,
    });

    if (error) setError(error.message);
    else if (data) setProfile(data as Profile);
  }

  async function unblock(id: string) {
    const { error } = await unblockUser(id);
    if (error) setError(error.message);
    else setBlocked(await getBlocked());
  }


  if (loading) return <FullScreenLoader />;


  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-8 py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="display on-art text-2xl">Settings</h1>
        <p className="on-art mt-1 text-sm text-muted">
          How the app looks and behaves for you.
        </p>
      </header>

      {error && <Alert>{error}</Alert>}

      <ProSection />

      <NotificationSettingsPanel />

      <DesktopSection />

      <ChangePassword />

      <BirthDateSection />

      <section className="mb-8 notch border border-line bg-surface p-5">
        <h2 className="mb-1 label-wide text-muted">
          Who can message you
        </h2>
        <p className="mb-4 text-xs text-muted">
          Only affects new conversations. Anyone you're already talking to can
          still reach you.
        </p>

        <div className="space-y-1.5">
          {(
            [
              {
                key: "everyone",
                label: "Anyone",
                note: "Someone you matched with can actually reach you. This is how the app is meant to work.",
              },
              {
                key: "friends",
                label: "Friends only",
                note: "People have to send a friend request first, and you have to accept it.",
              },
              {
                key: "nobody",
                label: "Nobody new",
                note: "Nobody can start a conversation with you. Useful for a while, lonely forever.",
              },
            ] as const
          ).map((option) => {
            const active =
              (profile?.message_privacy ?? "everyone") === option.key;
            return (
              <button
                key={option.key}
                onClick={() => setPrivacy(option.key)}
                className={
                  "w-full notch-md border px-3 py-2.5 text-left transition " +
                  (active
                    ? "border-accent bg-accent/10"
                    : "border-line hover:border-muted")
                }
              >
                <span
                  className={
                    "block text-sm font-medium " +
                    (active ? "text-accent" : "text-ink")
                  }
                >
                  {option.label}
                </span>
                <span className="block text-xs text-muted">{option.note}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="notch border border-line bg-surface p-5">
        <h2 className="mb-1 label-wide text-muted">
          Blocked players
        </h2>
        <p className="mb-4 text-xs text-muted">
          You and a blocked player can't see each other anywhere in the app.
          Unblocking doesn't restore a friendship — you'd have to ask again.
        </p>

        {blocked.length === 0 ? (
          <p className="text-sm text-muted">You haven't blocked anyone.</p>
        ) : (
          <div className="space-y-2">
            {blocked.map((person) => (
              <div
                key={person.user_id}
                className="flex items-center gap-3 notch-md border border-line bg-surface-2 p-2.5"
              >
                <Avatar of={person} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {person.display_name || person.username}
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{person.username}
                  </p>
                </div>
                <button
                  onClick={() => unblock(person.user_id)}
                  className="shrink-0 notch-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Signing out on a phone. On a computer it's at the foot of the
          sidebar; a phone has no sidebar and the tab bar has no room, so
          until this card there was no way to sign out on a phone at all
          (website or iPhone app). Phones only, so a computer doesn't
          show it twice. */}
      <section className="mb-8 notch border border-line bg-surface p-5 md:hidden">
        <h2 className="mb-1 label-wide text-muted">Account</h2>
        <p className="mb-4 truncate text-xs text-muted">
          Signed in as {user?.email}
        </p>
        <button
          type="button"
          onClick={signOut}
          className="notch-md border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted"
        >
          Sign out
        </button>
      </section>

      {/* Last on the page, on purpose. */}
      <DeleteAccount username={profile?.username ?? null} />

      {/* Developers only. The Developer page is in the sidebar on a
          computer; a phone has no sidebar, so it's reachable here. */}
      {isDev && (
        <p className="mt-8 text-center text-xs text-muted md:hidden">
          <Link to="/dev" className="font-semibold text-accent hover:underline">
            Developer tools →
          </Link>
        </p>
      )}
    </div>
  );
}

