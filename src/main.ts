// Bundled (not loaded from Google Fonts) so the app keeps its fonts on a
// tablet with no network. Latin subset only, to keep the APK small.
import "@fontsource/concert-one/latin-400.css";
import "@fontsource/press-start-2p/latin-400.css";
import "@fontsource/vt323/latin-400.css";
import "./style.css";
import { gameStore } from "./state";
import { loadLastSettings, saveLastSettings } from "./setupStorage";
import { loadTheme, applyTheme } from "./theme";
import { DEFAULT_PLAYER_COUNT, DEFAULT_STARTING_LIFE } from "./types";
import { defaultArrangementFor } from "./layout";
import { startMilestoneWatcher } from "./milestones";
import { renderGameScreen } from "./ui/game";
import { keepScreenAwake } from "./keepAwake";

applyTheme(loadTheme());
keepScreenAwake();

const app = document.querySelector<HTMLDivElement>("#app")!;

if (!gameStore.tryRestore()) {
  const settings = loadLastSettings() ?? {
    playerCount: DEFAULT_PLAYER_COUNT,
    startingLife: DEFAULT_STARTING_LIFE,
    arrangementId: defaultArrangementFor(DEFAULT_PLAYER_COUNT),
  };
  saveLastSettings(settings);
  gameStore.startGame(settings);
}

startMilestoneWatcher();
renderGameScreen(app);
