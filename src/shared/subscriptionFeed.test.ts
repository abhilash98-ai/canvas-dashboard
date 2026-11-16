import { describe, expect, it } from "vitest";
import type { DueAssignment } from "./assignments.js";
import { type HiddenRules, NO_HIDDEN_RULES, addComment, markDone } from "./hiding.js";
import { buildSubscriptionFeed } from "./subscriptionFeed.js";

const now = new Date("2026-11-12T12:00:00.000Z");

function assignment(id: number, name: string, dueAt: string): DueAssignment {
  return {
    id,
    name,
    courseName: "PHYS 211",
    dueAt,
    url: `https://canvas.illinois.edu/courses/1/assignments/${id}`,
    overdue: false,
  };
}

const lab = assignment(7, "Lab 4, Report", "2026-11-14T17:59:00.000Z");
const homework = assignment(8, "HW 9", "2026-11-15T23:59:00");

// Joins folded lines back together, the way a calendar app reads them.
function unfolded(feed: string): string {
  return feed.replace(/\r\n /g, "");
}

describe("buildSubscriptionFeed", () => {
  it("gives each assignment one event that keeps the same ID", () => {
    const feed = buildSubscriptionFeed([lab, homework], NO_HIDDEN_RULES, now);
    expect(feed).toContain("UID:assignment-7@whats-due");
    expect(feed).toContain("UID:assignment-8@whats-due");
    expect(feed.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("ends the event at the due time", () => {
    const feed = buildSubscriptionFeed([lab, homework], NO_HIDDEN_RULES, now);
    expect(feed).toContain("DTSTART:20261114T172900Z\r\nDTEND:20261114T175900Z");
    // Canvas's all-day work has no time zone, so it stays 11:59 PM local.
    expect(feed).toContain("DTSTART:20261115T232900\r\nDTEND:20261115T235900");
  });

  it("puts the current comments in the same event after one is added", () => {
    const before = buildSubscriptionFeed([lab], NO_HIDDEN_RULES, now);
    const rules = addComment(NO_HIDDEN_RULES, lab, "Ask TA about part 3", "c1", now);
    const after = unfolded(buildSubscriptionFeed([lab], rules, now));
    expect(before).not.toContain("Comments:");
    expect(after).toContain("Comments:\\n- Ask TA about part 3");
    expect(after).toContain("UID:assignment-7@whats-due");
  });

  it("leaves out work marked Done", () => {
    const rules: HiddenRules = markDone(NO_HIDDEN_RULES, lab);
    const feed = buildSubscriptionFeed([lab, homework], rules, now);
    expect(feed).not.toContain("assignment-7@");
    expect(feed).toContain("assignment-8@");
  });

  it("keeps commas and long comments safe in the calendar format", () => {
    const rules = addComment(NO_HIDDEN_RULES, lab, "🙂, ".repeat(60), "c2", now);
    const feed = buildSubscriptionFeed([lab], rules, now);
    for (const line of feed.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(unfolded(feed)).toContain(`- ${"🙂\\, ".repeat(59)}🙂\\,`);
    expect(feed).toContain("SUMMARY:Lab 4\\, Report due");
  });
});
