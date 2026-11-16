import { alarmMessage, alertsToSend, soundFor } from "../client/alerts.js";
import { describeWhen } from "../client/dueLabel.js";
import { type DueAssignment, selectDueAssignments } from "../shared/assignments.js";
import { courseLabel } from "../shared/hiding.js";
import type { HelperFiles, HelperState } from "./helperFiles.js";
import {
  type PhoneItem,
  newlyTickedOff,
  type PhoneList,
  phoneItems,
  planPhoneSync,
  stillListed,
} from "./phoneReminders.js";

const REMINDER_CHECK_MS = 60 * 1000;
const FEED_REFRESH_MS = 5 * 60 * 1000;
const PHONE_SYNC_MS = 2 * 60 * 1000;
// iCloud can take a minute or two to reach the phone, and an alert that's
// already past when it arrives never goes off, so the test alert waits a bit.
const PHONE_TEST_DELAY_MS = 3 * 60 * 1000;

// Talks to the Reminders app, whose "What's Due" list iCloud copies to the iPhone.
export interface PhoneReminders {
  list(): Promise<PhoneList>;
  create(item: PhoneItem): Promise<string>;
  update(reminderId: string, item: PhoneItem): Promise<void>;
  remove(reminderId: string): Promise<void>;
}

// What the helper does to the outside world, kept apart so tests can stand in.
export interface HelperEffects {
  fetchAssignments(feedUrl: string): Promise<DueAssignment[]>;
  banner(title: string, body: string): void;
  chime(): void;
  ringUntilStopped(message: string): Promise<void>;
  phone: PhoneReminders;
}

// Turns a Reminders failure into something Settings can tell you to fix.
export function describePhoneProblem(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/-1743|not authori[sz]ed/i.test(message)) {
    return (
      "Your Mac blocked the helper from using Reminders. Open System Settings → Privacy & " +
      "Security → Automation, find node, and turn on Reminders."
    );
  }
  return `Couldn't update the Reminders app: ${message.split("\n")[0]}`;
}

export interface Helper {
  tick(now: Date): Promise<void>;
}

export function createHelper(files: HelperFiles, effects: HelperEffects): Helper {
  let assignments: DueAssignment[] = [];
  // Until Canvas has answered once, an empty list means "not known yet", and
  // the phone list mustn't be emptied because of it.
  let assignmentsLoaded = false;
  let lastFetchMs = 0;
  let lastPhoneSyncMs = 0;
  let lastPhoneSettings = "";
  let lastReminderCheckMs = 0;
  let ringing = false;

  function ring(message: string): void {
    if (ringing) {
      return;
    }
    ringing = true;
    effects
      .ringUntilStopped(message)
      .catch((error: unknown) => console.error("Couldn't ring the alarm.", error))
      .finally(() => {
        ringing = false;
      });
  }

  async function refreshAssignments(feedUrl: string, nowMs: number): Promise<void> {
    if (nowMs - lastFetchMs < FEED_REFRESH_MS) {
      return;
    }
    lastFetchMs = nowMs;
    try {
      assignments = await effects.fetchAssignments(feedUrl);
      assignmentsLoaded = true;
    } catch (error) {
      // Offline or Canvas is down: keep reminding from the last list.
      console.error("Couldn't update from Canvas.", error instanceof Error ? error.message : error);
    }
  }

  async function syncPhone(state: HelperState, now: Date): Promise<void> {
    const items = [...assignments, ...selectDueAssignments(state.tests, now)];
    const wanted = state.phoneOn ? phoneItems(items, state.rules, now) : [];
    const listed = state.phoneOn ? stillListed(items, state.rules) : new Set<string>();
    const synced = { ...files.readPhoneSynced() };
    const onPhone = await effects.phone.list();
    // Ticking a reminder off on the phone marks the work Done in What's Due.
    const ticked = newlyTickedOff(synced, onPhone);
    if (ticked.length > 0) {
      files.addPhoneDone(ticked.map(Number));
      for (const key of ticked) {
        synced[key] = { ...synced[key], reportedDone: true };
      }
      files.writePhoneSynced(synced);
    }
    const plan = planPhoneSync(wanted, listed, synced, onPhone);
    for (const key of plan.forget) {
      delete synced[key];
    }
    // Saved after each change, so one failure doesn't lose track of the rest.
    for (const change of plan.changes) {
      if (change.kind === "delete") {
        await effects.phone.remove(change.reminderId);
        delete synced[change.key];
      } else {
        const { item } = change;
        const reminderId =
          change.kind === "create"
            ? await effects.phone.create(item)
            : (await effects.phone.update(change.reminderId, item), change.reminderId);
        synced[item.key] = {
          reminderId,
          title: item.title,
          dueAt: item.dueAt,
          alertAt: item.alertAt,
        };
      }
      files.writePhoneSynced(synced);
    }
    files.writePhoneSynced(synced);
  }

  // Updates the phone list every few minutes, and right away when you change
  // the switch or what's done, hidden or muted.
  async function syncPhoneIfDue(state: HelperState, now: Date): Promise<void> {
    const hasPhoneList = Object.keys(files.readPhoneSynced()).length > 0;
    if (!assignmentsLoaded || (!state.phoneOn && !hasPhoneList)) {
      return;
    }
    const settings = JSON.stringify([state.phoneOn, state.rules, state.tests]);
    if (settings === lastPhoneSettings && now.getTime() - lastPhoneSyncMs < PHONE_SYNC_MS) {
      return;
    }
    lastPhoneSettings = settings;
    lastPhoneSyncMs = now.getTime();
    try {
      await syncPhone(state, now);
      files.writePhoneProblem(null);
    } catch (error) {
      files.writePhoneProblem(describePhoneProblem(error));
    }
  }

  async function sendPhoneTest(now: Date): Promise<void> {
    const alertAt = new Date(now.getTime() + PHONE_TEST_DELAY_MS).toISOString();
    try {
      await effects.phone.create({
        key: "test",
        title: "Test from What's Due",
        notes: "Phone reminders work. You can tick this off.",
        dueAt: alertAt,
        alertAt,
      });
      files.writePhoneProblem(null);
    } catch (error) {
      files.writePhoneProblem(describePhoneProblem(error));
    }
  }

  return {
    async tick(now) {
      const nowMs = now.getTime();
      files.markRunning(nowMs);
      const state = files.readState();
      if (!state) {
        return;
      }
      if (state.testAt !== null && nowMs >= state.testAt) {
        files.writeState({ ...state, testAt: null });
        // Shows the next thing due, so the test looks like a real reminder.
        const [next] = selectDueAssignments([...assignments, ...state.tests], now).filter(
          (item) => !item.overdue,
        );
        const body = next
          ? `${next.name}: ${describeWhen(next, now)} · ${courseLabel(next.courseName, state.rules)}`
          : "Nothing is due soon. Real reminders will look like this.";
        effects.banner("Test alert from What's Due", body);
        ring(`Test alarm from What's Due. ${body}`);
        if (state.phoneOn) {
          await sendPhoneTest(now);
        }
      }
      const hasPhoneList = Object.keys(files.readPhoneSynced()).length > 0;
      if (!state.alertsOn && !state.phoneOn && !hasPhoneList) {
        return;
      }
      await refreshAssignments(state.feedUrl, nowMs);
      await syncPhoneIfDue(state, now);
      if (!state.alertsOn) {
        return;
      }
      if (nowMs - lastReminderCheckMs < REMINDER_CHECK_MS) {
        return;
      }
      lastReminderCheckMs = nowMs;

      const sentKeys = files.readSentKeys();
      const tests = selectDueAssignments(state.tests, now);
      const alerts = alertsToSend([...assignments, ...tests], state.rules, now, sentKeys);
      if (alerts.length === 0) {
        return;
      }
      for (const alert of alerts) {
        effects.banner(alert.title, alert.body);
        sentKeys.add(alert.key);
      }
      files.writeSentKeys(sentKeys);
      if (state.soundOn) {
        const sound = soundFor(alerts);
        if (sound === "alarm") {
          ring(alarmMessage(alerts));
        } else if (sound === "chime") {
          effects.chime();
        }
      }
    },
  };
}
