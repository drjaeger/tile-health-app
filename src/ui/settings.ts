import { gameStore } from "../state";
import { saveLastSettings } from "../setupStorage";
import { loadTheme, saveTheme, applyTheme } from "../theme";
import type { ThemeId } from "../theme";
import { openOverlay } from "./overlay";
import { openConfirm } from "./confirm";
import { openArrangementScreen } from "./arrangement";
import { openCredits } from "./credits";
import { BADGES, BADGE_KEYS, isBadgeEnabled, toggleBadgeEnabled, clearTableBadges } from "../badgeStore";

export function openSettings() {
  const state = gameStore.getState();
  if (!state) return;

  const originalSettings = state.settings;
  let startingLife = originalSettings.startingLife;

  const { close, contentEl } = openOverlay({ className: "settings-dialog" });

  function render() {
    contentEl.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "Settings";
    contentEl.appendChild(title);

    // Players & arrangement
    const playersRow = document.createElement("div");
    playersRow.className = "setup-row";
    const playersLabel = document.createElement("label");
    playersLabel.textContent = "Players";
    playersRow.appendChild(playersLabel);
    const changePlayersBtn = document.createElement("button");
    changePlayersBtn.className = "toggle-btn";
    changePlayersBtn.textContent = "Change Players";
    changePlayersBtn.addEventListener("click", () => {
      close();
      openArrangementScreen();
    });
    playersRow.appendChild(changePlayersBtn);
    contentEl.appendChild(playersRow);

    // Starting life stepper
    const lifeRow = document.createElement("div");
    lifeRow.className = "setup-row";
    const lifeLabel = document.createElement("label");
    lifeLabel.textContent = "Life max";
    lifeRow.appendChild(lifeLabel);
    const lifeControls = document.createElement("div");
    lifeControls.className = "stepper";
    const lifeMinus = document.createElement("button");
    lifeMinus.textContent = "−";
    lifeMinus.className = "stepper-btn";
    lifeMinus.addEventListener("click", () => {
      startingLife = Math.max(1, startingLife - 5);
      render();
    });
    const lifeValue = document.createElement("span");
    lifeValue.className = "stepper-value";
    lifeValue.textContent = String(startingLife);
    const lifePlus = document.createElement("button");
    lifePlus.textContent = "+";
    lifePlus.className = "stepper-btn";
    lifePlus.addEventListener("click", () => {
      startingLife += 5;
      render();
    });
    lifeControls.append(lifeMinus, lifeValue, lifePlus);
    lifeRow.appendChild(lifeControls);
    contentEl.appendChild(lifeRow);

    const divider1 = document.createElement("div");
    divider1.className = "settings-divider";
    contentEl.appendChild(divider1);

    // Style
    const styleRow = document.createElement("div");
    styleRow.className = "setup-row";
    const styleLabel = document.createElement("label");
    styleLabel.textContent = "Style";
    styleRow.appendChild(styleLabel);
    const styleControls = document.createElement("div");
    styleControls.className = "segmented-row";
    const currentTheme = loadTheme();
    const styleOptions: { id: ThemeId; label: string }[] = [
      { id: "dungeon", label: "Retro" },
      { id: "castlevania", label: "Dungeon" },
    ];
    for (const opt of styleOptions) {
      const btn = document.createElement("button");
      btn.className = "toggle-btn" + (opt.id === currentTheme ? " active" : "");
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        applyTheme(opt.id);
        saveTheme(opt.id);
        gameStore.remapToTheme(opt.id);
        render();
      });
      styleControls.appendChild(btn);
    }
    styleRow.appendChild(styleControls);
    contentEl.appendChild(styleRow);

    // Table badges — purely cosmetic draggable markers, no gameplay effect.
    const badgesRow = document.createElement("div");
    // The badge buttons wrap onto a second line on narrow screens — align
    // the label to the top of the first line instead of the vertical
    // center of both lines, which reads as misaligned/floating between them.
    badgesRow.className = "setup-row setup-row-top";
    const badgesLabel = document.createElement("label");
    badgesLabel.textContent = "Badges";
    badgesRow.appendChild(badgesLabel);
    const badgesControls = document.createElement("div");
    badgesControls.className = "segmented-row";
    for (const key of BADGE_KEYS) {
      const { icon, label } = BADGES[key];
      const btn = document.createElement("button");
      btn.className = "toggle-btn dialog-btn-icon" + (isBadgeEnabled(key) ? " active" : "");
      btn.innerHTML = `<img src="${icon}" class="dialog-btn-icon-img" alt="" /> ${label}`;
      btn.addEventListener("click", () => {
        toggleBadgeEnabled(key);
        render();
      });
      badgesControls.appendChild(btn);
    }
    badgesRow.appendChild(badgesControls);
    contentEl.appendChild(badgesRow);

    const divider2 = document.createElement("div");
    divider2.className = "settings-divider";
    contentEl.appendChild(divider2);

    const resetBtn = document.createElement("button");
    resetBtn.className = "dialog-btn dialog-btn-danger";
    resetBtn.textContent = "Reset Game";
    resetBtn.addEventListener("click", () => {
      close();
      openConfirm({
        title: "Reset this game?",
        message: `All life totals and counters will be reset back to ${startingLife}.`,
        confirmLabel: "Reset",
        onConfirm: () => {
          const settings = { ...originalSettings, startingLife };
          saveLastSettings(settings);
          gameStore.resetGame({ startingLife });
          clearTableBadges(["initiative", "monarch", "burn"]);
        },
      });
    });
    contentEl.appendChild(resetBtn);

    // Opens on top of Settings, so closing it lands back here.
    const creditsBtn = document.createElement("button");
    creditsBtn.className = "dialog-btn settings-credits-btn";
    creditsBtn.textContent = "Credits";
    creditsBtn.addEventListener("click", openCredits);
    contentEl.appendChild(creditsBtn);
  }

  render();
}
