import { makeId } from "./id";
import { COMMANDER_DAMAGE_LETHAL } from "./types";
import { getThemePalette, remapColorToTheme } from "./palette";
import { loadTheme } from "./theme";
import { MILESTONE_BADGES } from "./milestones";
import type { ThemeId } from "./theme";
import type { GameState, Player, GameSettings } from "./types";

type Listener = () => void;

const STORAGE_KEY = "edh-life-tracker:game:v2";

/** Builds a fresh player list; `preserve` carries over each seat's color by index (used by resetGame). */
function createPlayers(count: number, startingLife: number, preserve?: Player[]): Player[] {
  const palette = getThemePalette(loadTheme());
  const players: Player[] = Array.from({ length: count }, (_, i) => ({
    id: makeId(),
    color: preserve?.[i]?.color ?? palette[i % palette.length],
    hasPartner: false,
    life: startingLife,
    commanderDamage: {},
    badges: [],
  }));

  // Initialize commander damage tracking between every ordered pair of players.
  for (const p of players) {
    for (const opponent of players) {
      if (opponent.id === p.id) continue;
      p.commanderDamage[opponent.id] = { primary: 0, partner: 0 };
    }
  }

  return players;
}

export class GameStore {
  private state: GameState | null = null;
  private listeners = new Set<Listener>();
  // >0 while inside batch(): notify() just marks `dirty`, so the whole batch
  // saves and re-renders once.
  private batchDepth = 0;
  private dirty = false;

  getState(): GameState | null {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    if (this.batchDepth > 0) {
      this.dirty = true;
      return;
    }
    this.persist();
    for (const l of this.listeners) l();
  }

  /**
   * Runs several changes as one: a single save + re-render at the end
   * instead of one per change (e.g. a burn tick hitting every opponent).
   */
  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.dirty) {
        this.dirty = false;
        this.notify();
      }
    }
  }

  private persist() {
    if (this.state) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  tryRestore(): boolean {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as GameState;
      if (!parsed.players || parsed.players.length === 0) return false;
      if (!Number.isFinite(parsed.startedAt)) return false;
      if (!Number.isFinite(parsed.settings?.playerCount)) return false;
      const palette = getThemePalette(loadTheme());
      for (const [i, player] of parsed.players.entries()) {
        // Saves from before milestone badges existed won't have this field,
        // and older saves can hold ids since retired (bat, sunglasses) —
        // those would show no watermark yet still block earning a new one.
        player.badges = (player.badges ?? []).filter((id) => id in MILESTONE_BADGES);
        // A color outside the active theme's palette (e.g. saved under the
        // removed OSRS theme) gets this seat's default for the current one.
        if (!palette.includes(player.color)) player.color = palette[i % palette.length];
      }
      this.state = parsed;
      return true;
    } catch {
      return false;
    }
  }

  /** Starts a brand-new game — always resets every seat's color to defaults. */
  startGame(settings: GameSettings) {
    this.state = {
      players: createPlayers(settings.playerCount, settings.startingLife),
      settings,
      startedAt: Date.now(),
    };
    this.notify();
  }

  /**
   * Restarts the current game with the same player count/arrangement — keeps
   * each seat's color. `overrideSettings` merges over the current
   * settings first (e.g. a new life max picked in Settings since the game started).
   */
  resetGame(overrideSettings?: Partial<GameSettings>) {
    const state = this.requireState();
    const settings = { ...state.settings, ...overrideSettings };
    this.state = {
      players: createPlayers(settings.playerCount, settings.startingLife, state.players),
      settings,
      startedAt: Date.now(),
    };
    this.notify();
  }

  private requireState(): GameState {
    if (!this.state) throw new Error("No active game");
    return this.state;
  }

  private findPlayer(playerId: string): Player | undefined {
    return this.requireState().players.find((p) => p.id === playerId);
  }

  /** Applies `fn` to one player (if they exist) and notifies. */
  private mutatePlayer(playerId: string, fn: (player: Player) => void) {
    const player = this.findPlayer(playerId);
    if (!player) return;
    fn(player);
    this.notify();
  }

  adjustLife(playerId: string, delta: number) {
    this.mutatePlayer(playerId, (p) => (p.life += delta));
  }

  /**
   * Adjusts commander damage, clamped to 0..21 (21 is already lethal, so
   * holding "+" past it would only keep draining a dead player's life).
   * Returns the *actual* delta applied
   * (which can be less than `delta` in magnitude — or 0 — once clamped), so
   * callers can keep life changes and UI feedback in sync with what really
   * happened rather than the raw, possibly-clamped request.
   */
  adjustCommanderDamage(
    playerId: string,
    fromOpponentId: string,
    slot: "primary" | "partner",
    delta: number
  ): number {
    const player = this.findPlayer(playerId);
    const opponent = this.findPlayer(fromOpponentId);
    if (!player || !opponent) return 0;
    if (!player.commanderDamage[fromOpponentId]) {
      player.commanderDamage[fromOpponentId] = { primary: 0, partner: 0 };
    }
    const entry = player.commanderDamage[fromOpponentId];
    const oldValue = entry[slot];
    const newValue = Math.min(COMMANDER_DAMAGE_LETHAL, Math.max(0, oldValue + delta));
    const actualDelta = newValue - oldValue;
    if (actualDelta === 0) return 0;

    entry[slot] = newValue;
    // Commander damage also affects life total, matching tabletop rules.
    player.life -= actualDelta;

    this.notify();
    return actualDelta;
  }

  setPlayerColor(playerId: string, color: string) {
    this.mutatePlayer(playerId, (p) => (p.color = color));
  }

  /** Recolors every player to their equivalent "seat" in the new theme's palette. */
  remapToTheme(theme: ThemeId) {
    const state = this.requireState();
    for (const [i, player] of state.players.entries()) {
      player.color = remapColorToTheme(player.color, theme, i);
    }
    this.notify();
  }

  setHasPartner(playerId: string, hasPartner: boolean) {
    this.mutatePlayer(playerId, (p) => (p.hasPartner = hasPartner));
  }

  /** Clears whatever made a player dead (0 life and/or lethal commander damage), giving them 1 life. */
  revivePlayer(playerId: string) {
    this.mutatePlayer(playerId, (player) => {
      if (player.life <= 0) player.life = 1;
      for (const dmg of Object.values(player.commanderDamage)) {
        if (dmg.primary >= COMMANDER_DAMAGE_LETHAL) dmg.primary = COMMANDER_DAMAGE_LETHAL - 1;
        if (dmg.partner >= COMMANDER_DAMAGE_LETHAL) dmg.partner = COMMANDER_DAMAGE_LETHAL - 1;
      }
    });
  }

  /** True if any player already holds this badge this game. */
  isBadgeTaken(badgeId: string): boolean {
    return this.state?.players.some((p) => p.badges.includes(badgeId)) ?? false;
  }

  /**
   * Grants a milestone/easter-egg badge — idempotent (a player never gets
   * the same one twice) and unique per game (once any player holds a given
   * badge, no one else can also earn it).
   */
  awardBadge(playerId: string, badgeId: string) {
    // Covers both "already has it" and "someone else has it".
    if (this.isBadgeTaken(badgeId)) return;
    this.mutatePlayer(playerId, (p) => p.badges.push(badgeId));
  }
}

export const gameStore = new GameStore();
