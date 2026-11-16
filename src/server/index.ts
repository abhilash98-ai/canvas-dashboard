import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { HELPER_DIRECTORY, HelperFiles } from "../helper/helperFiles.js";
import { createApp } from "./app.js";
import { GrabbedStore, HiddenStore } from "./hiddenStore.js";
import { SessionStore } from "./sessions.js";

const PORT = 3001;
// Saved logins, hidden-assignment rules, and the secret that protects them. Ignored by git.
const DATA_DIRECTORY = ".data";

// Settings from .env, which win over the shell environment.
function loadSettings(): NodeJS.Dict<string> {
  let fileSettings: NodeJS.Dict<string> = {};
  try {
    fileSettings = parseEnv(readFileSync(".env", "utf8"));
  } catch {
    // No .env file; the defaults are fine.
  }
  return { ...process.env, ...fileSettings };
}

// The secret that encrypts saved Canvas calendar links. Uses SESSION_SECRET if set (for
// hosting); otherwise makes one on first run and keeps it in .data/.
function loadSessionSecret(settings: NodeJS.Dict<string>): string {
  if (settings.SESSION_SECRET) {
    return settings.SESSION_SECRET;
  }
  const secretPath = `${DATA_DIRECTORY}/session-secret`;
  try {
    return readFileSync(secretPath, "utf8").trim();
  } catch {
    const secret = randomBytes(32).toString("hex");
    mkdirSync(DATA_DIRECTORY, { recursive: true });
    writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }
}

const settings = loadSettings();
// Which Canvas to talk to. Defaults to Illinois; set CANVAS_BASE_URL to use
// another school's Canvas.
const canvasBaseUrl = (settings.CANVAS_BASE_URL || "https://canvas.illinois.edu").replace(
  /\/+$/,
  "",
);
if (!canvasBaseUrl.startsWith("https://")) {
  console.error("CANVAS_BASE_URL must start with https://");
  process.exit(1);
}

const secret = loadSessionSecret(settings);
const sessions = new SessionStore(secret, `${DATA_DIRECTORY}/sessions.json`);
const hidden = new HiddenStore(secret, `${DATA_DIRECTORY}/hidden.json`);
const grabbed = new GrabbedStore(secret, `${DATA_DIRECTORY}/grabbed.json`);
const helperFiles = process.platform === "darwin" ? new HelperFiles(HELPER_DIRECTORY) : null;
createApp(canvasBaseUrl, sessions, hidden, grabbed, helperFiles).listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT} (Canvas: ${canvasBaseUrl})`);
});
