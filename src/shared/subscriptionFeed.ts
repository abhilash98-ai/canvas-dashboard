import type { DueAssignment } from "./assignments.js";
import { type HiddenRules, commentsFor, isHidden } from "./hiding.js";

// A calendar file Google Calendar can subscribe to ("From URL"). Google
// re-reads it on its own every so often, so comments added in What's Due later
// show up in the same event: each assignment keeps the same UID every time.

const EVENT_LENGTH_MS = 30 * 60 * 1000;
// iCalendar lines can be at most 75 bytes; longer ones continue on the next
// line behind a space.
const MAX_LINE_BYTES = 75;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

// "20261110T173000Z" for a UTC time, or "20261013T232900" for a time with no
// zone (Canvas's all-day work), which calendars read as local time.
function icsTime(time: Date, utc: boolean): string {
  const parts = utc
    ? [
        time.getUTCFullYear(),
        time.getUTCMonth() + 1,
        time.getUTCDate(),
        time.getUTCHours(),
        time.getUTCMinutes(),
        time.getUTCSeconds(),
      ]
    : [
        time.getFullYear(),
        time.getMonth() + 1,
        time.getDate(),
        time.getHours(),
        time.getMinutes(),
        time.getSeconds(),
      ];
  const [year, month, day, hour, minute, second] = parts.map(twoDigits);
  return `${year}${month}${day}T${hour}${minute}${second}${utc ? "Z" : ""}`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Splits by character, not byte, so an emoji is never cut in half.
function foldLine(line: string): string[] {
  const encoder = new TextEncoder();
  const pieces: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = pieces.length === 0 ? MAX_LINE_BYTES : MAX_LINE_BYTES - 1;
    if (currentBytes + bytes > limit) {
      pieces.push(current);
      current = "";
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  pieces.push(current);
  return pieces.map((piece, index) => (index === 0 ? piece : ` ${piece}`));
}

function eventLines(assignment: DueAssignment, rules: HiddenRules, now: Date): string[] {
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/.test(assignment.dueAt);
  const end = new Date(assignment.dueAt);
  const start = new Date(end.getTime() - EVENT_LENGTH_MS);
  const comments = commentsFor(rules, assignment);
  const commentText =
    comments.length === 0
      ? ""
      : `\n\nComments:\n${comments.map((comment) => `- ${comment.text}`).join("\n")}`;
  const description = `${assignment.courseName}\nOpen in Canvas: ${assignment.url}${commentText}`;
  return [
    "BEGIN:VEVENT",
    `UID:assignment-${assignment.id}@whats-due`,
    `DTSTAMP:${icsTime(now, true)}`,
    `DTSTART:${icsTime(start, hasZone)}`,
    `DTEND:${icsTime(end, hasZone)}`,
    `SUMMARY:${escapeText(`${assignment.name} due`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:${assignment.url}`,
    "END:VEVENT",
  ];
}

// Every assignment still on the list, with its current comments. Done and
// hidden work is left out, so it drops off the calendar too.
export function buildSubscriptionFeed(
  assignments: DueAssignment[],
  rules: HiddenRules,
  now: Date,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//What's Due//Assignments//EN",
    "X-WR-CALNAME:What's Due",
    ...assignments
      .filter((assignment) => !isHidden(assignment, rules))
      .flatMap((assignment) => eventLines(assignment, rules, now)),
    "END:VCALENDAR",
  ];
  return lines.flatMap(foldLine).join("\r\n") + "\r\n";
}
