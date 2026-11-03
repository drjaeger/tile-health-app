import { gameStore } from "../../state";
import { getThemePalette } from "../../palette";
import { loadTheme } from "../../theme";
import type { Player } from "../../types";

/** Keeps a press on a control inside a card from also starting that card's swipe/tap gesture. */
export function stopPointerDown(el: HTMLElement) {
  el.addEventListener("pointerdown", (e) => e.stopPropagation());
}

export function renderCustomizationPanel(container: HTMLElement, player: Player) {
  container.innerHTML = "";
  container.className = "panel-wrapper customization-panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Customize";
  container.appendChild(title);

  const bgTitle = document.createElement("div");
  bgTitle.className = "panel-subtitle";
  bgTitle.textContent = "Color";
  container.appendChild(bgTitle);

  const bgRow = document.createElement("div");
  bgRow.className = "panel-swatch-row";

  // Solid colors — neon-arcade under Retro, muted/gothic under Dungeon —
  // picking one also sets this player's identity color.
  for (const color of getThemePalette(loadTheme())) {
    const swatch = document.createElement("button");
    const selected = player.color === color;
    swatch.className = "panel-bg-swatch" + (selected ? " selected" : "");
    swatch.style.backgroundColor = color;
    swatch.setAttribute("aria-label", `Color ${color}`);
    stopPointerDown(swatch);
    swatch.addEventListener("click", () => {
      gameStore.setPlayerColor(player.id, color);
    });
    bgRow.appendChild(swatch);
  }
  container.appendChild(bgRow);

  const partnerRow = document.createElement("label");
  partnerRow.className = "panel-toggle-row";
  const partnerCheckbox = document.createElement("input");
  partnerCheckbox.type = "checkbox";
  partnerCheckbox.checked = player.hasPartner;
  stopPointerDown(partnerCheckbox);
  partnerCheckbox.addEventListener("change", () => {
    gameStore.setHasPartner(player.id, partnerCheckbox.checked);
  });
  partnerRow.append(partnerCheckbox, " Partner commander");
  container.appendChild(partnerRow);

  const hint = document.createElement("div");
  hint.className = "panel-hint";
  hint.textContent = "swipe to return";
  container.appendChild(hint);
}
