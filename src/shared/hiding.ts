import { COURSE_WEIGHTS, type CourseWeights } from "./priority.js";

// What a person has hidden from their list. The calendar feed can't say what's
// submitted, so "Done" is marked by hand, and some "assignments" are really
// attendance grades with nothing to turn in (e.g. "A&P Class 10" in ENG 100),
// which "Hide all like this" clears out in one go, including future ones.
export interface HiddenRules {
  // Canvas assignment IDs marked Done.
  doneIds: number[];
  // "Hide all like this": every assignment in courseName whose name has this shape.
  patterns: HidePattern[];
  // Canvas assignment IDs that stay on the list but never send alerts.
  mutedIds: number[];
  comments: AssignmentComment[];
  // How much each course matters, for priority order. Normal courses are left out.
  courseWeights: CourseWeights;
  // Names you gave courses, by the name the feed gives them ("CITL" → "ACT Plan").
  courseNicknames: Record<string, string>;
}

export interface AssignmentComment {
  id: string;
  assignmentId: number;
  text: string;
  createdAt: string;
}

export interface HidePattern {
  courseName: string;
  namePattern: string;
}

export const NO_HIDDEN_RULES: HiddenRules = {
  doneIds: [],
  patterns: [],
  mutedIds: [],
  comments: [],
  courseWeights: {},
  courseNicknames: {},
};

export const MAX_COMMENT_LENGTH = 2000;
const MAX_COMMENTS = 5000;

// Limits that keep a saved rules file small; far beyond what one person needs.
const MAX_IDS = 5000;
const MAX_PATTERNS = 200;
const MAX_TEXT_LENGTH = 300;
export const MAX_NICKNAME_LENGTH = 40;

// The shape of a name with its numbers blanked out: "A&P Class 10" → "A&P Class #".
// Names without a number have no shape to match, so they give null.
export function namePattern(name: string): string | null {
  return /\d/.test(name) ? name.trim().replace(/\d+/g, "#") : null;
}

interface Hideable {
  id: number;
  name: string;
  courseName: string;
}

export function matchesPattern(assignment: Hideable, pattern: HidePattern): boolean {
  return (
    assignment.courseName === pattern.courseName &&
    namePattern(assignment.name) === pattern.namePattern
  );
}

export function isHidden(assignment: Hideable, rules: HiddenRules): boolean {
  return (
    rules.doneIds.includes(assignment.id) ||
    rules.patterns.some((pattern) => matchesPattern(assignment, pattern))
  );
}

export function isMuted(assignment: Hideable, rules: HiddenRules): boolean {
  return rules.mutedIds.includes(assignment.id);
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH;

const isIdList = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length <= MAX_IDS &&
  value.every((id) => Number.isSafeInteger(id) && id > 0);

function parseComment(value: unknown): AssignmentComment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { id, assignmentId, text, createdAt } = value as Record<string, unknown>;
  if (
    !isText(id) ||
    !isIdList([assignmentId]) ||
    typeof text !== "string" ||
    text.trim() === "" ||
    text.length > MAX_COMMENT_LENGTH ||
    !isText(createdAt) ||
    Number.isNaN(Date.parse(createdAt))
  ) {
    return null;
  }
  return { id, assignmentId: assignmentId as number, text, createdAt };
}

function parseCourseWeights(value: unknown): CourseWeights | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value);
  const valid =
    entries.length <= MAX_PATTERNS &&
    entries.every(
      ([courseName, weight]) =>
        isText(courseName) && weight !== "normal" && COURSE_WEIGHTS.includes(weight),
    );
  return valid ? (Object.fromEntries(entries) as CourseWeights) : null;
}

function parseCourseNicknames(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value);
  const valid =
    entries.length <= MAX_PATTERNS &&
    entries.every(
      ([courseName, nickname]) =>
        isText(courseName) &&
        typeof nickname === "string" &&
        nickname.trim() !== "" &&
        nickname.length <= MAX_NICKNAME_LENGTH,
    );
  return valid ? (Object.fromEntries(entries) as Record<string, string>) : null;
}

// Checks rules sent by a browser before saving them; null means they're malformed.
export function parseHiddenRules(value: unknown): HiddenRules | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  // Rules saved before muting, comments and course weights existed don't have those fields.
  const {
    doneIds,
    patterns,
    mutedIds = [],
    comments = [],
    courseWeights = {},
    courseNicknames = {},
  } = value as Record<string, unknown>;
  const cleanWeights = parseCourseWeights(courseWeights);
  const cleanNicknames = parseCourseNicknames(courseNicknames);
  if (!isIdList(doneIds) || !isIdList(mutedIds) || !cleanWeights || !cleanNicknames) {
    return null;
  }
  if (!Array.isArray(comments) || comments.length > MAX_COMMENTS) {
    return null;
  }
  const cleanComments: AssignmentComment[] = [];
  for (const comment of comments) {
    const clean = parseComment(comment);
    if (!clean) {
      return null;
    }
    cleanComments.push(clean);
  }
  if (!Array.isArray(patterns) || patterns.length > MAX_PATTERNS) {
    return null;
  }
  const cleanPatterns: HidePattern[] = [];
  for (const pattern of patterns) {
    if (typeof pattern !== "object" || pattern === null) {
      return null;
    }
    const { courseName, namePattern } = pattern as Record<string, unknown>;
    if (!isText(courseName) || !isText(namePattern)) {
      return null;
    }
    cleanPatterns.push({ courseName, namePattern });
  }
  return {
    doneIds: [...new Set(doneIds)],
    patterns: cleanPatterns,
    mutedIds: [...new Set(mutedIds)],
    comments: cleanComments,
    courseWeights: cleanWeights,
    courseNicknames: cleanNicknames,
  };
}

// Rule changes. Each returns new rules and leaves the old ones untouched, so
// Undo can put the old ones back.

export function markDone(rules: HiddenRules, assignment: Hideable): HiddenRules {
  return { ...rules, doneIds: [...new Set([...rules.doneIds, assignment.id])] };
}

// The "Hide all like this" rule for an assignment, or null if its name has no number.
export function patternFor(assignment: Hideable): HidePattern | null {
  const shape = namePattern(assignment.name);
  return shape ? { courseName: assignment.courseName, namePattern: shape } : null;
}

export function hideAllLike(rules: HiddenRules, pattern: HidePattern): HiddenRules {
  const alreadyHidden = rules.patterns.some(
    (existing) =>
      existing.courseName === pattern.courseName && existing.namePattern === pattern.namePattern,
  );
  return alreadyHidden ? rules : { ...rules, patterns: [...rules.patterns, pattern] };
}

// Brings an assignment back: clears its Done mark and any "Hide all like this"
// rule covering it, which brings back the others that rule hid too.
export function unhide(rules: HiddenRules, assignment: Hideable): HiddenRules {
  return {
    ...rules,
    doneIds: rules.doneIds.filter((id) => id !== assignment.id),
    patterns: rules.patterns.filter((pattern) => !matchesPattern(assignment, pattern)),
  };
}

export function muteAlerts(rules: HiddenRules, assignment: Hideable): HiddenRules {
  return { ...rules, mutedIds: [...new Set([...rules.mutedIds, assignment.id])] };
}

export function unmuteAlerts(rules: HiddenRules, assignment: Hideable): HiddenRules {
  return { ...rules, mutedIds: rules.mutedIds.filter((id) => id !== assignment.id) };
}

export function commentsFor(rules: HiddenRules, assignment: Hideable): AssignmentComment[] {
  return rules.comments.filter((comment) => comment.assignmentId === assignment.id);
}

export function addComment(
  rules: HiddenRules,
  assignment: Hideable,
  text: string,
  id: string,
  createdAt: Date,
): HiddenRules {
  const comment = {
    id,
    assignmentId: assignment.id,
    text: text.trim(),
    createdAt: createdAt.toISOString(),
  };
  return { ...rules, comments: [...rules.comments, comment] };
}

export function deleteComment(rules: HiddenRules, commentId: string): HiddenRules {
  return { ...rules, comments: rules.comments.filter((comment) => comment.id !== commentId) };
}

// What to call a course on screen and in reminders: your name for it, if you gave one.
export function courseLabel(courseName: string, rules: HiddenRules): string {
  return rules.courseNicknames[courseName] ?? courseName;
}

// A blank name goes back to the feed's name for the course.
export function setCourseNickname(
  rules: HiddenRules,
  courseName: string,
  nickname: string,
): HiddenRules {
  const { [courseName]: _old, ...others } = rules.courseNicknames;
  const clean = nickname.replace(/\s+/g, " ").trim().slice(0, MAX_NICKNAME_LENGTH);
  const keep = clean !== "" && clean !== courseName;
  return { ...rules, courseNicknames: keep ? { ...others, [courseName]: clean } : others };
}
