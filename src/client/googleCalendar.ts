import type { DueAssignment } from "../shared/assignments.js";
import type { AssignmentComment } from "../shared/hiding.js";

const EVENT_LENGTH_MS = 30 * 60 * 1000;
const MAX_COMMENT_CHARACTERS = 1500;

// Google's format for a time in UTC: 20261110T120000Z.
function googleTime(time: Date): string {
  return time.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

// Very long links get rejected, so long comments are cut short. Splitting by
// character keeps an emoji whole, since half of one can't go in a link.
function commentsSection(comments: AssignmentComment[]): string {
  if (comments.length === 0) {
    return "";
  }
  const text = comments.map((comment) => `- ${comment.text}`).join("\n");
  const characters = [...text];
  const shortened =
    characters.length > MAX_COMMENT_CHARACTERS
      ? `${characters.slice(0, MAX_COMMENT_CHARACTERS).join("")}… (more in What's Due)`
      : text;
  return `\n\nComments:\n${shortened}`;
}

// A link that opens Google Calendar's new-event page already filled in, so no
// Google login passes through this app. The event ends at the due time.
export function googleCalendarUrl(
  assignment: DueAssignment,
  comments: AssignmentComment[],
): string {
  const end = new Date(assignment.dueAt);
  const start = new Date(end.getTime() - EVENT_LENGTH_MS);
  const details =
    `${assignment.courseName}\nOpen in Canvas: ${assignment.url}` + commentsSection(comments);
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(`${assignment.name} due`)}` +
    `&dates=${googleTime(start)}/${googleTime(end)}` +
    `&details=${encodeURIComponent(details)}`
  );
}
