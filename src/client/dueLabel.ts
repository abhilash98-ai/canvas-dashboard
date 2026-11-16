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

// Tests read differently from homework: "Booking closes tomorrow, 11:59 PM"
// for one still to book, "Exam in 3 hours" for one that's booked.
export function describeWhen(
  item: { dueAt: string; kind?: "toBook" | "booked" },
  now: Date,
): string {
  const text = describeDue(new Date(item.dueAt), now);
  if (item.kind === "toBook") {
    return text.replace(/^Due/, "Booking closes");
  }
  return item.kind === "booked" ? text.replace(/^Due/, "Exam") : text;
}

// "Exam days: Mon, Nov 16 – Tue, Nov 17", or one day if it opens and closes the same day.
export function describeExamDays(opensAt: string, closesAt: string): string {
  const day = (time: string) =>
    new Date(time).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const first = day(opensAt);
  const last = day(closesAt);
  return first === last ? `Exam day: ${first}` : `Exam days: ${first} – ${last}`;
}
