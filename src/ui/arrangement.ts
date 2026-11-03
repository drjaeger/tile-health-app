import { gameStore } from "../state";
import { saveLastSettings } from "../setupStorage";
import { MIN_PLAYERS, MAX_PLAYERS } from "../types";
import type { ArrangementId } from "../types";
import { ARRANGEMENTS_BY_COUNT, defaultArrangementFor, getLayout } from "../layout";
import { getThemePalette } from "../palette";
import { loadTheme } from "../theme";
import { openOverlay } from "./overlay";
import { openConfirm } from "./confirm";
import { BADGE_KEYS, clearTableBadges } from "../badgeStore";
import { fitRotated } from "../rotatedFit";

export function openArrangementScreen() {
  const state = gameStore.getState();
  if (!state) return;

  const originalSettings = state.settings;
  let playerCount = originalSettings.playerCount;
  let arrangementId: ArrangementId = originalSettings.arrangementId;
  const { close, contentEl } = openOverlay({ className: "arrangement-dialog", dismissible: false });

  function buildPreview(count: number, id: ArrangementId): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "arrangement-preview";
    const layout = getLayout(count, id);
    preview.style.gridTemplateAreas = layout.areas;
    preview.style.gridTemplateColumns = layout.columnTemplate ?? `repeat(${layout.columns}, 1fr)`;
    const palette = getThemePalette(loadTheme());
    for (let i = 0; i < count; i++) {
      const seat = document.createElement("div");
      seat.className = "arrangement-seat";
      seat.style.gridArea = `p${i}`;
      seat.style.background = palette[i % palette.length];
      const number = document.createElement("span");
      number.textContent = String(i + 1);
      const rotation = layout.rotation[i] ?? 0;
      if (rotation === 90 || rotation === 270) {
        fitRotated(seat, number, rotation);
      } else {
        if (rotation === 180) number.style.transform = "rotate(180deg)";
        seat.appendChild(number);
      }
      preview.appendChild(seat);
    }
    return preview;
  }

  function render() {
    contentEl.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "Players & Arrangement";
    contentEl.appendChild(title);

    // Player count stepper
    const countRow = document.createElement("div");
    countRow.className = "setup-row";
    const countLabel = document.createElement("label");
    countLabel.textContent = "Players";
    countRow.appendChild(countLabel);
    const countControls = document.createElement("div");
    countControls.className = "stepper";
    const minusBtn = document.createElement("button");
    minusBtn.className = "stepper-btn";
    minusBtn.textContent = "−";
    minusBtn.disabled = playerCount <= MIN_PLAYERS;
    minusBtn.addEventListener("click", () => {
      playerCount = Math.max(MIN_PLAYERS, playerCount - 1);
      arrangementId = defaultArrangementFor(playerCount);
      render();
    });
    const countValue = document.createElement("span");
    countValue.className = "stepper-value";
    countValue.textContent = String(playerCount);
    const plusBtn = document.createElement("button");
    plusBtn.className = "stepper-btn";
    plusBtn.textContent = "+";
    plusBtn.disabled = playerCount >= MAX_PLAYERS;
    plusBtn.addEventListener("click", () => {
      playerCount = Math.min(MAX_PLAYERS, playerCount + 1);
      arrangementId = defaultArrangementFor(playerCount);
      render();
    });
    countControls.append(minusBtn, countValue, plusBtn);
    countRow.appendChild(countControls);
    contentEl.appendChild(countRow);

    // Arrangement picker — one clickable mini-preview per option for this count.
    const arrLabel = document.createElement("label");
    arrLabel.className = "setup-row";
    arrLabel.textContent = "Arrangement";
    contentEl.appendChild(arrLabel);

    const options = document.createElement("div");
    options.className = "arrangement-options";
    const choices = ARRANGEMENTS_BY_COUNT[playerCount] ?? [];
    for (const choice of choices) {
      const card = document.createElement("button");
      card.className = "arrangement-option" + (choice.id === arrangementId ? " active" : "");
      card.appendChild(buildPreview(playerCount, choice.id));
      const label = document.createElement("span");
      label.className = "arrangement-option-label";
      label.textContent = choice.label;
      card.appendChild(label);
      card.addEventListener("click", () => {
        arrangementId = choice.id;
        render();
      });
      options.appendChild(card);
    }
    contentEl.appendChild(options);

    const actions = document.createElement("div");
    actions.className = "dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "dialog-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", close);
    actions.appendChild(cancelBtn);
    contentEl.appendChild(actions);

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "dialog-btn dialog-btn-primary";
    confirmBtn.textContent = "Start";
    confirmBtn.addEventListener("click", () => {
      close();
      openConfirm({
        title: "Restart with these settings?",
        message: "This will reset the current game with the chosen player count and arrangement.",
        confirmLabel: "Start",
        onConfirm: () => {
          const settings = { ...originalSettings, playerCount, arrangementId };
          saveLastSettings(settings);
          gameStore.startGame(settings);
          // A new game may reshuffle seats entirely, so any floating
          // badge's position (and the old dealer/initiative/monarch
          // assignment) no longer means anything.
          clearTableBadges(BADGE_KEYS);
        },
      });
    });
    contentEl.appendChild(confirmBtn);
  }

  render();
}
