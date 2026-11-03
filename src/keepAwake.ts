/**
 * Keeps the screen from dimming/locking mid-game in a plain browser. (The
 * Android app doesn't need this — MainActivity sets FLAG_KEEP_SCREEN_ON,
 * which works even where the WebView lacks the Wake Lock API.)
 */
export function keepScreenAwake() {
  if (!("wakeLock" in navigator)) return;
  const request = () => {
    navigator.wakeLock.request("screen").catch(() => {});
  };
  request();
  // The browser drops the lock whenever the tab is hidden, so take it again
  // on coming back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") request();
  });
}
