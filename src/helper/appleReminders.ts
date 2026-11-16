import type { PhoneReminders } from "./helper.js";
import { type PhoneItem, PHONE_LIST_NAME } from "./phoneReminders.js";

// Runs an AppleScript with the given values as its arguments and gives back what it returns.
export type RunAppleScript = (lines: string[], values: string[]) => Promise<string>;

// AppleScript reads dates in the Mac's own format, which differs by country,
// so dates are built from numbers instead: year, month, day, seconds into the day.
const MAKE_DATE = [
  "on makeDate(y, m, d, s)",
  "set t to current date",
  "set day of t to 1",
  "set year of t to (y as integer)",
  "set month of t to (m as integer)",
  "set day of t to (d as integer)",
  "set time of t to (s as integer)",
  "return t",
  "end makeDate",
];

function dateParts(iso: string): string[] {
  const date = new Date(iso);
  const secondsIntoDay = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), secondsIntoDay].map(String);
}

// Arguments 1-3 are the list (or reminder id), title and notes; 4-11 are the dates.
const SET_DATES = [
  "set due date of r to my makeDate(item 4 of argv, item 5 of argv, item 6 of argv, item 7 of argv)",
  "set remind me date of r to my makeDate(item 8 of argv, item 9 of argv, item 10 of argv, item 11 of argv)",
];

const itemValues = (first: string, item: PhoneItem): string[] => [
  first,
  item.title,
  item.notes,
  ...dateParts(item.dueAt),
  ...dateParts(item.alertAt),
];

export function appleReminders(run: RunAppleScript): PhoneReminders {
  return {
    async list() {
      const output = await run(
        [
          "on run argv",
          'tell application "Reminders"',
          'if not (exists list (item 1 of argv)) then return ""',
          "set theReminders to reminders of list (item 1 of argv)",
          'set output to ""',
          "repeat with r in theReminders",
          "set output to output & (id of r) & tab & (completed of r) & linefeed",
          "end repeat",
          "return output",
          "end tell",
          "end run",
        ],
        [PHONE_LIST_NAME],
      );
      const reminders = new Map<string, { completed: boolean }>();
      for (const line of output.split("\n")) {
        const [id, completed] = line.split("\t");
        if (id) {
          reminders.set(id, { completed: completed === "true" });
        }
      }
      return reminders;
    },

    create(item) {
      return run(
        [
          ...MAKE_DATE,
          "on run argv",
          'tell application "Reminders"',
          "if not (exists list (item 1 of argv)) then make new list with properties {name:(item 1 of argv)}",
          "set r to make new reminder at end of list (item 1 of argv) with properties {name:(item 2 of argv), body:(item 3 of argv)}",
          ...SET_DATES,
          "return id of r",
          "end tell",
          "end run",
        ],
        itemValues(PHONE_LIST_NAME, item),
      );
    },

    async update(reminderId, item) {
      await run(
        [
          ...MAKE_DATE,
          "on run argv",
          'tell application "Reminders"',
          "set r to reminder id (item 1 of argv)",
          "set name of r to (item 2 of argv)",
          "set body of r to (item 3 of argv)",
          ...SET_DATES,
          "end tell",
          "end run",
        ],
        itemValues(reminderId, item),
      );
    },

    async remove(reminderId) {
      await run(
        [
          "on run argv",
          'tell application "Reminders"',
          "delete reminder id (item 1 of argv)",
          "end tell",
          "end run",
        ],
        [reminderId],
      );
    },
  };
}
