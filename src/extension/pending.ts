import type { Grab } from "../shared/grabbed.js";

// Grabs waiting to be handed to What's Due, kept in the extension's own storage
// so nothing is lost if What's Due isn't open yet.
export interface PendingGrab {
  id: string;
  grab: Grab;
}

export const PENDING_KEY = "pending";

export async function readPending(): Promise<PendingGrab[]> {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  return (stored[PENDING_KEY] as PendingGrab[] | undefined) ?? [];
}

// A newer grab of the same thing replaces one still waiting, so visiting
// PrairieTest several times before opening What's Due doesn't pile up.
function sameThing(first: Grab, second: Grab): boolean {
  if (first.kind === "exams" || second.kind === "exams") {
    return first.kind === second.kind;
  }
  return first.course.courseUrl === second.course.courseUrl;
}

export async function addPending(grab: Grab): Promise<void> {
  const others = (await readPending()).filter((item) => !sameThing(item.grab, grab));
  await chrome.storage.local.set({
    [PENDING_KEY]: [...others, { id: crypto.randomUUID(), grab }],
  });
}

export async function removePending(id: string): Promise<void> {
  const pending = await readPending();
  await chrome.storage.local.set({ [PENDING_KEY]: pending.filter((item) => item.id !== id) });
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function describeGrab(grab: Grab): string {
  return grab.kind === "grades"
    ? `Got ${plural(grab.course.grades.length, "grade")} from ${grab.course.courseName}.`
    : `Got ${plural(grab.exams.length, "test")} from PrairieTest.`;
}
