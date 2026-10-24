import { describe, expect, it } from "vitest";
import { describeDue, dueGroup } from "./dueLabel.js";

// Local time, so the calendar-day logic doesn't depend on the test machine's zone.
const now = new Date(2026, 9, 6, 10, 0); // Tue Oct 6, 10:00 AM

describe("dueGroup", () => {
  it.each([
    [new Date(2026, 9, 6, 9, 0), "overdue"],
    [new Date(2026, 9, 6, 23, 59), "today"],
    [new Date(2026, 9, 7, 8, 0), "tomorrow"],
    [new Date(2026, 9, 12, 23, 59), "week"],
    [new Date(2026, 9, 13, 9, 0), "later"],
  ] as const)("puts %s in %s", (dueAt, group) => {
    expect(dueGroup(dueAt, now)).toBe(group);
  });
});

describe("describeDue", () => {
  it("counts down in hours on the day it's due", () => {
    expect(describeDue(new Date(2026, 9, 6, 13, 0), now)).toBe("Due in 3 hours");
  });

  it("counts down in minutes in the last hour", () => {
    expect(describeDue(new Date(2026, 9, 6, 10, 20), now)).toBe("Due in 20 min");
  });

  it("says when overdue work was due", () => {
    expect(describeDue(new Date(2026, 9, 5, 23, 59), now)).toMatch(/^Overdue · was due/);
  });
});
