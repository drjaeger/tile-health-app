import { gameStore } from "./state";

/**
 * Drawn as a faint watermark in a top corner of the player's card: either a
 * single-color silhouette (see public/watermarks/CREDITS.txt) or a short
 * word set in the life-total font.
 */
export type MilestoneBadge = { label: string } & ({ watermark: string } | { text: string });

/** Every badge a milestone can award, keyed by its id (stored in Player.badges). */
export const MILESTONE_BADGES: Record<string, MilestoneBadge> = {
  skull: { watermark: "/watermarks/skull.svg", label: "Lived on the edge — 1 life" },
  blackjack: { watermark: "/watermarks/cards.svg", label: "Blackjack — 21 life" },
  blackcat: { watermark: "/watermarks/blackcat.svg", label: "Bad luck — 13 life" },
  nice: { text: "Nice", label: "Nice — 69 life" },
  finger: { watermark: "/watermarks/finger.svg", label: "Rude — 67 life" },
  star: { watermark: "/watermarks/star.svg", label: "Triple digits — 100+ life" },
};

/** How long life has to sit on a milestone value (or above, for a "gte" rule) before it's awarded. */
const DWELL_MS = 5000;

interface MilestoneRule {
  life: number;
  /** "eq" (the default) requires landing on this exact value; "gte" fires anywhere at/above it. */
  comparison?: "eq" | "gte";
  badgeId: string;
}

const RULES: MilestoneRule[] = [
  { life: 1, badgeId: "skull" },
  { life: 13, badgeId: "blackcat" },
  { life: 21, badgeId: "blackjack" },
  { life: 67, badgeId: "finger" },
  { life: 69, badgeId: "nice" },
  { life: 100, comparison: "gte", badgeId: "star" },
];

function ruleMatches(life: number, rule: MilestoneRule): boolean {
  return rule.comparison === "gte" ? life >= rule.life : life === rule.life;
}

// Keyed by `${playerId}:${life}` — survives across renders since this module
// (unlike the DOM) isn't torn down on every state change.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
let lastStartedAt: number | null = null;

function check() {
  const state = gameStore.getState();
  if (!state) return;

  if (lastStartedAt !== state.startedAt) {
    // A new/reset game invalidates every pending dwell timer (and the
    // player ids they were keyed to).
    for (const timeout of pending.values()) clearTimeout(timeout);
    pending.clear();
    lastStartedAt = state.startedAt;
  }

  for (const player of state.players) {
    for (const rule of RULES) {
      const key = `${player.id}:${rule.life}`;
      // A player only ever earns one milestone badge per game — a card
      // crowded with several of them stops reading as "a nice surprise".
      // A badge is also unique per game — once any player holds it, the
      // rule is dead for everyone else.
      const matches =
        ruleMatches(player.life, rule) && player.badges.length === 0 && !gameStore.isBadgeTaken(rule.badgeId);
      const alreadyPending = pending.has(key);

      if (matches && !alreadyPending) {
        const startedAt = state.startedAt;
        const timeout = setTimeout(() => {
          pending.delete(key);
          const freshState = gameStore.getState();
          const freshPlayer = freshState?.players.find((p) => p.id === player.id);
          if (!freshState || !freshPlayer) return;
          if (freshState.startedAt !== startedAt) return;
          if (!ruleMatches(freshPlayer.life, rule)) return;
          if (freshPlayer.badges.length > 0) return;
          gameStore.awardBadge(freshPlayer.id, rule.badgeId);
        }, DWELL_MS);
        pending.set(key, timeout);
      } else if (!matches && alreadyPending) {
        clearTimeout(pending.get(key)!);
        pending.delete(key);
      }
    }
  }
}

/** Starts watching every player's life for milestone values — call once at app boot. */
export function startMilestoneWatcher() {
  gameStore.subscribe(check);
  check();
}
