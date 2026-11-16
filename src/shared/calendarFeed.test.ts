import { describe, expect, it } from "vitest";
import {
  friendlyCourseName,
  isClassMeeting,
  parseCalendarFeed,
  parseDueDate,
} from "./calendarFeed.js";

// Shaped like a real Canvas feed: CRLF line endings, long lines folded behind
// a leading space, all-day dates with a doubled VALUE=DATE, and the course
// code in brackets at the end of each title.
const SAMPLE_FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "X-WR-CALNAME:Ada Lovelace Calendar (Canvas)",
  "BEGIN:VEVENT",
  "UID:event-assignment-1719207",
  "DTSTART;VALUE=DATE;VALUE=DATE:20261013",
  "DESCRIPTION:Write about it\\, then submit\\nby midnight",
  "SUMMARY:3.5 | Analytic Writing Assignment: Fanship in Your Life [rst_335_12",
  " 0268_261705]",
  "URL;VALUE=URI:https://canvas.illinois.edu/calendar?include_contexts=course_",
  " 70306&month=10&year=2026#assignment_1719207",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-assignment-42",
  "DTSTART:20261015T170000Z",
  "SUMMARY:7.5 | Quiz   [vcstud_cc_open_249979]",
  "URL;VALUE=URI:https://canvas.illinois.edu/calendar#assignment_42",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-assignment-1726954",
  "DTSTART;VALUE=DATE;VALUE=DATE:20261019",
  "SUMMARY:A&P Class 13 [eng_100_120268_265701]",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-calendar-event-773567",
  "DTSTART;VALUE=DATE:20261005",
  "SUMMARY:Office hours [math_231_120268_260333]",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

describe("parseCalendarFeed", () => {
  const feed = parseCalendarFeed(SAMPLE_FEED);

  it("reads the owner's first name from the calendar title", () => {
    expect(feed.ownerName).toBe("Ada");
  });

  it("keeps assignments and skips class meetings and other calendar events", () => {
    expect(feed.assignments.map((assignment) => assignment.id)).toEqual([1719207, 42]);
  });

  it("joins folded lines and splits the course code off the title", () => {
    expect(feed.assignments[0]).toMatchObject({
      name: "3.5 | Analytic Writing Assignment: Fanship in Your Life",
      courseName: "RST 335",
    });
  });

  it("links straight to the assignment page when the course is known", () => {
    expect(feed.assignments[0].url).toBe(
      "https://canvas.illinois.edu/courses/70306/assignments/1719207",
    );
    expect(feed.assignments[1].url).toBe("https://canvas.illinois.edu/calendar#assignment_42");
  });

  it("treats an all-day entry as due at 11:59 PM that day", () => {
    expect(feed.assignments[0].dueAt).toBe("2026-10-13T23:59:00");
    expect(feed.assignments[1].dueAt).toBe("2026-10-15T17:00:00Z");
  });

  it("returns no assignments for an empty calendar", () => {
    expect(parseCalendarFeed("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n")).toEqual({
      ownerName: "",
      assignments: [],
    });
  });
});

describe("friendlyCourseName", () => {
  it("shortens Illinois course codes", () => {
    expect(friendlyCourseName("math_231_120268_260333")).toBe("MATH 231");
  });

  it("names a course with no number by its first word, and leaves odd codes alone", () => {
    expect(friendlyCourseName("citl_citl_open_260025")).toBe("CITL");
    expect(friendlyCourseName("Orientation")).toBe("Orientation");
  });
});

describe("parseDueDate", () => {
  it("rejects values that aren't dates", () => {
    expect(parseDueDate("next tuesday")).toBeNull();
  });
});

describe("isClassMeeting", () => {
  it("spots numbered class days but keeps real work that mentions class", () => {
    expect(isClassMeeting("A&P Class 13")).toBe(true);
    expect(isClassMeeting("GP5: In-class Presentation")).toBe(false);
    expect(isClassMeeting("A10: Stepping Stones")).toBe(false);
  });
});
