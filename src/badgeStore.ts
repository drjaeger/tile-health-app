/** The Settings-toggleable table badges. (Milestone badges are card watermarks, not table badges — see renderLifeFace.) */
export type BadgeKey = "initiative" | "monarch" | "dealer" | "burn";

export interface BadgeState {
  enabled: boolean;
  /** Position as a percentage of the game-screen's own box, so it stays sane across layout/resizes. */
  xPct: number;
  yPct: number;
  /** Matches whichever seat it was last dropped on (or earned on), so it reads right-side-up for them. 0/90/180/270. */
  rotation: number;
}

/** Everything that differs between badges, so the table/Settings code never has to compare keys for looks. */
export interface BadgeDef {
  icon: string;
  /** Settings toggle label. */
  label: string;
  alt: string;
  /** Bobs in place (the dealer chip sits still on the table). */
  bob: boolean;
  /** Throws a pool of light on the table around it (`.badge-light-<key>`). */
  light: boolean;
  /** A stepped pixel shine sweeps across it (`.badge-glint-<key>`). */
  glint: boolean;
  /** Star glints pop on its points. */
  sparkles: boolean;
  defaults: Omit<BadgeState, "enabled">;
}

export const BADGES: Record<BadgeKey, BadgeDef> = {
  initiative: {
    icon: "/icons/torch.png",
    label: "Initiative",
    alt: "Initiative",
    bob: true,
    light: true,
    glint: false,
    sparkles: false,
    defaults: { xPct: 28, yPct: 50, rotation: 0 },
  },
  monarch: {
    icon: "/icons/crown.png",
    label: "Monarch",
    alt: "Monarch",
    bob: true,
    light: true,
    glint: true,
    sparkles: true,
    defaults: { xPct: 72, yPct: 50, rotation: 0 },
  },
  dealer: {
    icon: "/icons/chip.png",
    label: "Dealer",
    alt: "Dealer (starting player)",
    bob: false,
    light: false,
    glint: true,
    sparkles: false,
    defaults: { xPct: 50, yPct: 30, rotation: 0 },
  },
  burn: {
    icon: "/icons/fire.png",
    label: "Burn",
    alt: "Burn (hold to damage every opponent)",
    bob: true,
    light: true,
    glint: false,
    sparkles: false,
    defaults: { xPct: 50, yPct: 70, rotation: 0 },
  },
};

export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

type Listener = () => void;

const state = new Map<BadgeKey, BadgeState>(BADGE_KEYS.map((key) => [key, { enabled: false, ...BADGES[key].defaults }]));

const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

export function subscribeBadges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBadgeState(key: BadgeKey): BadgeState {
  return state.get(key)!;
}

export function isBadgeEnabled(key: BadgeKey): boolean {
  return getBadgeState(key).enabled;
}

export function toggleBadgeEnabled(key: BadgeKey) {
  const badge = getBadgeState(key);
  badge.enabled = !badge.enabled;
  notify();
}

/** Turns off whichever of the given badges are currently on, e.g. initiative+monarch once someone wins. */
export function disableBadges(keys: BadgeKey[]) {
  let changed = false;
  for (const key of keys) {
    const badge = getBadgeState(key);
    if (badge.enabled) {
      badge.enabled = false;
      changed = true;
    }
  }
  if (changed) notify();
}

/**
 * Turns the given badges off *and* moves them back to their default spots
 * (game reset / new game), so e.g. the monarch doesn't stay parked on last
 * game's monarch. Notifies once, and only if anything actually changed.
 */
export function clearTableBadges(keys: BadgeKey[]) {
  let changed = false;
  for (const key of keys) {
    const badge = getBadgeState(key);
    const { xPct, yPct, rotation } = BADGES[key].defaults;
    if (badge.enabled || badge.xPct !== xPct || badge.yPct !== yPct || badge.rotation !== rotation) {
      Object.assign(badge, { enabled: false, xPct, yPct, rotation });
      changed = true;
    }
  }
  if (changed) notify();
}

export function setBadgePosition(key: BadgeKey, xPct: number, yPct: number, rotation: number) {
  Object.assign(getBadgeState(key), { xPct, yPct, rotation });
  notify();
}
