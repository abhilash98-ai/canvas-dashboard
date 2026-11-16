import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HelperFiles } from "../helper/helperFiles.js";
import { examItemId } from "../shared/grabbed.js";
import { createApp } from "./app.js";
import { GrabbedStore, HiddenStore } from "./hiddenStore.js";
import { SessionStore } from "./sessions.js";

const CANVAS_URL = "https://canvas.test.example";
const GOOD_FEED = `${CANVAS_URL}/feeds/calendars/user_goodFeed123.ics`;

// Stands in for Canvas: only GOOD_FEED exists, and its calendar is empty.
// Like the real canvas.illinois.edu, an unknown feed link gets a 400.
function fakeCanvas(url: string): Response {
  if (url !== GOOD_FEED) {
    return new Response("Bad request", { status: 400 });
  }
  return new Response(
    "BEGIN:VCALENDAR\r\nX-WR-CALNAME:Abhilash Adusumalli Calendar (Canvas)\r\nEND:VCALENDAR\r\n",
  );
}

const SECRET = "test-secret";
const realFetch = globalThis.fetch;
const dataDirectory = mkdtempSync(join(tmpdir(), "whats-due-test-"));
const sessionsFile = join(dataDirectory, "sessions.json");
const hiddenFile = join(dataDirectory, "hidden.json");
const grabbedFile = join(dataDirectory, "grabbed.json");
const helperFiles = new HelperFiles(join(dataDirectory, "helper"));
let server: Server;
let appUrl: string;

// Starts the app the way index.ts does, reading saved logins and hidden rules
// from the test's data directory.
async function startServer(): Promise<void> {
  server = createApp(
    CANVAS_URL,
    new SessionStore(SECRET, sessionsFile),
    new HiddenStore(SECRET, hiddenFile),
    new GrabbedStore(SECRET, grabbedFile),
    helperFiles,
  ).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  appUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    return url.startsWith(CANVAS_URL) ? Promise.resolve(fakeCanvas(url)) : realFetch(input, init);
  });
  await startServer();
});

afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
  rmSync(dataDirectory, { recursive: true, force: true });
});

function logIn(feedUrl: string): Promise<Response> {
  return fetch(`${appUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedUrl }),
  });
}

function sessionCookie(response: Response): string {
  return response.headers.get("set-cookie")!.split(";")[0];
}

describe("logging in with a Canvas calendar link", () => {
  it("rejects an empty link without asking Canvas", async () => {
    const response = await logIn("   ");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/paste/i);
  });

  it("rejects links that aren't a calendar feed on our Canvas", async () => {
    for (const link of [
      "not a link",
      "https://evil.example/feeds/calendars/user_abc.ics",
      `${CANVAS_URL}/courses/1`,
    ]) {
      const response = await logIn(link);
      expect(response.status).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("rejects a calendar link Canvas doesn't recognize, and sets no session", async () => {
    const response = await logIn(`${CANVAS_URL}/feeds/calendars/user_wrong.ics`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/didn't recognize/);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("shows assignments only to someone who is logged in", async () => {
    const response = await fetch(`${appUrl}/api/assignments`);
    expect(response.status).toBe(401);
  });

  it("logs in with a good link, greets the person by name, and loads their assignments", async () => {
    const login = await logIn(`  ${GOOD_FEED.replace("https://", "webcal://")}\n`);
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ name: "Abhilash" });
    const cookie = sessionCookie(login);
    expect(cookie).not.toContain("goodFeed123");

    const me = await fetch(`${appUrl}/api/me`, { headers: { cookie } });
    expect(await me.json()).toEqual({ name: "Abhilash" });

    const assignments = await fetch(`${appUrl}/api/assignments`, { headers: { cookie } });
    expect(assignments.status).toBe(200);
    expect(await assignments.json()).toEqual([]);
  });

  it("stays logged in after the server restarts, without saving the link readably", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    expect(readFileSync(sessionsFile, "utf8")).not.toContain("goodFeed123");

    server.close();
    await startServer();

    const me = await fetch(`${appUrl}/api/me`, { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ name: "Abhilash" });
  });

  it("forgets the link on log out, even after a restart", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    const logout = await fetch(`${appUrl}/api/logout`, { method: "POST", headers: { cookie } });
    expect(logout.status).toBe(204);

    server.close();
    await startServer();
    const assignments = await fetch(`${appUrl}/api/assignments`, { headers: { cookie } });
    expect(assignments.status).toBe(401);
  });
});

describe("hiding assignments", () => {
  const rules = {
    doneIds: [101],
    patterns: [{ courseName: "ENG 100", namePattern: "A&P Class #" }],
    mutedIds: [202],
    courseWeights: { "MATH 231": "high" },
    courseNicknames: { CITL: "ACT Plan" },
    comments: [
      {
        id: "comment-1",
        assignmentId: 303,
        text: "Ask about part 2",
        createdAt: "2026-11-09T12:00:00.000Z",
      },
    ],
  };

  function saveRules(cookie: string, body: unknown): Promise<Response> {
    return fetch(`${appUrl}/api/hidden`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  }

  it("only lets someone who is logged in see or change what's hidden", async () => {
    expect((await fetch(`${appUrl}/api/hidden`)).status).toBe(401);
    expect((await saveRules("", rules)).status).toBe(401);
  });

  it("rejects malformed rules", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    const response = await saveRules(cookie, { doneIds: "everything" });
    expect(response.status).toBe(400);
  });

  it("keeps hidden assignments hidden after logging out and back in, and after a restart", async () => {
    const firstLogin = sessionCookie(await logIn(GOOD_FEED));
    expect((await saveRules(firstLogin, rules)).status).toBe(200);
    await fetch(`${appUrl}/api/logout`, { method: "POST", headers: { cookie: firstLogin } });

    server.close();
    await startServer();

    const secondLogin = sessionCookie(await logIn(GOOD_FEED));
    const response = await fetch(`${appUrl}/api/hidden`, { headers: { cookie: secondLogin } });
    expect(await response.json()).toEqual(rules);
    expect(readFileSync(hiddenFile, "utf8")).not.toContain("goodFeed123");
  });
});

describe("what the Brave extension grabs", () => {
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const examsGrab = {
    kind: "exams",
    grabbedAt: new Date().toISOString(),
    exams: [
      {
        id: examItemId(76718, false),
        kind: "toBook",
        name: "Book Q12: Recursion and Trees",
        courseName: "CS 124",
        dueAt: inTwoDays,
        url: "https://us.prairietest.com/pt/student/exam/76718",
      },
    ],
  };

  function sendGrab(cookie: string, body: unknown): Promise<Response> {
    return fetch(`${appUrl}/api/grabbed`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  }

  it("needs a login", async () => {
    expect((await fetch(`${appUrl}/api/grabbed`)).status).toBe(401);
  });

  it("rejects something that isn't grades or exams", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    expect((await sendGrab(cookie, { kind: "exams", exams: "lots" })).status).toBe(400);
  });

  it("keeps PrairieTest tests and Gradescope grades, and leaves tests off the Canvas list", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    expect((await sendGrab(cookie, examsGrab)).status).toBe(200);
    const grades = {
      kind: "grades",
      course: {
        site: "Gradescope",
        courseName: "Math 231 FA26",
        courseUrl: "https://www.gradescope.com/courses/111",
        grabbedAt: new Date().toISOString(),
        grades: [{ name: "Exam 1", score: "92.0 / 100.0", url: "https://www.gradescope.com/x" }],
      },
    };
    expect((await sendGrab(cookie, grades)).status).toBe(200);

    const assignments = await fetch(`${appUrl}/api/assignments`, { headers: { cookie } });
    expect(await assignments.json()).toEqual([]);
    const saved = await (await fetch(`${appUrl}/api/grabbed`, { headers: { cookie } })).json();
    expect(saved.exams).toEqual(examsGrab.exams);
    expect(saved.gradeCourses).toEqual([grades.course]);
  });
});

describe("the Mac helper", () => {
  function setHelper(cookie: string, body: unknown): Promise<Response> {
    return fetch(`${appUrl}/api/mac-helper`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  }
  const connect = { connected: true, alertsOn: true, soundOn: false };

  it("needs a login", async () => {
    expect((await fetch(`${appUrl}/api/mac-helper`)).status).toBe(401);
  });

  it("rejects settings that aren't true or false", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    expect((await setHelper(cookie, { connected: "yes" })).status).toBe(400);
  });

  it("gets the link and switches when connected, and forgets them when disconnected", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    const connected = await setHelper(cookie, connect);
    expect(await connected.json()).toMatchObject({ supported: true, connected: true });
    expect(helperFiles.readState()).toMatchObject({
      feedUrl: GOOD_FEED,
      alertsOn: true,
      soundOn: false,
    });
    // Tests grabbed earlier in this file reach the helper too.
    expect(helperFiles.readState()?.tests).toHaveLength(1);

    await setHelper(cookie, { ...connect, connected: false });
    expect(helperFiles.readState()).toBeNull();
  });

  it("turns iPhone reminders on, and passes on any problem the helper had with Reminders", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    const response = await setHelper(cookie, { ...connect, phoneOn: true });
    expect(await response.json()).toMatchObject({ phoneOn: true, phoneProblem: null });
    expect(helperFiles.readState()?.phoneOn).toBe(true);

    helperFiles.writePhoneProblem("Your Mac blocked the helper from using Reminders.");
    const status = await fetch(`${appUrl}/api/mac-helper`, { headers: { cookie } });
    expect(await status.json()).toMatchObject({
      phoneProblem: "Your Mac blocked the helper from using Reminders.",
    });
    helperFiles.writePhoneProblem(null);
  });

  it("marks work Done when it's ticked off in the iPhone's Reminders list", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    await setHelper(cookie, { ...connect, phoneOn: true });
    helperFiles.addPhoneDone([4242]);
    const response = await fetch(`${appUrl}/api/hidden`, { headers: { cookie } });
    expect((await response.json()).doneIds).toContain(4242);
    // The helper hears too, and the tick is only used once.
    expect(helperFiles.readState()?.rules.doneIds).toContain(4242);
    expect(helperFiles.takePhoneDone()).toEqual([]);
  });

  it("learns about a newly muted assignment", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    await setHelper(cookie, connect);
    await fetch(`${appUrl}/api/hidden`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ doneIds: [], patterns: [], mutedIds: [55] }),
    });
    expect(helperFiles.readState()?.rules.mutedIds).toEqual([55]);
  });

  it("schedules a test about 30 seconds out", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    await setHelper(cookie, connect);
    const before = Date.now();
    await fetch(`${appUrl}/api/mac-helper/test`, { method: "POST", headers: { cookie } });
    expect(helperFiles.readState()?.testAt).toBeGreaterThanOrEqual(before + 29 * 1000);
  });

  it("won't run a test before it's connected", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    await setHelper(cookie, { ...connect, connected: false });
    const response = await fetch(`${appUrl}/api/mac-helper/test`, {
      method: "POST",
      headers: { cookie },
    });
    expect(response.status).toBe(409);
  });

  it("forgets the saved link on Log out", async () => {
    const cookie = sessionCookie(await logIn(GOOD_FEED));
    await setHelper(cookie, connect);
    await fetch(`${appUrl}/api/logout`, { method: "POST", headers: { cookie } });
    expect(helperFiles.readState()).toBeNull();
  });
});
