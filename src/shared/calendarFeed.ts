// Reads a Canvas calendar feed (an .ics file) into assignments. The format is
// iCalendar: lines like "SUMMARY:HW 05 [math_231_120268_260333]" grouped into
// BEGIN:VEVENT ... END:VEVENT blocks, with long lines folded onto the next
// line behind a leading space.

export interface FeedAssignment {
  id: number;
  name: string;
  courseName: string;
  // ISO time. All-day entries have no offset ("2026-10-13T23:59:00"), so they
  // mean 11:59 PM wherever the date is read.
  dueAt: string;
  url: string;
}

export interface CalendarFeed {
  ownerName: string;
  assignments: FeedAssignment[];
}

export function isCalendarFeed(text: string): boolean {
  return text.trimStart().startsWith("BEGIN:VCALENDAR");
}

function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_match, character: string) =>
    character.toLowerCase() === "n" ? "\n" : character,
  );
}

// "20261013" (all day) or "20261013T045900Z" / "20261013T225900" (a time).
// Canvas lists work due at 11:59 PM as all-day.
export function parseDueDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second, utc] = match;
  if (!hour) {
    return `${year}-${month}-${day}T23:59:00`;
  }
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${utc ?? ""}`;
}

// "math_231_120268_260333" → "MATH 231". A code with no course number, like
// "citl_citl_open_260025", becomes its first word: "CITL".
export function friendlyCourseName(code: string): string {
  const match = code.match(/^([a-z]+)_(\d{3})_/i);
  if (match) {
    return `${match[1].toUpperCase()} ${match[2]}`;
  }
  const firstWord = code.match(/^([a-z]+)_/i);
  return firstWord ? firstWord[1].toUpperCase() : code;
}

// Canvas links each entry to its calendar page, e.g.
// .../calendar?include_contexts=course_70306&...#assignment_1719207,
// which has what we need to link straight to the assignment instead.
function assignmentUrl(calendarUrl: string, assignmentId: number): string {
  try {
    const url = new URL(calendarUrl);
    const courseId = url.searchParams.get("include_contexts")?.match(/^course_(\d+)$/)?.[1];
    return courseId ? `${url.origin}/courses/${courseId}/assignments/${assignmentId}` : calendarUrl;
  } catch {
    return calendarUrl;
  }
}

// "Abhilash Adusumalli Calendar (Canvas)" becomes "Abhilash".
function ownerFirstName(calendarName: string | undefined): string {
  const fullName = calendarName?.replace(/\s*Calendar\s*\(Canvas\)\s*$/i, "").trim() ?? "";
  return fullName.split(/\s+/)[0] ?? "";
}

// Some courses post each class meeting as an "assignment" (ENG 100's
// "A&P Class 13" is attendance for that day). Those are class days, not work
// to hand in, so they're left out. "In-class Presentation" has no number and stays.
export function isClassMeeting(name: string): boolean {
  return /\bclass \d+$/i.test(name);
}

function toAssignment(fields: Map<string, string>): FeedAssignment | null {
  // Only assignments; other calendar events (office hours etc.) are skipped.
  const id = Number(fields.get("UID")?.match(/^event-assignment-(\d+)$/)?.[1]);
  const dueAt = parseDueDate(fields.get("DTSTART") ?? "");
  if (!id || !dueAt) {
    return null;
  }
  const summary = unescapeText(fields.get("SUMMARY") ?? "");
  const course = summary.match(/\s*\[([^\]]+)\]\s*$/);
  const name = (course ? summary.slice(0, course.index) : summary).replace(/\s+/g, " ").trim();
  if (isClassMeeting(name)) {
    return null;
  }
  return {
    id,
    name,
    courseName: course ? friendlyCourseName(course[1]) : "Other",
    dueAt,
    url: assignmentUrl(fields.get("URL") ?? "", id),
  };
}

export function parseCalendarFeed(text: string): CalendarFeed {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const assignments: FeedAssignment[] = [];
  let calendarName: string | undefined;
  let event: Map<string, string> | null = null;

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    // "DTSTART;VALUE=DATE:20261013": the name is before any ";" parameters.
    const name = line.slice(0, colon).split(";")[0].toUpperCase();
    const value = line.slice(colon + 1);

    if (name === "BEGIN" && value === "VEVENT") {
      event = new Map();
    } else if (name === "END" && value === "VEVENT" && event) {
      const assignment = toAssignment(event);
      if (assignment) {
        assignments.push(assignment);
      }
      event = null;
    } else if (event) {
      event.set(name, value);
    } else if (name === "X-WR-CALNAME") {
      calendarName = unescapeText(value);
    }
  }
  return { ownerName: ownerFirstName(calendarName), assignments };
}
