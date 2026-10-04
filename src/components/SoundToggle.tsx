import { useState } from "react";
import { play, setSoundOn, soundOn } from "../arcade/sound";

/** The arcade's sound switch: a speaker that's crossed out when off. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(soundOn);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !on;
        setSoundOn(next);
        setOn(next);
        if (next) play("click");
      }}
      aria-pressed={on}
      aria-label={on ? "Sound on" : "Sound off"}
      title={on ? "Sound on — click to mute" : "Sound off — click to unmute"}
      className={
        "inline-flex h-9 w-9 items-center justify-center notch-md border border-line transition hover:border-accent hover:text-accent " +
        (on ? "text-ink" : "text-muted") +
        " " +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {on ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M19 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <path d="m22 9-6 6M16 9l6 6" />
        )}
      </svg>
    </button>
  );
}
