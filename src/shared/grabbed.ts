import type { TestKind } from "./assignments.js";

// What the Brave extension grabs from sites that aren't Canvas: grades from
// Gradescope, and exams from PrairieTest. The extension reads the page you have
// open and hands the result to What's Due, which saves it with your login.

export interface GradeRow {
  name: string;
  score: string;
  url: string;
}

export interface CourseGrades {
  site: "Gradescope";
  courseName: string;
  courseUrl: string;
  grabbedAt: string;
  grades: GradeRow[];
}

// An exam from PrairieTest, shown on the Tests tab.
export interface GrabbedExam {
  id: number;
  kind: TestKind;
  // For a test still to book: when its exam days start (dueAt is when they end).
  opensAt?: string;
  name: string;
  courseName: string;
  dueAt: string;
  url: string;
}

export type Grab =
  | { kind: "grades"; course: CourseGrades }
  | { kind: "exams"; grabbedAt: string; exams: GrabbedExam[] };

export interface GrabbedData {
  gradeCourses: CourseGrades[];
  exams: GrabbedExam[];
  examsGrabbedAt: string | null;
}

export const NOTHING_GRABBED: GrabbedData = { gradeCourses: [], exams: [], examsGrabbedAt: null };

// PrairieTest exam numbers could match a Canvas assignment number, and Done and
// Mute are keyed by number, so exams get their own range far above Canvas's.
// Booking an exam and taking it are separate items, so each exam gets two.
const EXAM_ID_BASE = 9_000_000_000_000;

export function examItemId(examNumber: number, booked: boolean): number {
  return EXAM_ID_BASE + examNumber * 2 + (booked ? 1 : 0);
}

const MAX_TEXT_LENGTH = 300;
const MAX_URL_LENGTH = 1000;
const MAX_ROWS = 500;
const MAX_COURSES = 100;

const isText = (value: unknown, maxLength = MAX_TEXT_LENGTH): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maxLength;

const isWebLink = (value: unknown): value is string =>
  isText(value, MAX_URL_LENGTH) && value.startsWith("https://");

const isTime = (value: unknown): value is string =>
  isText(value) && !Number.isNaN(Date.parse(value));

function parseGradeRow(value: unknown): GradeRow | null {
  const row = value as Partial<GradeRow> | null;
  return row && isText(row.name) && isText(row.score) && isWebLink(row.url)
    ? { name: row.name, score: row.score, url: row.url }
    : null;
}

function parseCourseGrades(value: unknown): CourseGrades | null {
  const course = value as Partial<CourseGrades> | null;
  if (
    !course ||
    course.site !== "Gradescope" ||
    !isText(course.courseName) ||
    !isWebLink(course.courseUrl) ||
    !isTime(course.grabbedAt) ||
    !Array.isArray(course.grades) ||
    course.grades.length > MAX_ROWS
  ) {
    return null;
  }
  const grades = course.grades.map(parseGradeRow);
  if (grades.some((row) => row === null)) {
    return null;
  }
  return {
    site: course.site,
    courseName: course.courseName,
    courseUrl: course.courseUrl,
    grabbedAt: course.grabbedAt,
    grades: grades as GradeRow[],
  };
}

function parseExam(value: unknown): GrabbedExam | null {
  const exam = value as Partial<GrabbedExam> | null;
  return exam &&
    Number.isSafeInteger(exam.id) &&
    (exam.kind === "toBook" || exam.kind === "booked") &&
    (exam.opensAt === undefined || isTime(exam.opensAt)) &&
    exam.id! > EXAM_ID_BASE &&
    isText(exam.name) &&
    isText(exam.courseName) &&
    isTime(exam.dueAt) &&
    isWebLink(exam.url)
    ? {
        id: exam.id!,
        kind: exam.kind!,
        ...(exam.opensAt ? { opensAt: exam.opensAt } : {}),
        name: exam.name,
        courseName: exam.courseName,
        dueAt: exam.dueAt,
        url: exam.url,
      }
    : null;
}

// A saved list of tests, or null if any of it looks wrong.
export function parseExams(value: unknown): GrabbedExam[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROWS) {
    return null;
  }
  const exams = value.map(parseExam);
  return exams.some((exam) => exam === null) ? null : (exams as GrabbedExam[]);
}

// Checks what the page sent before it's saved, since it comes from another site's page.
export function parseGrab(value: unknown): Grab | null {
  const grab = value as { kind?: unknown; course?: unknown; grabbedAt?: unknown; exams?: unknown };
  if (grab?.kind === "grades") {
    const course = parseCourseGrades(grab.course);
    return course ? { kind: "grades", course } : null;
  }
  if (grab?.kind === "exams" && isTime(grab.grabbedAt)) {
    const exams = parseExams(grab.exams);
    return exams ? { kind: "exams", grabbedAt: grab.grabbedAt, exams } : null;
  }
  return null;
}

// Adds a grab to what's saved: a course's grades replace that course's old
// grades, and PrairieTest's exams replace the old list (it shows them all at once).
export function applyGrab(data: GrabbedData, grab: Grab): GrabbedData {
  if (grab.kind === "exams") {
    return { ...data, exams: grab.exams, examsGrabbedAt: grab.grabbedAt };
  }
  const others = data.gradeCourses.filter((course) => course.courseUrl !== grab.course.courseUrl);
  return { ...data, gradeCourses: [...others, grab.course].slice(-MAX_COURSES) };
}
