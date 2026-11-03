import { openOverlay } from "./overlay";

export function openConfirm(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  const { close, contentEl } = openOverlay({ className: "confirm-dialog" });

  const title = document.createElement("h2");
  title.textContent = opts.title;
  contentEl.appendChild(title);

  const message = document.createElement("p");
  message.textContent = opts.message;
  contentEl.appendChild(message);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "dialog-btn";
  cancelBtn.textContent = opts.cancelLabel ?? "Cancel";
  cancelBtn.addEventListener("click", close);
  actions.appendChild(cancelBtn);

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "dialog-btn dialog-btn-danger";
  confirmBtn.textContent = opts.confirmLabel ?? "Confirm";
  confirmBtn.addEventListener("click", () => {
    close();
    opts.onConfirm();
  });
  actions.appendChild(confirmBtn);

  contentEl.appendChild(actions);
}
