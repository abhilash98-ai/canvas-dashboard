# What's Due: Canvas Assignment Dashboard

A web app that pulls assignments from every course in Canvas into one list, grouped
into Overdue / Today / Tomorrow / This week / Later, soonest due first, so nothing slips
by. I built it because keeping track of assignments across all my classes was a real
struggle, and almost all of them post work on Canvas.

![The dashboard in demo mode, showing sample assignments grouped by due date](docs/screenshot.png)

## Features

- **One list across all courses**, each card labeled by course and linked to the
  assignment in Canvas. Overdue work is highlighted in red.
- **Home, Assignments, Grades, Tests and Settings tabs**, with summary tiles and a
  "Next up" card on Home.
- **Log in with your own Canvas calendar link.** Each person sees their own assignments.
  The app greets you by name and keeps you logged in across restarts until you log out.
- **Stays current:** re-checks Canvas every 5 minutes and whenever you return to the tab,
  with a check mark showing whether the last check worked.
- **Mark done, hide, mute:** ✓ Done with Undo, "Hide all like this" for repeating items,
  and per-assignment mute for reminders.
- **Course priority and friendlier names:** mark courses High / Normal / Low, sort by
  priority, and rename cryptic course codes.
- **Reminders:** browser alerts and sounds 1 day, 3 hours and 1 hour before work is due,
  plus an optional Mac background helper that keeps reminding with the browser closed.
- **iPhone reminders:** the Mac helper can keep a list in Apple Reminders that syncs to
  the iPhone; ticking one off there marks it Done in the app.
- **Comments** on each assignment, and **Add to Google Calendar** with the comments
  copied in.
- **Gradescope and PrairieTest:** a small browser extension grabs Gradescope scores and
  PrairieTest exams, shown on the Grades and Tests tabs with booking reminders.
- **Light and dark themes** and **demo mode** with sample data, for trying it without a
  Canvas account.

## How it works

- **Front end:** TypeScript and plain DOM, bundled with Vite.
- **Server:** Node + Express in TypeScript. It fetches the user's Canvas calendar feed
  (iCalendar `.ics`) and parses it into assignments. Browsers can't call Canvas directly
  (CORS), and this keeps the user's private feed link out of the page.
- **Why the calendar feed:** my university doesn't let students create Canvas API
  tokens, so the app reads the per-user calendar feed instead.
- **Logins:** feed links are encrypted with AES-256-GCM and stored on the server. The
  browser holds only a random session ID in an `httpOnly` cookie. The server accepts
  only Canvas feed URLs on the configured Canvas host.
- **Mac helper:** a small Node process (`npm run helper:install`) that shows banners and
  alarms and talks to Apple Reminders through AppleScript.
- **Extension:** a Chromium extension in `extension/` that reads Gradescope and PrairieTest
  pages and hands them to the app.
- **Tests:** Vitest, covering feed parsing, grouping and sorting, due-date labels, and
  the login API against a fake Canvas server, reminders, the Mac helper and the extension readers.

## Run it

Needs [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm run dev
```

Open http://localhost:5173. Paste your Canvas calendar link (Canvas → **Calendar** →
**Calendar Feed**, bottom right), or open http://localhost:5173/?demo to see sample data.

To use a Canvas other than Illinois, copy `.env.example` to `.env` and change
`CANVAS_BASE_URL`.

## Test and check

```bash
npm test
npm run typecheck
npm run format
```
