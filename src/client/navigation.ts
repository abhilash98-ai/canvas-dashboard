import type { DueAssignment } from "../shared/assignments.js";
import { byPriority, type CourseWeights } from "../shared/priority.js";

export type Page = "home" | "assignments" | "tests" | "grades" | "settings";

const PAGES: readonly Page[] = ["home", "assignments", "tests", "grades", "settings"];

// The page named in the link, like "#settings", so reloading stays put and the
// browser's Back button works. Anything unrecognized goes Home.
export function pageFromHash(hash: string): Page {
  const name = hash.replace(/^#/, "");
  return PAGES.find((page) => page === name) ?? "home";
}

// The most pressing work for the Home page: overdue first, then by priority,
// which is plain due-date order until a course is marked High or Low.
export function nextUp(
  assignments: DueAssignment[],
  weights: CourseWeights,
  now: Date,
  limit: number,
): DueAssignment[] {
  return byPriority(assignments, weights, now).slice(0, limit);
}
