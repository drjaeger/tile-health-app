"""Generates the "Tile" launcher icon and splash screens for the Android app.

The icon is the app itself in miniature: four player tiles in the Retro
palette, with the center plate (where the clock sits between the cards)
holding a pixel heart. Drawn as plain pixels on a logical grid and scaled
with nearest-neighbor, so it keeps the app's pixel-art look. Emits:
  - mipmap-*/ic_launcher_foreground.png (transparent; artwork kept inside
    the adaptive icon's safe zone so it survives any OEM mask shape)
  - mipmap-*/ic_launcher.png / ic_launcher_round.png (legacy, pre-Android-8:
    background + artwork flattened; the round one masked to a circle)
  - drawable*/splash.png (the artwork centered on the background color)
  - public/favicon.png (browser tab icon for the dev server / web build)
  - values/ic_launcher_background.xml (solid background color)

Run from the repo root:  python3 scripts/gen_icon.py
"""

from PIL import Image, ImageDraw
import os

# The adaptive icon is a 108dp canvas, so a 54-unit grid scales by a whole
# number at every density (2x mdpi ... 8x xxxhdpi) — every art pixel stays a
# crisp square. Launchers show only the center 72dp (36 units), and any mask
# shape is guaranteed to keep a 66dp circle (radius 16.5 units).
GRID = 54
VISIBLE = 36

BG = (18, 15, 36)          # Retro --bg (src/style.css :root)
OUTLINE = (8, 6, 16)
PLATE = (31, 26, 58)       # Retro --stone, the center button's face
TILES = [(255, 56, 100), (45, 226, 230), (249, 200, 14), (126, 211, 33)]  # RETRO_COLORS[0..3]
HEART = (255, 77, 109)     # Retro --loss
SHINE = (242, 238, 255)    # Retro --ink

HEART_SHAPE = [
    ".##.##.",
    "#######",
    "#######",
    ".#####.",
    "..###..",
    "...#...",
]

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
FG_BASE = 108      # ic_launcher_foreground.png at mdpi
LEGACY_BASE = 48   # ic_launcher.png at mdpi
RES = "android/app/src/main/res"


def shade(color, f):
    return tuple(max(0, min(255, int(v * f))) for v in color)


def outline(px, diagonal=False):
    """Rings every drawn pixel with a 1-unit dark outline."""
    steps = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if diagonal:
        steps += [(1, 1), (-1, -1), (1, -1), (-1, 1)]
    ring = {}
    for x, y in px:
        for dx, dy in steps:
            if (x + dx, y + dy) not in px:
                ring[(x + dx, y + dy)] = OUTLINE
    px.update(ring)


def draw_tile(px, x, y, size, color):
    """A player card: stair-cut corners, lit top edge, shaded bottom edge."""
    for yy in range(y, y + size):
        for xx in range(x, x + size):
            if xx in (x, x + size - 1) and yy in (y, y + size - 1):
                continue
            c = color
            if yy <= y + 1:
                c = shade(color, 1.18)
            elif yy >= y + size - 2:
                c = shade(color, 0.72)
            px[(xx, yy)] = c


def draw_heart(px, x, y):
    heart = {}
    for r, row in enumerate(HEART_SHAPE):
        for c, ch in enumerate(row):
            if ch == "#":
                heart[(x + c, y + r)] = shade(HEART, 0.75) if r >= 4 else HEART
    heart[(x + 1, y + 1)] = SHINE
    outline(heart, diagonal=True)
    px.update(heart)


def artwork():
    """The icon's pixels, keyed (x, y) on the GRID x GRID canvas."""
    px = {}
    tile, gap = 11, 2
    o = (GRID - (2 * tile + gap)) // 2
    for i, color in enumerate(TILES):
        draw_tile(px, o + (i % 2) * (tile + gap), o + (i // 2) * (tile + gap), tile, color)
    outline(px)

    # Center plate, like the clock button sitting where the cards meet.
    c = GRID // 2
    for yy in range(c - 6, c + 6):
        for xx in range(c - 7, c + 7):
            edge = yy in (c - 6, c + 5) or xx in (c - 7, c + 6)
            px[(xx, yy)] = OUTLINE if edge else PLATE
    draw_heart(px, c - 4, c - 3)
    return px


def render(px, unit, background=None):
    img = Image.new("RGBA", (GRID, GRID), background + (255,) if background else (0, 0, 0, 0))
    for (x, y), color in px.items():
        img.putpixel((x, y), color + (255,))
    return img.resize((GRID * unit, GRID * unit), Image.NEAREST)


def main():
    px = artwork()

    for density, scale in DENSITIES.items():
        # Foreground: whole canvas, transparent around the art.
        size = round(FG_BASE * scale)
        render(px, size // GRID).save(os.path.join(RES, f"mipmap-{density}", "ic_launcher_foreground.png"))

        # Legacy: just the visible center, flattened onto the background.
        # (48*scale isn't a multiple of 36, so this one is resampled from a
        # larger render — only pre-Android-8 launchers ever show it.)
        legacy_size = round(LEGACY_BASE * scale)
        big = render(px, 8, BG)
        margin = (GRID - VISIBLE) // 2 * 8
        legacy = big.crop((margin, margin, big.width - margin, big.height - margin))
        legacy = legacy.resize((legacy_size, legacy_size), Image.NEAREST)
        legacy.save(os.path.join(RES, f"mipmap-{density}", "ic_launcher.png"))
        mask = Image.new("L", legacy.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, legacy_size - 1, legacy_size - 1], fill=255)
        round_icon = Image.new("RGBA", legacy.size, (0, 0, 0, 0))
        round_icon.paste(legacy, (0, 0), mask)
        round_icon.save(os.path.join(RES, f"mipmap-{density}", "ic_launcher_round.png"))

    # Splash screens: keep each existing file's size, art centered at a
    # whole-number scale (about a quarter of the short side).
    for folder in sorted(os.listdir(RES)):
        path = os.path.join(RES, folder, "splash.png")
        if not os.path.exists(path):
            continue
        w, h = Image.open(path).size
        unit = max(1, min(w, h) // 4 // VISIBLE)
        art = render(px, unit)
        splash = Image.new("RGBA", (w, h), BG + (255,))
        splash.paste(art, ((w - art.width) // 2, (h - art.height) // 2), art)
        splash.convert("RGB").save(path)

    # Favicon: the launcher's visible area at 2px per unit (72x72).
    full = render(px, 2, BG)
    m = (GRID - VISIBLE) // 2 * 2
    full.crop((m, m, full.width - m, full.height - m)).save("public/favicon.png")

    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
            f'    <color name="ic_launcher_background">#{BG[0]:02x}{BG[1]:02x}{BG[2]:02x}</color>\n'
            "</resources>\n"
        )
    print("done")


if __name__ == "__main__":
    main()
