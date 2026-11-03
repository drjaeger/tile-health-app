# Tile

A pass-and-play multiplayer life counter for Commander (EDH) — one shared
device, screen split into per-player zones (rotated for players sitting
across the table), built with TypeScript + Vite and wrapped for Android
via Capacitor. No backend, no network — everything runs locally on the
device.

## Features

- 2–6 players, configurable starting life, remembers your last setup
- Split-screen life grid: tap/hold to change life, rotated zones for the
  far side of the table so everyone reads their own total right-side up
- Commander damage tracking per opponent (with partner/background
  commander support) and a 21-damage lethal flag
- Poison/infect counters (10 = lethal), toggle on/off per game
- Custom counters (experience, energy, etc.) per player
- Undo (full action log), turn tracking, dice roller / coin flip
- Confirm-guarded "New Game" reset
- Dark theme suited for late-night table play

## Development

```bash
npm install
npm run dev       # starts Vite dev server
npm run build     # type-checks and builds to dist/
```

## Building the Android app

The native Android project already exists under `android/` (added via
Capacitor). To build it you need, **on your own machine**:

- **JDK 17** (Android Gradle Plugin requires it — Android Studio bundles
  one, or `brew install openjdk@17` and point `JAVA_HOME` at it)
- **Android SDK** (installed via Android Studio, or standalone
  command-line tools) with `ANDROID_HOME`/`ANDROID_SDK_ROOT` set

Then:

```bash
npm run cap:sync          # builds the web app and copies it into android/
npm run cap:open          # opens the project in Android Studio
```

From Android Studio you can run it on a connected device/emulator, or
build → Build Bundle(s)/APK(s) → Build APK(s) to get an installable APK.

Alternatively, from the command line once JDK 17 + the SDK are set up:

```bash
npm run android:build-debug
# APK lands at android/app/build/outputs/apk/debug/app-debug.apk
```

After changing any web code, re-run `npm run cap:sync` before rebuilding
the Android app — Capacitor only picks up `dist/` on sync, not live.

## iOS (future)

Once ready, add the iOS platform the same way:

```bash
npm install @capacitor/ios
npx cap add ios
npx cap open ios
```

This requires a Mac with Xcode installed.
