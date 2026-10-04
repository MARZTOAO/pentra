import { mountLagSpike } from "./lagSpike";
import { mountPacketPop } from "./packetPop";
import type { MountGame } from "./types";

export type { ArcadeHandle, GameCallbacks, GameState, RunResult } from "./types";

/** Every game, by the slug in arcade_games. Add the next one here. */
const ENGINES: Record<string, MountGame> = {
  "lag-spike": mountLagSpike,
  "packet-pop": mountPacketPop,
};

export function engineFor(slug: string): MountGame | null {
  return ENGINES[slug] ?? null;
}
