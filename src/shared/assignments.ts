import type { FeedAssignment } from "./calendarFeed.js";

// What the web page receives for each assignment.
export interface DueAssignment {
  id: number;
  name: string;
  courseName: string;
  dueAt: string;
  url: string;
  overdue: boolean;
}

// Work that went past its due date more than this long ago is left off the
// list, so old assignments don't bury what's coming up.
export const OVERDUE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Picks the assignments to show: upcoming or recently past due, soonest first.
export function selectDueAssignments(assignments: FeedAssignment[], now: Date): DueAssignment[] {
  const oldestShown = now.getTime() - OVERDUE_WINDOW_DAYS * DAY_MS;
  return assignments
    .filter((assignment) => Date.parse(assignment.dueAt) >= oldestShown)
    .map((assignment) => ({
      ...assignment,
      overdue: Date.parse(assignment.dueAt) < now.getTime(),
    }))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
