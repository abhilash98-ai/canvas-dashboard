import type { DueAssignment } from "../shared/assignments.js";
import { ApiError, fetchCurrentUser, requestJson } from "./api.js";
import { demoAssignments } from "./demoAssignments.js";
import { DUE_GROUP_TITLES, describeDue, dueGroup, type DueGroup } from "./dueLabel.js";

const groupsContainer = document.querySelector<HTMLDivElement>("#groups")!;
const statsContainer = document.querySelector<HTMLElement>("#stats")!;
const statusLine = document.querySelector<HTMLParagraphElement>("#status")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const todayLine = document.querySelector<HTMLParagraphElement>("#today")!;
const greetingLine = document.querySelector<HTMLParagraphElement>("#greeting")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const updatedLine = document.querySelector<HTMLParagraphElement>("#updated")!;

const isDemo = new URLSearchParams(window.location.search).has("demo");

// Canvas can't tell us when something changes, so the page checks again on a
// timer while it's open, and whenever you come back to the tab.
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const REFRESH_ON_RETURN_AFTER_MS = 60 * 1000;
let lastUpdated: Date | null = null;
let loading = false;

const OPEN_ICON = `<svg class="open-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7 17 17 7M8 7h9v9" /></svg>`;

function showStatus(message: string, kind: "info" | "error" | "done" = "info"): void {
  statusLine.textContent = message;
  statusLine.className = kind;
}

// The same course always gets the same color tag.
function courseHue(courseName: string): number {
  let hash = 0;
  for (const character of courseName) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  // Stepping by the golden angle spreads similar names far apart on the wheel.
  return Math.round((hash * 137.508) % 360);
}

function renderCard(assignment: DueAssignment, now: Date): HTMLLIElement {
  const dueAt = new Date(assignment.dueAt);

  const card = document.createElement("a");
  card.className = "card";
  card.href = assignment.url;
  card.target = "_blank";
  card.rel = "noopener";
  card.title = "Open in Canvas";
  card.style.setProperty("--hue", String(courseHue(assignment.courseName)));

  const main = document.createElement("div");
  main.className = "card-main";

  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = assignment.name;

  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = assignment.courseName;
  main.append(title, tag);

  const due = document.createElement("span");
  due.className = "due";
  due.textContent = describeDue(dueAt, now);

  card.append(main, due);
  card.insertAdjacentHTML("beforeend", OPEN_ICON);

  const item = document.createElement("li");
  item.append(card);
  return item;
}

function renderGroups(assignments: DueAssignment[], now: Date): void {
  const groups = new Map<DueGroup, DueAssignment[]>();
  for (const assignment of assignments) {
    const group = dueGroup(new Date(assignment.dueAt), now);
    groups.set(group, [...(groups.get(group) ?? []), assignment]);
  }

  const sections = (Object.keys(DUE_GROUP_TITLES) as DueGroup[])
    .filter((group) => groups.has(group))
    .map((group) => {
      const section = document.createElement("section");
      section.className = `group ${group}`;

      const heading = document.createElement("h2");
      heading.className = "group-title";
      heading.textContent = DUE_GROUP_TITLES[group];
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(groups.get(group)!.length);
      heading.append(count);

      const list = document.createElement("ul");
      list.className = "cards";
      list.append(...groups.get(group)!.map((assignment) => renderCard(assignment, now)));

      section.append(heading, list);
      return section;
    });
  groupsContainer.replaceChildren(...sections);
}

function renderStats(assignments: DueAssignment[], now: Date): void {
  const countIn = (wanted: DueGroup[]) =>
    assignments.filter((assignment) => wanted.includes(dueGroup(new Date(assignment.dueAt), now)))
      .length;
  const stats: [string, string, number][] = [
    ["overdue", "Overdue", countIn(["overdue"])],
    ["today", "Due today", countIn(["today"])],
    ["week", "Next 7 days", countIn(["today", "tomorrow", "week"])],
  ];
  statsContainer.replaceChildren(
    ...stats.map(([kind, label, value]) => {
      const stat = document.createElement("div");
      stat.className = `stat ${kind}`;
      const number = document.createElement("span");
      number.className = "stat-number";
      number.textContent = String(value);
      const caption = document.createElement("span");
      caption.className = "stat-label";
      caption.textContent = label;
      stat.append(number, caption);
      return stat;
    }),
  );
}

function showLoading(): void {
  statsContainer.replaceChildren();
  showStatus("");
  const placeholders = Array.from({ length: 4 }, () => {
    const placeholder = document.createElement("div");
    placeholder.className = "skeleton";
    return placeholder;
  });
  const list = document.createElement("div");
  list.className = "cards";
  list.setAttribute("aria-label", "Loading assignments");
  list.append(...placeholders);
  groupsContainer.replaceChildren(list);
}

async function fetchAssignments(): Promise<DueAssignment[]> {
  if (isDemo) {
    return demoAssignments(new Date());
  }
  return requestJson<DueAssignment[]>("/api/assignments");
}

function goToLogin(): void {
  window.location.replace("/login.html");
}

function showLastUpdated(): void {
  if (!lastUpdated) {
    updatedLine.textContent = "";
    return;
  }
  const minutes = Math.floor((Date.now() - lastUpdated.getTime()) / 60000);
  const ago = minutes < 1 ? "just now" : `${minutes} min ago`;
  updatedLine.textContent = `Updated ${ago} · checks Canvas every ${AUTO_REFRESH_MS / 60000} min`;
}

async function loadAssignments(): Promise<void> {
  if (loading) {
    return;
  }
  loading = true;
  refreshButton.disabled = true;
  // Only the first load shows placeholders; later updates keep the current
  // list on screen until the new one arrives.
  if (!lastUpdated) {
    showLoading();
  }
  try {
    const assignments = await fetchAssignments();
    const now = new Date();
    renderStats(assignments, now);
    renderGroups(assignments, now);
    if (assignments.length === 0) {
      showStatus("🎉 Nothing due. You're all caught up!", "done");
    } else if (isDemo) {
      showStatus("Demo mode: these are sample assignments, not your Canvas data.");
    } else {
      showStatus("");
    }
    lastUpdated = now;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      goToLogin();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (lastUpdated) {
      showStatus(`Couldn't update just now. ${message} Showing the last list.`, "error");
    } else {
      groupsContainer.replaceChildren();
      showStatus(`Couldn't load assignments. ${message}`, "error");
    }
  } finally {
    loading = false;
    refreshButton.disabled = false;
    showLastUpdated();
  }
}

function startAutoRefresh(): void {
  window.setInterval(() => {
    if (!document.hidden) {
      loadAssignments();
    }
  }, AUTO_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    const stale = !lastUpdated || Date.now() - lastUpdated.getTime() > REFRESH_ON_RETURN_AFTER_MS;
    if (!document.hidden && stale) {
      loadAssignments();
    }
  });
  window.setInterval(showLastUpdated, 30 * 1000);
}

todayLine.textContent = new Date().toLocaleDateString([], {
  weekday: "long",
  month: "long",
  day: "numeric",
});
refreshButton.addEventListener("click", loadAssignments);

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  if (!isDemo) {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
  }
  goToLogin();
});

async function start(): Promise<void> {
  if (isDemo) {
    greetingLine.textContent = "Demo mode";
    logoutButton.textContent = "Exit demo";
  } else {
    try {
      const user = await fetchCurrentUser();
      // The name comes from the calendar's title, which a feed may not have.
      greetingLine.textContent = user.name ? `Hi, ${user.name}` : "Welcome back";
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        goToLogin();
        return;
      }
      // Server unreachable: loadAssignments shows the error.
    }
  }
  await loadAssignments();
  startAutoRefresh();
}

start();
