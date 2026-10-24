const HOUR_MS = 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

// Human-friendly due text, e.g. "Due in 3 hours", "Due tomorrow, 11:59 PM",
// "Overdue · was due Mon, Oct 5, 11:59 PM".
export function describeDue(dueAt: Date, now: Date): string {
  const time = dueAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const msLeft = dueAt.getTime() - now.getTime();

  if (msLeft < 0) {
    const date = dueAt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return `Overdue · was due ${date}, ${time}`;
  }
  if (msLeft < HOUR_MS) {
    const minutes = Math.max(1, Math.round(msLeft / 60000));
    return `Due in ${minutes} min`;
  }
  if (msLeft < 12 * HOUR_MS) {
    const hours = Math.round(msLeft / HOUR_MS);
    return `Due in ${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const daysAway = Math.round((startOfDay(dueAt) - startOfDay(now)) / (24 * HOUR_MS));
  if (daysAway === 0) {
    return `Due today, ${time}`;
  }
  if (daysAway === 1) {
    return `Due tomorrow, ${time}`;
  }
  if (daysAway < 7) {
    return `Due ${dueAt.toLocaleDateString([], { weekday: "long" })}, ${time}`;
  }
  return `Due ${dueAt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
}

export type DueGroup = "overdue" | "today" | "tomorrow" | "week" | "later";

export const DUE_GROUP_TITLES: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
};

// Which section of the page an assignment belongs in, by calendar day.
export function dueGroup(dueAt: Date, now: Date): DueGroup {
  if (dueAt.getTime() < now.getTime()) {
    return "overdue";
  }
  const daysAway = Math.round((startOfDay(dueAt) - startOfDay(now)) / (24 * HOUR_MS));
  if (daysAway === 0) {
    return "today";
  }
  if (daysAway === 1) {
    return "tomorrow";
  }
  return daysAway < 7 ? "week" : "later";
}
