import { describe, expect, it } from "vitest";
import {
  addComment,
  commentsFor,
  courseLabel,
  deleteComment,
  hideAllLike,
  isHidden,
  isMuted,
  markDone,
  muteAlerts,
  namePattern,
  NO_HIDDEN_RULES,
  parseHiddenRules,
  patternFor,
  setCourseNickname,
  unhide,
  unmuteAlerts,
} from "./hiding.js";

const attendance = (id: number, number: number) => ({
  id,
  name: `A&P Class ${number}`,
  courseName: "ENG 100",
});

describe("namePattern", () => {
  it("blanks out the numbers so every class session has the same shape", () => {
    expect(namePattern("A&P Class 10")).toBe("A&P Class #");
    expect(namePattern("A&P Class 3")).toBe("A&P Class #");
  });

  it("gives nothing to match for a name without numbers", () => {
    expect(namePattern("Group Project Proposal")).toBeNull();
  });
});

describe("isHidden", () => {
  it("hides an assignment marked Done, and only that one", () => {
    const rules = { ...NO_HIDDEN_RULES, doneIds: [7] };
    expect(isHidden(attendance(7, 10), rules)).toBe(true);
    expect(isHidden(attendance(8, 11), rules)).toBe(false);
  });

  it("'Hide all like this' hides every A&P Class in ENG 100, including future ones", () => {
    const rules = {
      ...NO_HIDDEN_RULES,
      patterns: [{ courseName: "ENG 100", namePattern: "A&P Class #" }],
    };
    expect(isHidden(attendance(1, 10), rules)).toBe(true);
    expect(isHidden(attendance(99, 31), rules)).toBe(true);
  });

  it("doesn't hide real work in the same course or the same name in another course", () => {
    const rules = {
      ...NO_HIDDEN_RULES,
      patterns: [{ courseName: "ENG 100", namePattern: "A&P Class #" }],
    };
    expect(isHidden({ id: 2, name: "Essay 2", courseName: "ENG 100" }, rules)).toBe(false);
    expect(isHidden({ ...attendance(3, 10), courseName: "ENG 101" }, rules)).toBe(false);
  });
});

describe("parseHiddenRules", () => {
  it("accepts well-formed rules and drops repeated IDs", () => {
    expect(
      parseHiddenRules({
        doneIds: [4, 4, 5],
        patterns: [{ courseName: "ENG 100", namePattern: "A&P Class #" }],
      }),
    ).toEqual({
      doneIds: [4, 5],
      patterns: [{ courseName: "ENG 100", namePattern: "A&P Class #" }],
      mutedIds: [],
      comments: [],
      courseWeights: {},
      courseNicknames: {},
    });
  });

  it("keeps course priorities and rejects ones that aren't High or Low", () => {
    const empty = { doneIds: [], patterns: [] };
    const weights = { "MATH 231": "high", "ADV 150": "low" };
    expect(parseHiddenRules({ ...empty, courseWeights: weights })?.courseWeights).toEqual(weights);
    expect(parseHiddenRules({ ...empty, courseWeights: { "MATH 231": "urgent" } })).toBeNull();
    expect(parseHiddenRules({ ...empty, courseWeights: ["MATH 231"] })).toBeNull();
  });

  it("keeps valid comments, and treats rules saved before comments existed as having none", () => {
    const comment = {
      id: "a",
      assignmentId: 9,
      text: "Ask about part 2",
      createdAt: "2026-11-09T12:00:00.000Z",
    };
    const empty = { doneIds: [], patterns: [] };
    expect(parseHiddenRules({ ...empty, comments: [comment] })?.comments).toEqual([comment]);
    expect(parseHiddenRules(empty)?.comments).toEqual([]);
  });

  it("rejects comments that are blank, too long, or badly dated", () => {
    const good = { id: "a", assignmentId: 9, text: "Hi", createdAt: "2026-11-09T12:00:00.000Z" };
    for (const bad of [
      "not a comment",
      { ...good, text: "   " },
      { ...good, text: "x".repeat(2001) },
      { ...good, createdAt: "whenever" },
      { ...good, assignmentId: -1 },
    ]) {
      expect(parseHiddenRules({ doneIds: [], patterns: [], comments: [bad] })).toBeNull();
    }
  });

  it("keeps muted IDs, and treats rules saved before muting existed as none muted", () => {
    expect(parseHiddenRules({ doneIds: [], patterns: [], mutedIds: [9, 9] })?.mutedIds).toEqual([
      9,
    ]);
    expect(parseHiddenRules({ doneIds: [], patterns: [] })?.mutedIds).toEqual([]);
  });

  it("rejects malformed rules", () => {
    for (const bad of [
      null,
      "hide everything",
      { doneIds: "1,2" },
      { doneIds: [1.5], patterns: [] },
      { doneIds: [-1], patterns: [] },
      { doneIds: [], patterns: [{ courseName: "", namePattern: "x" }] },
      { doneIds: [], patterns: [{ courseName: "ENG 100", namePattern: "x".repeat(301) }] },
      { doneIds: Array.from({ length: 5001 }, (_, index) => index + 1), patterns: [] },
      { doneIds: [], patterns: [], mutedIds: "all" },
      { doneIds: [], patterns: [], mutedIds: [-1] },
    ]) {
      expect(parseHiddenRules(bad)).toBeNull();
    }
  });
});

describe("comments", () => {
  const WHEN = new Date("2026-11-09T12:00:00.000Z");

  it("adds a comment to one assignment only, without the extra spaces", () => {
    const rules = addComment(NO_HIDDEN_RULES, attendance(7, 10), "  Ask TA  ", "a", WHEN);
    expect(commentsFor(rules, attendance(7, 10))).toEqual([
      { id: "a", assignmentId: 7, text: "Ask TA", createdAt: WHEN.toISOString() },
    ]);
    expect(commentsFor(rules, attendance(8, 11))).toEqual([]);
  });

  it("keeps comments in the order they were added", () => {
    const one = addComment(NO_HIDDEN_RULES, attendance(7, 10), "first", "a", WHEN);
    const two = addComment(one, attendance(7, 10), "second", "b", WHEN);
    expect(commentsFor(two, attendance(7, 10)).map((comment) => comment.text)).toEqual([
      "first",
      "second",
    ]);
  });

  it("deletes only the chosen comment", () => {
    const one = addComment(NO_HIDDEN_RULES, attendance(7, 10), "first", "a", WHEN);
    const two = addComment(one, attendance(7, 10), "second", "b", WHEN);
    expect(deleteComment(two, "a").comments.map((comment) => comment.id)).toEqual(["b"]);
  });
});

describe("muting alerts", () => {
  it("mutes one assignment without hiding it, and unmutes it again", () => {
    const muted = muteAlerts(NO_HIDDEN_RULES, attendance(7, 10));
    expect(isMuted(attendance(7, 10), muted)).toBe(true);
    expect(isMuted(attendance(8, 11), muted)).toBe(false);
    expect(isHidden(attendance(7, 10), muted)).toBe(false);
    expect(isMuted(attendance(7, 10), unmuteAlerts(muted, attendance(7, 10)))).toBe(false);
  });

  it("stays muted when something else is brought back from hidden", () => {
    const muted = muteAlerts(markDone(NO_HIDDEN_RULES, attendance(1, 1)), attendance(7, 10));
    expect(isMuted(attendance(7, 10), unhide(muted, attendance(1, 1)))).toBe(true);
  });
});

describe("changing what's hidden", () => {
  it("Done hides one assignment, and Not done brings it back", () => {
    const done = markDone(NO_HIDDEN_RULES, attendance(7, 10));
    expect(isHidden(attendance(7, 10), done)).toBe(true);
    expect(isHidden(attendance(7, 10), unhide(done, attendance(7, 10)))).toBe(false);
  });

  it("only offers 'Hide all like this' for names with a number", () => {
    expect(patternFor(attendance(1, 10))).toEqual({
      courseName: "ENG 100",
      namePattern: "A&P Class #",
    });
    expect(patternFor({ id: 2, name: "Final Essay", courseName: "ENG 100" })).toBeNull();
  });

  it("unhiding one A&P Class brings all of them back, since one rule hid them", () => {
    const rules = hideAllLike(NO_HIDDEN_RULES, patternFor(attendance(1, 10))!);
    const restored = unhide(rules, attendance(1, 10));
    expect(isHidden(attendance(2, 11), restored)).toBe(false);
  });

  it("doesn't add the same 'Hide all' rule twice", () => {
    const pattern = patternFor(attendance(1, 10))!;
    expect(hideAllLike(hideAllLike(NO_HIDDEN_RULES, pattern), pattern).patterns).toHaveLength(1);
  });
});

describe("course nicknames", () => {
  it("shows your name for a course, and goes back to the feed's name when cleared", () => {
    const named = setCourseNickname(NO_HIDDEN_RULES, "CITL", "  ACT   Plan ");
    expect(courseLabel("CITL", named)).toBe("ACT Plan");
    expect(courseLabel("MATH 231", named)).toBe("MATH 231");
    expect(setCourseNickname(named, "CITL", " ").courseNicknames).toEqual({});
  });

  it("only saves nicknames that are short, non-blank text", () => {
    const empty = { doneIds: [], patterns: [] };
    expect(parseHiddenRules({ ...empty, courseNicknames: { CITL: "ACT Plan" } })).not.toBeNull();
    expect(parseHiddenRules({ ...empty, courseNicknames: { CITL: "" } })).toBeNull();
    expect(parseHiddenRules({ ...empty, courseNicknames: { CITL: "x".repeat(41) } })).toBeNull();
  });
});
