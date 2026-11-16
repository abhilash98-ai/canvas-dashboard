import { describe, expect, it } from "vitest";
import type { DueAssignment } from "../shared/assignments.js";
import { NO_HIDDEN_RULES } from "../shared/hiding.js";
import {
  alarmMessage,
  alertsToSend,
  practiceReminder,
  practiceSummary,
  soundFor,
} from "./alerts.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const NOW = new Date(2026, 10, 5, 12, 0);

function dueIn(ms: number, id = 1): DueAssignment {
  return {
    id,
    name: "Lab 4 Report",
    courseName: "PHYS 211",
    dueAt: new Date(NOW.getTime() + ms).toISOString(),
    url: "https://canvas.illinois.edu",
    overdue: ms < 0,
  };
}

const send = (assignments: DueAssignment[], sent = new Set<string>(), rules = NO_HIDDEN_RULES) =>
  alertsToSend(assignments, rules, NOW, sent);

describe("alertsToSend", () => {
  it("stays quiet when nothing is due within a day", () => {
    expect(send([dueIn(25 * HOUR_MS)])).toEqual([]);
  });

  it("reminds you a day before, 3 hours before, and an hour before", () => {
    for (const ms of [23 * HOUR_MS, 2 * HOUR_MS + 59 * MINUTE_MS, 59 * MINUTE_MS]) {
      const alerts = send([dueIn(ms)]);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].title).toBe("Lab 4 Report");
      expect(alerts[0].body).toContain("PHYS 211");
    }
  });

  it("doesn't repeat an alert that was already sent", () => {
    const assignment = dueIn(2 * HOUR_MS);
    const [first] = send([assignment]);
    expect(send([assignment], new Set([first.key]))).toEqual([]);
  });

  it("sends only the closest reminder when you open the site late, not all three", () => {
    const alerts = send([dueIn(30 * MINUTE_MS)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toBe("Due in 30 min · PHYS 211");
  });

  it("calls the course by the name you gave it", () => {
    const rules = { ...NO_HIDDEN_RULES, courseNicknames: { "PHYS 211": "Physics" } };
    expect(send([dueIn(30 * MINUTE_MS)], new Set(), rules)[0].body).toBe("Due in 30 min · Physics");
  });

  it("sends the next reminder once its time comes", () => {
    const assignment = dueIn(2 * HOUR_MS);
    const [threeHourAlert] = send([assignment]);
    const later = alertsToSend(
      [assignment],
      NO_HIDDEN_RULES,
      new Date(NOW.getTime() + 61 * MINUTE_MS),
      new Set([threeHourAlert.key]),
    );
    expect(later).toHaveLength(1);
    expect(later[0].key).not.toBe(threeHourAlert.key);
  });

  it("never alerts for work that's done, hidden, or already overdue", () => {
    const done = { ...NO_HIDDEN_RULES, doneIds: [1] };
    expect(send([dueIn(HOUR_MS / 2, 1)], new Set(), done)).toEqual([]);
    expect(send([dueIn(-HOUR_MS)])).toEqual([]);
  });
});

describe("muted assignments", () => {
  const muted = { ...NO_HIDDEN_RULES, mutedIds: [1] };

  it("never sends an alert, even in the last hour", () => {
    expect(send([dueIn(30 * MINUTE_MS, 1)], new Set(), muted)).toEqual([]);
  });

  it("leaves other assignments' alerts alone", () => {
    const alerts = send([dueIn(30 * MINUTE_MS, 1), dueIn(40 * MINUTE_MS, 2)], new Set(), muted);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toContain("2@");
  });

  it("is reported as silent by the practice reminder", () => {
    const practice = practiceReminder(
      [{ ...dueIn(30 * MINUTE_MS, 1), name: "Muted Lab" }, dueIn(40 * MINUTE_MS, 2)],
      muted,
      NOW,
    );
    expect(practice.alerts.map((alert) => alert.title)).toEqual(["Lab 4 Report"]);
    expect(practiceSummary(practice)).toBe(
      "Reminded you about: Lab 4 Report. Stayed silent because muted: Muted Lab.",
    );
  });

  it("says so when the practice reminder has nothing to do", () => {
    const practice = practiceReminder([dueIn(25 * HOUR_MS)], NO_HIDDEN_RULES, NOW);
    expect(practiceSummary(practice)).toContain("nothing to remind you about");
  });

  it("repeats reminders that already went out, so practice always has something to play", () => {
    const practice = practiceReminder([dueIn(2 * HOUR_MS)], NO_HIDDEN_RULES, NOW);
    expect(practice.alerts).toHaveLength(1);
  });
});

describe("soundFor", () => {
  it("is silent when no alerts went out", () => {
    expect(soundFor([])).toBeNull();
  });

  it("chimes for the 1-day and 3-hour reminders", () => {
    expect(soundFor(send([dueIn(23 * HOUR_MS)]))).toBe("chime");
    expect(soundFor(send([dueIn(2 * HOUR_MS)]))).toBe("chime");
  });

  it("rings the alarm for the 1-hour reminder, even alongside a chime", () => {
    expect(soundFor(send([dueIn(30 * MINUTE_MS)]))).toBe("alarm");
    expect(soundFor(send([dueIn(2 * HOUR_MS, 1), dueIn(30 * MINUTE_MS, 2)]))).toBe("alarm");
  });
});

describe("alarmMessage", () => {
  it("names the assignment when only one is ringing", () => {
    expect(alarmMessage(send([dueIn(30 * MINUTE_MS)]))).toBe(
      "Lab 4 Report: Due in 30 min · PHYS 211",
    );
  });

  it("counts only the assignments due within the hour", () => {
    const alerts = send([
      dueIn(2 * HOUR_MS, 1),
      dueIn(30 * MINUTE_MS, 2),
      dueIn(40 * MINUTE_MS, 3),
    ]);
    expect(alarmMessage(alerts)).toBe("2 assignments are due within the hour");
  });
});

describe("PrairieTest tests", () => {
  const toBook = (ms: number): DueAssignment => ({
    ...dueIn(ms, 9),
    name: "Book Q12",
    kind: "toBook",
  });

  it("reminds you once a day to book a test while booking stays open", () => {
    const alerts = send([toBook(4 * 24 * HOUR_MS)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe("Book Q12");
    expect(alerts[0].body).toMatch(/^Booking closes/);
    // Already reminded today: nothing more until tomorrow.
    expect(send([toBook(4 * 24 * HOUR_MS)], new Set([alerts[0].key]))).toEqual([]);
    const tomorrow = new Date(NOW.getTime() + 24 * HOUR_MS);
    expect(
      alertsToSend([toBook(4 * 24 * HOUR_MS)], NO_HIDDEN_RULES, tomorrow, new Set([alerts[0].key])),
    ).toHaveLength(1);
  });

  it("doesn't send the daily booking reminder before 9 AM", () => {
    const early = new Date(2026, 10, 5, 7, 0);
    expect(alertsToSend([toBook(4 * 24 * HOUR_MS)], NO_HIDDEN_RULES, early, new Set())).toEqual([]);
  });

  it("treats a booked test like homework: no daily reminder, the usual ones before it starts", () => {
    const booked = { ...dueIn(4 * 24 * HOUR_MS), kind: "booked" as const };
    expect(send([booked])).toEqual([]);
    const soon = { ...dueIn(2 * HOUR_MS), kind: "booked" as const };
    expect(send([soon])[0].body).toMatch(/^Exam in 2 hours/);
  });
});
