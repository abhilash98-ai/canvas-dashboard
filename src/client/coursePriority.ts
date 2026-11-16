import { type HiddenRules, MAX_NICKNAME_LENGTH } from "../shared/hiding.js";
import { COURSE_WEIGHTS, type CourseWeight, weightOf } from "../shared/priority.js";

// How the Assignments page is ordered. Only this browser remembers it.
export type SortOrder = "due" | "priority";

const SORT_STORAGE_KEY = "whats-due-sort";

export function loadSortOrder(): SortOrder {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === "priority" ? "priority" : "due";
  } catch {
    return "due";
  }
}

export function saveSortOrder(order: SortOrder): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, order);
  } catch {
    // Storage is blocked, so the choice only lasts until this page reloads.
  }
}

const WEIGHT_LABELS: Record<CourseWeight, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

// The Settings list: each course with a name box and a High / Normal / Low choice.
export function renderCourseWeights(
  list: HTMLUListElement,
  emptyNote: HTMLElement,
  courseNames: string[],
  rules: Pick<HiddenRules, "courseWeights" | "courseNicknames">,
  onChange: (courseName: string, weight: CourseWeight) => void,
  onRename: (courseName: string, nickname: string) => void,
): void {
  emptyNote.hidden = courseNames.length > 0;
  list.replaceChildren(
    ...courseNames.map((courseName) => {
      const nameBox = document.createElement("input");
      nameBox.type = "text";
      nameBox.className = "course-nickname";
      nameBox.maxLength = MAX_NICKNAME_LENGTH;
      nameBox.placeholder = courseName;
      nameBox.value = rules.courseNicknames[courseName] ?? "";
      nameBox.setAttribute("aria-label", `Name for ${courseName}`);
      nameBox.title = `Canvas calls this course "${courseName}". Leave blank to use that.`;
      // Saves when you press Enter or click away, not on every letter.
      nameBox.addEventListener("change", () => onRename(courseName, nameBox.value));

      const choice = document.createElement("select");
      choice.setAttribute("aria-label", `Priority for ${courseName}`);
      for (const weight of COURSE_WEIGHTS) {
        choice.add(new Option(WEIGHT_LABELS[weight], weight));
      }
      choice.value = weightOf(courseName, rules.courseWeights);
      choice.addEventListener("change", () => onChange(courseName, choice.value as CourseWeight));

      const item = document.createElement("li");
      item.append(nameBox, choice);
      return item;
    }),
  );
}

export function describeWeightChange(label: string, weight: CourseWeight): string {
  return `${label} is now ${WEIGHT_LABELS[weight]} priority`;
}
