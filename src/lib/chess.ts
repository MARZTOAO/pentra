import { supabase } from "./supabase";

/**
 * Chess against other players (supabase/109_chess.sql).
 *
 * Turn-based: a game lives in the database, each player moves when
 * they're around, and the other gets a notification. The rules run in
 * the app (src/arcade/chess/engine.ts); the database checks it's your
 * game and your turn, and keeps the position and the move list.
 */

export type ChessPlayer = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
};

export type ChessGame = {
  id: number;
  status: "invited" | "active" | "finished" | "declined" | "cancelled";
  fen: string;
  moves: string[];
  host_id: string;
  opponent_id: string;
  host_call: "heads" | "tails";
  flip: "heads" | "tails";
  white_id: string;
  black_id: string;
  /** Whose move it is, while the game is active. */
  turn_id: string | null;
  result: "white" | "black" | "draw" | null;
  result_reason: string | null;
  created_at: string;
  started_at: string | null;
  last_move_at: string | null;
  finished_at: string | null;
  white: ChessPlayer;
  black: ChessPlayer;
};

type Reply = ChessGame | { error: string };

function unwrap(data: unknown, error: { message: string } | null): ChessGame | string {
  if (error) return error.message;
  const r = data as Reply | null;
  if (!r) return "Nothing came back.";
  return "error" in r ? r.error : r;
}

export async function listChessGames(): Promise<ChessGame[]> {
  const { data, error } = await supabase.rpc("my_chess_games");
  if (error || !data) return [];
  return data as ChessGame[];
}

export async function getChessGame(id: number): Promise<ChessGame | null> {
  const { data, error } = await supabase.rpc("chess_game", { p_id: id });
  if (error || !data) return null;
  return data as ChessGame;
}

/** Challenge someone. The database flips the coin. */
export async function challenge(opponentId: string, call: "heads" | "tails"): Promise<ChessGame | string> {
  const { data, error } = await supabase.rpc("chess_challenge", { p_opponent: opponentId, p_call: call });
  return unwrap(data, error);
}

export async function respondToChallenge(id: number, accept: boolean): Promise<ChessGame | string> {
  const { data, error } = await supabase.rpc("chess_respond", { p_id: id, p_accept: accept });
  return unwrap(data, error);
}

export async function sendMove(
  id: number,
  san: string,
  fen: string,
  result: "white" | "black" | "draw" | null,
  reason: string | null,
): Promise<ChessGame | string> {
  const { data, error } = await supabase.rpc("chess_move", {
    p_id: id,
    p_san: san,
    p_fen: fen,
    p_result: result,
    p_reason: reason,
  });
  return unwrap(data, error);
}

export async function resign(id: number): Promise<ChessGame | string> {
  const { data, error } = await supabase.rpc("chess_resign", { p_id: id });
  return unwrap(data, error);
}

export type ChessRecord = { wins: number; losses: number; draws: number };

export async function getChessRecord(userId?: string): Promise<ChessRecord | null> {
  const { data, error } = await supabase.rpc("chess_record", { p_user: userId ?? null });
  if (error || !data) return null;
  return data as ChessRecord;
}

/** The other player, from your point of view. */
export function opponentOf(g: ChessGame, me: string): ChessPlayer {
  return g.white.id === me ? g.black : g.white;
}

export function myColor(g: ChessGame, me: string): "w" | "b" {
  return g.white_id === me ? "w" : "b";
}

/** "You won", "You lost", "Draw", with the reason. */
export function resultText(g: ChessGame, me: string): string {
  if (g.status === "declined") return "Declined";
  if (g.status === "cancelled") return "Cancelled";
  if (g.status !== "finished" || !g.result) return "";
  const why: Record<string, string> = {
    checkmate: "by checkmate",
    stalemate: "by stalemate",
    resigned: "by resignation",
    insufficient: "— not enough pieces to mate",
    fifty_moves: "— fifty moves without progress",
    repetition: "by repetition",
    draw_agreed: "by agreement",
    timeout: "on time",
  };
  const reason = g.result_reason ? why[g.result_reason] ?? "" : "";
  if (g.result === "draw") return `Draw ${reason}`.trim();
  const won = (g.result === "white" && g.white_id === me) || (g.result === "black" && g.black_id === me);
  return `${won ? "You won" : "You lost"} ${reason}`.trim();
}
