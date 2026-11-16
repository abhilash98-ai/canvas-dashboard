export type Theme = "light" | "dark";

// The same key is read by the small script at the top of each page, which sets
// the theme before anything is drawn so the page never flashes the wrong one.
const THEME_STORAGE_KEY = "whats-due-theme";

// A choice made with the button wins; until there is one, follow the Mac.
export function resolveTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === "light" || saved === "dark") {
    return saved;
  }
  return prefersDark ? "dark" : "light";
}

function loadSavedTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is blocked, so the choice only lasts until this page reloads.
  }
}

export function setUpThemeButton(button: HTMLButtonElement): void {
  const macAppearance = window.matchMedia("(prefers-color-scheme: dark)");

  function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    saveTheme(next);
    applyTheme(next);
  });
  macAppearance.addEventListener("change", () =>
    applyTheme(resolveTheme(loadSavedTheme(), macAppearance.matches)),
  );
  applyTheme(resolveTheme(loadSavedTheme(), macAppearance.matches));
}
