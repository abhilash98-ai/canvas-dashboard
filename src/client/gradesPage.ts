import type { CourseGrades } from "../shared/grabbed.js";

// The Grades tab: one box per Gradescope course, with each score and when it
// was grabbed, since the extension only knows what was on screen then.

function grabbedWhen(grabbedAt: string): string {
  return new Date(grabbedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderCourse(course: CourseGrades): HTMLElement {
  const box = document.createElement("section");
  box.className = "setting grade-course";

  const heading = document.createElement("div");
  heading.className = "setting-row";
  const title = document.createElement("h3");
  const link = document.createElement("a");
  link.href = course.courseUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = course.courseName;
  title.append(link);
  const when = document.createElement("span");
  when.className = "setting-help";
  when.textContent = `${course.site} · grabbed ${grabbedWhen(course.grabbedAt)}`;
  heading.append(title, when);

  const list = document.createElement("ul");
  list.className = "grade-list";
  for (const row of course.grades) {
    const item = document.createElement("li");
    const name = document.createElement("a");
    name.href = row.url;
    name.target = "_blank";
    name.rel = "noopener";
    name.textContent = row.name;
    const score = document.createElement("span");
    score.className = "grade-score";
    score.textContent = row.score;
    item.append(name, score);
    list.append(item);
  }
  if (course.grades.length === 0) {
    const none = document.createElement("li");
    none.textContent = "No scores on this page yet.";
    list.append(none);
  }
  box.append(heading, list);
  return box;
}

export function renderGrades(
  container: HTMLElement,
  emptyNote: HTMLElement,
  courses: CourseGrades[],
): void {
  emptyNote.hidden = courses.length > 0;
  const sorted = [...courses].sort((a, b) => a.courseName.localeCompare(b.courseName));
  container.replaceChildren(...sorted.map(renderCourse));
}
