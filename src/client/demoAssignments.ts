import type { DueAssignment } from "../shared/assignments.js";

const HOUR_MS = 60 * 60 * 1000;

// Made-up assignments for trying the app without a Canvas calendar link (open the
// page with ?demo). Due dates are relative to now so every section shows up.
export function demoAssignments(now: Date): DueAssignment[] {
  const due = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * HOUR_MS);
  const samples: [string, string, number][] = [
    ["Problem Set 5", "MATH 241", -20],
    ["Quiz 6: Recursion", "CS 124", 3],
    ["Lab 4 Report", "PHYS 211", 9],
    ["Reading Response: Chapter 7", "RHET 105", 28],
    ["MP3: Tree Traversal", "CS 124", 50],
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
