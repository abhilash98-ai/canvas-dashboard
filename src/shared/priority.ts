// Priority order: due date, nudged by how much each course matters to you.
// Each course is High, Normal or Low. A High course's work counts as if it
// were due sooner, so it moves up past Normal work due a little earlier.

export type CourseWeight = "high" | "normal" | "low";

export const COURSE_WEIGHTS: CourseWeight[] = ["high", "normal", "low"];

// Saved weights leave out Normal courses, so a new course starts Normal.
export type CourseWeights = Record<string, Exclude<CourseWeight, "normal">>;

// High work due in 3 days ranks with Normal work due in 1 day, and Low work
// due in 3 days ranks with Normal work due in 9.
const WEIGHT_FACTOR: Record<CourseWeight, number> = { high: 3, normal: 1, low: 1 / 3 };

// Anything due within this long stays on top in due-date order whatever its
// course, so a priority never hides something due tonight.
const URGENT_MS = 24 * 60 * 60 * 1000;

interface Rankable {
  courseName: string;
  dueAt: string;
}

export function weightOf(courseName: string, weights: CourseWeights): CourseWeight {
  return weights[courseName] ?? "normal";
}

// Smaller ranks come first: overdue work, then work due in the next day, then the rest.
function rank(item: Rankable, weights: CourseWeights, now: Date): [number, number] {
  const msLeft = Date.parse(item.dueAt) - now.getTime();
  if (msLeft < 0) {
    return [0, msLeft];
  }
  if (msLeft <= URGENT_MS) {
    return [1, msLeft];
  }
  return [2, msLeft / WEIGHT_FACTOR[weightOf(item.courseName, weights)]];
}

export function byPriority<T extends Rankable>(items: T[], weights: CourseWeights, now: Date): T[] {
  return items
    .map((item) => ({ item, rank: rank(item, weights, now) }))
    .sort(
      (first, second) =>
        first.rank[0] - second.rank[0] ||
        first.rank[1] - second.rank[1] ||
        Date.parse(first.item.dueAt) - Date.parse(second.item.dueAt),
    )
    .map(({ item }) => item);
}

export function setCourseWeight(
  weights: CourseWeights,
  courseName: string,
  weight: CourseWeight,
): CourseWeights {
  const { [courseName]: _old, ...others } = weights;
  return weight === "normal" ? others : { ...others, [courseName]: weight };
}
