import { examItemId, type Grab, type GrabbedExam, type GradeRow } from "../shared/grabbed.js";

// Reads a saved or open page from a site the extension knows. Each site lays
// out its page differently, so each has its own reader. They read the page's
// HTML, not a picture of the screen, so they're exact.

const cleanText = (element: Element | null | undefined): string =>
  (element?.textContent ?? "").replace(/\s+/g, " ").trim();

function absoluteUrl(href: string | null | undefined, pageUrl: string): string {
  return new URL(href ?? "", pageUrl).href;
}

// Gradescope course page: a table with each assignment's name and score.
// Rows without a score yet (not submitted or not graded) are left out.
export function readGradescope(page: Document, pageUrl: string, now: Date): Grab | null {
  const table = page.querySelector("#assignments-student-table");
  if (!table) {
    return null;
  }
  const grades: GradeRow[] = [];
  for (const row of table.querySelectorAll("tbody tr")) {
    const nameCell = row.querySelector("th");
    const score = cleanText(row.querySelector(".submissionStatus--score"));
    const name = cleanText(nameCell);
    if (name && score) {
      const link = nameCell?.querySelector("a")?.getAttribute("href");
      grades.push({ name, score, url: absoluteUrl(link ?? pageUrl, pageUrl) });
    }
  }
  const courseLink = page.querySelector(".sidebar--title-course a")?.getAttribute("href");
  return {
    kind: "grades",
    course: {
      site: "Gradescope",
      courseName: cleanText(page.querySelector(".courseHeader--title")) || "Gradescope course",
      courseUrl: absoluteUrl(courseLink ?? pageUrl, pageUrl),
      grabbedAt: now.toISOString(),
      grades,
    },
  };
}

// "CS 124 (Fa26): Q12: Recursion and Trees" → course "CS 124", name "Q12: Recursion and Trees".
export function splitExamTitle(title: string): { courseName: string; name: string } {
  const match = title.match(/^(.+?)(?: \([^)]*\))?: (.+)$/);
  return match
    ? { courseName: match[1], name: match[2] }
    : { courseName: "PrairieTest", name: title };
}

// The PrairieTest home page is a set of cards, each with a heading.
function findCard(page: Document, heading: string): Element | undefined {
  return [...page.querySelectorAll(".card")].find(
    (candidate) => cleanText(candidate.querySelector(".card-header")) === heading,
  );
}

const hasCard = (page: Document, heading: string): boolean => findCard(page, heading) !== undefined;

function cardItems(page: Document, heading: string): Element[] {
  return [...(findCard(page, heading)?.querySelectorAll("li.list-group-item") ?? [])];
}

const examNumber = (href: string | null | undefined): number | null => {
  const found = href?.match(/\/exam\/(\d+)/)?.[1];
  return found ? Number(found) : null;
};

// Exams open for booking become "Book …" items due when booking closes, and
// booked exams show at their start time with the room.
export function readPrairieTest(page: Document, pageUrl: string, now: Date): Grab | null {
  const toBook = cardItems(page, "Exams available for reservations");
  const booked = cardItems(page, "Exam reservations");
  // Only the home page has these lists. Any other PrairieTest page gives
  // nothing, so visiting it never wipes out the saved tests.
  if (!hasCard(page, "Exams available for reservations") && !hasCard(page, "Exam reservations")) {
    return null;
  }
  const exams: GrabbedExam[] = [];

  for (const item of toBook) {
    const link = item.querySelector('[data-testid="action"] a')?.getAttribute("href");
    const number = examNumber(link);
    const range = item
      .querySelector("[data-format-date-range]")
      ?.getAttribute("data-format-date-range");
    const { start: opensAt, end: closesAt } = range
      ? (JSON.parse(range) as { start?: string; end?: string })
      : {};
    if (number === null || !closesAt) {
      continue;
    }
    const { courseName, name } = splitExamTitle(
      cleanText(item.querySelector('[data-testid="exam"]')),
    );
    exams.push({
      id: examItemId(number, false),
      kind: "toBook",
      ...(opensAt ? { opensAt: new Date(opensAt).toISOString() } : {}),
      name: `Book ${name}`,
      courseName,
      dueAt: new Date(closesAt).toISOString(),
      url: absoluteUrl(link, pageUrl),
    });
  }

  for (const item of booked) {
    const startsAt = item.querySelector('[data-testid="date"] time')?.getAttribute("datetime");
    const title = cleanText(item.querySelector('[data-testid="exam"]'));
    if (!startsAt || !title) {
      continue;
    }
    const link = item.querySelector('a[href*="/exam/"]')?.getAttribute("href");
    // A booked exam's page link isn't guaranteed, so fall back to a number
    // made from its start time, which stays the same each time it's grabbed.
    const number = examNumber(link) ?? Math.floor(Date.parse(startsAt) / 60000);
    const { courseName, name } = splitExamTitle(title);
    const room = cleanText(item.querySelector('[data-testid="location"] a'));
    exams.push({
      id: examItemId(number, true),
      kind: "booked",
      name: room ? `${name} · ${room}` : name,
      courseName,
      dueAt: new Date(startsAt).toISOString(),
      url: absoluteUrl(link ?? pageUrl, pageUrl),
    });
  }

  return { kind: "exams", grabbedAt: now.toISOString(), exams };
}

export type SiteName = "Gradescope" | "PrairieTest";

export function siteFor(pageUrl: string): SiteName | null {
  const host = new URL(pageUrl).hostname;
  if (host === "gradescope.com" || host.endsWith(".gradescope.com")) {
    return "Gradescope";
  }
  if (host === "prairietest.com" || host.endsWith(".prairietest.com")) {
    return "PrairieTest";
  }
  return null;
}

export function readPage(page: Document, pageUrl: string, now: Date): Grab | null {
  const site = siteFor(pageUrl);
  if (site === "Gradescope") {
    return readGradescope(page, pageUrl, now);
  }
  if (site === "PrairieTest") {
    return readPrairieTest(page, pageUrl, now);
  }
  return null;
}
