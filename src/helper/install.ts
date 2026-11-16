import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { HELPER_DIRECTORY } from "./helperFiles.js";

// Installs the helper so macOS starts it at login, or removes it again with
// "npm run helper:uninstall".
const LABEL = "local.whatsdue.helper";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const SESSION = `gui/${userInfo().uid}`;
const SCRIPT_NAME = "helper.mjs";

function stopHelper(): void {
  try {
    execFileSync("launchctl", ["bootout", `${SESSION}/${LABEL}`], { stdio: "ignore" });
  } catch {
    // It wasn't running.
  }
}

// macOS finishes stopping the old helper a moment after "bootout" returns, and
// starting the new one before then fails, so it tries again for a few seconds.
async function startHelper(): Promise<void> {
  const ATTEMPTS = 10;
  for (let attempt = 1; ; attempt += 1) {
    try {
      execFileSync("launchctl", ["bootstrap", SESSION, PLIST_PATH], { stdio: "pipe" });
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

const escapeXml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function plist(scriptPath: string, logPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(process.execPath)}</string>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardErrorPath</key><string>${escapeXml(logPath)}</string>
</dict>
</plist>
`;
}

async function install(): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("The helper only works on a Mac.");
  }
  mkdirSync(HELPER_DIRECTORY, { recursive: true });
  await build({
    configFile: false,
    logLevel: "warn",
    build: {
      ssr: "src/helper/index.ts",
      outDir: HELPER_DIRECTORY,
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: SCRIPT_NAME } },
    },
  });
  stopHelper();
  mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
  writeFileSync(
    PLIST_PATH,
    plist(join(HELPER_DIRECTORY, SCRIPT_NAME), join(HELPER_DIRECTORY, "helper.log")),
  );
  await startHelper();
  console.log("The What's Due helper is installed and running.");
}

function uninstall(): void {
  stopHelper();
  rmSync(PLIST_PATH, { force: true });
  rmSync(HELPER_DIRECTORY, { recursive: true, force: true });
  console.log("The What's Due helper is removed, along with its saved calendar link.");
}

if (process.argv[2] === "uninstall") {
  uninstall();
} else {
  await install();
}
