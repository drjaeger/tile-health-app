import { Haptics, ImpactStyle } from "@capacitor/haptics";

// Fire-and-forget: a device without a vibration motor (or a desktop browser
// without navigator.vibrate) rejects, and that must never break a life tap.
function safely(p: Promise<void>) {
  p.catch(() => {});
}

// One burn tick or commander-damage volley touches several cards in the
// same instant — buzz once for the whole thing, not once per card.
const MIN_GAP_MS = 60;
let lastBuzz = 0;

/** A life change: a light tick for a single tap, a firmer one for a hold-repeat. */
export function hapticLifeChange(intense: boolean) {
  const now = Date.now();
  if (now - lastBuzz < MIN_GAP_MS) return;
  lastBuzz = now;
  safely(Haptics.impact({ style: intense ? ImpactStyle.Medium : ImpactStyle.Light }));
}

/** A player just died — long enough to notice over the tap buzzes. */
export function hapticDeath() {
  lastBuzz = Date.now();
  safely(Haptics.vibrate({ duration: 400 }));
}
