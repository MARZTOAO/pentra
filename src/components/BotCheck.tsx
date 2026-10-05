import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile on the sign-up form: proves there's a real
 * browser (almost always a real person) behind a new account. Most
 * people see a small box that ticks itself; now and then, a click.
 *
 * The token it hands back goes into the sign-up as `captcha_token`,
 * and Supabase's sign-up hook checks it with Cloudflare before the
 * account is created (supabase/functions/signup-guard). Checking it
 * there, not here, is what makes it a lock rather than a sign.
 *
 * Website only. Turnstile doesn't run inside the iPhone or Windows
 * app, so those send people to pentra.gg to sign up (see Signup.tsx).
 *
 * Off — draws nothing, asks for nothing — until VITE_TURNSTILE_SITE_KEY
 * is set. The site key is public by design; the secret one lives only
 * in Supabase.
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ?? "";

export const botCheckOn = SITE_KEY !== "";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let script: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  script ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      script = null; // let a later attempt try again
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return script;
}

/**
 * @param onToken  Called with a fresh token, or null when it expires
 *   or fails. A token works once: after a failed sign-up, change
 *   `round` to get a new one.
 */
export function BotCheck({
  onToken,
  onUnavailable,
  round,
}: {
  onToken: (token: string | null) => void;
  /** Cloudflare's script couldn't load (offline, or blocked). */
  onUnavailable: () => void;
  round: number;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!botCheckOn) return;
    let id: string | undefined;
    let cancelled = false;
    onToken(null);

    loadTurnstile()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          theme: "dark",
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) onUnavailable();
      });

    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
    // Re-rendered only for a new round; the callbacks are setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  if (!botCheckOn) return null;
  return <div ref={box} className="mb-4 flex min-h-[65px] justify-center" />;
}
