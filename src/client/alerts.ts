import type { DueAssignment } from "../shared/assignments.js";
import { courseLabel, type HiddenRules, isHidden, isMuted } from "../shared/hiding.js";
import { describeWhen } from "./dueLabel.js";

const HOUR_MS = 60 * 60 * 1000;

// When to remind Abhilash before something is due, closest first.
export const ALERT_LEADS = [
  { key: "1h", ms: HOUR_MS },
  { key: "3h", ms: 3 * HOUR_MS },
  { key: "1d", ms: 24 * HOUR_MS },
];

const ALARM_LEAD_KEY = "1h";

// A test still to book also gets one reminder a day, from this hour on,
// until it's booked or the last day before booking closes.
export const DAILY_BOOKING_HOUR = 9;
const DAILY_LEAD_KEY = "daily";

function localDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export interface DueAlert {
  // Remembers that this alert was sent, so it never repeats.
  key: string;
  // Which reminder this is, from ALERT_LEADS.
  leadKey: string;
  title: string;
  body: string;
}

export type AlertSound = "chime" | "alarm";

// The last reminder before a deadline rings; the earlier ones just chime.
export function soundFor(alerts: DueAlert[]): AlertSound | null {
  if (alerts.length === 0) {
    return null;
  }
  return alerts.some((alert) => alert.leadKey === ALARM_LEAD_KEY) ? "alarm" : "chime";
}

export function alarmMessage(alerts: DueAlert[]): string {
  const ringing = alerts.filter((alert) => alert.leadKey === ALARM_LEAD_KEY);
  return ringing.length === 1
    ? `${ringing[0].title}: ${ringing[0].body}`
    : `${ringing.length} assignments are due within the hour`;
}

// The alerts that should go out right now. Only the closest reminder that
// applies is sent: opening the site 30 minutes before a deadline gives just
// the 1-hour alert, not all three at once. Done, hidden and muted work never alerts.
export function alertsToSend(
  assignments: DueAssignment[],
  rules: HiddenRules,
  now: Date,
  alreadySent: ReadonlySet<string>,
): DueAlert[] {
  const alerts: DueAlert[] = [];
  for (const assignment of assignments) {
    const dueAt = new Date(assignment.dueAt);
    const msLeft = dueAt.getTime() - now.getTime();
    if (msLeft <= 0 || isHidden(assignment, rules) || isMuted(assignment, rules)) {
      continue;
    }
    let lead = ALERT_LEADS.find((candidate) => msLeft <= candidate.ms)?.key;
    if (!lead && assignment.kind === "toBook" && now.getHours() >= DAILY_BOOKING_HOUR) {
      lead = `${DAILY_LEAD_KEY}-${localDay(now)}`;
    }
    if (!lead) {
      continue;
    }
    // The due date is part of the key, so a moved deadline gets fresh reminders.
    const key = `${assignment.id}@${assignment.dueAt}:${lead}`;
    if (!alreadySent.has(key)) {
      alerts.push({
        key,
        leadKey: lead,
        title: assignment.name,
        body: `${describeWhen(assignment, now)} · ${courseLabel(assignment.courseName, rules)}`,
      });
    }
  }
  return alerts;
}

export interface PracticeReminder {
  alerts: DueAlert[];
  mutedNames: string[];
}

// What would go off right now if nothing had been sent yet, and which
// assignments muting kept quiet.
export function practiceReminder(
  assignments: DueAssignment[],
  rules: HiddenRules,
  now: Date,
): PracticeReminder {
  const nothingSent = new Set<string>();
  const alerts = alertsToSend(assignments, rules, now, nothingSent);
  const sentKeys = new Set(alerts.map((alert) => alert.key));
  const mutedNames = alertsToSend(assignments, { ...rules, mutedIds: [] }, now, nothingSent)
    .filter((alert) => !sentKeys.has(alert.key))
    .map((alert) => alert.title);
  return { alerts, mutedNames };
}

export function practiceSummary({ alerts, mutedNames }: PracticeReminder): string {
  const parts: string[] = [];
  if (alerts.length > 0) {
    parts.push(`Reminded you about: ${alerts.map((alert) => alert.title).join(", ")}.`);
  }
  if (mutedNames.length > 0) {
    parts.push(`Stayed silent because muted: ${mutedNames.join(", ")}.`);
  }
  return (
    parts.join(" ") || "Nothing is due in the next day, so there was nothing to remind you about."
  );
}
