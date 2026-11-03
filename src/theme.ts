export type ThemeId = "dungeon" | "castlevania";

const KEY = "edh-life-tracker:theme";
const VALID_THEMES: ThemeId[] = ["dungeon", "castlevania"];

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(KEY);
  return (VALID_THEMES as string[]).includes(saved ?? "") ? (saved as ThemeId) : "dungeon";
}

export function saveTheme(theme: ThemeId) {
  localStorage.setItem(KEY, theme);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}
