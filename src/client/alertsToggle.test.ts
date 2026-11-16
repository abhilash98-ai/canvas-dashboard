import { describe, expect, it } from "vitest";
import { alertsToggleView } from "./alertsToggle.js";

describe("alertsToggleView", () => {
  it("is on with no banner when the browser allows alerts and the switch is on", () => {
    expect(alertsToggleView("granted", true)).toEqual({ on: true, locked: false, banner: null });
  });

  it("stays usable and explains how to turn alerts back on when switched off", () => {
    const view = alertsToggleView("granted", false);
    expect(view.on).toBe(false);
    expect(view.locked).toBe(false);
    expect(view.banner).toContain("Flip the Alerts switch");
  });

  it("offers the switch when the browser hasn't asked yet", () => {
    const view = alertsToggleView("default", true);
    expect(view.on).toBe(false);
    expect(view.locked).toBe(false);
    expect(view.banner).toContain("choose Allow");
  });

  it("locks the switch and gives browser steps when notifications are blocked", () => {
    const view = alertsToggleView("denied", true);
    expect(view.on).toBe(false);
    expect(view.locked).toBe(true);
    expect(view.banner).toContain("blocked");
    expect(view.banner).toContain("Safari > Settings");
  });

  it("locks the switch when the browser has no notifications at all", () => {
    const view = alertsToggleView("unsupported", true);
    expect(view.on).toBe(false);
    expect(view.locked).toBe(true);
    expect(view.banner).toContain("can't show notifications");
  });
});
