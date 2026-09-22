import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { Alert } from "./ui";
import { isMuted, setMuted, preview } from "../lib/sound";
import { isDesktopApp } from "../lib/platform";
import {
  autostartEnabled,
  closeToTray,
  notificationsEnabled,
  setAutostart,
  setCloseToTray,
  setNotificationsEnabled,
} from "../lib/desktop";
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
  const [sound, setSound] = useState(!isMuted());

  // Desktop-only switches. Read straight from this machine, not the
  // account — see the note on the sound toggle below, same reasoning.
  const desktop = isDesktopApp();
  const [toasts, setToasts] = useState(notificationsEnabled);
  const [tray, setTray] = useState(closeToTray);
  const [startup, setStartup] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    if (desktop) void autostartEnabled().then(setStartup);
  }, [desktop]);

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

      {/* Sound is kept on the device rather than the account: audible on
          a desktop and silent on a phone is a reasonable thing to want,
          and it would be odd for one to change the other. */}
      <label className="mt-2 flex cursor-pointer items-start gap-3 notch-md border-t border-line px-3 py-3 transition hover:bg-surface-2">
        <Switch
          on={sound}
          onChange={() => {
            const next = !sound;
            setSound(next);
            setMuted(!next);
            // Play it as they turn it on, so "sound" isn't an abstraction.
            if (next) preview("notification");
          }}
          label="Play a sound"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Play a sound</span>
          <span className="block text-xs leading-snug text-muted">
            A short beep when something arrives. This device only.
          </span>
        </span>
      </label>

      {/* Desktop only. In a browser this whole block is absent rather
          than disabled — a switch you cannot move is worse than no
          switch, and the download prompt already covers the pitch. */}
      {desktop && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="mb-2 px-3 pt-1 label-wide text-muted">On this computer</p>

          <DeviceToggle
            on={toasts}
            label="Windows notifications"
            hint="The ones switched on above also appear on your desktop, so they reach you while you're in a game. Nothing pops up while Pentra is the window you're looking at."
            onChange={() => {
              const next = !toasts;
              setToasts(next);
              setNotificationsEnabled(next);
            }}
          />

          <DeviceToggle
            on={tray}
            label="Keep running when I close the window"
            hint="Closing Pentra tucks it into the tray by the clock instead of quitting, so notifications keep arriving. Quit properly from the tray icon."
            onChange={() => {
              const next = !tray;
              setTray(next);
              void setCloseToTray(next);
            }}
          />

          <DeviceToggle
            on={startup}
            label="Start Pentra when I sign in to Windows"
            hint="Starts quietly in the tray without opening a window."
            onChange={async () => {
              const next = !startup;
              setStartup(next); // Optimistic, like the switches above.
              setStartupError(null);
              try {
                await setAutostart(next);
              } catch {
                // Windows can refuse this — a locked-down machine, or
                // security software guarding the startup list. Say so
                // rather than leave a switch showing something untrue.
                setStartup(!next);
                setStartupError("Windows wouldn't let Pentra change that.");
              }
            }}
          />

          {startupError && (
            <p className="px-3 pt-1 text-xs text-danger">{startupError}</p>
          )}
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        {desktop
          ? "Quit Pentra from the tray and nothing arrives until you open it again — a session reminder that came due meanwhile is waiting the next time you look."
          : "These appear in the app while it's open. The desktop app can also put them on your desktop, and keeps receiving them while you're in a game."}
      </p>
    </section>
  );
}

/**
 * One of the per-machine switches.
 *
 * Same shape as the rows above, but these save to this computer rather
 * than the account, so there is no user id and nothing to roll back.
 */
function DeviceToggle({
  on,
  label,
  hint,
  onChange,
}: {
  on: boolean;
  label: string;
  hint: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 notch-md px-3 py-2.5 transition hover:bg-surface-2">
      <Switch on={on} onChange={onChange} label={label} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs leading-snug text-muted">{hint}</span>
      </span>
    </label>
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
