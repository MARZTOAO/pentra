import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { getProfile, updateProfile, type Profile } from "../lib/profile";
import {
  PALETTES,
  applyTheme,
  findPalette,
  DEFAULT_THEME,
} from "../lib/themes";
import { Alert, FullScreenLoader } from "../components/ui";

export default function Settings() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      if (data) setProfile(data as Profile);
      setLoading(false);
    });
  }, [user]);

  async function choose(key: string) {
    if (!user) return;

    // Apply first, save second. The colours should change the instant
    // you click, not after a round trip to the database.
    applyTheme(key);
    setError(null);

    const { data, error } = await updateProfile(user.id, { app_theme: key });

    if (error) setError(error.message);
    else if (data) setProfile(data as Profile);
  }

  if (loading) return <FullScreenLoader />;

  const current = profile?.app_theme ?? DEFAULT_THEME;
  const dark = PALETTES.filter((p) => p.mode === "dark");
  const light = PALETTES.filter((p) => p.mode === "light");

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          How the app looks and behaves for you.
        </p>
      </header>

      {error && <Alert>{error}</Alert>}

      <section className="mb-8 rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Colour theme
        </h2>
        <p className="mb-5 text-xs text-muted">
          Changes the whole app for you only — nobody else sees it. Saves the
          moment you pick one, and follows you to another machine.
        </p>

        <ThemeGrid
          title="Dark"
          palettes={dark}
          current={current}
          onPick={choose}
        />
        <ThemeGrid
          title="Light"
          palettes={light}
          current={current}
          onPick={choose}
          note="Newer than the dark ones — tell me if anything looks off."
        />
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Privacy and blocking
        </h2>
        <p className="text-sm text-muted">
          Who can message you, and your blocked list. Arrives in Phase 6.
        </p>
      </section>
    </div>
  );
}

function ThemeGrid({
  title,
  palettes,
  current,
  onPick,
  note,
}: {
  title: string;
  palettes: typeof PALETTES;
  current: string;
  onPick: (key: string) => void;
  note?: string;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {note && <p className="mb-2 text-[11px] text-muted">{note}</p>}

      <div className="grid grid-cols-4 gap-3">
        {palettes.map((palette) => {
          const active = findPalette(current).key === palette.key;
          return (
            <button
              key={palette.key}
              type="button"
              onClick={() => onPick(palette.key)}
              className={
                "rounded-lg border-2 p-2 text-left transition " +
                (active
                  ? "border-accent ring-2 ring-accent/30"
                  : "border-line hover:border-muted")
              }
            >
              <div className="mb-2 flex h-9 overflow-hidden rounded">
                {palette.swatch.map((colour, i) => (
                  <div
                    key={i}
                    className="flex-1"
                    style={{ backgroundColor: colour }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium">{palette.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
