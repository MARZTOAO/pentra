import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { Alert } from "./ui";
import {
  DEFAULT_SETTINGS,
  SETTING_LABELS,
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from "../lib/notifications";

/**
 * One toggle per kind of notification.
 *
 * Saves on each flip rather than behind a Save button. These are four
 * independent switches with no invalid combination, so there is
 * nothing to validate and nothing to confirm — making someone press
 * Save afterwards is a step that exists only to be forgotten.
 */
export function NotificationSettingsPanel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNotificationSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  async function flip(key: keyof NotificationSettings) {
    if (!user) return;

    const next = { ...settings, [key]: !settings[key] };
    const previous = settings;

    setSettings(next); // Optimistic; the switch should move on the tap.
    setError(null);

    const { error: problem } = await saveNotificationSettings(user.id, next);

    // Roll back rather than leave the switch showing a state the
    // database doesn't have — someone who turns something off and is
    // quietly still notified will not trust the screen again.
    if (problem) {
      setSettings(previous);
      setError("Couldn't save that. Try again?");
    }
  }

  return (
    <section className="mb-8 notch border border-line bg-surface p-5">
      <h2 className="mb-1 label-wide text-muted">Notifications</h2>
      <p className="mb-4 text-xs text-muted">
        What the bell tells you about. Everything is on to begin with.
      </p>

      {error && <Alert>{error}</Alert>}

      <div className="space-y-1">
        {SETTING_LABELS.map(({ key, label, hint }) => (
          <label
            key={key}
            className="flex cursor-pointer items-start gap-3 notch-md px-3 py-2.5 transition hover:bg-surface-2"
          >
            <Switch
              on={settings[key]}
              disabled={loading}
              onChange={() => flip(key)}
              label={label}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs leading-snug text-muted">
                {hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        These appear in the app. Session reminders are worked out when you
        open it, so one that came due while the app was closed is waiting
        the next time you look rather than arriving on your desktop.
      </p>
    </section>
  );
}

/**
 * A switch rather than a checkbox.
 *
 * The real input is still a checkbox, kept visually hidden — it carries
 * the keyboard behaviour, the focus ring and the accessible name for
 * free, and reimplementing those on a div is how toggles end up
 * unusable without a mouse.
 */
function Switch({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <span className="relative mt-0.5 inline-flex shrink-0">
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={
          "flex h-5 w-9 items-center notch-sm border px-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50 " +
          (on ? "border-accent bg-accent/25" : "border-line bg-surface-2")
        }
      >
        <span
          className={
            "h-3.5 w-3.5 notch-sm transition " +
            (on ? "translate-x-4 bg-accent" : "translate-x-0 bg-muted")
          }
        />
      </span>
    </span>
  );
}
