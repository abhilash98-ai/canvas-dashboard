export interface CardMenuItem {
  label: string;
  onSelect(): void;
}

// Only one menu is open at a time; this closes whichever it is.
let closeOpenMenu: (() => void) | null = null;

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element && event.target.closest(".card-menu"))) {
    closeOpenMenu?.();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeOpenMenu?.();
  }
});

// The "⋯" button on a card and the less-used actions behind it.
export function renderCardMenu(assignmentName: string, items: CardMenuItem[]): HTMLDivElement {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "chip-button card-menu-toggle";
  toggle.textContent = "⋯";
  toggle.setAttribute("aria-label", `More actions for ${assignmentName}`);
  toggle.setAttribute("aria-expanded", "false");

  const panel = document.createElement("div");
  panel.className = "card-menu-panel";
  panel.hidden = true;

  const container = document.createElement("div");
  container.className = "card-menu";

  function close(): void {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    container.closest(".card-item")?.classList.remove("menu-open");
    closeOpenMenu = null;
  }

  function open(): void {
    closeOpenMenu?.();
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    container.closest(".card-item")?.classList.add("menu-open");
    closeOpenMenu = close;
    panel.querySelector("button")?.focus();
  }

  toggle.addEventListener("click", () => (panel.hidden ? open() : close()));
  panel.append(
    ...items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.addEventListener("click", () => {
        close();
        item.onSelect();
      });
      return button;
    }),
  );
  container.append(toggle, panel);
  return container;
}
