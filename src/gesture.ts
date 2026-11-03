const LOCK_THRESHOLD = 16;
// How far (px) a drag has to end up from its start to "stick" instead of
// springing back — independent of LOCK_THRESHOLD, which only starts the live
// finger-follow, so the content can follow the finger immediately while
// still requiring a deliberate drag to actually commit.
const RELEASE_THRESHOLD = 100;
/** The app-wide press-and-hold cadence: first repeat after this long, then every HOLD_INTERVAL_MS. */
export const HOLD_DELAY_MS = 450;
export const HOLD_INTERVAL_MS = 450;

export type SwipeSide = "left" | "right";

export interface GestureOptions {
  /** Quick press+release with no meaningful movement; (x, y) is the touch's client position. */
  onTap?: (x: number, y: number) => void;
  /** Fires once after the hold delay, then repeats every HOLD_INTERVAL_MS until release; (x, y) is the touch's client position. */
  onHoldTick?: (x: number, y: number) => void;
  /** Fires on release when an upward drag ended past the release threshold. */
  onSwipeUp?: () => void;
  /** Fires on release when a downward drag ended past the release threshold. */
  onSwipeDown?: () => void;
  /** Fires on release when a horizontal drag ended past the release threshold; reports which side. */
  onSwipeSide?: (side: SwipeSide) => void;
  /**
   * Fires on every pointer move once a drag has locked to an axis, with the
   * (dx, dy) so far on that axis only — pair with a 1:1, undamped follow for
   * a real "stuck to the finger" feel. Whether the drag commits is decided
   * once, at release.
   */
  onDragMove?: (dx: number, dy: number) => void;
  /** Fires once on release if no swipe was confirmed (tap or cancelled drag) — use it to snap any drag-follow feedback back. */
  onDragEnd?: () => void;
  /**
   * Fires immediately on pointerdown — pair with `onPressEnd` to drive a
   * manually-managed "pressed" CSS class instead of native `:active`, since
   * `:active` can't survive the element being replaced mid-gesture by a
   * re-render (e.g. triggered from `onHoldTick`).
   */
  onPressStart?: () => void;
  /** Fires once release/cancel happens, or as soon as the gesture is recognized as a swipe/drag. */
  onPressEnd?: () => void;
}

/**
 * Unifies tap, press-and-hold-repeat, and swipe detection on one element.
 * A drag cancels any pending/active hold so a gesture never does both.
 * Tracking happens on `window` (not `el`) once a gesture starts, so it
 * survives the element being replaced mid-gesture by a re-render triggered
 * from onTap/onHoldTick/onSwipe*.
 */
export function attachGestureZone(el: HTMLElement, opts: GestureOptions) {
  function start(e: PointerEvent) {
    e.preventDefault();
    // Several players can be touching the table at once — every window
    // listener below only follows the finger that started *this* gesture,
    // or another seat's finger would drag/swipe/tap this one.
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let axis: "x" | "y" | null = null;
    let lastDx = 0;
    let lastDy = 0;
    let holdTriggered = false;
    let pressEnded = false;
    let holdTimeout: ReturnType<typeof setTimeout> | null = null;
    let holdInterval: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController();
    const { signal } = controller;

    opts.onPressStart?.();

    function endPress() {
      if (pressEnded) return;
      pressEnded = true;
      opts.onPressEnd?.();
    }

    function clearHold() {
      if (holdTimeout) clearTimeout(holdTimeout);
      if (holdInterval) clearInterval(holdInterval);
      holdTimeout = null;
      holdInterval = null;
    }

    function finish() {
      clearHold();
      controller.abort();
      endPress();
      if (axis) {
        // The whole gesture was a drag (not a tap/hold) — decide now,
        // against the release point, whether it "sticks" open or snaps back.
        if (axis === "y" && Math.abs(lastDy) > RELEASE_THRESHOLD) {
          (lastDy < 0 ? opts.onSwipeUp : opts.onSwipeDown)?.();
        } else if (axis === "x" && Math.abs(lastDx) > RELEASE_THRESHOLD) {
          opts.onSwipeSide?.(lastDx < 0 ? "left" : "right");
        } else {
          opts.onDragEnd?.();
        }
        return;
      }
      if (!holdTriggered) opts.onTap?.(startX, startY);
    }

    if (opts.onHoldTick) {
      holdTimeout = setTimeout(() => {
        holdTriggered = true;
        opts.onHoldTick!(startX, startY);
        holdInterval = setInterval(() => opts.onHoldTick!(startX, startY), HOLD_INTERVAL_MS);
      }, HOLD_DELAY_MS);
    }

    window.addEventListener(
      "pointermove",
      (ev) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        lastDx = dx;
        lastDy = dy;
        if (!axis) {
          const adx = Math.abs(dx);
          const ady = Math.abs(dy);
          if (Math.max(adx, ady) > LOCK_THRESHOLD) {
            axis = adx > ady ? "x" : "y";
            clearHold();
            endPress();
          }
        }
        // Once locked, report movement on only the locked axis — otherwise a
        // slightly diagonal finger path would drag the view on both axes at
        // once instead of sticking to one.
        if (axis) opts.onDragMove?.(axis === "x" ? dx : 0, axis === "y" ? dy : 0);
      },
      { signal }
    );
    const finishOwn = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) finish();
    };
    window.addEventListener("pointerup", finishOwn, { signal });
    window.addEventListener("pointercancel", finishOwn, { signal });
  }

  el.addEventListener("pointerdown", start);
}
