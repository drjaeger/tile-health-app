import { gameStore } from "../state";
import { getLayout, getClockwiseOrder } from "../layout";
import { attachGestureZone, HOLD_DELAY_MS, HOLD_INTERVAL_MS } from "../gesture";
import type { GestureOptions } from "../gesture";
import { fitRotated } from "../rotatedFit";
import { COMMANDER_DAMAGE_LETHAL, PLAYER_COLORS } from "../types";
import type { GameState, Player, PlayerId } from "../types";
import { openSettings } from "./settings";
import { openConfirm } from "./confirm";
import { renderCustomizationPanel, stopPointerDown } from "./panels/customization";
import {
  BADGES,
  BADGE_KEYS,
  subscribeBadges,
  getBadgeState,
  setBadgePosition,
  isBadgeEnabled,
  disableBadges,
  clearTableBadges,
} from "../badgeStore";
import type { BadgeKey } from "../badgeStore";
import { MILESTONE_BADGES } from "../milestones";
import { hapticDeath, hapticLifeChange } from "../haptics";

type Dir = "up" | "down" | "left" | "right";

const EXIT_TRANSFORMS: Record<Dir, string> = {
  up: "translateY(-130%)",
  down: "translateY(130%)",
  left: "translateX(-130%)",
  right: "translateX(130%)",
};
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const CW_DIRS: Dir[] = ["up", "right", "down", "left"];

/**
 * A card rotated `rotation` degrees clockwise (0/90/180/270 — see
 * GridLayout.rotation) has its own coordinate space rotated to match, so a
 * transform/gesture that should read as physical direction `dir` on screen
 * must actually be authored as this converted direction in the card's
 * local (pre-rotation) space. Every `dir` reaching animateExit/animateEnter,
 * or used to decide what a swipe means, is the *physical* swipe/seat
 * direction, so it must be converted through this before use.
 */
function localDir(dir: Dir, rotation: number): Dir {
  const steps = (rotation / 90) % 4;
  if (!steps) return dir;
  return CW_DIRS[(CW_DIRS.indexOf(dir) - steps + 4) % 4];
}

/** Same conversion as `localDir`, for the continuous (dx, dy) of a live drag. */
function toLocalVector(dx: number, dy: number, rotation: number): [number, number] {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [dy, -dx];
    case 180:
      return [-dx, -dy];
    case 270:
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

const DELTA_HOLD_MS = 1300;

// Every state change does a full re-render, which recreates the badge <img>
// from scratch — a fresh element restarts its CSS animation at 0%. Phasing
// each new element's animation-delay to this fixed wall-clock epoch instead
// of letting it default to "just started" makes the bob look continuous
// across re-renders instead of visibly resetting on every life change.
const BADGE_ANIM_EPOCH = Date.now();
const BADGE_BOB_DURATION_MS = 2200;
// How far (px) a finger has to move on the burn flame before the press
// turns into a drag instead of a (pending) burn hold.
const BADGE_DRAG_SLOP = 12;
const WINNER_PULSE_DURATION_MS = 1800;

// A swipe-commit exit continues straight out of a 1:1 finger-follow drag, so
// it needs an easing that keeps looking like the same motion rather than
// visibly changing speed the instant the finger lifts: "ease-in" (the
// previous curve) starts slow, which reads as the content stalling for a
// beat before launching away. An ease-out curve instead starts at (or above)
// the speed the drag left it at and decelerates into place, which is what
// makes the hand-off feel seamless. Exit and enter share the same curve and
// duration so the two halves of a panel transition read as one motion.
const SWIPE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SWIPE_TRANSITION_MS = 220;

function animateExit(el: HTMLElement, dir: Dir, onDone: () => void) {
  el.style.transition = `transform ${SWIPE_TRANSITION_MS}ms ${SWIPE_EASE}, opacity ${SWIPE_TRANSITION_MS}ms ${SWIPE_EASE}`;
  el.style.transform = EXIT_TRANSFORMS[dir];
  el.style.opacity = "0";
  setTimeout(onDone, SWIPE_TRANSITION_MS);
}

function animateEnter(el: HTMLElement, dir: Dir) {
  el.style.transition = "none";
  el.style.transform = EXIT_TRANSFORMS[dir];
  el.style.opacity = "0";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${SWIPE_TRANSITION_MS}ms ${SWIPE_EASE}, opacity ${SWIPE_TRANSITION_MS}ms ${SWIPE_EASE}`;
      el.style.transform = "translate(0, 0)";
      el.style.opacity = "1";
    });
  });
}

/**
 * The center button is pill-shaped and its text reads as nonsense (or just
 * looks broken) rotated on its side, unlike a seat's own life-face content —
 * so any 90/270 (court end-seat) interaction falls back to upright instead
 * of actually turning the text sideways. 180 is fine (just upside-down).
 */
function centerTextRotation(rotation: number): 0 | 180 {
  return rotation === 180 ? 180 : 0;
}

/** Whether a badge's stored (percent-of-screen) position currently falls within a given card's on-screen rect. */
function isPointOverCard(xPct: number, yPct: number, card: HTMLElement, container: HTMLElement): boolean {
  const containerRect = container.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const x = containerRect.left + (xPct / 100) * containerRect.width;
  const y = containerRect.top + (yPct / 100) * containerRect.height;
  return x >= cardRect.left && x <= cardRect.right && y >= cardRect.top && y <= cardRect.bottom;
}

/**
 * The life number's font-size is otherwise a single viewport-relative
 * clamp, which doesn't know a 6-player card is much smaller than a
 * 4-player one — it looked oversized there. Scaled relative to 4 players
 * (1.0, the size that already looked right), by discrete player count
 * rather than a continuous formula, since there's no single "cards per
 * seat" ratio that holds across every arrangement family (court vs. grid).
 */
function lifeScaleForPlayerCount(count: number): number {
  const SCALE_BY_COUNT: Record<number, number> = { 2: 1.2, 3: 1.1, 4: 1, 5: 0.85, 6: 0.7 };
  return SCALE_BY_COUNT[count] ?? 1;
}

function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type ShakeStrength = "light" | "normal" | "heavy";

/** Rattles a seat (a `.player-card`) — light for burn, normal for a ±10 life hold / single commander hit, heavy for a ±10 commander hold. */
function shakeCard(target: HTMLElement, strength: ShakeStrength) {
  const cls = `shake-${strength}`;
  // Every caller shakes a card fresh from a full re-render, so there's never
  // a running shake to restart first.
  target.classList.add(cls);
  target.addEventListener("animationend", function onShakeEnd(e) {
    if (e.target !== target) return;
    target.classList.remove(cls);
    target.removeEventListener("animationend", onShakeEnd);
  });
}

/**
 * All the feedback for one confirmed life change — flash wash, outward
 * pulse rings from the tap's own position, and the floating "+N"/"-N"
 * text — plus, for a hold-to-repeat ±10 tick, a stronger flash/ring and a
 * slight shake. `intense` is driven by *which action* fired (a hold-tick
 * vs. a single tap), not by the raw magnitude of `delta`, since a
 * commander-damage delta can get clamped to something other than exactly
 * ±1/±10. `origin` is the tap's client (x, y); omitted, the rings fall
 * back to the card's current center. `rings: false` drops the rings (burn
 * damage, which nobody tapped on that card).
 *
 * Every piece except the shake is spawned into `effectsLayer` — a
 * `position: fixed` overlay that lives *outside* the game screen's root and
 * is never touched by its full `root.innerHTML = ""` re-render — using
 * plain screen (client) coordinates captured once at spawn time. The game
 * re-renders on every single life change (including every hold-tick), which
 * would otherwise tear down and recreate the card mid-animation on each
 * subsequent tap; this is what actually lets an effect "follow through" to
 * completion while a later tap's effects join in alongside it, rather than
 * being destroyed by it. It also sidesteps the rotated-card coordinate math
 * entirely, since screen coordinates don't care which way a seat is turned.
 *
 * `shake` says what rattles and how hard — commander damage shakes the
 * *receiving* seat, not the slot the flash/rings are sized to. Left out,
 * `card` shakes normally on an intense change and stays still otherwise.
 */
function spawnLifeEffect(
  effectsLayer: HTMLElement,
  card: HTMLElement | null,
  delta: number,
  {
    intense = false,
    origin,
    rings = true,
    shake = intense ? { target: card, strength: "normal" } : null,
  }: {
    intense?: boolean;
    origin?: { x: number; y: number };
    rings?: boolean;
    shake?: { target: HTMLElement | null; strength: ShakeStrength } | null;
  } = {}
) {
  if (!card) return;
  hapticLifeChange(intense);
  const isGain = delta > 0;
  const rect = card.getBoundingClientRect();

  const flash = document.createElement("div");
  flash.className = "life-flash " + (isGain ? "flash-gain" : "flash-loss") + (intense ? " flash-intense" : "");
  flash.style.left = `${rect.left}px`;
  flash.style.top = `${rect.top}px`;
  flash.style.width = `${rect.width}px`;
  flash.style.height = `${rect.height}px`;
  flash.addEventListener("animationend", () => flash.remove());
  effectsLayer.appendChild(flash);

  const cx = origin ? origin.x : rect.left + rect.width / 2;
  const cy = origin ? origin.y : rect.top + rect.height / 2;
  const ringCount = !rings ? 0 : intense ? 3 : 2;
  for (let i = 0; i < ringCount; i++) {
    const ring = document.createElement("span");
    ring.className = "life-ring" + (intense ? " ring-intense" : "");
    ring.style.animationDelay = `${i * 90}ms`;
    ring.style.left = `${cx}px`;
    ring.style.top = `${cy}px`;
    ring.addEventListener("animationend", () => ring.remove());
    effectsLayer.appendChild(ring);
  }

  if (shake?.target) shakeCard(shake.target, shake.strength);

  const float = document.createElement("span");
  float.className = "floating-delta " + (isGain ? "floating-gain" : "floating-loss");
  float.textContent = isGain ? `+${delta}` : String(delta);
  float.style.left = `${rect.left + rect.width * (0.35 + Math.random() * 0.3)}px`;
  float.style.top = `${rect.top + rect.height * 0.4}px`;
  float.addEventListener("animationend", () => float.remove());
  effectsLayer.appendChild(float);
}

export function renderGameScreen(root: HTMLElement) {
  // Lives outside `root` specifically so it survives every full re-render
  // (see spawnLifeEffect) — created once for the lifetime of the app, since
  // renderGameScreen itself is only ever called once (see main.ts).
  const effectsLayer = document.createElement("div");
  effectsLayer.className = "effects-layer";
  (root.parentElement ?? document.body).appendChild(effectsLayer);

  let timerInterval: ReturnType<typeof setInterval> | null = null;
  // Seats showing their customization panel instead of their life total.
  const customizing = new Set<PlayerId>();
  let commanderViewFor: PlayerId | null = null;
  const pendingEnter = new Map<PlayerId, Dir>();
  let pendingDelta: { key: string; total: number } | null = null;
  let pendingDeltaTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastInteractionRotation = 0;
  // CSS :active can't survive a hold-tick's re-render replacing the element
  // mid-press, so the "pressed" look is tracked here and manually reapplied
  // to whichever fresh element matches this key after every render.
  let pressedZoneKey: string | null = null;
  // Winner is derived fresh every render rather than stored, so this tracks
  // the edge (no winner -> winner) to clear initiative/monarch exactly once
  // per round instead of on every re-render while a winner stands.
  let lastWinnerId: PlayerId | null = null;
  // A reset / new game mints fresh player ids, so any panel or commander
  // view still keyed to an old id would linger invisibly (leaving the center
  // button stuck on "BACK") — render() drops all of it when this changes.
  let lastStartedAt: number | null = null;
  // Who was dead as of the last render, to buzz exactly once on the render
  // where someone dies (null = no baseline yet, e.g. right after a restore
  // or reset, so an already-dead seat doesn't buzz on load).
  let lastDeadIds: Set<PlayerId> | null = null;
  // True while the burn flame is being held down and ticking (see
  // renderBadge) — re-applied to each re-rendered flame as `.burning`.
  let burnActive = false;
  // Set for the duration of a table-badge drag (see renderBadge) — swipes are
  // suppressed while true, so dragging a badge across a card never also
  // opens/closes that card's panel underneath it.
  let badgeDragging = false;

  /** A swipe shouldn't register while something else is already happening on top of it. */
  function swipesBlocked(): boolean {
    // effectsLayer only ever holds the transient ring/flash/floating-delta
    // spans from a life change in progress — any children at all means one
    // is still mid-animation.
    return badgeDragging || effectsLayer.childElementCount > 0;
  }

  /** Slides `view` to follow the finger 1:1 (converted into the seat's own rotated space) — the "stuck to your finger" half of every panel-open/close swipe. */
  function dragFollowView(view: HTMLElement, rotation: number, dx: number, dy: number) {
    if (swipesBlocked()) return;
    const [localDx, localDy] = toLocalVector(dx, dy, rotation);
    view.style.transition = "none";
    view.style.transform = `translate(${localDx}px, ${localDy}px)`;
  }

  /** Springs `view` back to its resting position — released short of the commit threshold, or blocked outright. */
  function snapBackView(view: HTMLElement) {
    view.style.transition = "transform 180ms ease-out";
    view.style.transform = "translate(0, 0)";
  }

  /**
   * The gesture options every swipeable face shares: `view` follows the
   * finger, and a committed swipe calls `onSwipe` with its physical
   * direction — unless a swipe is currently blocked, in which case the drag
   * just springs back instead, as if it had fallen short.
   */
  function swipeHandlers(view: HTMLElement, rotation: number, onSwipe: (dir: Dir) => void): GestureOptions {
    const commit = (dir: Dir) => (swipesBlocked() ? snapBackView(view) : onSwipe(dir));
    return {
      onDragMove: (dx, dy) => dragFollowView(view, rotation, dx, dy),
      onDragEnd: () => snapBackView(view),
      onSwipeUp: () => commit("up"),
      onSwipeDown: () => commit("down"),
      onSwipeSide: (side) => commit(side),
    };
  }

  /**
   * Slides a seat's `view` out in the swipe's direction, then applies
   * `change` (open/close a panel or the commander view) and has the new
   * content enter from the opposite edge — so it follows through in the
   * same visual direction (a continuous "conveyor" motion, not a
   * bounce-back from the far side).
   */
  function transitionView(view: HTMLElement, playerId: PlayerId, rotation: number, dir: Dir, change: () => void) {
    lastInteractionRotation = rotation;
    const local = localDir(dir, rotation);
    animateExit(view, local, () => {
      change();
      pendingEnter.set(playerId, OPPOSITE[local]);
      render();
    });
  }

  /**
   * One − or + tap zone: a tap applies ±1, a hold repeats ±10. The pressed
   * look is tracked by `zoneKey` so it survives hold-tick re-renders.
   * `extra` adds more gesture handling (e.g. the life face's swipes).
   */
  function makeTapZone(
    sign: -1 | 1,
    zoneKey: string,
    ariaLabel: string,
    apply: (delta: number, intense: boolean, origin: { x: number; y: number }) => void,
    extra: GestureOptions = {}
  ): HTMLElement {
    const zone = document.createElement("button");
    zone.className = `tap-zone tap-zone-${sign < 0 ? "minus" : "plus"}` + (pressedZoneKey === zoneKey ? " pressed" : "");
    zone.dataset.zoneKey = zoneKey;
    zone.setAttribute("aria-label", ariaLabel);
    zone.innerHTML = `<span class="tap-glyph">${sign < 0 ? "−" : "+"}</span>`;
    attachGestureZone(zone, {
      ...extra,
      onTap: (x, y) => apply(sign, false, { x, y }),
      onHoldTick: (x, y) => apply(sign * 10, true, { x, y }),
      onPressStart: () => setZonePressed(zoneKey, true),
      onPressEnd: () => setZonePressed(zoneKey, false),
    });
    return zone;
  }

  /** A seat's big number (life total or commander damage) in its centered row. */
  function renderNumber(value: number, { compact = false, dead = false } = {}): HTMLElement {
    const center = document.createElement("div");
    center.className = "card-center";
    const num = document.createElement("div");
    num.className = "life-number" + (compact ? " compact" : "") + (dead ? " life-dead" : "");
    fillDigits(num, value);
    center.appendChild(num);
    return center;
  }

  function findCard(playerId: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-player-id="${playerId}"]`);
  }

  function setZonePressed(key: string, pressed: boolean) {
    pressedZoneKey = pressed ? key : pressedZoneKey === key ? null : pressedZoneKey;
    root.querySelector<HTMLElement>(`[data-zone-key="${key}"]`)?.classList.toggle("pressed", pressed);
  }

  function closeAllPanels() {
    customizing.clear();
    commanderViewFor = null;
    pendingEnter.clear();
    render();
  }

  function updatePendingDelta(key: string, delta: number, rotation: number) {
    if (!pendingDelta || pendingDelta.key !== key) pendingDelta = { key, total: 0 };
    pendingDelta.total += delta;
    lastInteractionRotation = rotation;
    if (pendingDeltaTimeout) clearTimeout(pendingDeltaTimeout);
    pendingDeltaTimeout = setTimeout(() => {
      pendingDelta = null;
      pendingDeltaTimeout = null;
      render();
    }, DELTA_HOLD_MS);
    // No render() here: every caller pairs this with a store change (in the
    // same batch, or right after), and that change's re-render shows it.
  }

  function render() {
    const state = gameStore.getState();
    if (!state) return;

    if (lastStartedAt !== state.startedAt) {
      lastStartedAt = state.startedAt;
      customizing.clear();
      commanderViewFor = null;
      pendingEnter.clear();
      pendingDelta = null;
      if (pendingDeltaTimeout) clearTimeout(pendingDeltaTimeout);
      pendingDeltaTimeout = null;
      pressedZoneKey = null;
      lastDeadIds = null;
    }

    const deadIds = new Set(state.players.filter(isPlayerDead).map((p) => p.id));
    if (lastDeadIds && [...deadIds].some((id) => !lastDeadIds!.has(id))) hapticDeath();
    lastDeadIds = deadIds;

    root.innerHTML = "";

    const container = document.createElement("div");
    container.className = "game-screen";

    const grid = document.createElement("div");
    grid.className = "player-grid";
    const layout = getLayout(state.players.length, state.settings.arrangementId);
    grid.style.gridTemplateAreas = layout.areas;
    grid.style.gridTemplateColumns = layout.columnTemplate ?? `repeat(${layout.columns}, 1fr)`;
    grid.style.setProperty("--life-scale", String(lifeScaleForPlayerCount(state.players.length)));

    const winner = getWinner(state);

    if (winner) {
      if (lastWinnerId !== winner.id) {
        lastWinnerId = winner.id;
        // Deferred: calling this synchronously here would re-enter render()
        // (badgeStore notifies synchronously) while this render is still
        // building the DOM, so let the current render finish first.
        queueMicrotask(() => disableBadges(["initiative", "monarch"]));
      }
    } else {
      lastWinnerId = null;
    }

    // While viewing commander damage, the "Back" button should always
    // match the seat *receiving* that damage (the one who swiped
    // into this view), never whichever opponent's +/- zone was last
    // tapped — those are rendered inside that opponent's own rotated card,
    // which can be a completely different orientation.
    const commanderViewerRotation = commanderViewFor
      ? layout.rotation[state.players.findIndex((p) => p.id === commanderViewFor)] ?? 0
      : 0;

    state.players.forEach((player, i) => {
      const card = renderPlayerCard(
        state,
        player,
        layout.rotation[i] ?? 0,
        i,
        winner?.id === player.id,
        commanderViewerRotation
      );
      grid.appendChild(card);
    });

    container.appendChild(grid);

    const anyPanelOpen = customizing.size > 0 || commanderViewFor !== null;
    const centerBtn = document.createElement("button");
    centerBtn.className = "center-settings-btn";
    if (layout.centerX !== undefined) centerBtn.style.left = `${layout.centerX}%`;
    if (layout.centerRotation !== undefined) {
      centerBtn.style.setProperty("--center-rotation", `${layout.centerRotation}deg`);
    }

    if (pendingDelta && pendingDelta.total !== 0) {
      const isGain = pendingDelta.total > 0;
      const span = document.createElement("span");
      span.className = "center-delta " + (isGain ? "gain" : "loss");
      const deltaRotation = centerTextRotation(lastInteractionRotation);
      if (deltaRotation) span.style.transform = `rotate(${deltaRotation}deg)`;
      span.textContent = (isGain ? "+" : "") + String(pendingDelta.total);
      centerBtn.appendChild(span);
      centerBtn.setAttribute("aria-label", "Recent change");
      centerBtn.addEventListener("click", () => (anyPanelOpen ? closeAllPanels() : openSettings()));
    } else if (anyPanelOpen) {
      const returnLabel = document.createElement("span");
      returnLabel.className = "center-return-label";
      const labelRotation = centerTextRotation(lastInteractionRotation);
      if (labelRotation) returnLabel.style.transform = `rotate(${labelRotation}deg)`;
      returnLabel.textContent = "BACK";
      centerBtn.appendChild(returnLabel);
      centerBtn.setAttribute("aria-label", "Back to game");
      centerBtn.addEventListener("click", closeAllPanels);
    } else {
      const timerEl = document.createElement("span");
      timerEl.className = "center-timer";
      timerEl.textContent = formatTimer(Date.now() - state.startedAt);
      centerBtn.appendChild(timerEl);
      centerBtn.setAttribute("aria-label", "Settings");
      centerBtn.addEventListener("click", () => openSettings());
    }
    container.appendChild(centerBtn);

    // Attached before badges are measured/appended below, so `findCard`
    // rects (needed to tell which seat a badge currently sits over) are
    // real laid-out geometry rather than a detached, zero-sized subtree.
    root.appendChild(container);

    // A badge only disappears if it's currently sitting over a seat whose
    // *customization* panel is open — commander damage doesn't hide any
    // badge, regardless of position, since that view doesn't replace the
    // whole table the way a customization panel does. Position-based (not
    // "hide every badge whenever anything is open") because badges are
    // freely draggable anywhere on screen — a badge a player dragged onto
    // someone else's card has nothing to do with a panel open on a third
    // seat, and should stay visible.
    for (const key of BADGE_KEYS) {
      if (!isBadgeEnabled(key)) continue;
      // Burn only means "life damage" — out of the way while the table is
      // showing commander damage instead.
      if (key === "burn" && commanderViewFor !== null) continue;
      const badgeState = getBadgeState(key);
      if (!badgeState) continue;
      const coveredBy = [...customizing].some((playerId) => {
        const card = findCard(playerId);
        return card && isPointOverCard(badgeState.xPct, badgeState.yPct, card, container);
      });
      if (!coveredBy) container.appendChild(renderBadge(key));
    }

    placeWatermarks(centerBtn);

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    // Once there's a winner the round is over — stop ticking so the clock
    // doesn't keep forcing re-renders (which would restart the confetti loop).
    if (!winner) {
      timerInterval = setInterval(() => {
        const s = gameStore.getState();
        const liveTimerEl = root.querySelector<HTMLElement>(".center-timer");
        if (!s || !liveTimerEl) return;
        liveTimerEl.textContent = formatTimer(Date.now() - s.startedAt);
      }, 1000);
    }
  }

  function renderPlayerCard(
    state: GameState,
    player: Player,
    rotation: number,
    index: number,
    isWinner: boolean,
    commanderViewerRotation: number
  ): HTMLElement {
    const card = document.createElement("div");
    card.className = "player-card" + (isWinner ? " winner" : "");
    card.dataset.playerId = player.id;
    card.dataset.rotation = String(rotation);
    card.style.gridArea = `p${index}`;
    card.style.setProperty("--player-color", player.color);
    if (isWinner) {
      // Same re-render-survives-via-epoch-phasing trick as the table badges
      // and confetti — without it the brightness pulse snaps back to its
      // 0% phase (and visibly "resets") the next time anything re-renders.
      const elapsed = Date.now() - BADGE_ANIM_EPOCH;
      card.style.setProperty("--winner-t", `${-(elapsed % WINNER_PULSE_DURATION_MS)}ms`);
    }

    // Everything that represents "this player's seat" — its color and
    // whichever content (life/customize/commander/dead) is showing — lives
    // inside one `view` wrapper, so a swipe slides the color along with the
    // content instead of leaving it behind.
    const view = document.createElement("div");
    view.className = "card-view";
    if (rotation === 90 || rotation === 270) {
      // A 90/270 seat swaps visual width/height, so `view` is rotated
      // inside a transposed rotator (see fitRotated) instead of rotating
      // the card itself and overflowing its cell.
      fitRotated(card, view, rotation);
    } else {
      if (rotation === 180) card.style.transform = "rotate(180deg)";
      card.appendChild(view);
    }

    const colorFill = document.createElement("div");
    colorFill.className = "card-color-fill";
    view.appendChild(colorFill);

    const enterDir = pendingEnter.get(player.id);
    pendingEnter.delete(player.id);
    if (enterDir) animateEnter(view, enterDir);

    if (commanderViewFor) {
      if (player.id === commanderViewFor) {
        renderCommanderAnnounceFace(view, player.id, rotation);
      } else {
        const viewer = state.players.find((p) => p.id === commanderViewFor)!;
        renderCommanderNumberFace(view, viewer, player, index, commanderViewerRotation);
      }
    } else if (customizing.has(player.id)) {
      const panelContainer = document.createElement("div");
      view.appendChild(panelContainer);
      renderCustomizationPanel(panelContainer, player);

      attachGestureZone(
        panelContainer,
        swipeHandlers(view, rotation, (dir) =>
          transitionView(view, player.id, rotation, dir, () => customizing.delete(player.id))
        )
      );
    } else {
      const face = renderLifeFace(view, player, rotation, index);
      if (isWinner) {
        spawnConfetti(card);
        spawnWinnerChalices(face);

        const winnerBar = document.createElement("div");
        winnerBar.className = "winner-bar";

        const label = document.createElement("span");
        label.className = "winner-label";
        label.textContent = "🏆 Winner";
        winnerBar.appendChild(label);

        const playAgainBtn = document.createElement("button");
        playAgainBtn.className = "winner-reset-btn";
        playAgainBtn.textContent = "Play Again";
        stopPointerDown(playAgainBtn);
        playAgainBtn.addEventListener("click", () => {
          openConfirm({
            title: "Start a new round?",
            message: "Everyone's life totals and counters will reset to starting values.",
            confirmLabel: "Play Again",
            onConfirm: () => {
              gameStore.resetGame();
              clearTableBadges(["initiative", "monarch", "burn"]);
            },
          });
        });
        winnerBar.appendChild(playAgainBtn);

        face.appendChild(winnerBar);
      }
    }

    return card;
  }

  function renderCommanderAnnounceFace(view: HTMLElement, playerId: PlayerId, rotation: number) {
    const face = document.createElement("div");
    face.className = "life-face commander-announce";
    view.appendChild(face);

    const text = document.createElement("div");
    text.className = "commander-announce-text";
    text.textContent = "Commander Damage";
    face.appendChild(text);

    // No tap-to-close here on purpose — closing this view now only happens
    // via the center "Back" button or a swipe, never an accidental tap on
    // the field itself.
    attachGestureZone(
      face,
      swipeHandlers(view, rotation, (dir) =>
        transitionView(view, playerId, rotation, dir, () => (commanderViewFor = null))
      )
    );
  }

  type CommanderSlotRegion = "left-half" | "right-half" | "full";

  function findSlotFace(playerId: PlayerId, region: CommanderSlotRegion): HTMLElement | null {
    return findCard(playerId)?.querySelector<HTMLElement>(`.commander-slot-face.${region}`) ?? null;
  }

  function renderCommanderSlot(
    face: HTMLElement,
    viewer: Player,
    opponent: Player,
    slot: "primary" | "partner",
    value: number,
    viewerRotation: number,
    index: number,
    region: CommanderSlotRegion
  ) {
    const slotFace = document.createElement("div");
    slotFace.className = "commander-slot-face " + region;
    face.appendChild(slotFace);

    const baseKey = `cmd:${viewer.id}:${opponent.id}:${slot}`;

    function applyCommanderDelta(delta: number, intense: boolean, origin: { x: number; y: number }) {
      // Batched so the HUD update (which needs the clamped `actual`, only
      // known after the change) lands in the same single re-render.
      const actual = gameStore.batch(() => {
        const actual = gameStore.adjustCommanderDamage(viewer.id, opponent.id, slot, delta);
        // Commander damage ticking up means the viewer is losing life, so
        // both the HUD and the on-field flash/floating-text (which track net
        // life impact, not "damage dealt") show the inverse of the damage
        // delta. The HUD's own orientation follows the *viewer* (the one
        // actually losing life here), not this slot's own card (the opponent
        // dealing the damage) — those can be different seats.
        if (actual !== 0) updatePendingDelta(baseKey, -actual, viewerRotation);
        return actual;
      });
      if (actual === 0) return;
      // Taking damage rattles the *receiving* seat — a ±10 hold much harder.
      // Undoing damage (actual < 0) doesn't shake anything.
      spawnLifeEffect(effectsLayer, findSlotFace(opponent.id, region), -actual, {
        intense,
        origin,
        shake: actual > 0 ? { target: findCard(viewer.id), strength: intense ? "heavy" : "normal" } : null,
      });
    }

    for (const sign of [-1, 1] as const) {
      const verb = sign < 0 ? "Decrease" : "Increase";
      slotFace.appendChild(
        makeTapZone(
          sign,
          `${baseKey}:${sign < 0 ? "minus" : "plus"}`,
          `${verb} ${slot} commander damage dealt by player ${index + 1}`,
          applyCommanderDelta
        )
      );
    }
    slotFace.appendChild(
      renderNumber(value, { compact: region !== "full", dead: value >= COMMANDER_DAMAGE_LETHAL })
    );
  }

  /**
   * Draws `value` one digit per fixed-width .life-digit span, so a narrow
   * "1" next to a wide "2" can't shift the other digits around (31 -> 32
   * keeps the 3 still).
   */
  function fillDigits(el: HTMLElement, value: number) {
    const text = String(value);
    // role="img" so the label is actually announced as one number, instead
    // of screen readers reading the separate digit spans one by one.
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", text);
    for (const ch of text) {
      const digit = document.createElement("span");
      digit.className = "life-digit";
      digit.textContent = ch;
      el.appendChild(digit);
    }
  }

  function renderCommanderNumberFace(
    view: HTMLElement,
    viewer: Player,
    opponent: Player,
    index: number,
    viewerRotation: number
  ) {
    const face = document.createElement("div");
    face.className = "life-face";
    view.appendChild(face);

    const dmg = viewer.commanderDamage[opponent.id] ?? { primary: 0, partner: 0 };

    if (opponent.hasPartner) {
      // Always a side-by-side split, regardless of seat rotation — every
      // seat's local (pre-rotation) card space is a wide/short landscape
      // rectangle (a 90/270 seat is transposed to match before its own
      // rotation is applied), and splitting a wide-short box top/bottom
      // produces two long, squashed strips. Left/right instead gives each
      // half a much more reasonable shape for a life number plus its
      // tap zones.
      renderCommanderSlot(face, viewer, opponent, "primary", dmg.primary, viewerRotation, index, "left-half");
      renderCommanderSlot(face, viewer, opponent, "partner", dmg.partner, viewerRotation, index, "right-half");
    } else {
      renderCommanderSlot(face, viewer, opponent, "primary", dmg.primary, viewerRotation, index, "full");
    }
  }

  function isPlayerDead(player: Player): boolean {
    if (player.life <= 0) return true;
    return Object.values(player.commanderDamage).some(
      (d) => d.primary >= COMMANDER_DAMAGE_LETHAL || d.partner >= COMMANDER_DAMAGE_LETHAL
    );
  }

  /**
   * Live (not render-time) check: a hold keeps ticking on window listeners
   * after the seat it started on has re-rendered into its dead face, so the
   * hold handlers ask the store directly and stop once the player is dead —
   * otherwise holding "−" kept pushing life to -10, -20, ...
   */
  function isDeadNow(playerId: PlayerId): boolean {
    const live = gameStore.getState()?.players.find((p) => p.id === playerId);
    return !live || isPlayerDead(live);
  }

  /** The last player standing, once everyone else is dead — null otherwise (incl. before anyone's died). */
  function getWinner(state: GameState): Player | null {
    if (state.players.length < 2) return null;
    const alive = state.players.filter((p) => !isPlayerDead(p));
    return alive.length === 1 ? alive[0] : null;
  }

  /** Cheap deterministic pseudo-random in [0,1), so confetti keeps the same per-piece look across re-renders. */
  function seeded(n: number): number {
    const x = Math.sin(n * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function spawnConfetti(card: HTMLElement) {
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const elapsed = Date.now() - BADGE_ANIM_EPOCH;
    for (let i = 0; i < 18; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      const durationMs = (1.8 + seeded(i + 100) * 1.2) * 1000;
      const staggerMs = seeded(i + 200) * 2000;
      piece.style.left = `${(seeded(i) * 100).toFixed(2)}%`;
      piece.style.backgroundColor = PLAYER_COLORS[i % PLAYER_COLORS.length];
      piece.style.animationDuration = `${durationMs}ms`;
      // Winner is re-derived (and this re-spawned) on every state re-render
      // while they stand, so the delay is phased to wall-clock time instead
      // of randomized fresh each time — otherwise the fall visibly "resets"
      // to the top the next time anything else triggers a re-render.
      piece.style.animationDelay = `${-((elapsed + staggerMs) % durationMs)}ms`;
      layer.appendChild(piece);
    }
    card.appendChild(layer);
  }

  /**
   * Two chalices flanking the winner's life total, inside .card-center's
   * flex row (life-number is its only other child, so these land either
   * side of it, centered as a group). Reuses the table badges' bob
   * animation/epoch so it reads as the same "floater" family.
   */
  function spawnWinnerChalices(face: HTMLElement) {
    const center = face.querySelector<HTMLElement>(".card-center");
    if (!center) return;
    const lifeNum = center.querySelector(".life-number");

    const elapsed = Date.now() - BADGE_ANIM_EPOCH;
    const delay = `${-(elapsed % BADGE_BOB_DURATION_MS)}ms`;

    function makeChalice(): HTMLElement {
      const img = document.createElement("img");
      img.src = "/icons/chalice.png";
      img.alt = "";
      img.className = "winner-chalice";
      img.style.animationDelay = delay;
      return img;
    }

    center.insertBefore(makeChalice(), lifeNum);
    center.appendChild(makeChalice());
  }

  /**
   * Puts each card's milestone watermark in the top corner (in that seat's
   * own orientation) on the far side from the center clock, so the two
   * never crowd each other. Needs real layout, so it runs after `container`
   * is attached; a seat with the clock dead-center beside it (the 6-player
   * side seats) just keeps the default left corner.
   */
  function placeWatermarks(clock: HTMLElement) {
    const c = clock.getBoundingClientRect();
    const clockX = c.left + c.width / 2;
    const clockY = c.top + c.height / 2;
    // Measure every card before touching any class, so one layout serves all.
    const sides = [...root.querySelectorAll<HTMLElement>(".card-watermark")].map((mark) => {
      const card = mark.closest<HTMLElement>(".player-card")!;
      const r = card.getBoundingClientRect();
      const [localDx] = toLocalVector(clockX - (r.left + r.width / 2), clockY - (r.top + r.height / 2), Number(card.dataset.rotation ?? "0"));
      return [mark, localDx < -1 ? "right" : "left"] as const;
    });
    for (const [mark, side] of sides) mark.classList.add(side);
  }

  /**
   * A draggable marker for table state like initiative/monarch/dealer —
   * purely cosmetic, except the burn flame (see burnOpponents). Dropping
   * it over a player's card orients it to match that seat's life-total
   * direction.
   */
  function renderBadge(key: BadgeKey): HTMLElement {
    const b = getBadgeState(key);
    const def = BADGES[key];
    const fallbackRotation = b.rotation;
    const el = document.createElement("div");
    el.className = "table-badge" + (key === "burn" && burnActive ? " burning" : "");
    el.dataset.badgeKey = key;
    el.style.left = `${b.xPct}%`;
    el.style.top = `${b.yPct}%`;

    // The outer element only ever carries position (left/top + centering
    // transform); rotation and the bob animation live on the icon's body
    // so the two sets of transforms/animations don't fight each other.
    const elapsed = Date.now() - BADGE_ANIM_EPOCH;
    // Every looping light effect below reads this as its animation-delay,
    // phased to the same wall-clock epoch as the bob, so a re-render (every
    // life tap) doesn't visibly restart the flicker/rays/glints.
    el.style.setProperty("--badge-t", `${-elapsed}ms`);

    // Some badges light up the table around them (torch firelight, the
    // crown's soft glow, the flame's embers). Sits behind the body,
    // unrotated, so it stays centered on the badge.
    if (def.light) {
      const light = document.createElement("div");
      light.className = `badge-light badge-light-${key}`;
      el.appendChild(light);
    }

    const body = document.createElement("div");
    body.className = "table-badge-icon" + (def.bob ? "" : " no-bob");
    if (b.rotation) body.style.rotate = `${b.rotation}deg`;
    if (def.bob) body.style.animationDelay = `${-(elapsed % BADGE_BOB_DURATION_MS)}ms`;
    const icon = document.createElement("img");
    icon.src = def.icon;
    icon.alt = def.alt;
    icon.className = `table-badge-img table-badge-img-${key}`;
    body.appendChild(icon);

    if (def.glint) {
      // A bright band of light sweeping across the badge (masked to its own
      // shape) — often on the crown, only once in a long while on the chip.
      const glint = document.createElement("div");
      glint.className = `badge-glint badge-glint-${key}`;
      glint.style.maskImage = `url(${def.icon})`;
      glint.style.webkitMaskImage = `url(${def.icon})`;
      body.appendChild(glint);
    }
    if (def.sparkles) {
      // Plus a few star glints popping on the crown's points.
      for (let i = 0; i < 3; i++) {
        const sparkle = document.createElement("span");
        sparkle.className = `badge-sparkle sparkle-${i}`;
        body.appendChild(sparkle);
      }
    }
    el.appendChild(body);

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const gameScreen = el.closest<HTMLElement>(".game-screen");
      if (!gameScreen) return;
      const rect = gameScreen.getBoundingClientRect();
      const controller = new AbortController();
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      let burnHold: ReturnType<typeof setTimeout> | null = null;
      let burnTicks: ReturnType<typeof setInterval> | null = null;

      function startDrag() {
        dragging = true;
        // Tracking happens via window listeners regardless, so the badge
        // itself never needs to receive pointer events during the drag — and
        // must not, or it'll shadow itself as the hit-test target on drop.
        el.style.pointerEvents = "none";
        el.classList.add("dragging");
        badgeDragging = true;
      }

      function setBurning(on: boolean) {
        burnActive = on;
        root.querySelector(`[data-badge-key="burn"]`)?.classList.toggle("burning", on);
      }

      function stopBurn() {
        if (burnHold) clearTimeout(burnHold);
        if (burnTicks) clearInterval(burnTicks);
        burnHold = burnTicks = null;
        if (burnActive) setBurning(false);
      }

      // The burn flame doubles as a button: held still for the same delay
      // as a ±10 life hold, it burns on the same cadence; it only becomes a
      // drag once the finger actually moves. A quick tap does nothing, so
      // nudging it can't deal damage by accident.
      if (key === "burn") {
        burnHold = setTimeout(() => {
          burnHold = null;
          setBurning(true);
          burnOpponents();
          burnTicks = setInterval(burnOpponents, HOLD_INTERVAL_MS);
        }, HOLD_DELAY_MS);
      } else {
        startDrag();
      }

      function moveTo(clientX: number, clientY: number) {
        const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
        const live = root.querySelector<HTMLElement>(`[data-badge-key="${key}"]`);
        if (live) {
          live.style.left = `${xPct}%`;
          live.style.top = `${yPct}%`;
        }
        return { xPct, yPct };
      }

      function onMove(ev: PointerEvent) {
        if (ev.pointerId !== e.pointerId) return;
        if (!dragging) {
          // Once it's burning the flame stays put for the rest of the press.
          if (burnActive || Math.hypot(ev.clientX - startX, ev.clientY - startY) < BADGE_DRAG_SLOP) return;
          stopBurn();
          startDrag();
        }
        moveTo(ev.clientX, ev.clientY);
      }

      function onUp(ev: PointerEvent) {
        if (ev.pointerId !== e.pointerId) return;
        controller.abort();
        stopBurn();
        if (!dragging) return;
        const { xPct, yPct } = moveTo(ev.clientX, ev.clientY);
        // Hit-test for the drop target while still "none" (set at pointerdown)
        // so the badge doesn't shadow itself — only restore afterward. A
        // re-render mid-drag replaces the badge with a fresh element that
        // *does* take pointer events, so silence that one too.
        const live = root.querySelector<HTMLElement>(`[data-badge-key="${key}"]`);
        if (live) live.style.pointerEvents = "none";
        const elAtPoint = document.elementFromPoint(ev.clientX, ev.clientY);
        if (live) live.style.pointerEvents = "";
        el.style.pointerEvents = "";
        el.classList.remove("dragging");
        badgeDragging = false;
        const card = elAtPoint?.closest<HTMLElement>(".player-card") ?? null;
        const rotation = card ? Number(card.dataset.rotation ?? "0") : fallbackRotation;
        setBadgePosition(key, xPct, yPct, rotation);
      }

      // Only follow the finger that grabbed the badge — another player
      // tapping their card mid-drag must not yank it across the table.
      window.addEventListener("pointermove", onMove, { signal: controller.signal });
      window.addEventListener("pointerup", onUp, { signal: controller.signal });
      window.addEventListener("pointercancel", onUp, { signal: controller.signal });
    });

    return el;
  }

  /**
   * One tick of a held burn flame: 1 damage to every living player except
   * whoever's card the flame sits on (nobody is spared if it's parked off
   * every card), each hit card giving a light shake.
   */
  function burnOpponents() {
    const state = gameStore.getState();
    const screen = root.querySelector<HTMLElement>(".game-screen");
    const b = getBadgeState("burn");
    if (!state || !screen) return;
    const ownerCard = state.players
      .map((p) => findCard(p.id))
      .find((card) => card && isPointOverCard(b.xPct, b.yPct, card, screen));
    const ownerId = ownerCard?.dataset.playerId;
    const targets = state.players.filter((p) => p.id !== ownerId && !isDeadNow(p.id));
    if (targets.length === 0) return;

    updatePendingDelta("burn", -1, Number(ownerCard?.dataset.rotation ?? "0"));
    // All the damage as one change (one re-render), then the effects on
    // the freshly rendered cards.
    gameStore.batch(() => {
      for (const t of targets) gameStore.adjustLife(t.id, -1);
    });
    for (const t of targets) {
      const card = findCard(t.id);
      spawnLifeEffect(effectsLayer, card, -1, { rings: false, shake: { target: card, strength: "light" } });
    }
  }

  /** Shared by both the normal life-face and the dead-face swipe handlers. */
  function openCommanderViewWithExit(view: HTMLElement, playerId: PlayerId, rotation: number, dir: Dir) {
    transitionView(view, playerId, rotation, dir, () => (commanderViewFor = playerId));
  }

  function renderDeadFace(view: HTMLElement, player: Player, rotation: number): HTMLElement {
    const face = document.createElement("div");
    face.className = "life-face dead-face";
    view.appendChild(face);

    const skull = document.createElement("img");
    skull.className = "dead-skull";
    skull.src = "/icons/skull.png";
    skull.alt = "";
    face.appendChild(skull);

    const reviveBtn = document.createElement("button");
    reviveBtn.className = "revive-btn";
    reviveBtn.textContent = "Revive";
    stopPointerDown(reviveBtn);
    reviveBtn.addEventListener("click", () => gameStore.revivePlayer(player.id));
    face.appendChild(reviveBtn);

    // Still swipeable even while dead, so a player who died to commander
    // damage can check who dealt it without reviving first. A dead seat has
    // no "up" action, so every swipe direction opens the commander view —
    // unlike the live life-face, there's no customization panel to route to.
    attachGestureZone(
      face,
      swipeHandlers(view, rotation, (dir) => openCommanderViewWithExit(view, player.id, rotation, dir))
    );

    return face;
  }

  /**
   * One pill per opponent who has actually dealt this player commander
   * damage — unlike an earlier version, a dealer with none isn't rendered
   * at all (not even hidden), so the row is only ever as wide as it needs
   * to be and stays centered as entries join: the first pill is centered
   * alone, a second recenters the pair around it, and so on. Each pill's
   * *width* still comes from the game's total opponent count, not how many
   * are currently shown — set as `--cmd-pill-count` and referenced by
   * .cmd-damage-bar's CSS `calc()` — so an existing pill never resizes
   * just because another opponent starts or stops dealing damage.
   *
   * Ordered by the current arrangement's actual table geometry — see
   * `GridLayout.clockwiseOrder` in layout.ts — starting right after this
   * player's own seat and wrapping around to end on the seat right before
   * it, so the left-most pill is the next player clockwise and the
   * right-most is the nearest one counter-clockwise, with every other
   * seat's pill (if shown) falling in between in that same order. Plain
   * seat-index order is *not* a safe stand-in for this: e.g. "quad" seats
   * index 2 and 3 diagonally opposite 0 and 1, not adjacent to them.
   *
   * Each shown pill fills to `min(total, 20)` of 20 — 21 is already lethal
   * and handled by the dead-face takeover, so the bar never needs to
   * represent it.
   */
  function renderCommanderDamageBars(viewer: Player): HTMLElement | null {
    const state = gameStore.getState();
    if (!state) return null;
    const n = state.players.length;
    if (n < 2) return null;
    const viewerSeatIndex = state.players.findIndex((p) => p.id === viewer.id);
    if (viewerSeatIndex === -1) return null;

    const layout = getLayout(n, state.settings.arrangementId);
    const cwOrder = getClockwiseOrder(layout, n);
    const posInOrder = cwOrder.indexOf(viewerSeatIndex);
    if (posInOrder === -1) return null;

    const bars = document.createElement("div");
    bars.className = "cmd-damage-bars";
    bars.style.setProperty("--cmd-pill-count", String(n - 1));
    for (let step = 1; step < n; step++) {
      const dealer = state.players[cwOrder[(posInOrder + step) % n]];
      const dmg = viewer.commanderDamage[dealer.id];
      const total = dmg ? dmg.primary + dmg.partner : 0;
      if (total === 0) continue;

      const bar = document.createElement("div");
      bar.className = "cmd-damage-bar";
      const fill = document.createElement("div");
      fill.className = "cmd-damage-bar-fill";
      fill.style.width = `${(Math.min(total, 20) / 20) * 100}%`;
      fill.style.background = dealer.color;
      bar.appendChild(fill);
      bars.appendChild(bar);
    }
    return bars;
  }

  function renderLifeFace(view: HTMLElement, player: Player, rotation: number, index: number): HTMLElement {
    if (isPlayerDead(player)) return renderDeadFace(view, player, rotation);

    const face = document.createElement("div");
    face.className = "life-face";
    view.appendChild(face);

    // A player earns at most one milestone per game (see milestones.ts).
    // Its silhouette sits faintly behind everything else in a top corner;
    // which one is picked after layout by placeWatermarks.
    const milestone = player.badges[0] ? MILESTONE_BADGES[player.badges[0]] : undefined;
    if (milestone) {
      const mark = document.createElement("div");
      mark.title = milestone.label;
      if ("text" in milestone) {
        mark.className = "card-watermark card-watermark-text";
        mark.textContent = milestone.text;
      } else {
        mark.className = "card-watermark";
        mark.style.maskImage = `url(${milestone.watermark})`;
        mark.style.webkitMaskImage = `url(${milestone.watermark})`;
      }
      face.appendChild(mark);
    }


    // A swipe's meaning (open customization vs. commander) depends on the
    // seat's own "up" direction, not the raw screen direction it was made
    // in — a seat rotated 90/270 (the court family's end seats) has its
    // local up/down axis running along the *screen's* left/right axis, so
    // e.g. a physical left/right swipe there opens customization while
    // up/down opens commander, the reverse of an upright or 180 seat.
    function routeSwipe(dir: Dir) {
      const local = localDir(dir, rotation);
      if (local === "left" || local === "right") openCommanderViewWithExit(view, player.id, rotation, dir);
      else transitionView(view, player.id, rotation, dir, () => customizing.add(player.id));
    }

    const lifeKey = `life:${player.id}`;
    function applyLife(delta: number, intense: boolean, origin: { x: number; y: number }) {
      // A hold keeps ticking after this seat re-renders into its dead face.
      if (intense && isDeadNow(player.id)) return;
      updatePendingDelta(lifeKey, delta, rotation);
      gameStore.adjustLife(player.id, delta);
      spawnLifeEffect(effectsLayer, findCard(player.id), delta, { intense, origin });
    }
    const swipes = swipeHandlers(view, rotation, routeSwipe);
    for (const sign of [-1, 1] as const) {
      const side = sign < 0 ? "minus" : "plus";
      const verb = sign < 0 ? "decrease" : "increase";
      face.appendChild(makeTapZone(sign, `${lifeKey}:${side}`, `Player ${index + 1} ${verb} life`, applyLife, swipes));
    }

    // (A dead player never gets here — see renderDeadFace above.)
    face.appendChild(renderNumber(player.life));

    const cmdBars = renderCommanderDamageBars(player);
    if (cmdBars) face.appendChild(cmdBars);

    return face;
  }

  const unsubscribe = gameStore.subscribe(render);
  const unsubscribeBadges = subscribeBadges(render);
  render();

  return () => {
    unsubscribe();
    unsubscribeBadges();
    if (timerInterval) clearInterval(timerInterval);
  };
}
