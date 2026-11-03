# Tile

A pass-and-play life counter for Commander (EDH): one shared Android tablet
in the middle of the table, the screen split into one tile per player, each
turned to face its seat. Pixel-art styled, built with TypeScript + Vite and
wrapped for Android with Capacitor. No backend, no network, no accounts:
everything runs and is saved locally on the device.

## Features

- **2–6 players** in several table arrangements (stacked or side by side,
  three-seat layouts, face-off, and "tennis court" with seats at the
  ends), configurable starting life; remembers your last setup.
- **Life totals:** tap − / + for ±1, hold for ±10. Digits keep fixed
  positions so totals don't jump around as they change.
- **Commander damage:** swipe a tile sideways to see the damage each
  opponent's commander has dealt you, right on their tiles; tap/hold to
  adjust (capped at 21, lethal). Partner commanders get split counters.
  Small bars on your own tile show who has hit you so far.
- **Customize:** swipe a tile up/down to pick its color or turn on a
  partner commander.
- **Death and victory:** a player at 0 life or 21 commander damage shows a
  skull (with Revive); the last player standing gets confetti and a
  Play Again button.
- **Table badges** you drag onto a tile: Initiative (torch), Monarch
  (crown), Dealer (first-player chip), and **Burn** (flame) — hold it to
  deal 1 damage per tick to every other living player.
- **Milestones:** a life total that sits on 1, 13, 21, 67, 69 or 100+ for a
  few seconds earns that player a watermark.
- **Two styles:** Retro (arcade neon) and Dungeon (mossy stone and torch
  light).
- Haptic feedback, game timer, and tablet-friendly native behavior: keeps
  the screen awake, locks to landscape, pins the app so a stray swipe
  doesn't leave it. Fonts are bundled, so it works fully offline.

The center clock opens Settings (players, starting life, style, badges,
reset, credits).

## Development

Needs Node 20.19+ or 22.12+ (Vite 8).

```bash
npm install
npm run dev       # Vite dev server
npm run build     # type-check + production build to dist/
```

## Building the Android app

Requirements on your machine:

- **JDK 21** — `capacitor-android` targets Java 21; JDK 17 fails with
  `invalid source release: 21`. Point `JAVA_HOME` at it.
- **Android SDK** (Android Studio, or the standalone command-line tools)
  with `ANDROID_HOME` set.

```bash
npm run android:build-debug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```

That builds the web app, copies it into `android/` (`npx cap sync`), and
runs Gradle. Capacitor only picks up web changes on sync, so re-run it
after changing anything in `src/`. To work in Android Studio instead:
`npm run cap:sync` then `npm run cap:open`.

### CI

Every push to `master` (or `main`) runs
[`.github/workflows/android.yml`](.github/workflows/android.yml), which
builds the same debug APK and attaches it to the run as a downloadable
artifact (kept 30 days). It can also be started by hand from the Actions
tab.

## Art and icons

- Launcher icon, splash screens and favicon: `python3 scripts/gen_icon.py`
  (needs Pillow). Edit the script rather than the generated PNGs.
- Dealer chip and the crown's shine: `python3 scripts/gen_badges.py`.
- Third-party art and fonts are credited in the app (Settings → Credits)
  and in `public/icons/CREDITS.txt` / `public/watermarks/CREDITS.txt`.
