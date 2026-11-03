export type PlayerId = string;

export interface CommanderDamage {
  /** Damage from this opponent's primary commander. */
  primary: number;
  /** Damage from this opponent's partner/background commander, if they have one. */
  partner: number;
}

export interface Player {
  id: PlayerId;
  color: string;
  hasPartner: boolean;
  life: number;
  /** Keyed by the opponent's PlayerId — damage this player has taken from each opponent's commander(s). */
  commanderDamage: Record<PlayerId, CommanderDamage>;
  /** Milestone/easter-egg badge ids this player has earned this game — see src/milestones.ts. */
  badges: string[];
}

export type ArrangementId =
  | "split-v"
  | "split-h"
  | "trio-no-tl"
  | "trio-no-tr"
  | "trio-no-bl"
  | "trio-no-br"
  | "quad"
  | "court"
  | "court-5l"
  | "court-5r"
  | "court-6";

export interface GameSettings {
  playerCount: number;
  startingLife: number;
  arrangementId: ArrangementId;
}

export interface GameState {
  players: Player[];
  settings: GameSettings;
  /** Timestamp (Date.now()) the current game started, for the running timer. */
  startedAt: number;
}

// The winner's confetti: a fixed mix that reads as a celebration on any seat
// color in either theme (player colors themselves are RETRO_/DUNGEON_COLORS).
export const CONFETTI_COLORS = [
  "#c23b3b", // blood red
  "#3a86c8", // cave blue
  "#6ab04c", // toxic green
  "#e3b23c", // mustard gold
  "#8854a0", // malaise purple
  "#3cb9a3", // teal
];

// Muted/gothic instead of bright/saturated, to match the "Dungeon" theme's
// cold stone + torchlight look rather than clashing with it.
export const DUNGEON_COLORS = [
  "#8f2a2a", // dried blood
  "#b8923f", // tarnished gold
  "#4f6b43", // lichen moss
  "#46586b", // slate stone
  "#5c3d73", // deep violet
  "#a05a2a", // rusted iron
  "#3f7370", // verdigris
  "#9c8f74", // old bone
  "#7d3456", // spilled wine
  "#3d4f7a", // midnight
  "#74776b", // ash
  "#c4762f", // torch ember
];

// Saturated arcade-cabinet neon, to match the "Retro" theme's arcade look.
export const RETRO_COLORS = [
  "#ff3864", // neon pink/red
  "#2de2e6", // neon cyan
  "#f9c80e", // neon yellow
  "#7ed321", // neon lime
  "#9b5de5", // neon purple
  "#ff8800", // neon orange
  "#ff4fd8", // hot magenta
  "#3a86ff", // electric blue
  "#00f5a0", // neon mint
  "#ffad85", // peach
  "#e8f1ff", // ice white
  "#c77dff", // lavender
];

export const DEFAULT_PLAYER_COUNT = 4;
export const DEFAULT_STARTING_LIFE = 40;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const COMMANDER_DAMAGE_LETHAL = 21;
