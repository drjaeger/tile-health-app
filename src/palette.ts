import { DUNGEON_COLORS, RETRO_COLORS } from "./types";
import type { ThemeId } from "./theme";

const PALETTES: Record<ThemeId, string[]> = {
  retro: RETRO_COLORS,
  dungeon: DUNGEON_COLORS,
};

/** The identity-color palette for a theme, index-aligned across themes (index = "seat"). */
export function getThemePalette(theme: ThemeId): string[] {
  return PALETTES[theme];
}

/**
 * Maps a color currently drawn from one theme's palette to the same "seat"
 * in another theme's palette, so switching themes recolors every player to
 * their equivalent (e.g. Retro neon red <-> Dungeon dried-blood red) instead of leaving
 * them on a color that no longer belongs to the active theme.
 */
export function remapColorToTheme(currentColor: string, newTheme: ThemeId, seatIndex = 0): string {
  const index = Object.values(PALETTES)
    .map((palette) => palette.indexOf(currentColor))
    .find((i) => i !== -1);
  const newPalette = PALETTES[newTheme];
  // A color from neither palette (e.g. a game saved under the removed OSRS
  // theme) falls back to this seat's own default rather than palette[0],
  // which would otherwise turn every such seat the same color.
  return newPalette[(index ?? seatIndex) % newPalette.length];
}
