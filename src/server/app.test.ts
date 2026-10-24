import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
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
let server: Server;
let appUrl: string;

// Starts the app the way index.ts does, reading saved logins from sessionsFile.
async function startServer(): Promise<void> {
  server = createApp(CANVAS_URL, new SessionStore(SECRET, sessionsFile)).listen(0);
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
