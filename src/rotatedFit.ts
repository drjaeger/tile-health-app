/**
 * Wraps `content` in a `.rotated-fit` element sized (in CSS, via container
 * units — see `.rotated-fit-cell` in style.css) to `cell`'s own transposed
 * (width/height swapped) dimensions and rotated in place — a 90/270deg
 * rotation swaps visual width/height, so without this a non-square `cell`
 * either overflows (content too big) or leaves empty space (content too
 * small) once rotated.
 */
export function fitRotated(cell: HTMLElement, content: HTMLElement, rotationDeg: number) {
  const rotator = document.createElement("div");
  rotator.className = "rotated-fit";
  rotator.style.setProperty("--fit-rotation", `${rotationDeg}deg`);
  rotator.appendChild(content);
  cell.classList.add("rotated-fit-cell");
  cell.appendChild(rotator);
}
