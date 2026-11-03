let overlayRoot: HTMLElement | null = null;

function getOverlayRoot(): HTMLElement {
  if (!overlayRoot) {
    overlayRoot = document.createElement("div");
    overlayRoot.id = "overlay-root";
    document.body.appendChild(overlayRoot);
  }
  return overlayRoot;
}

export interface OverlayHandle {
  close: () => void;
  contentEl: HTMLElement;
}

export function openOverlay(opts: {
  dismissible?: boolean;
  className?: string;
}): OverlayHandle {
  const root = getOverlayRoot();
  const backdrop = document.createElement("div");
  backdrop.className = "overlay-backdrop";

  const content = document.createElement("div");
  content.className = "overlay-content" + (opts.className ? ` ${opts.className}` : "");
  backdrop.appendChild(content);

  function close() {
    backdrop.remove();
  }

  if (opts.dismissible !== false) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
  }

  root.appendChild(backdrop);
  return { close, contentEl: content };
}
