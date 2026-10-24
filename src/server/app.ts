import express, { type Request, type Response } from "express";
import { selectDueAssignments } from "../shared/assignments.js";
import { CanvasError, fetchCalendarFeed, normalizeFeedUrl } from "./canvas.js";
import { COOKIE_MAX_AGE_MS, SESSION_COOKIE, SessionStore, readCookie } from "./sessions.js";

// Real feed links are about 90 characters; anything far longer is a paste mistake.
const MAX_FEED_URL_LENGTH = 512;

export function createApp(canvasBaseUrl: string, sessions: SessionStore): express.Express {
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

  app.post("/api/logout", (request, response) => {
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

  return app;
}
