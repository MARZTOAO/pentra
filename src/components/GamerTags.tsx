import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import {
  NETWORKS,
  getGamerTags,
  saveGamerTags,
  type GamerTag,
} from "../lib/gamerTags";
import { Button, Alert } from "./ui";

export function GamerTags() {
  const { user } = useAuth();

  const [handles, setHandles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    getGamerTags(user.id).then((tags) => {
      const map: Record<string, string> = {};
      for (const tag of tags) map[tag.network] = tag.handle;
      setHandles(map);
      setLoading(false);
    });
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const tags: GamerTag[] = Object.entries(handles).map(([network, handle]) => ({
      network,
      handle,
    }));

    const { error } = await saveGamerTags(tags);

    setSaving(false);

    if (error) setError(error.message);
    else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const filled = Object.values(handles).filter((h) => h.trim()).length;

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="label-wide text-muted">
          Gamer tags
        </h2>
        <span className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Friends only
        </span>
      </div>

      <p className="mb-5 text-xs text-muted">
        Only people you've accepted as friends can see these. Everyone else gets
        nothing — the database refuses to hand them over, so it holds even if
        someone goes around the app.
      </p>

      {error && <Alert>{error}</Alert>}
      {saved && <Alert kind="ok">Gamer tags saved.</Alert>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {NETWORKS.map((network) => (
              <label key={network.key} className="block">
                <span className="mb-1.5 block text-xs font-medium">
                  {network.label}
                </span>
                <input
                  value={handles[network.key] ?? ""}
                  onChange={(e) =>
                    setHandles((current) => ({
                      ...current,
                      [network.key]: e.target.value,
                    }))
                  }
                  maxLength={100}
                  placeholder={network.placeholder}
                  className="w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
              </label>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="w-40">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save tags"}
              </Button>
            </div>
            <p className="text-xs text-muted">
              {filled === 0
                ? "None added — leave blank any you don't use."
                : `${filled} added.`}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
