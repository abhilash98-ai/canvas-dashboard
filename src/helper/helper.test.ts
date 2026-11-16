import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DueAssignment } from "../shared/assignments.js";
import { examItemId } from "../shared/grabbed.js";
import { muteAlerts, NO_HIDDEN_RULES } from "../shared/hiding.js";
import { createHelper, type Helper, type HelperEffects } from "./helper.js";
import { type HelperState, HelperFiles } from "./helperFiles.js";
import type { PhoneItem } from "./phoneReminders.js";

// Stands in for the Reminders app: what's in the "What's Due" list.
function fakeRemindersApp() {
  const reminders = new Map<string, { item: PhoneItem; completed: boolean }>();
  let nextId = 1;
  return {
    reminders,
    titles: () => [...reminders.values()].map((reminder) => reminder.item.title),
    list: vi.fn(
      async () =>
        new Map([...reminders].map(([id, reminder]) => [id, { completed: reminder.completed }])),
    ),
    create: vi.fn(async (item: PhoneItem) => {
      const id = `r${nextId++}`;
      reminders.set(id, { item, completed: false });
      return id;
    }),
    update: vi.fn(async (id: string, item: PhoneItem) => {
      reminders.set(id, { item, completed: false });
    }),
    remove: vi.fn(async (id: string) => {
      reminders.delete(id);
    }),
  };
}

const MINUTE_MS = 60 * 1000;
const NOW = new Date(2026, 10, 9, 12, 0);

function dueIn(ms: number, id = 1): DueAssignment {
  return {
    id,
    name: `Lab ${id}`,
    courseName: "PHYS 211",
    dueAt: new Date(NOW.getTime() + ms).toISOString(),
    url: "https://canvas.illinois.edu",
    overdue: false,
  };
}

const ON: HelperState = {
  feedUrl: "https://canvas.illinois.edu/feeds/calendars/user_abc.ics",
  rules: NO_HIDDEN_RULES,
  tests: [],
  alertsOn: true,
  soundOn: true,
  phoneOn: false,
  testAt: null,
};

describe("the background helper", () => {
  let files: HelperFiles;
  let effects: HelperEffects;
  let helper: Helper;
  let phoneApp: ReturnType<typeof fakeRemindersApp>;

  function start(assignments: DueAssignment[]): void {
    effects = {
      fetchAssignments: vi.fn().mockResolvedValue(assignments),
      banner: vi.fn(),
      chime: vi.fn(),
      ringUntilStopped: vi.fn().mockResolvedValue(undefined),
      phone: phoneApp,
    };
    helper = createHelper(files, effects);
  }

  beforeEach(() => {
    phoneApp = fakeRemindersApp();
    files = new HelperFiles(mkdtempSync(join(tmpdir(), "whats-due-helper-")));
  });

  it("rings and shows a banner in the last hour", async () => {
    files.writeState(ON);
    start([dueIn(30 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.banner).toHaveBeenCalledWith("Lab 1", "Due in 30 min · PHYS 211");
    expect(effects.ringUntilStopped).toHaveBeenCalledWith("Lab 1: Due in 30 min · PHYS 211");
  });

  it("chimes for an earlier reminder", async () => {
    files.writeState(ON);
    start([dueIn(120 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.chime).toHaveBeenCalledOnce();
    expect(effects.ringUntilStopped).not.toHaveBeenCalled();
  });

  it("doesn't repeat a reminder, even after the helper restarts", async () => {
    files.writeState(ON);
    start([dueIn(120 * MINUTE_MS)]);
    await helper.tick(NOW);
    start([dueIn(120 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.banner).not.toHaveBeenCalled();
  });

  it("stays silent for a muted assignment", async () => {
    files.writeState({ ...ON, rules: { ...NO_HIDDEN_RULES, mutedIds: [1] } });
    start([dueIn(30 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.banner).not.toHaveBeenCalled();
    expect(effects.ringUntilStopped).not.toHaveBeenCalled();
  });

  it("sends banners but no sound when Sound is off", async () => {
    files.writeState({ ...ON, soundOn: false });
    start([dueIn(30 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.banner).toHaveBeenCalledOnce();
    expect(effects.ringUntilStopped).not.toHaveBeenCalled();
  });

  it("does nothing when Alerts is off", async () => {
    files.writeState({ ...ON, alertsOn: false });
    start([dueIn(30 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.fetchAssignments).not.toHaveBeenCalled();
    expect(effects.banner).not.toHaveBeenCalled();
  });

  it("does nothing, but still checks in, before anyone connects it", async () => {
    start([dueIn(30 * MINUTE_MS)]);
    await helper.tick(NOW);
    expect(effects.banner).not.toHaveBeenCalled();
    expect(files.isRunning(NOW.getTime())).toBe(true);
  });

  it("fires a test once, only when its time comes", async () => {
    files.writeState({ ...ON, alertsOn: false, testAt: NOW.getTime() + 30 * 1000 });
    start([]);
    await helper.tick(NOW);
    expect(effects.ringUntilStopped).not.toHaveBeenCalled();
    await helper.tick(new Date(NOW.getTime() + 31 * 1000));
    await helper.tick(new Date(NOW.getTime() + 36 * 1000));
    expect(effects.ringUntilStopped).toHaveBeenCalledOnce();
    expect(effects.banner).toHaveBeenCalledOnce();
  });

  it("says what's next in the test banner, so it reads like a real reminder", async () => {
    files.writeState(ON);
    start([dueIn(2 * 24 * 60 * MINUTE_MS)]);
    await helper.tick(NOW);
    files.writeState({ ...ON, testAt: NOW.getTime() });
    await helper.tick(new Date(NOW.getTime() + 1000));
    expect(effects.banner).toHaveBeenCalledWith(
      "Test alert from What's Due",
      expect.stringMatching(/^Lab 1: Due .* · PHYS 211$/),
    );
  });

  it("reminds about PrairieTest tests too, not only Canvas work", async () => {
    const test = {
      id: examItemId(5, true),
      kind: "booked" as const,
      name: "Midterm 2",
      courseName: "MATH 241",
      dueAt: new Date(NOW.getTime() + 30 * MINUTE_MS).toISOString(),
      url: "https://us.prairietest.com/pt",
    };
    files.writeState({ ...ON, tests: [test] });
    start([]);
    await helper.tick(NOW);
    expect(effects.banner).toHaveBeenCalledWith("Midterm 2", expect.stringMatching(/^Exam in/));
    expect(effects.ringUntilStopped).toHaveBeenCalledOnce();
  });

  it("keeps running when Canvas can't be reached", async () => {
    files.writeState(ON);
    start([]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    effects.fetchAssignments = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(helper.tick(NOW)).resolves.toBeUndefined();
  });

  describe("iPhone reminders", () => {
    const PHONE_ON = { ...ON, alertsOn: false, phoneOn: true };
    const DAY_MS = 24 * 60 * MINUTE_MS;

    it("puts upcoming work in the Reminders list, and takes it off once muted", async () => {
      const lab = dueIn(2 * DAY_MS, 1);
      files.writeState(PHONE_ON);
      start([lab, dueIn(3 * DAY_MS, 2)]);
      await helper.tick(NOW);
      expect(phoneApp.titles()).toEqual(["Lab 1 · PHYS 211", "Lab 2 · PHYS 211"]);

      files.writeState({ ...PHONE_ON, rules: muteAlerts(NO_HIDDEN_RULES, lab) });
      await helper.tick(new Date(NOW.getTime() + 1000));
      expect(phoneApp.titles()).toEqual(["Lab 2 · PHYS 211"]);
    });

    it("never touches the Reminders app while phone reminders are off", async () => {
      files.writeState(ON);
      start([dueIn(DAY_MS)]);
      await helper.tick(NOW);
      expect(phoneApp.list).not.toHaveBeenCalled();
    });

    it("doesn't empty the phone list when Canvas can't be reached", async () => {
      files.writeState(PHONE_ON);
      start([dueIn(2 * DAY_MS)]);
      await helper.tick(NOW);
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const restarted = createHelper(files, {
        ...effects,
        fetchAssignments: vi.fn().mockRejectedValue(new Error("offline")),
      });
      await restarted.tick(new Date(NOW.getTime() + 1000));
      expect(phoneApp.titles()).toEqual(["Lab 1 · PHYS 211"]);
    });

    it("clears its reminders off the phone when you turn phone reminders off", async () => {
      files.writeState(PHONE_ON);
      start([dueIn(2 * DAY_MS)]);
      await helper.tick(NOW);
      files.writeState({ ...PHONE_ON, phoneOn: false });
      await helper.tick(new Date(NOW.getTime() + 1000));
      expect(phoneApp.titles()).toEqual([]);
    });

    it("passes on a reminder ticked off on the phone, once, so it can be marked Done", async () => {
      files.writeState(PHONE_ON);
      start([dueIn(2 * DAY_MS, 7)]);
      await helper.tick(NOW);
      phoneApp.reminders.get("r1")!.completed = true;

      // The phone list is checked every couple of minutes.
      await helper.tick(new Date(NOW.getTime() + 6 * MINUTE_MS));
      expect(files.takePhoneDone()).toEqual([7]);

      await helper.tick(new Date(NOW.getTime() + 12 * MINUTE_MS));
      expect(files.takePhoneDone()).toEqual([]);
      expect(phoneApp.create).toHaveBeenCalledOnce();
    });

    it("says how to fix it when the Mac blocks the helper from Reminders", async () => {
      files.writeState(PHONE_ON);
      start([dueIn(2 * DAY_MS)]);
      phoneApp.list.mockRejectedValue(new Error("execution error: Not authorized (-1743)"));
      await helper.tick(NOW);
      expect(files.readPhoneProblem()).toMatch(/Privacy & Security → Automation/);
    });
  });
});
