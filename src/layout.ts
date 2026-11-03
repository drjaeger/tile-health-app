import type { ArrangementId } from "./types";

export interface GridLayout {
  columns: number;
  areas: string;
  /** Clockwise degrees (0/90/180/270) each seat's content is rotated, by seat index. */
  rotation: number[];
  /**
   * Explicit CSS `grid-template-columns` value, overriding the `columns`-based
   * `repeat(columns, 1fr)` default. The "court" family uses this to keep its
   * end (rotated) seats narrower than the shared middle seat(s).
   */
  columnTemplate?: string;
  /**
   * Horizontal position (percent of the full grid width) the center
   * button should be centered on, overriding the usual 50%. The 5-player
   * court layouts use this to center it on the 4-player "base" cluster
   * instead of the whole screen, since that cluster doesn't span the full
   * width (the 5th, sideways seat takes up the rest).
   */
  centerX?: number;
  /**
   * Degrees (0/90/180/270) the center button itself is rotated, overriding
   * the usual upright 0. `split-h`'s two seats sit rotated 90/270 along a
   * vertical seam, where the button's default landscape shape doesn't fit
   * well — rotating it 90 turns it into a portrait pill that faces one of
   * the two seats instead.
   */
  centerRotation?: number;
  /**
   * Seat indices (0-based) listed in the table's true geometric clockwise
   * order — e.g. `quad`'s [0, 1, 3, 2], since its grid areas put seat 2 and
   * 3 diagonally opposite seat 0 and 1 respectively, not adjacent to them
   * the way plain ascending index order would assume. Consumed by the
   * commander-damage pill row (see renderCommanderDamageBars in game.ts) so
   * "left-most pill = next player clockwise" holds for every arrangement,
   * not just ones where seat index already happens to match table geometry.
   * Omitted where index order already *is* clockwise order (every 2/3-player
   * layout but the two "trio-no-t*" ones) — `getLayout` then defaults to
   * identity order.
   */
  clockwiseOrder?: number[];
}

/**
 * Every arrangement a given player count can use, in picker order (first
 * entry is that count's default). IDs are unique across the whole catalog,
 * not just within a count, so `getLayout` can dispatch on `id` alone.
 */
export const ARRANGEMENTS_BY_COUNT: Record<number, { id: ArrangementId; label: string }[]> = {
  2: [
    { id: "split-v", label: "Stacked" },
    { id: "split-h", label: "Side by Side" },
  ],
  3: [
    { id: "trio-no-br", label: "No Bottom-Right" },
    { id: "trio-no-bl", label: "No Bottom-Left" },
    { id: "trio-no-tr", label: "No Top-Right" },
    { id: "trio-no-tl", label: "No Top-Left" },
  ],
  4: [
    { id: "quad", label: "Face Off" },
    { id: "court", label: "Tennis Court" },
  ],
  5: [
    { id: "court-5l", label: "Tennis Court — Left Pair" },
    { id: "court-5r", label: "Tennis Court — Right Pair" },
  ],
  6: [{ id: "court-6", label: "Tennis Court" }],
};

export function defaultArrangementFor(count: number): ArrangementId {
  return (ARRANGEMENTS_BY_COUNT[count]?.[0]?.id ?? "quad") as ArrangementId;
}

export function isValidArrangement(count: number, id: ArrangementId): boolean {
  return (ARRANGEMENTS_BY_COUNT[count] ?? []).some((a) => a.id === id);
}

type LayoutOpts = Pick<GridLayout, "columnTemplate" | "centerX" | "centerRotation" | "clockwiseOrder">;

function layout(columns: number, areas: string, rotation: number[], opts: LayoutOpts = {}): GridLayout {
  return { columns, areas, rotation, ...opts };
}

/** `getLayout`'s public contract: identity order when a layout doesn't need an override. */
export function getClockwiseOrder(layout: GridLayout, count: number): number[] {
  return layout.clockwiseOrder ?? Array.from({ length: count }, (_, i) => i);
}

// The two end (rotated) seats read sideways, so they don't need as much
// width as the shared middle seat(s) — narrower ends leave more room where
// it's actually read from.
const COURT_3COL = "0.72fr 1fr 0.72fr";
const COURT_4COL = "0.72fr 1fr 1fr 0.72fr";
// 5-player court layouts: a 2x2 "base" cluster sharing 3/4 of the width,
// identically sized, plus one sideways single player in the remaining 1/4.
const COURT_5COL_SIDE_RIGHT = "1.5fr 1.5fr 1fr";
const COURT_5COL_SIDE_LEFT = "1fr 1.5fr 1.5fr";

/**
 * The "court" family seats two players at the far ends of a landscape
 * rectangle (rotated 90/270 so they read right-side-up from outside that
 * edge) with the rest sharing the middle, net-like, the way real card-table
 * seating works — as opposed to the "grid" family (`quad`, `trio-*`), which
 * is the classic quadrant pass-and-play layout.
 */
function getCourtLayout(count: number, id: ArrangementId): GridLayout {
  switch (id) {
    case "court":
      // Left end (0) -> top-middle (1) -> right end (3) -> bottom-middle (2).
      return layout(3, `"p0 p1 p3" "p0 p2 p3"`, [90, 180, 0, 270], {
        columnTemplate: COURT_3COL,
        clockwiseOrder: [0, 1, 3, 2],
      });
    case "court-5l":
      // The split end's pair faces each other across their own shared
      // border, same as the middle pair — not sideways like a single
      // (unsplit) end seat, which is what rotation this slot has in every
      // other court layout.
      // Base cluster occupies the left 3/4 (columns 1-2 of COURT_5COL_SIDE_RIGHT) — its center sits at 3/4 / 2 = 37.5%.
      // Top-left (0) -> top-middle (2) -> right end (4) -> bottom-middle (3) -> bottom-left (1).
      return layout(3, `"p0 p2 p4" "p1 p3 p4"`, [180, 0, 180, 0, 270], {
        columnTemplate: COURT_5COL_SIDE_RIGHT,
        centerX: 37.5,
        clockwiseOrder: [0, 2, 4, 3, 1],
      });
    case "court-5r":
      // Base cluster occupies the right 3/4 (columns 2-3) — its center sits at 25% + 3/4 / 2 = 62.5%.
      // Left end (0) -> top-middle (1) -> top-right (3) -> bottom-right (4) -> bottom-middle (2).
      return layout(3, `"p0 p1 p3" "p0 p2 p4"`, [90, 180, 0, 180, 0], {
        columnTemplate: COURT_5COL_SIDE_LEFT,
        centerX: 62.5,
        clockwiseOrder: [0, 1, 3, 4, 2],
      });
    case "court-6":
      // Left end (0) -> top col2 (1) -> top col3 (2) -> right end (5) -> bottom col3 (4) -> bottom col2 (3).
      return layout(4, `"p0 p1 p2 p5" "p0 p3 p4 p5"`, [90, 180, 180, 0, 0, 270], {
        columnTemplate: COURT_4COL,
        clockwiseOrder: [0, 1, 2, 5, 4, 3],
      });
    default:
      return getGridLayout(count, defaultArrangementFor(count));
  }
}

/** The classic quadrant pass-and-play layout, and its 3-player variants with one quadrant left empty. */
function getGridLayout(count: number, id: ArrangementId): GridLayout {
  switch (id) {
    case "split-v":
      return layout(1, `"p0" "p1"`, [180, 0]);
    case "split-h":
      // Same left/right facing convention as the court family's end seats,
      // so both read right-side-up from outside their edge of the screen.
      // The two seats sit along a vertical seam, so the center button is
      // rotated 90 to match (a portrait pill instead of its usual landscape
      // shape) — facing seat 0.
      return layout(2, `"p0 p1"`, [90, 270], { centerRotation: 90 });
    case "trio-no-tl":
      // Top-right (0) -> bottom-right (2) -> bottom-left (1) — the empty
      // top-left quadrant is simply skipped over.
      return layout(2, `". p0" "p1 p2"`, [180, 0, 0], { clockwiseOrder: [0, 2, 1] });
    case "trio-no-tr":
      // Top-left (0) -> bottom-right (2) -> bottom-left (1) — the empty
      // top-right quadrant is skipped over.
      return layout(2, `"p0 ." "p1 p2"`, [180, 0, 0], { clockwiseOrder: [0, 2, 1] });
    case "trio-no-bl":
      return layout(2, `"p0 p1" ". p2"`, [180, 180, 0]);
    case "trio-no-br":
      return layout(2, `"p0 p1" "p2 ."`, [180, 180, 0]);
    case "quad":
      // Top-left (0) -> top-right (1) -> bottom-right (3) -> bottom-left (2).
      return layout(2, `"p0 p1" "p2 p3"`, [180, 180, 0, 0], { clockwiseOrder: [0, 1, 3, 2] });
    default:
      return layout(
        1,
        Array.from({ length: count }, (_, i) => `"p${i}"`).join(" "),
        Array.from({ length: count }, () => 0)
      );
  }
}

const COURT_IDS: ArrangementId[] = ["court", "court-5l", "court-5r", "court-6"];

export function getLayout(count: number, arrangementId: ArrangementId): GridLayout {
  const id = isValidArrangement(count, arrangementId) ? arrangementId : defaultArrangementFor(count);
  return COURT_IDS.includes(id) ? getCourtLayout(count, id) : getGridLayout(count, id);
}
