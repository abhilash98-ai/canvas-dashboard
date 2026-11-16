import express, { type Request, type Response } from "express";
import { markPhoneTicksDone } from "./phoneDone.js";
import { selectDueAssignments } from "../shared/assignments.js";
import { applyGrab, parseGrab } from "../shared/grabbed.js";
import { parseHiddenRules } from "../shared/hiding.js";
import type { HelperFiles, HelperState } from "../helper/helperFiles.js";
import { CanvasError, fetchCalendarFeed, normalizeFeedUrl } from "./canvas.js";
import type { GrabbedStore, HiddenStore } from "./hiddenStore.js";
import { COOKIE_MAX_AGE_MS, SESSION_COOKIE, SessionStore, readCookie } from "./sessions.js";

// Real feed links are about 90 characters; anything far longer is a paste mistake.
const MAX_FEED_URL_LENGTH = 512;
const HELPER_TEST_DELAY_MS = 30 * 1000;

export function createApp(
  canvasBaseUrl: string,
  sessions: SessionStore,
  hidden: HiddenStore,
  grabbed: GrabbedStore,
  helper: HelperFiles | null = null,
): express.Express {
  const app = express();
  app.use(express.json());

  const sessionId = (request: Request) => readCookie(request.headers.cookie, SESSION_COOKIE);

  function setSessionCookie(response: Response, id: string): void {
    response.cookie(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "strict",
      maxAge: COOKIE_MAX_AGE_MS,
      path: "/",
    });
  }

  function sendCanvasError(response: Response, error: unknown, fallback: string): void {
    if (error instanceof CanvasError) {
      const status = error.status === 400 || error.status === 401 ? error.status : 502;
      response.status(status).json({ error: error.message });
    } else {
      console.error(fallback, error);
      response.status(500).json({ error: fallback });
    }
  }

  app.post("/api/login", async (request, response) => {
    const pasted = typeof request.body?.feedUrl === "string" ? request.body.feedUrl.trim() : "";
    if (!pasted) {
      response.status(400).json({ error: "Paste your Canvas calendar link first." });
      return;
    }
    if (pasted.length > MAX_FEED_URL_LENGTH) {
      response.status(400).json({ error: "That link is too long. Copy it again from Canvas." });
      return;
    }
    try {
      // Fetching the feed checks the link works, and the calendar says whose it is.
      const feedUrl = normalizeFeedUrl(pasted, canvasBaseUrl);
      const feed = await fetchCalendarFeed(feedUrl);
      setSessionCookie(response, sessions.create({ feedUrl, name: feed.ownerName }));
      response.json({ name: feed.ownerName });
    } catch (error) {
      sendCanvasError(response, error, "Something went wrong checking your link with Canvas.");
    }
  });

  // The helper's saved state, only if it belongs to this person. Someone else
  // trying the app on this Mac can't change or see the owner's.
  function ownHelperState(feedUrl: string): HelperState | null {
    const state = helper?.readState() ?? null;
    return state?.feedUrl === feedUrl ? state : null;
  }

  function helperStatus(feedUrl: string) {
    const state = ownHelperState(feedUrl);
    return {
      supported: helper !== null,
      connected: state !== null,
      running: helper?.isRunning(Date.now()) ?? false,
      phoneOn: state?.phoneOn ?? false,
      phoneProblem: state?.phoneOn ? (helper?.readPhoneProblem() ?? null) : null,
    };
  }

  app.post("/api/logout", (request, response) => {
    // Log out promises to forget the link, so the helper's copy goes too.
    const loggingOut = sessions.get(sessionId(request));
    if (loggingOut && ownHelperState(loggingOut.feedUrl)) {
      helper?.clearState();
    }
    sessions.delete(sessionId(request));
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.status(204).end();
  });

  app.get("/api/me", (request, response) => {
    const id = sessionId(request);
    const session = sessions.get(id);
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    // Renew the cookie on each visit so a regular user is never logged out.
    setSessionCookie(response, id!);
    response.json({ name: session.name });
  });

  app.get("/api/assignments", async (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    try {
      const feed = await fetchCalendarFeed(session.feedUrl);
      response.json(selectDueAssignments(feed.assignments, new Date()));
    } catch (error) {
      // A link Canvas no longer recognizes: end the session so the page sends
      // the person back to log in again.
      if (error instanceof CanvasError && error.status === 401) {
        sessions.delete(sessionId(request));
      }
      sendCanvasError(response, error, "Something went wrong loading assignments from Canvas.");
    }
  });

  app.get("/api/hidden", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    if (helper && ownHelperState(session.feedUrl)) {
      markPhoneTicksDone(helper, hidden);
    }
    response.json(hidden.get(session.feedUrl));
  });

  app.put("/api/hidden", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    const rules = parseHiddenRules(request.body);
    if (!rules) {
      response.status(400).json({ error: "Those hidden-assignment settings don't look right." });
      return;
    }
    hidden.set(session.feedUrl, rules);
    const helperState = ownHelperState(session.feedUrl);
    if (helperState) {
      helper?.writeState({ ...helperState, rules });
    }
    response.json(rules);
  });

  app.get("/api/grabbed", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    response.json(grabbed.get(session.feedUrl));
  });

  // The page passes on what the Brave extension read from Gradescope or PrairieTest.
  app.post("/api/grabbed", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    const grab = parseGrab(request.body);
    if (!grab) {
      response.status(400).json({ error: "What the extension sent doesn't look right." });
      return;
    }
    const updated = applyGrab(grabbed.get(session.feedUrl), grab);
    grabbed.set(session.feedUrl, updated);
    // The helper reminds about tests with the browser closed, so it needs the new list.
    const helperState = ownHelperState(session.feedUrl);
    if (helperState) {
      helper?.writeState({ ...helperState, tests: updated.exams });
    }
    response.json(updated);
  });

  app.get("/api/mac-helper", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    response.json(helperStatus(session.feedUrl));
  });

  app.put("/api/mac-helper", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    if (!helper) {
      response.status(404).json({ error: "The helper only works on a Mac." });
      return;
    }
    // phoneOn is left out by pages loaded before phone reminders existed.
    const { connected, alertsOn, soundOn, phoneOn = false } = request.body ?? {};
    if (
      typeof connected !== "boolean" ||
      typeof alertsOn !== "boolean" ||
      typeof soundOn !== "boolean" ||
      typeof phoneOn !== "boolean"
    ) {
      response.status(400).json({ error: "Those helper settings don't look right." });
      return;
    }
    if (connected) {
      helper.writeState({
        feedUrl: session.feedUrl,
        rules: hidden.get(session.feedUrl),
        tests: grabbed.get(session.feedUrl).exams,
        alertsOn,
        soundOn,
        phoneOn,
        testAt: ownHelperState(session.feedUrl)?.testAt ?? null,
      });
    } else if (ownHelperState(session.feedUrl)) {
      helper.clearState();
    }
    response.json(helperStatus(session.feedUrl));
  });

  app.post("/api/mac-helper/test", (request, response) => {
    const session = sessions.get(sessionId(request));
    if (!session) {
      response.status(401).json({ error: "Not logged in." });
      return;
    }
    const state = ownHelperState(session.feedUrl);
    if (!state) {
      response.status(409).json({ error: "Turn on reminders with the browser closed first." });
      return;
    }
    helper?.writeState({ ...state, testAt: Date.now() + HELPER_TEST_DELAY_MS });
    response.json(helperStatus(session.feedUrl));
  });

  return app;
}
