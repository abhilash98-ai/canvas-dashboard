import type { DueAssignment } from "../shared/assignments.js";
import { courseLabel, type HiddenRules, isHidden, isMuted } from "../shared/hiding.js";

// Keeps a "What's Due" list in Apple's Reminders app, which iCloud copies to
// the iPhone. A reminder can only hold one alert, so each one's alert time
// moves forward as the deadline gets closer: 1 day, then 3 hours, then 1 hour
// before. If the Mac is off, the phone still has the next alert.

const HOUR_MS = 60 * 60 * 1000;
const ALERT_LEADS_MS = [24 * HOUR_MS, 3 * HOUR_MS, HOUR_MS];
// Further ahead than this stays off the phone, so the list isn't crowded.
const PHONE_HORIZON_MS = 14 * 24 * HOUR_MS;

export const PHONE_LIST_NAME = "What's Due";

export interface PhoneItem {
  key: string;
  title: string;
  notes: string;
  dueAt: string;
  alertAt: string;
}

// What the helper put on the phone for an item, saved between runs.
export interface SyncedReminder {
  reminderId: string;
  title: string;
  dueAt: string;
  alertAt: string;
  // Set once its tick on the phone has been passed on to What's Due as Done.
  reportedDone?: boolean;
}

export type SyncedReminders = Record<string, SyncedReminder>;

// The reminders in the phone list right now, by id.
export type PhoneList = ReadonlyMap<string, { completed: boolean }>;

export type PhoneChange =
  | { kind: "create"; item: PhoneItem }
  | { kind: "update"; reminderId: string; item: PhoneItem }
  | { kind: "delete"; key: string; reminderId: string };

export interface PhonePlan {
  changes: PhoneChange[];
  // Items to stop tracking without touching the phone (their deadline passed).
  forget: string[];
}

// The next of the 1-day / 3-hour / 1-hour alerts still to come, or the due
// time itself once all three have passed.
export function nextAlertAt(dueAt: Date, now: Date): Date {
  const upcoming = ALERT_LEADS_MS.map((lead) => dueAt.getTime() - lead).find(
    (time) => time > now.getTime(),
  );
  return new Date(upcoming ?? dueAt.getTime());
}

const itemKey = (item: DueAssignment): string => String(item.id);

// Upcoming work that belongs on the phone: not done, hidden or muted, and due
// within two weeks.
export function phoneItems(items: DueAssignment[], rules: HiddenRules, now: Date): PhoneItem[] {
  return items
    .filter((item) => !isHidden(item, rules) && !isMuted(item, rules))
    .filter((item) => {
      const msLeft = Date.parse(item.dueAt) - now.getTime();
      return msLeft > 0 && msLeft <= PHONE_HORIZON_MS;
    })
    .map((item) => ({
      key: itemKey(item),
      title: `${item.name} · ${courseLabel(item.courseName, rules)}`,
      notes: item.url,
      dueAt: new Date(item.dueAt).toISOString(),
      alertAt: nextAlertAt(new Date(item.dueAt), now).toISOString(),
    }));
}

// The keys of everything still on What's Due's list (not done, hidden or
// muted), whether or not its deadline has passed.
export function stillListed(items: DueAssignment[], rules: HiddenRules): Set<string> {
  return new Set(
    items.filter((item) => !isHidden(item, rules) && !isMuted(item, rules)).map(itemKey),
  );
}

// Items ticked off on the phone that What's Due hasn't heard about yet. Their
// keys are What's Due item numbers.
export function newlyTickedOff(synced: SyncedReminders, onPhone: PhoneList): string[] {
  return Object.entries(synced)
    .filter(([, saved]) => !saved.reportedDone && onPhone.get(saved.reminderId)?.completed)
    .map(([key]) => key);
}

// Works out what to change on the phone. Reminders you tick off or delete on
// the phone are left alone and never put back.
export function planPhoneSync(
  wanted: PhoneItem[],
  listed: ReadonlySet<string>,
  synced: SyncedReminders,
  onPhone: PhoneList,
): PhonePlan {
  const changes: PhoneChange[] = [];
  const forget: string[] = [];
  const wantedKeys = new Set(wanted.map((item) => item.key));

  for (const item of wanted) {
    const saved = synced[item.key];
    if (!saved) {
      changes.push({ kind: "create", item });
      continue;
    }
    const reminder = onPhone.get(saved.reminderId);
    if (!reminder || reminder.completed) {
      continue;
    }
    if (
      saved.title !== item.title ||
      saved.dueAt !== item.dueAt ||
      saved.alertAt !== item.alertAt
    ) {
      changes.push({ kind: "update", reminderId: saved.reminderId, item });
    }
  }

  for (const [key, saved] of Object.entries(synced)) {
    if (wantedKeys.has(key)) {
      continue;
    }
    const reminder = onPhone.get(saved.reminderId);
    // Past its deadline but not done: leave it on the phone, overdue.
    if (listed.has(key) || !reminder || reminder.completed) {
      forget.push(key);
    } else {
      changes.push({ kind: "delete", key, reminderId: saved.reminderId });
    }
  }
  return { changes, forget };
}
