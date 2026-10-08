import { useMemo, useState } from "react";
import {
  inCheck,
  movesFrom,
  squareName,
  colorOf,
  type Move,
  type PieceType,
  type Position,
  type Square,
} from "../arcade/chess/engine";

/**
 * A chess board you can play on. Tap a piece, see where it can go,
 * tap the square. Promotions ask which piece. The board turns round
 * for black so your pieces are always at the bottom.
 *
 * Pure: it shows a position and reports the move picked; whoever
 * renders it decides what happens next (the computer replies, or the
 * move goes to the database).
 */

const GLYPH: Record<string, string> = {
  K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};

export function ChessBoard({
  position,
  flipped = false,
  /** Which side the viewer may move; null for look-only. */
  canMove,
  lastMove,
  onMove,
  className = "",
}: {
  position: Position;
  flipped?: boolean;
  canMove: "w" | "b" | null;
  lastMove?: { from: Square; to: Square } | null;
  onMove: (m: Move) => void;
  className?: string;
}) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promoting, setPromoting] = useState<{ from: Square; to: Square } | null>(null);

  const targets = useMemo(
    () => (selected === null ? [] : movesFrom(position, selected)),
    [position, selected],
  );

  // The checked king gets a red square, so a check is never missed.
  const kingInDanger = useMemo(() => {
    const k = position.board.indexOf(position.turn === "w" ? "K" : "k");
    return k >= 0 && inCheck(position) ? k : -1;
  }, [position]);

  function tap(sq: Square) {
    if (promoting) return;
    const piece = position.board[sq];
    const mine = piece !== null && canMove !== null && colorOf(piece) === canMove && position.turn === canMove;

    if (selected !== null) {
      const choices = targets.filter((m) => m.to === sq);
      if (choices.length > 0) {
        if (choices[0].promotion) {
          setPromoting({ from: selected, to: sq });
          return;
        }
        setSelected(null);
        onMove(choices[0]);
        return;
      }
    }
    setSelected(mine ? (selected === sq ? null : sq) : null);
  }

  function promote(t: PieceType) {
    if (!promoting) return;
    const m = movesFrom(position, promoting.from).find((x) => x.to === promoting.to && x.promotion === t);
    setPromoting(null);
    setSelected(null);
    if (m) onMove(m);
  }

  const order = flipped ? [...Array(64).keys()].map((i) => 63 - i) : [...Array(64).keys()];

  return (
    <div className={"relative mx-auto w-full max-w-[520px] select-none " + className}>
      <div
        className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden notch border border-line"
        role="grid"
        aria-label="Chess board"
      >
        {order.map((sq) => {
          const r = Math.floor(sq / 8), f = sq % 8;
          const light = (r + f) % 2 === 0;
          const piece = position.board[sq];
          const target = targets.find((m) => m.to === sq);
          const isSel = selected === sq;
          const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
          const showFile = flipped ? r === 0 : r === 7;
          const showRank = flipped ? f === 7 : f === 0;
          return (
            <button
              key={sq}
              type="button"
              onClick={() => tap(sq)}
              aria-label={squareName(sq) + (piece ? ` ${piece}` : "")}
              className={
                "relative flex aspect-square min-h-0 min-w-0 items-center justify-center overflow-hidden p-0 text-[clamp(1.4rem,6.5vw,2.6rem)] leading-none transition " +
                (light ? "bg-[#c9c3b4]" : "bg-[#6b5d4a]") +
                (isSel ? " ring-inset ring-4 ring-accent" : "") +
                (isLast && !isSel ? " shadow-[inset_0_0_0_9999px_rgba(255,122,47,0.22)]" : "") +
                (kingInDanger === sq ? " shadow-[inset_0_0_0_9999px_rgba(220,50,50,0.45)]" : "")
              }
            >
              {piece && (
                <span
                  className={
                    piece === piece.toUpperCase()
                      ? "text-[#f6f1e6] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
                      : "text-[#15161a] drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]"
                  }
                >
                  {GLYPH[piece]}
                </span>
              )}
              {target && (
                <span
                  className={
                    "pointer-events-none absolute " +
                    (piece || target.enPassant
                      ? "inset-0 border-4 border-accent/80"
                      : "h-[28%] w-[28%] rounded-full bg-accent/80")
                  }
                />
              )}
              {showFile && (
                <span className={"pointer-events-none absolute bottom-0.5 right-1 text-[0.55rem] font-semibold " + (light ? "text-[#6b5d4a]" : "text-[#c9c3b4]")}>
                  {squareName(sq)[0]}
                </span>
              )}
              {showRank && (
                <span className={"pointer-events-none absolute left-1 top-0.5 text-[0.55rem] font-semibold " + (light ? "text-[#6b5d4a]" : "text-[#c9c3b4]")}>
                  {squareName(sq)[1]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {promoting && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="notch border border-line bg-surface p-3">
            <p className="label-wide mb-2 text-center text-muted">Promote to</p>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as PieceType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => promote(t)}
                  className="flex h-14 w-14 items-center justify-center notch-md border border-line bg-surface-2 text-4xl transition hover:border-accent"
                >
                  {GLYPH[canMove === "w" ? t.toUpperCase() : t]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** For the move list: "1. e4 e5  2. Nf3 …" */
export function MoveList({ moves, className = "" }: { moves: string[]; className?: string }) {
  if (moves.length === 0) return <p className={"text-xs text-muted " + className}>No moves yet.</p>;
  const pairs: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push(`${i / 2 + 1}. ${moves[i]}${moves[i + 1] ? " " + moves[i + 1] : ""}`);
  }
  return (
    <p className={"numeric flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted " + className}>
      {pairs.map((p, i) => (
        <span key={i} className={i === pairs.length - 1 ? "text-ink" : ""}>
          {p}
        </span>
      ))}
    </p>
  );
}
