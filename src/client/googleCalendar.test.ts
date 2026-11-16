import { describe, expect, it } from "vitest";
import type { DueAssignment } from "../shared/assignments.js";
import type { AssignmentComment } from "../shared/hiding.js";
import { googleCalendarUrl } from "./googleCalendar.js";

const assignment: DueAssignment = {
  id: 7,
  name: "Lab 4 & Report",
  courseName: "PHYS 211",
  dueAt: "2026-11-10T17:59:00.000Z",
  url: "https://canvas.illinois.edu/courses/1/assignments/7",
  overdue: false,
};

describe("googleCalendarUrl", () => {
  const link = new URL(googleCalendarUrl(assignment, []));

  function comment(text: string): AssignmentComment {
    return { id: text, assignmentId: 7, text, createdAt: "2026-11-09T12:00:00.000Z" };
  }

  function detailsWith(comments: AssignmentComment[]): string {
    return new URL(googleCalendarUrl(assignment, comments)).searchParams.get("details")!;
  }

  it("leaves out the comments heading when there are none", () => {
    expect(link.searchParams.get("details")).not.toContain("Comments:");
  });

  it("lists every comment in the event's description", () => {
    const details = detailsWith([comment("Ask TA"), comment("Check rubric")]);
    expect(details).toContain("Comments:\n- Ask TA\n- Check rubric");
  });

  it("cuts very long comments short so the link still works", () => {
    const details = detailsWith([comment("x".repeat(2000)), comment("y".repeat(2000))]);
    expect(details).toContain("(more in What's Due)");
    expect(details.length).toBeLessThan(1700);
  });

  it("doesn't break when the cut lands on an emoji", () => {
    expect(() => detailsWith([comment("📚".repeat(2000))])).not.toThrow();
  });

  it("opens Google Calendar's new-event page", () => {
    expect(link.origin).toBe("https://calendar.google.com");
    expect(link.searchParams.get("action")).toBe("TEMPLATE");
  });

  it("makes a 30-minute event that ends at the due time", () => {
    expect(link.searchParams.get("dates")).toBe("20261110T172900Z/20261110T175900Z");
  });

  it("keeps a name with special characters in one piece", () => {
    expect(link.searchParams.get("text")).toBe("Lab 4 & Report due");
  });

  it("includes the course and a link back to Canvas", () => {
    const details = link.searchParams.get("details");
    expect(details).toContain("PHYS 211");
    expect(details).toContain(assignment.url);
  });
});
