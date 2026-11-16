import { describe, expect, it } from "vitest";
import { byPriority, setCourseWeight } from "./priority.js";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-11-15T12:00:00Z");

function dueIn(hours: number, courseName: string, name = courseName) {
  return { name, courseName, dueAt: new Date(NOW.getTime() + hours * HOUR_MS).toISOString() };
}

const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("byPriority", () => {
  it("keeps due-date order when every course is Normal", () => {
    const items = [dueIn(72, "ADV 150"), dueIn(30, "MATH 231"), dueIn(-2, "ENG 100")];
    expect(names(byPriority(items, {}, NOW))).toEqual(["ENG 100", "MATH 231", "ADV 150"]);
  });

  it("moves a High course's work above Normal work due a little sooner", () => {
    const items = [dueIn(48, "ADV 150"), dueIn(72, "MATH 231")];
    expect(names(byPriority(items, { "MATH 231": "high" }, NOW))).toEqual(["MATH 231", "ADV 150"]);
  });

  it("moves a Low course's work below Normal work due later", () => {
    const items = [dueIn(36, "ADV 150"), dueIn(96, "MATH 231")];
    expect(names(byPriority(items, { "ADV 150": "low" }, NOW))).toEqual(["MATH 231", "ADV 150"]);
  });

  it("never lets a priority push overdue work or work due today below the rest", () => {
    const items = [
      dueIn(40, "MATH 231", "high, in 40 hours"),
      dueIn(5, "ADV 150", "low, in 5 hours"),
      dueIn(-1, "ADV 150", "low, overdue"),
    ];
    const weights = { "MATH 231": "high", "ADV 150": "low" } as const;
    expect(names(byPriority(items, weights, NOW))).toEqual([
      "low, overdue",
      "low, in 5 hours",
      "high, in 40 hours",
    ]);
  });
});

describe("setCourseWeight", () => {
  it("saves High and Low, and forgets a course set back to Normal", () => {
    const high = setCourseWeight({}, "MATH 231", "high");
    expect(high).toEqual({ "MATH 231": "high" });
    expect(setCourseWeight(high, "MATH 231", "normal")).toEqual({});
  });
});
