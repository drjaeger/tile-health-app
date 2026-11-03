import { openOverlay } from "./overlay";

// Attribution the third-party art's licenses ask for (full details in
// public/icons/CREDITS.txt and public/watermarks/CREDITS.txt). Keep the
// two in sync when adding or swapping art.
const CREDITS: { title: string; lines: string[] }[] = [
  {
    title: "Badges",
    lines: [
      "Crown & torch pixel art by Are Williarta (Vecteezy, Vecteezy Free License)",
      "Burn flame pixel art by Liudmila Shagieva (Vecteezy, Vecteezy Free License)",
    ],
  },
  {
    title: "Milestone watermarks",
    lines: [
      "Skull by Sbed; cards & cat by Lorc; trophy by Delapouite — game-icons.net (CC BY 3.0)",
      "Hand by Font Awesome (CC BY 4.0)",
    ],
  },
  {
    title: "Dead player skull",
    lines: ["Based on Twemoji by Twitter, Inc and contributors (CC BY 4.0)"],
  },
  {
    title: "Fonts",
    lines: [
      "Alagard by Hewett Tsoi",
      "Concert One, Press Start 2P & VT323 (SIL Open Font License)",
    ],
  },
];

export function openCredits() {
  const { close, contentEl } = openOverlay({ className: "credits-dialog" });

  const title = document.createElement("h2");
  title.textContent = "Credits";
  contentEl.appendChild(title);

  for (const section of CREDITS) {
    const heading = document.createElement("h3");
    heading.className = "credits-heading";
    heading.textContent = section.title;
    contentEl.appendChild(heading);
    for (const line of section.lines) {
      const p = document.createElement("p");
      p.className = "credits-line";
      p.textContent = line;
      contentEl.appendChild(p);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.className = "dialog-btn dialog-btn-primary credits-close";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", close);
  contentEl.appendChild(closeBtn);
}
