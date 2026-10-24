import { isCalendarFeed, parseCalendarFeed, type CalendarFeed } from "../shared/calendarFeed.js";

export class CanvasError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Turns what someone pasted into their Canvas calendar feed URL, or explains
// what's wrong. Only links on our Canvas are allowed, so the server can't be
// used to fetch arbitrary websites.
export function normalizeFeedUrl(input: string, canvasBaseUrl: string): string {
  let url: URL;
  try {
    // Calendar apps sometimes show the same link as webcal://.
    url = new URL(input.trim().replace(/^webcal:\/\//i, "https://"));
  } catch {
    throw new CanvasError("That isn't a link. Copy the whole Calendar Feed link from Canvas.", 400);
  }
  const canvasHost = new URL(canvasBaseUrl).host;
  if (url.protocol !== "https:" || url.host !== canvasHost) {
    throw new CanvasError(
      `That link isn't from ${canvasHost}. Use your Canvas Calendar Feed.`,
      400,
    );
  }
  if (!/^\/feeds\/calendars\/user_[A-Za-z0-9]+\.ics$/.test(url.pathname)) {
    throw new CanvasError(
      "That's a Canvas link, but not your calendar feed. In Canvas, open Calendar and click Calendar Feed.",
      400,
    );
  }
  return `${url.origin}${url.pathname}`;
}

export async function fetchCalendarFeed(feedUrl: string): Promise<CalendarFeed> {
  const response = await fetch(feedUrl).catch(() => {
    throw new CanvasError("Couldn't reach Canvas. Check your internet connection.", 502);
  });
  // Canvas answers 400 for a feed link it doesn't know (checked against
  // canvas.illinois.edu), and may use 401/403/404 for revoked ones.
  if ([400, 401, 403, 404].includes(response.status)) {
    throw new CanvasError("Canvas didn't recognize that calendar link.", 401);
  }
  if (!response.ok) {
    throw new CanvasError(`Canvas returned ${response.status} for your calendar.`, 502);
  }
  const text = await response.text();
  if (!isCalendarFeed(text)) {
    throw new CanvasError("Canvas sent something that isn't a calendar.", 502);
  }
  return parseCalendarFeed(text);
}
