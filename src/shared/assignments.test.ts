import { describe, expect, it } from "vitest";
import { selectDueAssignments } from "./assignments.js";
import type { FeedAssignment } from "./calendarFeed.js";

const now = new Date("2026-10-06T12:00:00Z");

function assignment(overrides: Partial<FeedAssignment>): FeedAssignment {
  return {
    id: 100,
    name: "Homework",
    courseName: "CS 124",
    dueAt: "2026-10-08T04:59:00Z",
    url: "https://canvas.illinois.edu/courses/1/assignments/100",
    ...overrides,
  };
}

describe("selectDueAssignments", () => {
  it("lists assignments across courses, soonest due first", () => {
    const result = selectDueAssignments(
      [
        assignment({ id: 1, name: "Later", courseName: "CS 124", dueAt: "2026-10-10T04:59:00Z" }),
        assignment({
          id: 2,
          name: "Sooner",
          courseName: "MATH 241",
          dueAt: "2026-10-07T04:59:00Z",
        }),
      ],
      now,
    );
    expect(result.map((a) => [a.name, a.courseName])).toEqual([
      ["Sooner", "MATH 241"],
      ["Later", "CS 124"],
    ]);
  });

  it("marks recent overdue work and drops work overdue for over a week", () => {
    const result = selectDueAssignments(
      [
        assignment({ id: 1, name: "Yesterday", dueAt: "2026-10-05T12:00:00Z" }),
        assignment({ id: 2, name: "Weeks ago", dueAt: "2026-09-20T12:00:00Z" }),
      ],
      now,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Yesterday", overdue: true });
  });

  it("returns an empty list when there is nothing to do", () => {
    expect(selectDueAssignments([], now)).toEqual([]);
  });
});
