// A header switch that's on until someone turns it off, remembered in this browser.
export function loadSwitchedOn(offStorageKey: string): boolean {
  try {
    return localStorage.getItem(offStorageKey) === null;
  } catch {
    return true;
  }
}

export function saveSwitchedOn(offStorageKey: string, switchedOn: boolean): void {
  try {
    if (switchedOn) {
      localStorage.removeItem(offStorageKey);
    } else {
      localStorage.setItem(offStorageKey, "true");
    }
  } catch {
    // Storage is blocked, so the switch only lasts until this page reloads.
  }
}
