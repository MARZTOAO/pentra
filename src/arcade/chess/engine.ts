/**
 * Chess rules, written for Pentra (no dependency).
 *
 * A board is 64 squares, index 0 = a8 (top-left as white sees it) to
 * 63 = h1. Pieces are single letters: upper case white (P N B R Q K),
 * lower case black. Positions round-trip through FEN, which is also
 * how a game is stored and sent between two players (supabase/109).
 *
 * Everything chess needs is here: legal move generation with castling,
 * en passant and promotion; check, checkmate and stalemate; the draw
 * rules the position alone can tell (insufficient material, the
 * fifty-move rule); and standard notation (SAN) for the move list.
 * Verified against the usual move-count benchmarks (perft) — see
 * engine.test.ts.
 */

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
export type Piece = string; // "P".."K" white, "p".."k" black
export type Square = number; // 0..63, a8 = 0

export type Position = {
  board: (Piece | null)[];
  turn: Color;
  /** Castling rights still available: subset of "KQkq". */
  castling: string;
  /** Square a pawn may capture en passant onto, or -1. */
  ep: Square;
  halfmove: number;
  fullmove: number;
};

export type Move = {
  from: Square;
  to: Square;
  piece: Piece;
  captured: Piece | null;
  promotion: PieceType | null;
  /** Set on castling and en passant so the mover can do the extra work. */
  castle: "K" | "Q" | null;
  enPassant: boolean;
};

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";

export const squareName = (s: Square) => FILES[s % 8] + String(8 - Math.floor(s / 8));
export const squareIndex = (name: string): Square =>
  FILES.indexOf(name[0]) + (8 - Number(name[1])) * 8;

export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? "w" : "b");
export const typeOf = (p: Piece): PieceType => p.toLowerCase() as PieceType;
const isWhite = (p: Piece) => p === p.toUpperCase();

/* ------------------------------------------------------------------ */
/*  FEN                                                                */
/* ------------------------------------------------------------------ */

export function parseFen(fen: string): Position {
  const [rows, turn, castling, ep, half, full] = fen.trim().split(/\s+/);
  const board: (Piece | null)[] = [];
  for (const row of rows.split("/")) {
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push(null);
      else board.push(ch);
    }
  }
  if (board.length !== 64) throw new Error("bad FEN");
  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castling: castling === "-" ? "" : castling,
    ep: ep && ep !== "-" ? squareIndex(ep) : -1,
    halfmove: Number(half ?? 0) || 0,
    fullmove: Number(full ?? 1) || 1,
  };
}

export function toFen(p: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const piece = p.board[r * 8 + f];
      if (!piece) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return [
    rows.join("/"),
    p.turn,
    p.castling || "-",
    p.ep >= 0 ? squareName(p.ep) : "-",
    p.halfmove,
    p.fullmove,
  ].join(" ");
}

/* ------------------------------------------------------------------ */
/*  Attacks                                                            */
/* ------------------------------------------------------------------ */

const KNIGHT_D = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_D = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const onBoard = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;

/** Is `sq` attacked by `by`? */
export function isAttacked(board: (Piece | null)[], sq: Square, by: Color): boolean {
  const r = Math.floor(sq / 8), f = sq % 8;
  const enemy = (p: Piece | null, t: PieceType) => p !== null && colorOf(p) === by && typeOf(p) === t;

  // Pawns: a white pawn attacks upward (towards row 0).
  const pr = by === "w" ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    if (onBoard(pr, f + df) && enemy(board[pr * 8 + f + df], "p")) return true;
  }
  for (const [dr, df] of KNIGHT_D) {
    if (onBoard(r + dr, f + df) && enemy(board[(r + dr) * 8 + f + df], "n")) return true;
  }
  for (const [dr, df] of KING_D) {
    if (onBoard(r + dr, f + df) && enemy(board[(r + dr) * 8 + f + df], "k")) return true;
  }
  for (const [dirs, types] of [
    [BISHOP_D, ["b", "q"]],
    [ROOK_D, ["r", "q"]],
  ] as const) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (onBoard(rr, ff)) {
        const p = board[rr * 8 + ff];
        if (p) {
          if (colorOf(p) === by && (types as readonly string[]).includes(typeOf(p))) return true;
          break;
        }
        rr += dr;
        ff += df;
      }
    }
  }
  return false;
}

function kingSquare(board: (Piece | null)[], c: Color): Square {
  const k = c === "w" ? "K" : "k";
  return board.indexOf(k);
}

export function inCheck(p: Position, c: Color = p.turn): boolean {
  const k = kingSquare(p.board, c);
  return k >= 0 && isAttacked(p.board, k, c === "w" ? "b" : "w");
}

/* ------------------------------------------------------------------ */
/*  Moves                                                              */
/* ------------------------------------------------------------------ */

function pseudoMoves(p: Position): Move[] {
  const out: Move[] = [];
  const me = p.turn;
  const own = (x: Piece | null) => x !== null && colorOf(x) === me;
  const push = (from: Square, to: Square, piece: Piece, extra: Partial<Move> = {}) =>
    out.push({
      from,
      to,
      piece,
      captured: p.board[to],
      promotion: null,
      castle: null,
      enPassant: false,
      ...extra,
    });

  for (let sq = 0; sq < 64; sq++) {
    const piece = p.board[sq];
    if (!piece || colorOf(piece) !== me) continue;
    const r = Math.floor(sq / 8), f = sq % 8;
    const t = typeOf(piece);

    if (t === "p") {
      const dir = me === "w" ? -1 : 1;
      const startRow = me === "w" ? 6 : 1;
      const lastRow = me === "w" ? 0 : 7;
      const one = (r + dir) * 8 + f;
      const promote = (to: Square, captured: Piece | null) => {
        for (const pr of ["q", "r", "b", "n"] as PieceType[]) push(sq, to, piece, { promotion: pr, captured });
      };
      if (onBoard(r + dir, f) && !p.board[one]) {
        if (r + dir === lastRow) promote(one, null);
        else push(sq, one, piece);
        const two = (r + 2 * dir) * 8 + f;
        if (r === startRow && !p.board[two]) push(sq, two, piece);
      }
      for (const df of [-1, 1]) {
        if (!onBoard(r + dir, f + df)) continue;
        const to = (r + dir) * 8 + f + df;
        const target = p.board[to];
        if (target && colorOf(target) !== me) {
          if (r + dir === lastRow) promote(to, target);
          else push(sq, to, piece);
        } else if (to === p.ep && !target) {
          push(sq, to, piece, { enPassant: true, captured: me === "w" ? "p" : "P" });
        }
      }
      continue;
    }

    if (t === "n" || t === "k") {
      for (const [dr, df] of t === "n" ? KNIGHT_D : KING_D) {
        if (!onBoard(r + dr, f + df)) continue;
        const to = (r + dr) * 8 + f + df;
        if (!own(p.board[to])) push(sq, to, piece);
      }
      if (t === "k") {
        const enemy = me === "w" ? "b" : "w";
        const home = me === "w" ? 60 : 4;
        if (sq === home && !isAttacked(p.board, home, enemy)) {
          const K = me === "w" ? "K" : "k", Q = me === "w" ? "Q" : "q";
          const rook = me === "w" ? "R" : "r";
          if (
            p.castling.includes(K) &&
            !p.board[home + 1] && !p.board[home + 2] && p.board[home + 3] === rook &&
            !isAttacked(p.board, home + 1, enemy) && !isAttacked(p.board, home + 2, enemy)
          ) push(sq, home + 2, piece, { castle: "K" });
          if (
            p.castling.includes(Q) &&
            !p.board[home - 1] && !p.board[home - 2] && !p.board[home - 3] && p.board[home - 4] === rook &&
            !isAttacked(p.board, home - 1, enemy) && !isAttacked(p.board, home - 2, enemy)
          ) push(sq, home - 2, piece, { castle: "Q" });
        }
      }
      continue;
    }

    const dirs = t === "b" ? BISHOP_D : t === "r" ? ROOK_D : [...BISHOP_D, ...ROOK_D];
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (onBoard(rr, ff)) {
        const to = rr * 8 + ff;
        const target = p.board[to];
        if (target) {
          if (colorOf(target) !== me) push(sq, to, piece);
          break;
        }
        push(sq, to, piece);
        rr += dr;
        ff += df;
      }
    }
  }
  return out;
}

/** The position after a move. Doesn't check legality; use legalMoves. */
export function makeMove(p: Position, m: Move): Position {
  const board = p.board.slice();
  const me = p.turn;
  board[m.to] = m.promotion ? (me === "w" ? m.promotion.toUpperCase() : m.promotion) : m.piece;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (me === "w" ? 8 : -8)] = null;
  if (m.castle === "K") {
    board[m.from + 1] = board[m.from + 3];
    board[m.from + 3] = null;
  } else if (m.castle === "Q") {
    board[m.from - 1] = board[m.from - 4];
    board[m.from - 4] = null;
  }

  let castling = p.castling;
  const drop = (s: string) => (castling = castling.replace(s, ""));
  if (typeOf(m.piece) === "k") me === "w" ? (drop("K"), drop("Q")) : (drop("k"), drop("q"));
  for (const sq of [m.from, m.to]) {
    if (sq === 63) drop("K");
    if (sq === 56) drop("Q");
    if (sq === 7) drop("k");
    if (sq === 0) drop("q");
  }

  const isPawn = typeOf(m.piece) === "p";
  const ep = isPawn && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;

  return {
    board,
    turn: me === "w" ? "b" : "w",
    castling,
    ep,
    halfmove: isPawn || m.captured ? 0 : p.halfmove + 1,
    fullmove: me === "b" ? p.fullmove + 1 : p.fullmove,
  };
}

export function legalMoves(p: Position): Move[] {
  return pseudoMoves(p).filter((m) => !inCheck(makeMove(p, m), p.turn));
}

export function movesFrom(p: Position, sq: Square): Move[] {
  return legalMoves(p).filter((m) => m.from === sq);
}

/* ------------------------------------------------------------------ */
/*  Game state                                                         */
/* ------------------------------------------------------------------ */

export type Outcome =
  | { over: false; check: boolean }
  | { over: true; result: "white" | "black" | "draw"; reason: "checkmate" | "stalemate" | "insufficient" | "fifty_moves" };

export function outcome(p: Position, moves = legalMoves(p)): Outcome {
  const check = inCheck(p);
  if (moves.length === 0) {
    if (check) return { over: true, result: p.turn === "w" ? "black" : "white", reason: "checkmate" };
    return { over: true, result: "draw", reason: "stalemate" };
  }
  if (insufficientMaterial(p.board)) return { over: true, result: "draw", reason: "insufficient" };
  if (p.halfmove >= 100) return { over: true, result: "draw", reason: "fifty_moves" };
  return { over: false, check };
}

/** King vs king, king + minor vs king, or king + bishop vs king + bishop on one colour. */
export function insufficientMaterial(board: (Piece | null)[]): boolean {
  const pieces: { t: PieceType; w: boolean; sq: number }[] = [];
  board.forEach((p, sq) => {
    if (p && typeOf(p) !== "k") pieces.push({ t: typeOf(p), w: isWhite(p), sq });
  });
  if (pieces.length === 0) return true;
  if (pieces.length === 1) return pieces[0].t === "n" || pieces[0].t === "b";
  if (pieces.length === 2 && pieces.every((x) => x.t === "b") && pieces[0].w !== pieces[1].w) {
    const shade = (sq: number) => (Math.floor(sq / 8) + sq) % 2;
    return shade(pieces[0].sq) === shade(pieces[1].sq);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Notation                                                           */
/* ------------------------------------------------------------------ */

/** Standard notation for a move in a position: "Nf3", "exd5", "O-O", "e8=Q+". */
export function san(p: Position, m: Move, all = legalMoves(p)): string {
  let s: string;
  if (m.castle === "K") s = "O-O";
  else if (m.castle === "Q") s = "O-O-O";
  else {
    const t = typeOf(m.piece);
    if (t === "p") {
      s = (m.captured ? FILES[m.from % 8] + "x" : "") + squareName(m.to);
      if (m.promotion) s += "=" + m.promotion.toUpperCase();
    } else {
      // Disambiguate when another piece of the same kind could go there.
      const others = all.filter((o) => o.to === m.to && o.from !== m.from && o.piece === m.piece);
      let dis = "";
      if (others.length) {
        const sameFile = others.some((o) => o.from % 8 === m.from % 8);
        const sameRank = others.some((o) => Math.floor(o.from / 8) === Math.floor(m.from / 8));
        if (!sameFile) dis = FILES[m.from % 8];
        else if (!sameRank) dis = String(8 - Math.floor(m.from / 8));
        else dis = squareName(m.from);
      }
      s = t.toUpperCase() + dis + (m.captured ? "x" : "") + squareName(m.to);
    }
  }
  const after = makeMove(p, m);
  const next = legalMoves(after);
  if (inCheck(after)) s += next.length === 0 ? "#" : "+";
  return s;
}

/** Nodes at a depth, for checking the generator against known counts. */
export function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(p);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(p, m), depth - 1);
  return n;
}
