import { useState } from "react";
import { formatCode } from "../lib/search";

/**
 * Your own friend code, with a copy button.
 *
 * The point of this existing at all: usernames are taken, misspelled
 * and duplicated across every service anyone has ever used. A code is
 * ten characters you can read out over voice chat and have land on
 * the right person the first time.
 *
 * There's no button to change it, and that's the feature. A code
 * you can swap is a nickname; a code you can't is an identity, and
 * the one someone wrote down still works a year later.
 */
export function FriendCode({ code }: { code: string | null | undefined }) {
  const [copied, setCopied] = useState(false);

  const pretty = formatCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused. The code is on screen either
      // way, so there's nothing to recover from — just don't claim it
      // was copied when it wasn't.
    }
  }

  if (!code) return null;

  return (
    <section className="mb-8 rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
        Your friend code
      </h2>
      <p className="mb-4 text-xs text-muted">
        Give this to people you already know. They can paste it into search
        and land straight on you — no guessing at spellings.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 font-mono text-lg font-semibold tracking-[0.18em] text-accent">
          {pretty}
        </code>

        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">
        Yours permanently. It can't be changed or picked, and it's never
        given to anyone else — not even if you were to delete your account.
      </p>
    </section>
  );
}
