import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PetSprite } from "./PetSprite";
import { useDevMode } from "../lib/devMode";
import {
  agoText,
  devPet,
  petAct,
  petCheer,
  petMoodText,
  untilText,
  usePet,
  type DevPetAction,
  type Pet,
  type PetAction,
} from "../lib/pets";

/**
 * The pet on a profile (supabase/110). Only rendered when the `pets`
 * flag is on for the viewer (PublicProfile checks useFlag("pets")).
 *
 * Your own profile: the egg (tap to warm it once a day) and, once it
 * hatches, Feed / Play / Rest, a rename, the meters and the growth
 * bar. Someone else's: their pet with a Cheer button (+mood, once a
 * day per visitor). Draws nothing for someone who has no pet yet.
 */
export function PetCard({ userId, isSelf }: { userId: string; isSelf: boolean }) {
  const { pet, setPet, reload } = usePet(userId, true);
  const dev = useDevMode();
  const [busy, setBusy] = useState<PetAction | "cheer" | "dev" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [name, setName] = useState("");
  // Re-render each minute so countdowns move without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // Notes fade after a few seconds.
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [note]);

  async function devAct(action: DevPetAction) {
    if (busy) return;
    setBusy("dev");
    const res = await devPet(userId, action);
    setBusy(null);
    if (res.error) {
      setNote(res.error);
      return;
    }
    if (action === "reset") {
      // Gone; the next look makes a fresh egg (yours) or nothing (theirs).
      await reload();
      setNote("Reset.");
      return;
    }
    if (res.pet) setPet(res.pet);
    else await reload();
    setNote(`Developer: ${action}.`);
  }

  if (!pet) {
    if (!dev) return null;
    return (
      <section className="mb-8">
        <h2 className="on-art mb-4 label-wide text-muted">Pet</h2>
        <div className="notch border border-accent/40 bg-surface/85 p-3 text-xs text-muted backdrop-blur-sm">
          <span className="label-wide mr-2 text-accent">Developer</span>
          No pet yet.{" "}
          <button type="button" disabled={busy !== null} onClick={() => void devAct("give")} className="font-semibold text-ink underline-offset-2 hover:underline">
            Give an egg
          </button>
          {note && <span className="ml-2 text-accent">{note}</span>}
        </div>
      </section>
    );
  }

  async function act(action: PetAction, value?: string) {
    if (busy) return;
    setBusy(action);
    const res = await petAct(action, value);
    setBusy(null);
    if (res.error) {
      setNote(res.error);
      return;
    }
    if (res.pet) setPet(res.pet);
    if (action === "feed") setNote("Yum.");
    if (action === "play") setNote("+mood. It loved that.");
    if (action === "rest") setNote("Zzz. Energy back to full.");
    if (action === "warm") setNote("Warm. Hatches with full mood.");
    if (action === "rename") {
      setRenaming(false);
      setNote("Renamed.");
    }
    if (action === "new_egg") {
      setConfirmNew(false);
      setNote("A new egg. Nobody knows what's inside.");
    }
  }

  async function cheer() {
    if (busy) return;
    setBusy("cheer");
    const res = await petCheer(userId);
    setBusy(null);
    if (res.error) {
      setNote(res.error);
      return;
    }
    if (res.pet) setPet(res.pet);
    setNote("You cheered it up.");
  }

  function submitRename(e: FormEvent) {
    e.preventDefault();
    void act("rename", name);
  }

  const playIn = untilText(pet.can_play_at);
  const newEggIn = untilText(pet.can_new_egg_at);
  const restIn = untilText(pet.can_rest_at);
  const r = pet.rules;

  return (
    <section className="mb-8">
      <h2 className="on-art mb-4 label-wide text-muted">{isSelf ? "Your pet" : "Pet"}</h2>
      <div className="notch border border-line bg-surface/85 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (pet.is_egg && isSelf && !pet.warmed_today) void act("warm");
              else if (!isSelf && !pet.is_egg && !pet.cheered_today) void cheer();
              else void reload();
            }}
            disabled={busy !== null}
            aria-label={pet.is_egg ? "Warm the egg" : isSelf ? "Your pet" : "Cheer this pet"}
            className="relative flex h-28 w-28 shrink-0 items-end justify-center"
            style={{
              background: `radial-gradient(circle at 50% 70%, ${pet.color ?? "#ff7a2f"}40, transparent 70%)`,
            }}
          >
            <PetSprite
              species={pet.species}
              shape={pet.shape}
              color={pet.color}
              edge={pet.edge}
              stage={pet.stage}
              napping={pet.napping}
              isEgg={pet.is_egg}
              size={104}
            />
            {!pet.is_egg && (
              <span className="absolute left-0 top-0 border border-accent/50 bg-accent/15 px-1.5 py-px text-[10px] font-semibold text-accent">
                Lv {pet.stage}
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {pet.is_egg ? (
              <EggInfo pet={pet} isSelf={isSelf} busy={busy !== null} onWarm={() => void act("warm")} />
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {renaming && isSelf ? (
                    <form onSubmit={submitRename} className="flex w-full items-center gap-2">
                      <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={20}
                        placeholder={pet.name ?? ""}
                        className="min-w-0 flex-1 border border-line bg-bg px-2 py-1 text-sm"
                      />
                      <button type="submit" disabled={busy !== null || !name.trim()} className="label-wide text-accent disabled:opacity-40">
                        Save
                      </button>
                      <button type="button" onClick={() => setRenaming(false)} className="label-wide text-muted">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="text-lg font-bold">{pet.name}</span>
                      <span className="text-xs text-muted">
                        {pet.species_name} · stage {pet.stage}
                      </span>
                      {isSelf && (
                        <button
                          type="button"
                          onClick={() => {
                            setName(pet.name ?? "");
                            setRenaming(true);
                          }}
                          className="text-xs text-muted underline-offset-2 hover:underline"
                        >
                          rename
                        </button>
                      )}
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {petMoodText(pet)} {pet.age_days === 0 ? "Hatched today." : `${pet.age_days} ${pet.age_days === 1 ? "day" : "days"} old.`}
                  {isSelf && pet.fed_at ? ` Fed ${agoText(pet.fed_at)}.` : ""}
                </p>
                <div className="mt-2 space-y-1.5">
                  <Meter label="Hunger" value={pet.hunger} color="#ff7a2f" />
                  <Meter label="Mood" value={pet.mood} color="#2ad4c8" />
                  <Meter label="Energy" value={pet.energy} color="#a66cff" />
                </div>
              </>
            )}
          </div>
        </div>

        {!pet.is_egg && isSelf && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <ActionButton
              primary
              label="Feed"
              sub={pet.snacks === 0 ? "no snacks" : `${pet.snacks} ${pet.snacks === 1 ? "snack" : "snacks"}`}
              disabled={busy !== null || pet.snacks === 0 || pet.hunger >= 100}
              onClick={() => void act("feed")}
            />
            <ActionButton
              label="Play"
              sub={playIn ? playIn : pet.energy < r.play_energy ? "too tired" : "ready"}
              disabled={busy !== null || !!playIn || pet.energy < r.play_energy}
              onClick={() => void act("play")}
            />
            <ActionButton
              label="Rest"
              sub={restIn ? restIn : "ready"}
              disabled={busy !== null || !!restIn}
              onClick={() => void act("rest")}
            />
          </div>
        )}

        {!pet.is_egg && !isSelf && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void cheer()}
              disabled={busy !== null || pet.cheered_today}
              className="label-wide notch-sm bg-accent px-4 py-2 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
            >
              {pet.cheered_today ? "Cheered today" : "Cheer"}
            </button>
            <span className="text-xs text-muted">
              +{r.cheer_mood} mood, once a day.
              {pet.cheers_today > 0 ? ` ${pet.cheers_today} ${pet.cheers_today === 1 ? "cheer" : "cheers"} today.` : ""}
            </span>
          </div>
        )}

        {!pet.is_egg && pet.next_stage_xp && (
          <div className="mt-4 border-t border-line/60 pt-3">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted">
              <span>To stage {pet.stage + 1}</span>
              <span className="numeric text-ink">
                {pet.xp} / {pet.next_stage_xp} XP
              </span>
            </div>
            <div className="mt-1 h-1.5 border border-line bg-bg">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (pet.xp / pet.next_stage_xp) * 100)}%` }} />
            </div>
            {isSelf && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                +{r.xp_care} XP a day for looking after it, +{r.xp_session} for every session you turn up to, +{r.xp_commend} per
                commendation, +{r.xp_arcade} a day in the Arcade. Snacks: one free every {r.snack_free_hours} hours (up to {r.snack_cap}),
                +2 per session, +1 a day in the Arcade, +5 when an invite of yours starts playing. It never dies: left alone it just naps.
              </p>
            )}
          </div>
        )}
        {!pet.is_egg && !pet.next_stage_xp && isSelf && (
          <p className="mt-3 text-xs text-muted">Fully grown. {pet.xp} XP and counting.</p>
        )}

        {isSelf && (
          <div className="mt-3 border-t border-line/60 pt-3 text-xs text-muted">
            {confirmNew ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink">
                  {pet.is_egg ? "Swap this egg for a different one?" : `${pet.name} will be gone for good. Sure?`}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act("new_egg")}
                  className="label-wide notch-sm bg-danger px-3 py-1.5 text-onaccent transition hover:brightness-110 disabled:opacity-40"
                >
                  Yes, new egg
                </button>
                <button type="button" onClick={() => setConfirmNew(false)} className="label-wide text-muted">
                  Keep it
                </button>
              </div>
            ) : newEggIn ? (
              <span>
                Want a different pet? Free members get a new egg once every {r.new_egg_days} days (next {newEggIn}).{" "}
                <Link to="/pro" className="text-accent">
                  Pentra Pro
                </Link>{" "}
                members can any time.
              </span>
            ) : (
              <span>
                Want a different pet?{" "}
                <button type="button" onClick={() => setConfirmNew(true)} className="font-semibold text-ink underline-offset-2 hover:underline">
                  Get a new egg
                </button>
                {pet.pro ? " (Pro: any time)" : ` (once every ${r.new_egg_days} days)`}. The old pet is gone for good.
              </span>
            )}
          </div>
        )}

        {note && (
          <p className="mt-3 text-xs font-medium text-accent" role="status">
            {note}
          </p>
        )}

        {dev && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent/40 pt-3">
            <span className="label-wide mr-1 text-accent">Developer</span>
            {(
              [
                ["hatch", "Hatch now", pet.is_egg],
                ["evolve", "Evolve", !pet.is_egg && pet.stage < 3],
                ["fill", "Fill meters", !pet.is_egg],
                ["starve", "Starve", !pet.is_egg],
                ["reset", "Reset to egg", true],
              ] as [DevPetAction, string, boolean][]
            )
              .filter(([, , show]) => show)
              .map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void devAct(action)}
                  className="notch-sm border border-line px-2.5 py-1 text-2xs font-semibold text-muted transition hover:text-ink disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EggInfo({ pet, isSelf, busy, onWarm }: { pet: Pet; isSelf: boolean; busy: boolean; onWarm: () => void }) {
  const hatchIn = untilText(pet.hatches_at);
  return (
    <>
      <p className="text-lg font-bold">{isSelf ? "You've got an egg." : "An egg."}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {isSelf
          ? `Hatches after your first session on Pentra, or ${hatchIn || "any moment now"}, whichever comes first. One of ten things is inside.`
          : `Hatches ${hatchIn || "any moment now"}, or after their first session.`}
      </p>
      {isSelf && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onWarm}
            disabled={busy || pet.warmed_today}
            className="label-wide notch-sm bg-accent px-4 py-2 text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            {pet.warmed_today ? "Warm" : "Warm it"}
          </button>
          <span className="text-xs text-muted">Once a day. Warm eggs hatch in a good mood.</span>
        </div>
      )}
    </>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className="numeric text-ink">{Math.round(value)}%</span>
      </div>
      <div className="mt-0.5 h-1.5 border border-line bg-bg">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  sub,
  primary,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  primary?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`notch-sm flex h-14 flex-col items-center justify-center transition disabled:opacity-40 ${
        primary ? "bg-accent text-onaccent hover:bg-accent-hi" : "border border-line bg-surface hover:bg-surface-2"
      }`}
    >
      <span className="label-wide">{label}</span>
      <span className={`text-[11px] ${primary ? "opacity-80" : "text-muted"}`}>{sub}</span>
    </button>
  );
}
