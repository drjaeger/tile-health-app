export type ThemeId = "retro" | "dungeon";

const KEY = "edh-life-tracker:theme:v2";
// Before v2 the ids didn't match their labels: Retro was saved as "dungeon"
// and Dungeon as "castlevania" (and "osrs" was a third, since-removed theme).
const LEGACY_KEY = "edh-life-tracker:theme";
const LEGACY_IDS: Record<string, ThemeId> = { dungeon: "retro", castlevania: "dungeon", osrs: "retro" };
const VALID_THEMES: ThemeId[] = ["retro", "dungeon"];

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(KEY);
  if ((VALID_THEMES as string[]).includes(saved ?? "")) return saved as ThemeId;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy !== null) {
    const migrated = LEGACY_IDS[legacy] ?? "retro";
    saveTheme(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  }
  return "retro";
}

export function saveTheme(theme: ThemeId) {
  localStorage.setItem(KEY, theme);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}
