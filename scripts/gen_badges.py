"""Generates pixel-art table-badge art: the dealer's casino chip (with a
"1" for first player) and the blocky shine that sweeps across the
monarch's crown. (The crown itself is a third-party sprite — see
public/icons/CREDITS.txt — so it is not generated here.)

Each icon is drawn on a 34x34 logical grid (shown at 68px in the app, so
every pixel lands on an exact 2x2 block) and written straight to
public/icons/ — the app renders them with `image-rendering: pixelated`.
Shapes are built as masks, shaded by position (light from the top-left),
then given a 1px dark outline, so tweaking a shape is a one-number change.

Run from the repo root:  python3 scripts/gen_badges.py
"""

from PIL import Image
import math
import os

GRID = 34
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

OUTLINE = (40, 20, 6, 255)


def blank():
    return [[None] * GRID for _ in range(GRID)]


def add_outline(px, color=OUTLINE):
    """Paints every empty pixel that touches a filled one (4-neighbour)."""
    edge = []
    for y in range(GRID):
        for x in range(GRID):
            if px[y][x] is not None:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < GRID and 0 <= ny < GRID and px[ny][nx] is not None and px[ny][nx] != color:
                    edge.append((x, y))
                    break
    for x, y in edge:
        px[y][x] = color


def save(px, name):
    img = Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))
    for y in range(GRID):
        for x in range(GRID):
            if px[y][x] is not None:
                img.putpixel((x, y), px[y][x])
    img.save(os.path.join(OUT_DIR, name))


# ---------- Dealer chip ----------

CHIP_RED = (210, 30, 52, 255)
CHIP_RED_DARK = (150, 14, 34, 255)
CHIP_RED_DEEP = (105, 8, 24, 255)
CHIP_WHITE = (246, 242, 232, 255)
CHIP_WHITE_SHADE = (205, 196, 180, 255)
CHIP_OUTLINE = (30, 6, 10, 255)

# "1" for first player, drawn in the chip's center.
ONE = [
    "..##.",
    ".###.",
    "#.##.",
    "..##.",
    "..##.",
    "..##.",
    "..##.",
    "#####",
]


def chip():
    px = blank()
    c = 16.5
    for y in range(GRID):
        for x in range(GRID):
            dx, dy = x + 0.5 - c, y + 0.5 - c
            r = math.hypot(dx, dy)
            if r > 15:
                continue
            # Light from the top-left: the lower-right half of each ring is shaded.
            lower_right = dx + dy > 3
            angle = (math.degrees(math.atan2(dy, dx)) + 360) % 360
            if r > 11:
                # Rim with six white edge inserts.
                insert = min((angle - a) % 360 for a in range(0, 360, 60)) < 13 or min((a - angle) % 360 for a in range(0, 360, 60)) < 13
                if insert:
                    col = CHIP_WHITE_SHADE if lower_right else CHIP_WHITE
                else:
                    col = CHIP_RED_DARK if lower_right else CHIP_RED
            elif r > 9.5:
                col = CHIP_RED_DEEP
            elif r > 8.5:
                # Dashed inlay ring.
                col = CHIP_WHITE if int(angle // 20) % 2 == 0 else CHIP_RED_DARK
            else:
                col = CHIP_WHITE if not (dx + dy > 7) else CHIP_WHITE_SHADE
            px[y][x] = col
    for dy, row in enumerate(ONE):
        for dx, ch in enumerate(row):
            if ch == "#":
                px[13 + dy][14 + dx] = CHIP_RED
    add_outline(px, CHIP_OUTLINE)
    save(px, "chip.png")


SHINE_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "fx", "shine.png")


def shine():
    """A flat-white diagonal glint — a thick and a thin stripe with stair-
    stepped pixel edges — that CSS slides across the crown in hard steps.
    16x34 logical px, shown at 2x (so it lines up with the badge's 2px art
    pixels)."""
    w, h = 16, 34
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(h):
        shift = (h - 1 - y) // 3  # leans right going up
        for x in (shift, shift + 1, shift + 2, shift + 4):
            if 0 <= x < w:
                img.putpixel((x, y), (255, 255, 240, 190))
    img.save(SHINE_PATH)


if __name__ == "__main__":
    chip()
    shine()
    print("wrote chip.png to", os.path.normpath(OUT_DIR), "and", os.path.normpath(SHINE_PATH))
