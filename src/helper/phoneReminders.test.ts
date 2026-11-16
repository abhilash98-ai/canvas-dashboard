import { describe, expect, it } from "vitest";
import type { DueAssignment } from "../shared/assignments.js";
import { markDone, muteAlerts, NO_HIDDEN_RULES } from "../shared/hiding.js";
import {
  newlyTickedOff,
  nextAlertAt,
  type PhoneItem,
  phoneItems,
  planPhoneSync,
  stillListed,
  type SyncedReminders,
} from "./phoneReminders.js";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-11-15T12:00:00Z");

function dueIn(hours: number, id = 1): DueAssignment {
  return {
    id,
    name: `HW ${id}`,
    courseName: "MATH 231",
    dueAt: new Date(NOW.getTime() + hours * HOUR_MS).toISOString(),
    url: `https://canvas.illinois.edu/courses/1/assignments/${id}`,
    overdue: hours < 0,
  };
}

const inHours = (hours: number) => new Date(NOW.getTime() + hours * HOUR_MS).toISOString();

function syncedFor(item: PhoneItem, reminderId = `r${item.key}`): SyncedReminders {
  return {
    [item.key]: { reminderId, title: item.title, dueAt: item.dueAt, alertAt: item.alertAt },
  };
}

describe("nextAlertAt", () => {
  const due = new Date(NOW.getTime() + 48 * HOUR_MS);

  it("starts a day before, then moves to 3 hours and 1 hour before", () => {
    expect(nextAlertAt(due, NOW).toISOString()).toBe(inHours(24));
    expect(nextAlertAt(due, new Date(NOW.getTime() + 25 * HOUR_MS)).toISOString()).toBe(
      inHours(45),
    );
    expect(nextAlertAt(due, new Date(NOW.getTime() + 46 * HOUR_MS)).toISOString()).toBe(
      inHours(47),
    );
  });

  it("alerts at the deadline once all three have passed", () => {
    expect(nextAlertAt(due, new Date(NOW.getTime() + 47.5 * HOUR_MS)).toISOString()).toBe(
      inHours(48),
    );
  });
});

describe("phoneItems", () => {
  it("puts upcoming work on the phone with its course, but not done, muted, past or far-off work", () => {
    const work = [dueIn(30, 1), dueIn(5, 2), dueIn(6, 3), dueIn(-2, 4), dueIn(20 * 24, 5)];
    const rules = muteAlerts(markDone(NO_HIDDEN_RULES, work[1]), work[2]);
    expect(phoneItems(work, rules, NOW)).toEqual([
      {
        key: "1",
        title: "HW 1 · MATH 231",
        notes: "https://canvas.illinois.edu/courses/1/assignments/1",
        dueAt: inHours(30),
        alertAt: inHours(6),
      },
    ]);
  });
});

describe("planPhoneSync", () => {
  const [item] = phoneItems([dueIn(30)], NO_HIDDEN_RULES, NOW);

  it("adds new work to the phone", () => {
    expect(planPhoneSync([item], new Set(["1"]), {}, new Map()).changes).toEqual([
      { kind: "create", item },
    ]);
  });

  it("changes nothing when the phone is already up to date", () => {
    const plan = planPhoneSync(
      [item],
      new Set(["1"]),
      syncedFor(item),
      new Map([["r1", { completed: false }]]),
    );
    expect(plan).toEqual({ changes: [], forget: [] });
  });

  it("moves the alert forward as the deadline gets closer", () => {
    const later = { ...item, alertAt: inHours(27) };
    const plan = planPhoneSync(
      [later],
      new Set(["1"]),
      syncedFor(item),
      new Map([["r1", { completed: false }]]),
    );
    expect(plan.changes).toEqual([{ kind: "update", reminderId: "r1", item: later }]);
  });

  it("never puts back a reminder you ticked off or deleted on the phone", () => {
    const ticked = new Map([["r1", { completed: true }]]);
    expect(planPhoneSync([item], new Set(["1"]), syncedFor(item), ticked).changes).toEqual([]);
    expect(planPhoneSync([item], new Set(["1"]), syncedFor(item), new Map()).changes).toEqual([]);
  });

  it("removes work you marked Done or muted, but leaves overdue work on the phone", () => {
    const open = new Map([["r1", { completed: false }]]);
    expect(planPhoneSync([], new Set(), syncedFor(item), open)).toEqual({
      changes: [{ kind: "delete", key: "1", reminderId: "r1" }],
      forget: [],
    });
    expect(planPhoneSync([], new Set(["1"]), syncedFor(item), open)).toEqual({
      changes: [],
      forget: ["1"],
    });
  });

  it("only lists work that isn't done, hidden or muted", () => {
    const work = [dueIn(30, 1), dueIn(-3, 2), dueIn(10, 3)];
    expect(stillListed(work, markDone(NO_HIDDEN_RULES, work[2]))).toEqual(new Set(["1", "2"]));
  });
});

describe("newlyTickedOff", () => {
  it("finds reminders ticked off on the phone that haven't been passed on yet", () => {
    const [item] = phoneItems([dueIn(30)], NO_HIDDEN_RULES, NOW);
    const synced = syncedFor(item);
    const ticked = new Map([["r1", { completed: true }]]);
    expect(newlyTickedOff(synced, ticked)).toEqual(["1"]);
    expect(newlyTickedOff(synced, new Map([["r1", { completed: false }]]))).toEqual([]);
    expect(newlyTickedOff({ "1": { ...synced["1"], reportedDone: true } }, ticked)).toEqual([]);
  });
});
