import type { GameSettings } from "./types";

const KEY = "edh-life-tracker:last-settings";

export function loadLastSettings(): GameSettings | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GameSettings;
  } catch {
    return null;
  }
}

export function saveLastSettings(settings: GameSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
