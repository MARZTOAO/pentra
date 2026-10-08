import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PetSprite } from "./PetSprite";
import { playBoost, type Pet } from "../lib/pets";

/**
 * Play: a 20-second mini game (supabase/110). Snacks pop up around
 * the field and vanish after a moment; tap them before they go. The
 * pet sits in the corner and perks up with every catch. The score goes
 * to pet_act('play', score): the full mood boost at `play_target`
 * catches, never less than 30% of it, so a bad round still counts as
 * playing. Spawns speed up as the clock runs down.
 */

const SECONDS = 20;
const LIFE_MS = 1300;

type Snack = { id: number; x: number; y: number; born: number; kind: 0 | 1 | 2; popped?: boolean };

export function PetPlayGame({
  pet,
  onDone,
  onClose,
}: {
  pet: Pet;
  /** Called once with the final score; the caller sends it to the server. */
  onDone: (score: number) => Promise<void>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"ready" | "playing" | "sending" | "done">("ready");
  const [left, setLeft] = useState(SECONDS);
  const [score, setScore] = useState(0);
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [bounce, setBounce] = useState(0);
  const nextId = useRef(1);
  const scoreRef = useRef(0);
  const caught = useRef(new Set<number>());
  const endAt = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The clock and the spawner, only while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    endAt.current = Date.now() + SECONDS * 1000;
    let spawnTimer = 0;

    const spawn = () => {
      const now = Date.now();
      if (now >= endAt.current) return;
      setSnacks((list) => [
        ...list.filter((s) => now - s.born < LIFE_MS + 300),
        {
          id: nextId.current++,
          x: 8 + Math.random() * 84,
          y: 10 + Math.random() * 80,
          born: now,
          kind: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        },
      ]);
      // 900ms between snacks at the start, down to 450ms at the end.
      const progress = 1 - (endAt.current - now) / (SECONDS * 1000);
      spawnTimer = window.setTimeout(spawn, 900 - 450 * progress);
    };
    spawn();

    const tick = window.setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endAt.current - now) / 1000));
      setLeft(remaining);
      setSnacks((list) => list.filter((s) => now - s.born < LIFE_MS + 300));
      if (now >= endAt.current) {
        window.clearInterval(tick);
        window.clearTimeout(spawnTimer);
        setSnacks([]);
        setPhase("sending");
      }
    }, 100);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(spawnTimer);
    };
  }, [phase]);

  // Send the score once the clock runs out.
  useEffect(() => {
    if (phase !== "sending") return;
    let active = true;
    onDoneRef.current(scoreRef.current).then(() => {
      if (active) setPhase("done");
    });
    return () => {
      active = false;
    };
  }, [phase]);

  // Escape closes, except mid-round.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "playing" && phase !== "sending") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  function catchSnack(id: number) {
    if (caught.current.has(id)) return;
    caught.current.add(id);
    scoreRef.current += 1;
    setScore(scoreRef.current);
    setBounce((n) => n + 1);
    setSnacks((list) => list.map((x) => (x.id === id ? { ...x, popped: true } : x)));
  }

  const color = pet.color ?? "#ff7a2f";
  const target = pet.rules.play_target;
  const boost = playBoost(score, pet.rules);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Play with your pet">
      <div className="w-full max-w-md notch border border-line bg-surface p-4 shadow-2xl" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="label-wide text-muted">Play with {pet.name}</p>
            <p className="text-sm font-semibold">{phase === "playing" ? "Tap the snacks!" : phase === "ready" ? "Catch the snacks" : "Round over"}</p>
          </div>
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="label-wide text-muted">Caught</p>
              <p className="numeric text-xl font-bold text-accent">{score}</p>
            </div>
            <div>
              <p className="label-wide text-muted">Time</p>
              <p className={`numeric text-xl font-bold ${left <= 5 && phase === "playing" ? "text-danger" : ""}`}>{left}</p>
            </div>
          </div>
        </div>

        <div
          className="relative w-full select-none overflow-hidden border border-line bg-bg"
          style={{
            aspectRatio: "4 / 3",
            backgroundImage:
              "linear-gradient(rgba(255,122,47,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,122,47,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            touchAction: "manipulation",
          }}
        >
          {/* The pet, bottom-left, bouncing on each catch. */}
          <div
            key={bounce}
            className="pointer-events-none absolute bottom-1 left-2"
            style={{ animation: bounce ? "pet-bounce 320ms ease-out" : undefined }}
          >
            <PetSprite species={pet.species} shape={pet.shape} color={pet.color} edge={pet.edge} stage={pet.stage} size={72} />
          </div>

          {phase === "playing" &&
            snacks.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-label="Snack"
                onPointerDown={(e) => {
                  e.preventDefault();
                  catchSnack(s.id);
                }}
                disabled={s.popped}
                className="absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  animation: s.popped ? "snack-pop 220ms ease-out forwards" : `snack-life ${LIFE_MS}ms linear forwards`,
                }}
              >
                <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true">
                  {s.kind === 0 && <circle cx="20" cy="20" r="13" fill={color} stroke={pet.edge ?? "#fff"} strokeWidth="2" />}
                  {s.kind === 1 && <polygon points="20,6 33,15 28,32 12,32 7,15" fill={color} stroke={pet.edge ?? "#fff"} strokeWidth="2" strokeLinejoin="round" />}
                  {s.kind === 2 && <rect x="8" y="8" width="24" height="24" fill={color} stroke={pet.edge ?? "#fff"} strokeWidth="2" transform="rotate(45 20 20)" />}
                  <circle cx="15" cy="16" r="2" fill="#15161a" />
                  <circle cx="25" cy="16" r="2" fill="#15161a" />
                </svg>
              </button>
            ))}

          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/70 p-6 text-center">
              <p className="text-sm text-muted">
                Snacks pop up for a second and vanish. Tap as many as you can in {SECONDS} seconds. {target} or more and {pet.name} is
                over the moon (+{pet.rules.play_mood} mood).
              </p>
              <button
                type="button"
                autoFocus
                onClick={() => setPhase("playing")}
                className="label-wide notch-sm bg-accent px-6 py-3 text-onaccent transition hover:bg-accent-hi"
              >
                Go
              </button>
            </div>
          )}

          {(phase === "sending" || phase === "done") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/80 p-6 text-center">
              <p className="numeric text-4xl font-bold text-accent">{score}</p>
              <p className="text-sm">
                {score >= target ? `${pet.name} loved that.` : score >= target / 2 ? `${pet.name} had fun.` : `${pet.name} appreciated the effort.`}{" "}
                <span className="text-muted">+{boost} mood</span>
              </p>
              {phase === "sending" ? (
                <p className="text-xs text-muted">Saving…</p>
              ) : (
                <button
                  type="button"
                  autoFocus
                  onClick={onClose}
                  className="label-wide notch-sm mt-2 bg-accent px-6 py-2.5 text-onaccent transition hover:bg-accent-hi"
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>

        {phase === "ready" && (
          <button type="button" onClick={onClose} className="mt-3 w-full text-center text-xs text-muted hover:text-ink">
            Not now
          </button>
        )}
      </div>

      <style>{`
        @keyframes snack-life { 0% { transform: translate(-50%,-50%) scale(0.2); opacity: 0 } 12% { transform: translate(-50%,-50%) scale(1.1); opacity: 1 } 80% { transform: translate(-50%,-50%) scale(1); opacity: 1 } 100% { transform: translate(-50%,-50%) scale(0.6); opacity: 0 } }
        @keyframes snack-pop { 0% { transform: translate(-50%,-50%) scale(1); opacity: 1 } 100% { transform: translate(-50%,-50%) scale(1.8); opacity: 0 } }
        @keyframes pet-bounce { 0% { transform: translateY(0) } 40% { transform: translateY(-14px) scale(1.06) } 100% { transform: translateY(0) } }
      `}</style>
    </div>,
    document.body,
  );
}
