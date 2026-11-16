import { type DueAssignment, selectDueAssignments } from "../shared/assignments.js";
import { ApiError, fetchCurrentUser, requestJson } from "./api.js";
import { connectionBadge, type ConnectionState } from "./connectionBadge.js";
import { demoAssignments } from "./demoAssignments.js";
import {
  DUE_GROUP_TITLES,
  describeExamDays,
  describeWhen,
  dueGroup,
  type DueGroup,
} from "./dueLabel.js";
import { type CardMenuItem, renderCardMenu } from "./cardMenu.js";
import { renderCommentSection } from "./commentSection.js";
import {
  describeWeightChange,
  loadSortOrder,
  renderCourseWeights,
  saveSortOrder,
  type SortOrder,
} from "./coursePriority.js";
import { byPriority, type CourseWeight, setCourseWeight } from "../shared/priority.js";
import {
  addComment,
  commentsFor,
  courseLabel,
  deleteComment,
  type HiddenRules,
  hideAllLike,
  isHidden,
  isMuted,
  markDone,
  matchesPattern,
  muteAlerts,
  NO_HIDDEN_RULES,
  patternFor,
  setCourseNickname,
  unhide,
  unmuteAlerts,
} from "../shared/hiding.js";
import {
  fetchHelperStatus,
  type HelperStatus,
  NO_HELPER,
  saveHelperSettings,
  startHelperTest,
} from "./helperApi.js";
import { fetchHiddenRules, saveHiddenRules } from "./hiddenRulesApi.js";
import { fetchGrabbed, saveGrab } from "./grabbedApi.js";
import { renderGrades } from "./gradesPage.js";
import { GRAB_MESSAGE, GRAB_SAVED_MESSAGE } from "../shared/grabMessages.js";
import { googleCalendarUrl } from "./googleCalendar.js";
import { nextUp, type Page, pageFromHash } from "./navigation.js";
import { setUpAlerts } from "./notifier.js";
import { setUpSound } from "./sounds.js";
import { startSplash } from "./splash.js";
import { setUpThemeButton } from "./theme.js";

const groupsContainer = document.querySelector<HTMLDivElement>("#groups")!;
const statsContainer = document.querySelector<HTMLElement>("#stats")!;
const statusLine = document.querySelector<HTMLParagraphElement>("#status")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const todayLine = document.querySelector<HTMLParagraphElement>("#today")!;
const greetingLine = document.querySelector<HTMLSpanElement>("#greeting")!;
const connectionMark = document.querySelector<HTMLSpanElement>("#connection")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const updatedLine = document.querySelector<HTMLParagraphElement>("#updated")!;
const showHiddenButton = document.querySelector<HTMLButtonElement>("#show-hidden")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const toastMessage = document.querySelector<HTMLSpanElement>("#toast-message")!;
const toastUndoButton = document.querySelector<HTMLButtonElement>("#toast-undo")!;
const alertsToggle = document.querySelector<HTMLInputElement>("#alerts-toggle")!;
const testAlertButton = document.querySelector<HTMLButtonElement>("#test-alert")!;
const alertsNote = document.querySelector<HTMLParagraphElement>("#alerts-note")!;
const alertsBanner = document.querySelector<HTMLParagraphElement>("#alerts-banner")!;
const soundToggle = document.querySelector<HTMLInputElement>("#sound-toggle")!;
const testChimeButton = document.querySelector<HTMLButtonElement>("#test-chime")!;
const testAlarmButton = document.querySelector<HTMLButtonElement>("#test-alarm")!;
const soundClickBanner = document.querySelector<HTMLParagraphElement>("#sound-click-banner")!;
const alarmBar = document.querySelector<HTMLDivElement>("#alarm-bar")!;
const alarmMessageLine = document.querySelector<HTMLSpanElement>("#alarm-message")!;
const alarmStopButton = document.querySelector<HTMLButtonElement>("#alarm-stop")!;
const settingsAttentionDot = document.querySelector<HTMLElement>("#settings-attention")!;
const pageSections: Record<Page, HTMLElement> = {
  home: document.querySelector<HTMLElement>("#page-home")!,
  assignments: document.querySelector<HTMLElement>("#page-assignments")!,
  tests: document.querySelector<HTMLElement>("#page-tests")!,
  grades: document.querySelector<HTMLElement>("#page-grades")!,
  settings: document.querySelector<HTMLElement>("#page-settings")!,
};
const testsContainer = document.querySelector<HTMLDivElement>("#tests-groups")!;
const testsEmptyNote = document.querySelector<HTMLParagraphElement>("#tests-empty")!;
const gradeCoursesContainer = document.querySelector<HTMLDivElement>("#grade-courses")!;
const gradesEmptyNote = document.querySelector<HTMLParagraphElement>("#grades-empty")!;
const grabberStatusLine = document.querySelector<HTMLParagraphElement>("#grabber-status")!;
const pageTabs = document.querySelectorAll<HTMLAnchorElement>(".tab");
const nextUpSection = document.querySelector<HTMLElement>("#next-up")!;
const nextUpList = document.querySelector<HTMLUListElement>("#next-up-list")!;
const seeAllLink = document.querySelector<HTMLAnchorElement>("#see-all")!;
const sortButtons = document.querySelectorAll<HTMLButtonElement>(".sort-switch button");
const priorityHint = document.querySelector<HTMLParagraphElement>("#priority-hint")!;
const courseWeightsList = document.querySelector<HTMLUListElement>("#course-weights")!;
const courseWeightsEmpty = document.querySelector<HTMLParagraphElement>("#course-weights-empty")!;
const practiceButton = document.querySelector<HTMLButtonElement>("#practice-reminder")!;
const practiceResult = document.querySelector<HTMLParagraphElement>("#practice-result")!;
const mutedList = document.querySelector<HTMLUListElement>("#muted-list")!;
const mutedEmptyNote = document.querySelector<HTMLParagraphElement>("#muted-empty")!;
const helperSetting = document.querySelector<HTMLDivElement>("#helper-setting")!;
const helperToggle = document.querySelector<HTMLInputElement>("#helper-toggle")!;
const helperTestButton = document.querySelector<HTMLButtonElement>("#helper-test")!;
const helperStatusLine = document.querySelector<HTMLParagraphElement>("#helper-status")!;
const phoneToggle = document.querySelector<HTMLInputElement>("#phone-toggle")!;
const phoneStatusLine = document.querySelector<HTMLParagraphElement>("#phone-status")!;

const isDemo = new URLSearchParams(window.location.search).has("demo");

// Canvas can't tell us when something changes, so the page checks again on a
// timer while it's open, and whenever you come back to the tab.
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const REFRESH_ON_RETURN_AFTER_MS = 60 * 1000;
let lastUpdated: Date | null = null;
let loading = false;

// The latest list from Canvas, and what the person has hidden from it.
let assignmentsOnScreen: DueAssignment[] = [];
// PrairieTest tests grabbed by the extension. They have their own tab, but
// count on Home and get reminders like everything else.
let testsOnScreen: DueAssignment[] = [];
const everythingOnScreen = (): DueAssignment[] => [...assignmentsOnScreen, ...testsOnScreen];
let hiddenRules: HiddenRules = NO_HIDDEN_RULES;
let helperStatus: HelperStatus = NO_HELPER;
// The list redraws often, so what's open and half-typed is remembered here.
const openCommentIds = new Set<number>();
const commentDrafts = new Map<number, string>();
let commentBoxToFocus: number | null = null;
let showingHidden = false;
let sortOrder: SortOrder = loadSortOrder();
const TOAST_MS = 6000;
let toastTimer: number | undefined;

const OPEN_ICON = `<svg class="open-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M7 17 17 7M8 7h9v9" /></svg>`;

const statIcon = (shape: string): string =>
  `<svg class="stat-icon" viewBox="0 0 24 24" aria-hidden="true">${shape}</svg>`;
const STAT_ICONS: Record<string, string> = {
  overdue: statIcon(`<circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" />`),
  today: statIcon(`<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />`),
  week: statIcon(
    `<rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" />`,
  ),
};

function showConnection(state: ConnectionState): void {
  const badge = connectionBadge(state);
  connectionMark.hidden = !badge;
  if (badge) {
    connectionMark.textContent = badge.symbol;
    connectionMark.className = `connection ${badge.kind}`;
    // Demo mode never talks to Canvas, so don't claim it did.
    const label = isDemo ? "Demo data loaded" : badge.label;
    connectionMark.title = label;
    connectionMark.setAttribute("aria-label", label);
  }
}

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

// Exams grabbed from PrairieTest link there; everything else is from Canvas.
const openTitle = (url: string): string =>
  new URL(url).hostname.endsWith("prairietest.com") ? "Open in PrairieTest" : "Open in Canvas";

const SLIDE_AWAY_MS = 220;
const NEXT_UP_COUNT = 4;

function actionButton(
  label: string,
  onClick: (button: HTMLButtonElement) => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chip-button";
  button.textContent = label;
  button.addEventListener("click", () => onClick(button));
  return button;
}

// Slides a card off the list, then makes the change that hides it.
function slideAway(button: HTMLButtonElement, change: () => void): void {
  button.closest(".card-item")?.classList.add("leaving");
  window.setTimeout(change, SLIDE_AWAY_MS);
}

function commentMenuItem(assignment: DueAssignment): CardMenuItem {
  const count = commentsFor(hiddenRules, assignment).length;
  let label = "💬 Add comment";
  if (openCommentIds.has(assignment.id)) {
    label = "💬 Hide comments";
  } else if (count > 0) {
    label = `💬 Comments (${count})`;
  }
  return { label, onSelect: () => toggleComments(assignment) };
}

// The buttons under a card: Done or a way to bring it back from hidden, with
// everything used less often behind the ⋯ menu.
function renderCardActions(assignment: DueAssignment, hidden: boolean): HTMLDivElement {
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const pattern = patternFor(assignment);
  if (hidden) {
    const hiddenByPattern =
      pattern && hiddenRules.patterns.some((rule) => matchesPattern(assignment, rule));
    const label = hiddenByPattern ? `Unhide all "${pattern.namePattern}"` : "Not done";
    actions.append(
      actionButton(label, () =>
        changeHiddenRules(unhide(hiddenRules, assignment), `Brought back ${assignment.name}`),
      ),
      renderCardMenu(assignment.name, [commentMenuItem(assignment)]),
    );
    return actions;
  }
  actions.append(
    actionButton("✓ Done", (button) =>
      slideAway(button, () =>
        changeHiddenRules(markDone(hiddenRules, assignment), `Marked done: ${assignment.name}`),
      ),
    ),
  );
  const menuItems = [commentMenuItem(assignment)];
  // Past-due work never alerts, so there's nothing to mute.
  if (new Date(assignment.dueAt).getTime() > Date.now()) {
    menuItems.push({
      label: isMuted(assignment, hiddenRules) ? "🔔 Unmute alerts" : "🔕 Mute alerts",
      onSelect: () => toggleMute(assignment),
    });
    menuItems.push({
      label: "📅 Add to Google Calendar",
      onSelect: () => {
        const comments = commentsFor(hiddenRules, assignment);
        window.open(
          googleCalendarUrl(
            { ...assignment, courseName: courseLabel(assignment.courseName, hiddenRules) },
            comments,
          ),
          "_blank",
          "noopener",
        );
        showToast("Opening Google Calendar. Press Save there to add it.");
      },
    });
  }
  // Only worth offering when it would hide more than this one card.
  const similar = pattern
    ? everythingOnScreen().filter((other) => matchesPattern(other, pattern))
    : [];
  if (pattern && similar.length > 1) {
    menuItems.push({
      label: "Hide all like this",
      onSelect: () => {
        const confirmed = window.confirm(
          `Hide all ${similar.length} "${pattern.namePattern}" in ${courseLabel(pattern.courseName, hiddenRules)}? ` +
            `New ones will be hidden too. "Show hidden" at the bottom brings them back.`,
        );
        if (confirmed) {
          changeHiddenRules(
            hideAllLike(hiddenRules, pattern),
            `Hid ${similar.length} "${pattern.namePattern}" in ${courseLabel(pattern.courseName, hiddenRules)}`,
          );
        }
      },
    });
  }
  actions.append(renderCardMenu(assignment.name, menuItems));
  return actions;
}

function toggleMute(assignment: DueAssignment): void {
  if (isMuted(assignment, hiddenRules)) {
    changeHiddenRules(unmuteAlerts(hiddenRules, assignment), `Alerts back on: ${assignment.name}`);
  } else {
    changeHiddenRules(muteAlerts(hiddenRules, assignment), `Muted alerts: ${assignment.name}`);
  }
}

function renderMutedList(): void {
  const muted = everythingOnScreen().filter(
    (assignment) => isMuted(assignment, hiddenRules) && !isHidden(assignment, hiddenRules),
  );
  mutedEmptyNote.hidden = muted.length > 0;
  mutedList.replaceChildren(
    ...muted.map((assignment) => {
      const name = document.createElement("span");
      name.textContent = `${assignment.name} · ${courseLabel(assignment.courseName, hiddenRules)}`;
      const item = document.createElement("li");
      item.append(
        name,
        actionButton("🔔 Unmute alerts", () => toggleMute(assignment)),
      );
      return item;
    }),
  );
}

function toggleComments(assignment: DueAssignment): void {
  if (!openCommentIds.delete(assignment.id)) {
    openCommentIds.add(assignment.id);
    commentBoxToFocus = assignment.id;
  }
  render();
}

async function addCommentTo(assignment: DueAssignment, text: string): Promise<void> {
  const id = crypto.randomUUID();
  commentDrafts.delete(assignment.id);
  commentBoxToFocus = assignment.id;
  await changeHiddenRules(
    addComment(hiddenRules, assignment, text, id, new Date()),
    `Comment added on ${assignment.name}`,
  );
  // Saving failed and the comment was taken back, so don't lose what was typed.
  if (!hiddenRules.comments.some((comment) => comment.id === id)) {
    commentDrafts.set(assignment.id, text);
    render();
  }
}

function renderComments(assignment: DueAssignment): HTMLFormElement {
  return renderCommentSection({
    assignmentId: assignment.id,
    assignmentName: assignment.name,
    comments: commentsFor(hiddenRules, assignment),
    draft: commentDrafts.get(assignment.id) ?? "",
    onDraftChange: (text) => commentDrafts.set(assignment.id, text),
    onAdd: (text) => addCommentTo(assignment, text),
    onDelete: (comment) =>
      changeHiddenRules(deleteComment(hiddenRules, comment.id), "Comment deleted"),
  });
}

// Puts the cursor back in a comment box after the list redraws around it.
function focusCommentBox(): void {
  if (commentBoxToFocus === null) {
    return;
  }
  const box = document.querySelector<HTMLTextAreaElement>(
    `textarea[data-comment-for="${commentBoxToFocus}"]`,
  );
  commentBoxToFocus = null;
  box?.focus();
  box?.setSelectionRange(box.value.length, box.value.length);
}

function courseTag(assignment: DueAssignment): HTMLSpanElement {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = courseLabel(assignment.courseName, hiddenRules);
  return tag;
}

function dueLabel(assignment: DueAssignment, now: Date): HTMLSpanElement {
  const due = document.createElement("span");
  due.className = "due";
  due.textContent = describeWhen(assignment, now);
  return due;
}

// Small marks on a card for what's tucked away in its ⋯ menu.
function cardBadges(assignment: DueAssignment): HTMLSpanElement[] {
  const badges: [boolean, string, string][] = [
    [isMuted(assignment, hiddenRules), "🔕", "Alerts muted"],
    [
      commentsFor(hiddenRules, assignment).length > 0,
      `💬 ${commentsFor(hiddenRules, assignment).length}`,
      "Has comments",
    ],
  ];
  return badges
    .filter(([show]) => show)
    .map(([, text, label]) => {
      const badge = document.createElement("span");
      badge.className = "card-badge";
      badge.textContent = text;
      badge.title = label;
      badge.setAttribute("aria-label", label);
      return badge;
    });
}

function renderCard(assignment: DueAssignment, now: Date): HTMLLIElement {
  const card = document.createElement("a");
  card.className = "card";
  card.href = assignment.url;
  card.target = "_blank";
  card.rel = "noopener";
  card.title = openTitle(assignment.url);
  card.style.setProperty("--hue", String(courseHue(assignment.courseName)));

  const main = document.createElement("div");
  main.className = "card-main";

  const title = document.createElement("span");
  title.className = "card-title";
  title.textContent = assignment.name;

  main.append(title, courseTag(assignment), ...cardBadges(assignment));
  if (assignment.opensAt) {
    const examDays = document.createElement("span");
    examDays.className = "exam-days";
    examDays.textContent = describeExamDays(assignment.opensAt, assignment.dueAt);
    main.append(examDays);
  }

  card.append(main, dueLabel(assignment, now));
  card.insertAdjacentHTML("beforeend", OPEN_ICON);

  const hidden = isHidden(assignment, hiddenRules);
  const item = document.createElement("li");
  item.className = hidden ? "card-item is-hidden" : "card-item";
  const cardWithActions = document.createElement("div");
  cardWithActions.className = "card-with-actions";
  cardWithActions.append(card, renderCardActions(assignment, hidden));
  item.append(cardWithActions);
  if (openCommentIds.has(assignment.id)) {
    item.append(renderComments(assignment));
  }
  return item;
}

function renderNextUp(assignments: DueAssignment[], now: Date): void {
  nextUpSection.hidden = assignments.length === 0;
  seeAllLink.textContent = `See all ${assignments.length}`;
  nextUpList.replaceChildren(
    ...nextUp(assignments, hiddenRules.courseWeights, now, NEXT_UP_COUNT).map((assignment) => {
      const name = document.createElement("span");
      name.className = "next-up-name";
      name.textContent = assignment.name;

      const link = document.createElement("a");
      link.className = "next-up-link";
      link.href = assignment.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.title = openTitle(assignment.url);
      link.style.setProperty("--hue", String(courseHue(assignment.courseName)));
      link.append(name, courseTag(assignment), dueLabel(assignment, now));

      const item = document.createElement("li");
      item.className = dueGroup(new Date(assignment.dueAt), now);
      item.append(link);
      return item;
    }),
  );
}

function groupSection(
  className: string,
  title: string,
  assignments: DueAssignment[],
  now: Date,
): HTMLElement {
  const section = document.createElement("section");
  section.className = `group ${className}`;

  const heading = document.createElement("h2");
  heading.className = "group-title";
  heading.textContent = title;
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = String(assignments.length);
  heading.append(count);

  const list = document.createElement("ul");
  list.className = "cards";
  list.append(...assignments.map((assignment) => renderCard(assignment, now)));

  section.append(heading, list);
  return section;
}

function renderGroups(container: HTMLElement, assignments: DueAssignment[], now: Date): void {
  const groups = new Map<DueGroup, DueAssignment[]>();
  for (const assignment of assignments) {
    const group = dueGroup(new Date(assignment.dueAt), now);
    groups.set(group, [...(groups.get(group) ?? []), assignment]);
  }
  container.replaceChildren(
    ...(Object.keys(DUE_GROUP_TITLES) as DueGroup[])
      .filter((group) => groups.has(group))
      .map((group) => groupSection(group, DUE_GROUP_TITLES[group], groups.get(group)!, now)),
  );
}

// Assignments in one list, most pressing first (see shared/priority.ts).
function renderPriorityList(container: HTMLElement, assignments: DueAssignment[], now: Date): void {
  const ordered = byPriority(assignments, hiddenRules.courseWeights, now);
  container.replaceChildren(
    ...(ordered.length > 0 ? [groupSection("priority", "By priority", ordered, now)] : []),
  );
}

function showSortOrder(): void {
  for (const button of sortButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.sort === sortOrder));
  }
  priorityHint.hidden = sortOrder !== "priority";
}

function changeCourseWeight(courseName: string, weight: CourseWeight): void {
  const courseWeights = setCourseWeight(hiddenRules.courseWeights, courseName, weight);
  changeHiddenRules(
    { ...hiddenRules, courseWeights },
    describeWeightChange(courseLabel(courseName, hiddenRules), weight),
  );
}

function renameCourse(courseName: string, nickname: string): void {
  const next = setCourseNickname(hiddenRules, courseName, nickname);
  const label = courseLabel(courseName, next);
  changeHiddenRules(
    next,
    label === courseName ? `Back to "${courseName}"` : `"${courseName}" now shows as "${label}"`,
  );
}

function renderCoursePriorities(): void {
  const courseNames = [
    ...new Set([...assignmentsOnScreen, ...testsOnScreen].map((item) => item.courseName)),
  ].sort((first, second) => first.localeCompare(second));
  renderCourseWeights(
    courseWeightsList,
    courseWeightsEmpty,
    courseNames,
    hiddenRules,
    changeCourseWeight,
    renameCourse,
  );
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
      stat.insertAdjacentHTML("beforeend", STAT_ICONS[kind]);
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

// Draws the list, leaving out hidden assignments unless "Show hidden" is on.
function render(now = new Date()): void {
  const notHidden = assignmentsOnScreen.filter((assignment) => !isHidden(assignment, hiddenRules));
  const hiddenCount = assignmentsOnScreen.length - notHidden.length;
  if (hiddenCount === 0) {
    showingHidden = false;
  }
  const testsNotHidden = testsOnScreen.filter((test) => !isHidden(test, hiddenRules));
  renderStats([...notHidden, ...testsNotHidden], now);
  renderNextUp([...notHidden, ...testsNotHidden], now);
  testsEmptyNote.hidden = testsNotHidden.length > 0;
  renderGroups(testsContainer, testsNotHidden, now);
  const activeBox = document.activeElement;
  if (activeBox instanceof HTMLTextAreaElement && activeBox.dataset.commentFor) {
    commentBoxToFocus = Number(activeBox.dataset.commentFor);
  }
  const assignmentsShown = showingHidden ? assignmentsOnScreen : notHidden;
  if (sortOrder === "priority") {
    renderPriorityList(groupsContainer, assignmentsShown, now);
  } else {
    renderGroups(groupsContainer, assignmentsShown, now);
  }
  showSortOrder();
  renderCoursePriorities();
  focusCommentBox();
  renderMutedList();

  if (notHidden.length === 0) {
    showStatus("🎉 Nothing due. You're all caught up!", "done");
  } else {
    showStatus("");
  }

  showHiddenButton.hidden = hiddenCount === 0;
  showHiddenButton.textContent = showingHidden ? "Hide them again" : `Show hidden (${hiddenCount})`;
}

function showToast(message: string, undo?: () => void): void {
  toastMessage.textContent = message;
  toastUndoButton.hidden = !undo;
  toastUndoButton.onclick = () => {
    toast.hidden = true;
    undo?.();
  };
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toast.hidden = true), TOAST_MS);
}

// Applies a change right away, saves it, and offers Undo. If saving fails the
// change is taken back, so the screen never shows something that wasn't saved.
async function changeHiddenRules(
  next: HiddenRules,
  message: string,
  offerUndo = true,
): Promise<void> {
  const previous = hiddenRules;
  hiddenRules = next;
  render();
  showToast(message, offerUndo ? () => changeHiddenRules(previous, "Undone", false) : undefined);
  try {
    await saveHiddenRules(isDemo, next);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      goToLogin();
      return;
    }
    hiddenRules = previous;
    render();
    const reason = error instanceof Error ? error.message : String(error);
    showToast(`Couldn't save that change. ${reason}`);
  }
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
    // Done marks are fetched each time too, since ticking a reminder off on
    // the iPhone can mark work Done while this page is open.
    const [rules, assignments, grabbed] = await Promise.all([
      fetchHiddenRules(isDemo),
      fetchAssignments(),
      fetchGrabbed(isDemo),
    ]);
    hiddenRules = rules;
    assignmentsOnScreen = assignments;
    testsOnScreen = selectDueAssignments(grabbed.exams, new Date());
    renderGrades(gradeCoursesContainer, gradesEmptyNote, grabbed.gradeCourses);
    const now = new Date();
    render(now);
    lastUpdated = now;
    await refreshHelperStatus();
    alerts.check();
    showConnection("ok");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      goToLogin();
      return;
    }
    showConnection("failed");
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

function showHelperStatus(): void {
  helperSetting.hidden = !helperStatus.supported;
  helperToggle.checked = helperStatus.connected;
  helperTestButton.disabled = !helperStatus.connected || !helperStatus.running;
  if (!helperStatus.running) {
    helperStatusLine.textContent =
      "The helper isn't running on this Mac. In the project folder, run: npm run helper:install";
  } else {
    helperStatusLine.textContent = helperStatus.connected
      ? "On. Banners and alarms now come from your Mac while the laptop is awake."
      : "";
  }
  showPhoneStatus();
}

function showPhoneStatus(): void {
  phoneToggle.checked = helperStatus.phoneOn;
  phoneToggle.disabled = !helperStatus.connected;
  if (!helperStatus.connected) {
    phoneStatusLine.textContent = "Turn on Reminders with the browser closed first.";
  } else if (helperStatus.phoneProblem) {
    phoneStatusLine.textContent = helperStatus.phoneProblem;
  } else {
    phoneStatusLine.textContent = helperStatus.phoneOn
      ? 'On. Open Reminders on your iPhone and look for the "What\'s Due" list.'
      : "";
  }
}

// Demo mode has no login, so it has no helper to connect.
async function refreshHelperStatus(): Promise<void> {
  if (isDemo) {
    return;
  }
  try {
    helperStatus = await fetchHelperStatus();
    showHelperStatus();
  } catch {
    // The server is unreachable; the list's own error explains that.
  }
}

// Runs a change to the helper and shows the result, or why it didn't work.
async function changeHelper(
  change: () => Promise<HelperStatus>,
  successMessage?: string,
): Promise<void> {
  try {
    helperStatus = await change();
    showHelperStatus();
    if (successMessage) {
      helperStatusLine.textContent = successMessage;
    }
  } catch (error) {
    showHelperStatus();
    helperStatusLine.textContent = error instanceof Error ? error.message : String(error);
  }
}

function saveHelperSwitches(connected: boolean, phoneOn = helperStatus.phoneOn): Promise<void> {
  return changeHelper(() =>
    saveHelperSettings(connected, alerts.switchedOn(), soundToggle.checked, phoneOn),
  );
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
const sounds = setUpSound({
  toggle: soundToggle,
  testChimeButton,
  testAlarmButton,
  clickNeededBanner: soundClickBanner,
  alarmBar,
  alarmMessageLine,
  alarmStopButton,
});
const alerts = setUpAlerts(
  {
    toggle: alertsToggle,
    testButton: testAlertButton,
    note: alertsNote,
    banner: alertsBanner,
    attentionDot: settingsAttentionDot,
  },
  {
    assignments: everythingOnScreen,
    hiddenRules: () => hiddenRules,
    helperHandlesAlerts: () => helperStatus.connected && helperStatus.running,
  },
  sounds.announce,
);

setUpThemeButton(document.querySelector<HTMLButtonElement>("#theme-button")!);

// The pages are sections of this one web page, swapped using the link's #name,
// because reminders and alarms only run while this page stays loaded.
function showCurrentPage(): Page {
  const current = pageFromHash(window.location.hash);
  for (const page of Object.keys(pageSections) as Page[]) {
    pageSections[page].hidden = page !== current;
  }
  for (const tab of pageTabs) {
    if (tab.dataset.page === current) {
      tab.setAttribute("aria-current", "page");
    } else {
      tab.removeAttribute("aria-current");
    }
  }
  return current;
}

// The extension marks this page when it's running here (see extension bridge.ts).
function showGrabberStatus(): void {
  grabberStatusLine.textContent =
    document.documentElement.dataset.grabber === "connected"
      ? "✓ What's Due Grabber is connected to this page."
      : "What's Due Grabber isn't connected to this page. Install it in Brave, then reload this page.";
}

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  showGrabberStatus();
  if (showCurrentPage() === "settings") {
    refreshHelperStatus();
  }
});
showCurrentPage();

helperToggle.addEventListener("change", () => saveHelperSwitches(helperToggle.checked));
phoneToggle.addEventListener("change", async () => {
  await saveHelperSwitches(helperStatus.connected, phoneToggle.checked);
  if (phoneToggle.checked && !helperStatus.phoneProblem) {
    phoneStatusLine.textContent =
      "On. Your Mac may ask whether node can control Reminders: click OK. The list fills in " +
      "within a minute.";
  }
});
for (const reminderSwitch of [alertsToggle, soundToggle]) {
  reminderSwitch.addEventListener("change", () => {
    if (helperStatus.connected) {
      saveHelperSwitches(true);
    }
  });
}
helperTestButton.addEventListener("click", async () => {
  await changeHelper(
    startHelperTest,
    "Test set. Quit the browser now. A banner and alarm come in about 30 seconds.",
  );
  if (helperStatus.phoneOn) {
    phoneStatusLine.textContent =
      'A "Test from What\'s Due" reminder also goes on your iPhone. It alerts about 3 ' +
      "minutes after the Mac banner, once iCloud has copied it over.";
  }
});
practiceButton.addEventListener("click", () => {
  practiceResult.textContent = alerts.practice();
});
refreshButton.addEventListener("click", loadAssignments);
for (const button of sortButtons) {
  button.addEventListener("click", () => {
    sortOrder = button.dataset.sort === "priority" ? "priority" : "due";
    saveSortOrder(sortOrder);
    render();
  });
}
showHiddenButton.addEventListener("click", () => {
  showingHidden = !showingHidden;
  render();
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  if (!isDemo) {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
  }
  goToLogin();
});

// The Brave extension hands over what it grabbed from Gradescope or PrairieTest.
// The page saves it with this login, then tells the extension it can forget it.
window.addEventListener("message", async (event) => {
  const data = event.data as { type?: unknown; id?: unknown; grab?: unknown } | null;
  if (isDemo || event.source !== window || data?.type !== GRAB_MESSAGE) {
    return;
  }
  try {
    const grabbed = await saveGrab(data.grab);
    window.postMessage({ type: GRAB_SAVED_MESSAGE, id: data.id }, window.location.origin);
    renderGrades(gradeCoursesContainer, gradesEmptyNote, grabbed.gradeCourses);
    const grab = data.grab as { kind?: unknown };
    showToast(
      grab.kind === "grades"
        ? "Added grades from Gradescope"
        : "Updated your tests from PrairieTest",
    );
    await loadAssignments();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    showToast(`Couldn't add what the extension grabbed. ${reason}`);
  }
});

async function start(): Promise<void> {
  const splash = startSplash(document.querySelector<HTMLElement>("#splash")!);
  if (isDemo) {
    greetingLine.textContent = "Demo mode · sample assignments";
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
  showGrabberStatus();
  await splash.finish();
  startAutoRefresh();
  alerts.askRightAway();
}

start();
