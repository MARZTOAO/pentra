import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/AuthContext";
import {
  checkBirthDate,
  dismissBirthDatePrompt,
  dismissCelebrations,
  getCelebrations,
  setBirthDate,
  todayIso,
  type Celebrations as CelebrationsData,
} from "../lib/birthday";
import { DIALOG_ORDER, useDialogTurn, type DialogState } from "../lib/dialogQueue";
import { SUPPORT_EMAIL } from "../lib/constants";

/**
 * The two pop-ups that come from supabase/69_birthdays.sql:
 *
 *   1. "When's your birthday?" — once, for accounts made before signup
 *      asked. Skippable; Settings has the same box for later.
 *   2. The greeting — happy birthday and/or thanks for another year,
 *      on the day, in the player's own time zone, once a year.
 *
 * Both wait their turn behind the first-run welcome and ahead of
 * What's New (lib/dialogQueue.ts), so nothing ever stacks.
 */
export function Celebrations() {
  const { user } = useAuth();

  const [data, setData] = useState<CelebrationsData | null>(null);
  const [promptState, setPromptState] = useState<DialogState>("pending");
  const [greetState, setGreetState] = useState<DialogState>("pending");

  const promptOpen = useDialogTurn(
    "birth-date",
    DIALOG_ORDER.birthDate,
    promptState,
  );
  const greetOpen = useDialogTurn(
    "celebration",
    DIALOG_ORDER.celebration,
    greetState,
  );

  const load = useCallback(async (includePrompt: boolean) => {
    const row = await getCelebrations();
    setData(row);
    if (includePrompt) {
      setPromptState(row?.needs_birth_date ? "wants" : "done");
    }
    setGreetState(
      row && (row.birthday || row.anniversary_years > 0) ? "wants" : "done",
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    load(true).catch(() => {
      setPromptState("done");
      setGreetState("done");
    });
  }, [user, load]);

  // Called by the prompt when it's finished, however it finished. If a
  // date was saved, ask again — they may have just told us it's their
  // birthday today, and it would be a strange moment to stay quiet.
  function promptFinished(saved: boolean) {
    if (saved) {
      setGreetState("pending");
      setPromptState("done");
      load(false).catch(() => setGreetState("done"));
    } else {
      setPromptState("done");
    }
  }

  function greetFinished() {
    setGreetState("done");
    dismissCelebrations();
  }

  if (promptOpen) return <BirthDatePrompt onFinished={promptFinished} />;

  if (greetOpen && data) {
    return (
      <Greeting
        birthday={data.birthday}
        years={data.anniversary_years}
        onClose={greetFinished}
      />
    );
  }

  return null;
}

/* ================================================================== */

function BirthDatePrompt({ onFinished }: { onFinished: (saved: boolean) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);

  function skip() {
    dismissBirthDatePrompt();
    onFinished(false);
  }

  async function save() {
    if (busy) return;
    setError(null);

    const check = checkBirthDate(value);
    if (check === "invalid") {
      setError("That doesn't look like a real date.");
      return;
    }
    if (check === "too_young") {
      // Nothing is sent, so nothing about the answer is kept. Record
      // only that the question was asked, so it doesn't come back.
      dismissBirthDatePrompt();
      setRefused(true);
      return;
    }

    setBusy(true);
    const result = await setBirthDate(value);
    setBusy(false);

    switch (result) {
      case "saved":
      case "already_set":
        onFinished(true);
        return;
      case "too_young":
        dismissBirthDatePrompt();
        setRefused(true);
        return;
      case "invalid":
        setError("That doesn't look like a real date.");
        return;
      default:
        setError("Couldn't save that just now. Try again, or skip for now.");
    }
  }

  if (refused) {
    return (
      <Modal onDismiss={() => onFinished(false)} labelledBy="dob-title">
        <Header kicker="Date of birth" title="Thanks" id="dob-title" />
        <div className="px-6 py-5 text-sm leading-relaxed text-muted">
          We couldn't add that date to your account. If you think something's
          wrong, write to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </div>
        <Footer>
          <PrimaryButton onClick={() => onFinished(false)} autoFocus>
            Close
          </PrimaryButton>
        </Footer>
      </Modal>
    );
  }

  return (
    <Modal onDismiss={skip} labelledBy="dob-title" backdropCloses={false}>
      <Header
        kicker="One quick thing"
        title="When's your birthday?"
        id="dob-title"
      />

      <div className="px-6 py-5">
        <p className="mb-4 text-sm leading-relaxed text-muted">
          So we can wish you a happy birthday on the day. It's private —
          it never appears on your profile and nobody else can see it.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Date of birth
          </span>
          <input
            type="date"
            value={value}
            min="1900-01-01"
            max={todayIso()}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="w-full notch-md border border-line bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 [color-scheme:dark]"
          />
        </label>

        <p className="mt-2 text-xs text-muted">
          Once it's saved it can't be changed in the app — if it's ever
          wrong, email {SUPPORT_EMAIL}.
        </p>

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </div>

      <Footer>
        <PrimaryButton onClick={save} disabled={busy || !value}>
          {busy ? "Saving…" : "Save"}
        </PrimaryButton>
        <SecondaryButton onClick={skip}>Not now</SecondaryButton>
      </Footer>

      <p className="px-6 pb-5 text-center text-xs text-muted sm:text-right">
        Skip it and we won't ask again. You can add it later in Settings.
      </p>
    </Modal>
  );
}

/* ================================================================== */

function Greeting({
  birthday,
  years,
  onClose,
}: {
  birthday: boolean;
  years: number;
  onClose: () => void;
}) {
  const anniversary = years > 0;
  const yearsLabel = years === 1 ? "One year" : `${years} years`;

  const title =
    birthday && anniversary
      ? "A double celebration"
      : birthday
        ? "Happy birthday!"
        : `${yearsLabel} on Pentra`;

  return (
    <Modal onDismiss={onClose} labelledBy="greet-title">
      <div className="relative overflow-hidden border-b border-line bg-accent-dim px-6 pb-6 pt-7 text-center">
        <Sparkles />
        <div className="relative">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center notch-md border border-accent-edge bg-surface">
            {birthday ? <CakeIcon /> : <BadgeIcon />}
          </div>
          <p className="label-wide mb-1 text-accent">
            <span aria-hidden="true">//</span> From the Pentra Team
          </p>
          <h2 id="greet-title" className="display text-2xl">
            {title}
          </h2>
        </div>
      </div>

      <div className="space-y-4 px-6 py-5">
        {birthday && (
          <p className="text-center text-sm leading-relaxed text-ink">
            Happy Birthday from the Pentra Team. We hope you have a great day!
          </p>
        )}

        {anniversary && (
          <div className={birthday ? "border-t border-line pt-4" : ""}>
            {birthday && (
              <p className="label-wide mb-1 text-center text-muted">
                {yearsLabel} on Pentra
              </p>
            )}
            <p className="text-center text-sm leading-relaxed text-ink">
              Thank you for being a part of our community. You help make
              this a better place for everyone.
            </p>
          </div>
        )}
      </div>

      <Footer>
        <PrimaryButton onClick={onClose} autoFocus>
          Thanks!
        </PrimaryButton>
      </Footer>
    </Modal>
  );
}

/* ================================================================== */
/*  Shared pieces — same frame as the Welcome dialog.                  */
/* ================================================================== */

function Modal({
  onDismiss,
  labelledBy,
  backdropCloses = true,
  children,
}: {
  onDismiss: () => void;
  labelledBy: string;
  /** Off for the birthday question, where closing means "never ask
      again" — too much to hang on a stray click outside the box. */
  backdropCloses?: boolean;
  children: ReactNode;
}) {
  // Escape closes it, and the page behind stops scrolling while it's up.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  // Portalled to <body>: the notched shell clips fixed descendants.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 py-6 sm:items-center sm:p-6 sm:py-10"
      onClick={backdropCloses ? onDismiss : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className="float-shadow w-full max-w-md">
        <div
          className="notch border border-line bg-surface"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Header({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <div className="border-b border-line bg-accent-dim px-6 py-5">
      <p className="label-wide mb-1 text-accent">
        <span aria-hidden="true">//</span> {kicker}
      </p>
      <h2 id={id} className="display text-2xl">
        {title}
      </h2>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-6 py-4 sm:flex-row-reverse">
      {children}
    </div>
  );
}

function PrimaryButton(props: {
  onClick: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      autoFocus={props.autoFocus}
      className="label-wide notch-sm bg-accent px-5 py-2.5 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}

function SecondaryButton(props: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="label-wide notch-sm border border-line px-5 py-2.5 text-muted transition hover:bg-surface-2 hover:text-ink"
    >
      {props.children}
    </button>
  );
}

/* Original line art, drawn for this dialog. */

function CakeIcon() {
  return (
    <svg
      className="h-7 w-7 text-accent"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5c.9.9 1.2 1.9.6 2.7a.8.8 0 0 1-1.2 0c-.6-.8-.3-1.8.6-2.7Z" />
      <path d="M12 7.5V10" />
      <rect x="4" y="10" width="16" height="4.5" rx="1" />
      <path d="M4 12.5c1.3 1 2.7 1 4 0s2.7-1 4 0 2.7 1 4 0 2.7-1 4 0" />
      <path d="M5 14.5v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg
      className="h-7 w-7 text-accent"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 2.5 2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 21.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.1Z" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" />
    </svg>
  );
}

/** A few scattered accent marks behind the heading. Decorative only. */
function Sparkles() {
  const marks = [
    { x: "8%", y: "22%", s: 7, r: 12, o: 0.5 },
    { x: "20%", y: "68%", s: 5, r: -20, o: 0.35 },
    { x: "84%", y: "18%", s: 6, r: 30, o: 0.45 },
    { x: "90%", y: "62%", s: 8, r: -8, o: 0.3 },
    { x: "72%", y: "84%", s: 4, r: 45, o: 0.4 },
    { x: "30%", y: "12%", s: 4, r: 0, o: 0.3 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {marks.map((m, i) => (
        <span
          key={i}
          className="absolute bg-accent"
          style={{
            left: m.x,
            top: m.y,
            width: m.s,
            height: m.s,
            opacity: m.o,
            transform: `rotate(${m.r}deg)`,
            clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)",
          }}
        />
      ))}
    </div>
  );
}
