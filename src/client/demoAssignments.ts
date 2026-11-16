import type { DueAssignment } from "../shared/assignments.js";
import { examItemId, type GrabbedData, NOTHING_GRABBED } from "../shared/grabbed.js";

const HOUR_MS = 60 * 60 * 1000;

// Made-up assignments for trying the app without a Canvas calendar link (open the
// page with ?demo). Due dates are relative to now so every section shows up.
export function demoAssignments(now: Date): DueAssignment[] {
  const due = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * HOUR_MS);
  const samples: [string, string, number][] = [
    ["Problem Set 5", "MATH 241", -20],
    ["Quiz 6: Recursion", "CS 124", 3],
    ["A&P Class 10", "ENG 100", 6],
    ["Lab 4 Report", "PHYS 211", 9],
    ["Reading Response: Chapter 7", "RHET 105", 28],
    ["MP3: Tree Traversal", "CS 124", 50],
    ["A&P Class 11", "ENG 100", 54],
    ["Midterm 2 Study Guide", "MATH 241", 100],
    ["Group Project Proposal", "BADM 310", 230],
  ];
  return samples.map(([name, courseName, hours], index) => ({
    id: index + 1,
    name,
    courseName,
    dueAt: due(hours).toISOString(),
    url: "https://canvas.illinois.edu",
    overdue: hours < 0,
  }));
}

// Made-up PrairieTest tests for the Tests tab in demo mode: one still to book,
// one booked.
export function demoTests(now: Date): GrabbedData {
  const at = (hoursFromNow: number) =>
    new Date(now.getTime() + hoursFromNow * HOUR_MS).toISOString();
  return {
    ...NOTHING_GRABBED,
    exams: [
      {
        id: examItemId(1, false),
        kind: "toBook",
        name: "Book Quiz 7: Sorting",
        courseName: "CS 124",
        opensAt: at(24),
        dueAt: at(72),
        url: "https://us.prairietest.com/pt",
      },
      {
        id: examItemId(2, true),
        kind: "booked",
        name: "Midterm 2 · Grainger Library 057",
        courseName: "MATH 241",
        dueAt: at(30),
        url: "https://us.prairietest.com/pt",
      },
    ],
  };
}
