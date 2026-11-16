import { describe, expect, it } from "vitest";
import { describeDue, dueGroup, describeExamDays } from "./dueLabel.js";

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

describe("describeExamDays", () => {
  it("names the first and last day a test can be taken", () => {
    const text = describeExamDays("2026-11-16T12:00:00Z", "2026-11-17T23:00:00Z");
    expect(text).toMatch(/^Exam days: .*16.* – .*17/);
  });

  it("names one day when the test is only on one day", () => {
    expect(describeExamDays("2026-11-16T12:00:00Z", "2026-11-16T20:00:00Z")).toMatch(/^Exam day: /);
  });
});
