// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { examItemId } from "../shared/grabbed.js";
import { readPage, splitExamTitle } from "./readers.js";

// Trimmed copies of the real pages' layout, with no one's personal details.
const GRADESCOPE_PAGE = `
<nav><div class="sidebar--title sidebar--title-course"><a href="https://www.gradescope.com/courses/111">Math 231 FA26</a></div></nav>
<header class="courseHeader"><h1 class="courseHeader--title">Math 231 FA26</h1></header>
<table id="assignments-student-table"><tbody>
  <tr><th class="table--primaryLink"><a href="https://www.gradescope.com/courses/111/assignments/5/submissions/9">Exam 1</a></th>
      <td class="submissionStatus"><div class="submissionStatus--score">92.0 / 100.0</div></td><td></td></tr>
  <tr><th class="table--primaryLink">Homework 3</th>
      <td class="submissionStatus"><div class="submissionStatus--text">No Submission</div></td><td></td></tr>
</tbody></table>`;

const PRAIRIETEST_PAGE = `
<div class="card"><div class="card-header"><h2>Exams available for reservations</h2></div>
  <ul class="list-group"><li class="list-group-item">
    <div data-testid="action"><a href="/pt/student/exam/76718">Make a reservation</a></div>
    <div data-testid="exam">CS 124 (Fa26): Q12: Recursion and Trees (Q11 Retakes)</div>
    <div data-testid="dates"><span data-format-date-range='{"start":"2026-11-16T06:01:00.000Z","end":"2026-11-18T05:59:00.000Z"}'>Mon, Nov 16 to Tue, Nov 17</span></div>
  </li></ul></div>
<div class="card"><div class="card-header"><h2>Exam reservations</h2></div>
  <ul class="list-group"><li class="list-group-item">
    <div data-testid="exam">MATH 221E (Fa26): Exam 4</div>
    <div data-testid="date"><time datetime="2026-11-19T16:00:00.000-06:00">Thu, Nov 19, 4pm</time></div>
    <div data-testid="location">CBTF: <a href="https://cbtf.illinois.edu/students/labs/gr">Grainger Library 057</a></div>
  </li></ul></div>
<div class="card"><div class="card-header"><h2>Past exam reservations</h2></div>
  <ul class="list-group"><li class="list-group-item">
    <div data-testid="exam">CS 124 (Fa26): Q0: Welcome to CS 124</div>
    <div data-testid="date"><time datetime="2026-08-27T16:00:00.000-05:00">Thu, Aug 27</time></div>
  </li></ul></div>`;

function pageFrom(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const NOW = new Date("2026-11-14T12:00:00Z");

describe("readPage", () => {
  it("reads scored rows from a Gradescope course and skips ones with no score", () => {
    const grab = readPage(pageFrom(GRADESCOPE_PAGE), "https://www.gradescope.com/courses/111", NOW);
    expect(grab).toEqual({
      kind: "grades",
      course: {
        site: "Gradescope",
        courseName: "Math 231 FA26",
        courseUrl: "https://www.gradescope.com/courses/111",
        grabbedAt: NOW.toISOString(),
        grades: [
          {
            name: "Exam 1",
            score: "92.0 / 100.0",
            url: "https://www.gradescope.com/courses/111/assignments/5/submissions/9",
          },
        ],
      },
    });
  });

  it("turns PrairieTest exams into a booking reminder and a booked exam, ignoring past ones", () => {
    const grab = readPage(pageFrom(PRAIRIETEST_PAGE), "https://us.prairietest.com/pt", NOW);
    expect(grab).toEqual({
      kind: "exams",
      grabbedAt: NOW.toISOString(),
      exams: [
        {
          id: examItemId(76718, false),
          kind: "toBook",
          opensAt: "2026-11-16T06:01:00.000Z",
          name: "Book Q12: Recursion and Trees (Q11 Retakes)",
          courseName: "CS 124",
          dueAt: "2026-11-18T05:59:00.000Z",
          url: "https://us.prairietest.com/pt/student/exam/76718",
        },
        expect.objectContaining({
          kind: "booked",
          name: "Exam 4 · Grainger Library 057",
          courseName: "MATH 221E",
          dueAt: "2026-11-19T22:00:00.000Z",
        }),
      ],
    });
  });

  it("gives nothing for a PrairieTest page that isn't the home page", () => {
    const otherPage = pageFrom("<h1>Exam details</h1>");
    expect(readPage(otherPage, "https://us.prairietest.com/pt/student/exam/1", NOW)).toBeNull();
  });

  it("gives nothing for a site it doesn't know", () => {
    expect(readPage(pageFrom(GRADESCOPE_PAGE), "https://example.com/", NOW)).toBeNull();
  });
});

describe("splitExamTitle", () => {
  it("keeps a title with no course in front as the name", () => {
    expect(splitExamTitle("Practice exam")).toEqual({
      courseName: "PrairieTest",
      name: "Practice exam",
    });
  });
});
