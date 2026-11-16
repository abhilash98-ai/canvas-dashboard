import { describe, expect, it } from "vitest";
import { connectionBadge } from "./connectionBadge.js";

describe("connectionBadge", () => {
  it("shows a green check once assignments loaded from Canvas", () => {
    expect(connectionBadge("ok")).toEqual({
      kind: "ok",
      symbol: "✓",
      label: "Connected to Canvas, assignments are up to date",
    });
  });

  it("shows a red mark, not a check, when Canvas couldn't be reached", () => {
    const badge = connectionBadge("failed");
    expect(badge?.kind).toBe("failed");
    expect(badge?.symbol).not.toBe("✓");
    expect(badge?.label).toMatch(/couldn't reach canvas/i);
  });

  it("shows nothing before the first load finishes", () => {
    expect(connectionBadge("checking")).toBeNull();
  });
});
