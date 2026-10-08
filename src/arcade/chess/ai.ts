import { legalMoves, makeMove, inCheck, typeOf, type Move, type Position } from "./engine";

/**
 * The computer opponent: a small alpha-beta search over the engine.
 *
 * Three levels. Easy looks one move ahead and sometimes picks a
 * second-best move on purpose, so a beginner can win. Normal looks two
 * moves ahead. Hard looks three, with captures followed a little
 * further so it doesn't walk into obvious trades. None of this is a
 * grandmaster; it's a decent opponent for the minutes between matches.
 */

export type Level = "easy" | "normal" | "hard";

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Where each piece likes to stand, from white's side (a8 first).
// Flipped for black. Small numbers: material still decides.
const PST: Record<string, number[]> = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

/** Score from the side to move's point of view, in centipawns. */
function evaluate(p: Position): number {
  let score = 0;
  for (let sq = 0; sq < 64; sq++) {
    const piece = p.board[sq];
    if (!piece) continue;
    const t = typeOf(piece);
    const white = piece === piece.toUpperCase();
    const pst = PST[t][white ? sq : 63 - sq];
    const v = VALUE[t] + pst;
    score += white ? v : -v;
  }
  return p.turn === "w" ? score : -score;
}

const MATE = 100000;

function orderMoves(moves: Move[]): Move[] {
  // Captures of big pieces by small ones first: alpha-beta prunes most
  // when the best move is tried early.
  return moves
    .map((m) => ({
      m,
      key:
        (m.captured ? 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] : 0) +
        (m.promotion ? 800 : 0),
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.m);
}

/** Captures only, a few plies on, so the search doesn't stop mid-trade. */
function quiesce(p: Position, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(p);
  if (depth === 0 || stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const caps = orderMoves(legalMoves(p).filter((m) => m.captured || m.promotion));
  for (const m of caps) {
    const score = -quiesce(makeMove(p, m), -beta, -alpha, depth - 1);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function search(p: Position, depth: number, alpha: number, beta: number, quiet: number): number {
  const moves = legalMoves(p);
  if (moves.length === 0) return inCheck(p) ? -MATE - depth : 0;
  if (p.halfmove >= 100) return 0;
  if (depth === 0) return quiesce(p, alpha, beta, quiet);
  let best = -Infinity;
  for (const m of orderMoves(moves)) {
    const score = -search(makeMove(p, m), depth - 1, -beta, -alpha, quiet);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/** The computer's move for this position, or null if there are none. */
export function chooseMove(p: Position, level: Level): Move | null {
  const moves = legalMoves(p);
  if (moves.length === 0) return null;

  const depth = level === "easy" ? 1 : level === "normal" ? 2 : 3;
  const quiet = level === "hard" ? 4 : level === "normal" ? 2 : 0;

  const scored = orderMoves(moves).map((m) => ({
    m,
    score: -search(makeMove(p, m), depth - 1, -Infinity, Infinity, quiet),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Easy: a third of the time, play something a bit worse (but never
  // throw away more than a pawn and a half), so it's beatable.
  if (level === "easy" && scored.length > 1 && Math.random() < 0.34) {
    const okish = scored.filter((s) => s.score >= scored[0].score - 150);
    return okish[Math.floor(Math.random() * okish.length)].m;
  }

  // Among equal-best moves, pick at random so games don't repeat.
  const top = scored.filter((s) => s.score === scored[0].score);
  return top[Math.floor(Math.random() * top.length)].m;
}
