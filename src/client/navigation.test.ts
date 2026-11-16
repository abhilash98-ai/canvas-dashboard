import { describe, expect, it } from "vitest";
import type { DueAssignment } from "../shared/assignments.js";
import { nextUp, pageFromHash } from "./navigation.js";

const NOW = new Date(2026, 10, 5);

function dueOn(day: number, id: number): DueAssignment {
  return {
    id,
    name: `Work ${id}`,
    courseName: "CS 124",
    dueAt: new Date(2026, 10, day).toISOString(),
    url: "https://canvas.illinois.edu",
    overdue: false,
  };
}

describe("pageFromHash", () => {
  it("finds the page named in the link", () => {
    expect(pageFromHash("#assignments")).toBe("assignments");
    expect(pageFromHash("#settings")).toBe("settings");
  });

  it("goes Home for an empty or unknown link", () => {
    expect(pageFromHash("")).toBe("home");
    expect(pageFromHash("#nonsense")).toBe("home");
  });
});

describe("nextUp", () => {
  it("gives the soonest work first, up to the limit", () => {
    const ids = nextUp([dueOn(20, 1), dueOn(10, 2), dueOn(15, 3), dueOn(12, 4)], {}, NOW, 3).map(
      (assignment) => assignment.id,
    );
    expect(ids).toEqual([2, 4, 3]);
  });

  it("puts a High course's work ahead of Normal work due a little sooner", () => {
    const math = { ...dueOn(14, 5), courseName: "MATH 231" };
    const ids = nextUp([dueOn(10, 2), math], { "MATH 231": "high" }, NOW, 1).map(
      (assignment) => assignment.id,
    );
    expect(ids).toEqual([5]);
  });

  it("doesn't reorder the list it was given", () => {
    const assignments = [dueOn(20, 1), dueOn(10, 2)];
    nextUp(assignments, {}, NOW, 1);
    expect(assignments.map((assignment) => assignment.id)).toEqual([1, 2]);
  });
});

describe("the Tests tab", () => {
  it("can be linked to", () => {
    expect(pageFromHash("#tests")).toBe("tests");
  });
});
