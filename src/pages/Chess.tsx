import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { useAuth } from "../lib/AuthContext";
import { Avatar } from "../components/Avatar";
import { ChessBoard, MoveList } from "../components/ChessBoard";
import { FullScreenLoader } from "../components/ui";
import { getFriendList, type FriendRow } from "../lib/friends";
import {
  challenge,
  getChessGame,
  getChessRecord,
  listChessGames,
  myColor,
  opponentOf,
  resign,
  respondToChallenge,
  resultText,
  sendMove,
  type ChessGame,
  type ChessRecord,
} from "../lib/chess";
import {
  START_FEN,
  legalMoves,
  makeMove,
  outcome,
  parseFen,
  san,
  toFen,
  type Move,
  type Position,
} from "../arcade/chess/engine";
import { chooseMove, type Level } from "../arcade/chess/ai";

/**
 * /arcade/chess — Chess (supabase/109).
 *
 * Two ways to play. Against the computer, everything happens here in
 * the browser. Against a friend, the game is turn-based: you move when
 * you're around, they get a notification, and the game waits. The
 * host calls a coin flip when challenging; the database flips it and
 * the winner of the call plays white.
 */
export default function Chess() {
  const { id } = useParams<{ id: string }>();
  if (id) return <OnlineGame id={Number(id)} />;
  return <Lobby />;
}

/* ================================================================== */
/*  Lobby: computer or a friend                                        */
/* ================================================================== */

function Lobby() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"friends" | "computer">("friends");
  const [games, setGames] = useState<ChessGame[] | null>(null);
  const [record, setRecord] = useState<ChessRecord | null>(null);
  const [challenging, setChallenging] = useState(false);

  const load = useCallback(() => {
    listChessGames().then(setGames);
    getChessRecord().then(setRecord);
  }, []);

  useEffect(load, [load]);

  // A friend may move while this page is open.
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const me = user?.id ?? "";
  const mine = games ?? [];
  const yourMove = mine.filter((g) => g.status === "active" && g.turn_id === me);
  const theirMove = mine.filter((g) => g.status === "active" && g.turn_id !== me);
  const invites = mine.filter((g) => g.status === "invited" && g.opponent_id === me);
  const sent = mine.filter((g) => g.status === "invited" && g.host_id === me);
  const done = mine.filter((g) => !["active", "invited"].includes(g.status));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Link to="/arcade" className="label-wide mb-4 inline-flex items-center gap-1.5 text-muted transition hover:text-ink">
        ← Arcade
      </Link>
      <header className="mb-6">
        <h1 className="display on-art text-2xl sm:text-3xl">Chess</h1>
        <p className="on-art mt-1 text-sm text-muted">
          Play the computer, or challenge a friend and take your turns whenever.
          {record && (record.wins + record.losses + record.draws > 0) && (
            <>
              {" "}Your record against players:{" "}
              <span className="numeric text-ink">
                {record.wins}–{record.losses}–{record.draws}
              </span>
              .
            </>
          )}
        </p>
      </header>

      <div role="tablist" className="mb-5 flex gap-1 border-b border-line">
        {(
          [
            ["friends", `Friends${yourMove.length + invites.length ? ` (${yourMove.length + invites.length})` : ""}`],
            ["computer", "Computer"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={
              "label-wide -mb-px border-b-2 px-3 py-2 transition " +
              (tab === key ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "computer" ? (
        <ComputerGame />
      ) : games === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setChallenging(true)}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Challenge a friend
          </button>

          {invites.length > 0 && (
            <Group title="Challenges for you">
              {invites.map((g) => (
                <InviteRow key={g.id} g={g} me={me} onChange={load} />
              ))}
            </Group>
          )}

          <Group title="Your move">
            {yourMove.length === 0 ? (
              <p className="text-sm text-muted">Nothing waiting on you.</p>
            ) : (
              yourMove.map((g) => <GameRow key={g.id} g={g} me={me} />)
            )}
          </Group>

          {theirMove.length > 0 && (
            <Group title="Their move">
              {theirMove.map((g) => (
                <GameRow key={g.id} g={g} me={me} />
              ))}
            </Group>
          )}

          {sent.length > 0 && (
            <Group title="Waiting for an answer">
              {sent.map((g) => (
                <InviteRow key={g.id} g={g} me={me} onChange={load} />
              ))}
            </Group>
          )}

          {done.length > 0 && (
            <Group title="Finished">
              {done.map((g) => (
                <GameRow key={g.id} g={g} me={me} />
              ))}
            </Group>
          )}

          {mine.length === 0 && (
            <p className="text-sm text-muted">
              No games yet. Challenge a friend: you call the coin flip, the winner of the call plays white,
              and you each move whenever you're around.
            </p>
          )}
        </div>
      )}

      {challenging && (
        <ChallengeDialog
          onDone={() => {
            setChallenging(false);
            load();
          }}
          onClose={() => setChallenging(false)}
        />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="label-wide mb-2 text-muted">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function GameRow({ g, me }: { g: ChessGame; me: string }) {
  const them = opponentOf(g, me);
  const colour = myColor(g, me) === "w" ? "White" : "Black";
  const when = g.last_move_at ?? g.started_at ?? g.created_at;
  return (
    <Link
      to={`/arcade/chess/${g.id}`}
      className="flex items-center gap-3 notch-md border border-line bg-surface/85 px-3 py-2.5 backdrop-blur-sm transition hover:border-accent/60"
    >
      <Avatar of={them} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{them.display_name || them.username}</p>
        <p className="truncate text-xs text-muted">
          You're {colour} · {g.moves.length} move{g.moves.length === 1 ? "" : "s"}
          {g.status === "finished" ? ` · ${resultText(g, me)}` : ""}
          {g.status === "declined" || g.status === "cancelled" ? ` · ${resultText(g, me)}` : ""}
        </p>
      </div>
      <span className="numeric shrink-0 text-2xs text-muted">{ago(when)}</span>
    </Link>
  );
}

function InviteRow({ g, me, onChange }: { g: ChessGame; me: string; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forMe = g.opponent_id === me;
  const them = opponentOf(g, me);
  const iAmWhite = g.white_id === me;

  async function answer(accept: boolean) {
    if (busy) return;
    setBusy(true);
    const r = await respondToChallenge(g.id, accept);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else onChange();
  }

  return (
    <div className="notch-md border border-accent/50 bg-accent/10 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Avatar of={them} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{them.display_name || them.username}</p>
          <p className="text-xs text-muted">
            {forMe ? "Challenged you. " : "Waiting for them. "}
            Coin: {g.host_id === me ? "you" : "they"} called {g.host_call}, it came up {g.flip}.{" "}
            You're {iAmWhite ? "White (you move first)" : "Black"}.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {forMe ? (
            <>
              <button
                type="button"
                onClick={() => answer(true)}
                disabled={busy}
                className="notch-md bg-accent px-3 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                disabled={busy}
                className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink disabled:opacity-40"
              >
                Decline
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => answer(false)}
              disabled={busy}
              className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-danger disabled:opacity-40"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Challenging: pick a friend, call the coin, watch it land           */
/* ------------------------------------------------------------------ */

function ChallengeDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [pick, setPick] = useState<FriendRow | null>(null);
  const [call, setCall] = useState<"heads" | "tails" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<ChessGame | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    getFriendList().then((rows) => setFriends(rows.filter((r) => r.direction === "friend")));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const n = filter.trim().toLowerCase();
    return (friends ?? []).filter(
      (f) => !n || f.username.toLowerCase().includes(n) || (f.display_name ?? "").toLowerCase().includes(n),
    );
  }, [friends, filter]);

  async function go() {
    if (!pick || !call || busy) return;
    setBusy(true);
    setError(null);
    const r = await challenge(pick.other_id, call);
    setBusy(false);
    if (typeof r === "string") {
      setError(r);
      return;
    }
    setFlipped(r);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-10 sm:p-6 sm:pt-20" onClick={onClose}>
      <div className="float-shadow w-full max-w-md">
        <div className="w-full overflow-hidden notch border border-line bg-surface" onClick={(e) => e.stopPropagation()}>
          {flipped ? (
            <CoinResult g={flipped} onClose={onDone} />
          ) : (
            <>
              <div className="border-b border-line p-4">
                <h2 className="mb-1 text-sm font-semibold">Challenge a friend</h2>
                <p className="text-xs text-muted">
                  Pick who, then call the coin. Call it right and you play White.
                </p>
                {(friends?.length ?? 0) > 6 && (
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter friends"
                    className="mt-3 w-full notch-md border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition focus:border-accent"
                  />
                )}
              </div>

              <div className="max-h-[40vh] overflow-y-auto p-3">
                {friends === null ? (
                  <p className="p-4 text-center text-sm text-muted">Loading…</p>
                ) : friends.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted">
                    No friends yet. Add some first, then challenge them here.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {shown.map((f) => (
                      <li key={f.other_id}>
                        <button
                          type="button"
                          onClick={() => setPick(f)}
                          className={
                            "flex w-full items-center gap-2.5 notch-md border px-2.5 py-2 text-left text-sm transition " +
                            (pick?.other_id === f.other_id
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-transparent hover:border-line hover:bg-surface-2")
                          }
                        >
                          <Avatar of={f} size={30} />
                          <span className="min-w-0 flex-1 truncate">{f.display_name || f.username}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-line p-3">
                <p className="label-wide mb-2 text-muted">Your call</p>
                <div className="flex gap-2">
                  {(["heads", "tails"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCall(c)}
                      className={
                        "flex-1 notch-md border px-3 py-2 text-sm font-semibold capitalize transition " +
                        (call === c ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink")
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-danger">{error}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={go}
                      disabled={!pick || !call || busy}
                      className="notch-md bg-accent px-4 py-1.5 text-xs font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
                    >
                      {busy ? "Flipping…" : "Flip and challenge"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The coin landing: a short spin, then the answer. */
function CoinResult({ g, onClose }: { g: ChessGame; onClose: () => void }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), 1400);
    return () => clearTimeout(t);
  }, []);
  const won = g.flip === g.host_call;
  const them = g.white_id === g.host_id ? g.black : g.white;
  return (
    <div className="p-6 text-center">
      <div
        className={
          "mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full border-4 border-accent bg-accent/15 text-3xl font-bold text-accent " +
          (landed ? "" : "animate-spin")
        }
      >
        {landed ? (g.flip === "heads" ? "H" : "T") : "?"}
      </div>
      {landed ? (
        <>
          <p className="display text-xl">{g.flip === "heads" ? "Heads" : "Tails"}!</p>
          <p className="mt-2 text-sm text-muted">
            You called {g.host_call}.{" "}
            {won ? "You play White and move first." : `${them.display_name || them.username} plays White and moves first.`}
          </p>
          <p className="mt-1 text-xs text-muted">
            They've been challenged. The game starts when they accept.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Done
          </button>
        </>
      ) : (
        <p className="text-sm text-muted">Flipping…</p>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Against the computer                                               */
/* ================================================================== */

function ComputerGame() {
  const [level, setLevel] = useState<Level>("normal");
  const [me, setMe] = useState<"w" | "b">("w");
  const [position, setPosition] = useState<Position | null>(null);
  const [moves, setMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: number; to: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = useMemo(() => (position ? outcome(position) : null), [position]);

  function start(side: "w" | "b") {
    setMe(side);
    setMoves([]);
    setLastMove(null);
    setPosition(parseFen(START_FEN));
  }

  // The computer moves whenever it's its turn.
  useEffect(() => {
    if (!position || !state || state.over || position.turn === me) return;
    setThinking(true);
    timer.current = setTimeout(() => {
      const m = chooseMove(position, level);
      if (m) apply(m);
      setThinking(false);
    }, 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, me, level]);

  function apply(m: Move) {
    if (!position) return;
    const all = legalMoves(position);
    setMoves((ms) => [...ms, san(position, m, all)]);
    setLastMove({ from: m.from, to: m.to });
    setPosition(makeMove(position, m));
  }

  if (!position) {
    return (
      <div className="notch border border-line bg-surface/85 p-5 backdrop-blur-sm">
        <h2 className="mb-1 text-sm font-semibold">Play the computer</h2>
        <p className="mb-4 text-xs text-muted">Pick how hard, and which side you'll play.</p>
        <div className="mb-4 flex gap-2">
          {(
            [
              ["easy", "Easy", "Learning the moves"],
              ["normal", "Normal", "A fair game"],
              ["hard", "Hard", "Thinks ahead"],
            ] as const
          ).map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              onClick={() => setLevel(k)}
              className={
                "flex-1 notch-md border px-3 py-2 text-left transition " +
                (level === k ? "border-accent bg-accent/15" : "border-line hover:border-muted")
              }
            >
              <span className={"block text-sm font-semibold " + (level === k ? "text-accent" : "")}>{label}</span>
              <span className="block text-2xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => start("w")}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi"
          >
            Play as White
          </button>
          <button
            type="button"
            onClick={() => start("b")}
            className="notch-md border border-line px-4 py-2 text-sm font-semibold transition hover:border-muted"
          >
            Play as Black
          </button>
        </div>
      </div>
    );
  }

  const statusLine = state?.over
    ? state.result === "draw"
      ? `Draw — ${reasonWord(state.reason)}.`
      : (state.result === "white") === (me === "w")
        ? "You won by checkmate!"
        : "The computer won by checkmate."
    : thinking
      ? "The computer is thinking…"
      : state?.check
        ? "Your move. You're in check!"
        : "Your move.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{statusLine}</p>
        <div className="flex gap-2">
          <span className="notch-sm border border-line px-2 py-1 text-2xs capitalize text-muted">{level}</span>
          <button
            type="button"
            onClick={() => setPosition(null)}
            className="notch-sm border border-line px-2 py-1 text-2xs font-semibold text-muted transition hover:text-ink"
          >
            {state?.over ? "Play again" : "Give up"}
          </button>
        </div>
      </div>

      <ChessBoard
        position={position}
        flipped={me === "b"}
        canMove={state?.over || thinking ? null : me}
        lastMove={lastMove}
        onMove={apply}
      />

      <MoveList moves={moves} />
    </div>
  );
}

function reasonWord(r: string): string {
  return (
    {
      stalemate: "stalemate",
      insufficient: "not enough pieces left to mate",
      fifty_moves: "fifty moves without a capture or pawn move",
      checkmate: "checkmate",
    } as Record<string, string>
  )[r] ?? r;
}

/* ================================================================== */
/*  Against a friend, by turns                                         */
/* ================================================================== */

function OnlineGame({ id }: { id: number }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const me = user?.id ?? "";
  const [g, setG] = useState<ChessGame | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);

  const load = useCallback(() => {
    getChessGame(id).then((x) => setG(x));
  }, [id]);

  useEffect(load, [load]);

  // While it's their move, check every few seconds so their move shows
  // up without a refresh. Slower once the game is over.
  useEffect(() => {
    if (!g || g.status !== "active") return;
    const t = setInterval(load, g.turn_id === me ? 20000 : 5000);
    return () => clearInterval(t);
  }, [g, me, load]);

  const position = useMemo(() => (g ? parseFen(g.fen) : null), [g]);
  const state = useMemo(() => (position ? outcome(position) : null), [position]);

  if (g === undefined) return <FullScreenLoader />;
  if (g === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
        <p className="text-sm text-muted">No such game, or it isn't yours.</p>
        <Link to="/arcade/chess" className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">
          ← Chess
        </Link>
      </div>
    );
  }

  const colour = myColor(g, me);
  const them = opponentOf(g, me);
  const myTurn = g.status === "active" && g.turn_id === me;
  const lastFrom = null; // the FEN alone doesn't say; the move list does.

  async function play(m: Move) {
    if (!position || !g || busy) return;
    const all = legalMoves(position);
    const notation = san(position, m, all);
    const after = makeMove(position, m);
    const o = outcome(after);
    setBusy(true);
    setError(null);
    const r = await sendMove(
      g.id,
      notation,
      toFen(after),
      o.over ? o.result : null,
      o.over ? o.reason : null,
    );
    setBusy(false);
    if (typeof r === "string") {
      setError(r);
      load();
    } else setG(r);
  }

  async function giveUp() {
    setConfirmResign(false);
    setBusy(true);
    const r = await resign(g!.id);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else setG(r);
  }

  async function answer(accept: boolean) {
    setBusy(true);
    const r = await respondToChallenge(g!.id, accept);
    setBusy(false);
    if (typeof r === "string") setError(r);
    else if (accept) setG(r);
    else navigate("/arcade/chess");
  }

  const headline =
    g.status === "invited"
      ? g.opponent_id === me
        ? `${them.display_name || them.username} challenged you`
        : "Waiting for them to accept"
      : g.status === "active"
        ? myTurn
          ? state && !state.over && state.check
            ? "Your move — you're in check!"
            : "Your move"
          : `Waiting for ${them.display_name || them.username}`
        : resultText(g, me);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <Link to="/arcade/chess" className="label-wide mb-4 inline-flex items-center gap-1.5 text-muted transition hover:text-ink">
        ← Chess
      </Link>

      <header className="mb-4 flex flex-wrap items-center gap-3">
        <Avatar of={them} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">
            <span className="font-semibold">{them.display_name || them.username}</span>
            <span className="text-muted"> · you're {colour === "w" ? "White" : "Black"}</span>
          </p>
          <p className={"text-sm " + (myTurn ? "font-semibold text-accent" : "text-muted")}>{headline}</p>
        </div>
        {g.status === "active" && (
          <button
            type="button"
            onClick={() => setConfirmResign(true)}
            disabled={busy}
            className="notch-sm border border-line px-2.5 py-1 text-2xs font-semibold text-muted transition hover:text-danger"
          >
            Resign
          </button>
        )}
      </header>

      <p className="mb-4 text-xs text-muted">
        Coin flip: {g.host_id === me ? "you" : them.display_name || them.username} called {g.host_call}, it came up{" "}
        {g.flip}, so {g.white_id === me ? "you" : them.display_name || them.username} play{g.white_id === me ? "" : "s"} White.
      </p>

      {g.status === "invited" && g.opponent_id === me && (
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => answer(true)}
            disabled={busy}
            className="notch-md bg-accent px-4 py-2 text-sm font-semibold text-onaccent transition hover:bg-accent-hi disabled:opacity-40"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => answer(false)}
            disabled={busy}
            className="notch-md border border-line px-4 py-2 text-sm font-semibold text-muted transition hover:text-ink disabled:opacity-40"
          >
            Decline
          </button>
        </div>
      )}

      {position && (
        <ChessBoard
          position={position}
          flipped={colour === "b"}
          canMove={myTurn && !busy ? colour : null}
          lastMove={lastFrom}
          onMove={play}
        />
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4">
        <MoveList moves={g.moves} />
      </div>

      {g.status === "active" && !myTurn && (
        <p className="mt-4 text-xs text-muted">
          You'll get a notification when it's your move. No need to keep this open.
        </p>
      )}

      {confirmResign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setConfirmResign(false)}>
          <div className="notch border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold">Resign this game?</p>
            <p className="mt-1 text-xs text-muted">{them.display_name || them.username} wins. You can't undo it.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResign(false)}
                className="notch-md border border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-ink"
              >
                Keep playing
              </button>
              <button
                type="button"
                onClick={giveUp}
                className="notch-md bg-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Resign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
