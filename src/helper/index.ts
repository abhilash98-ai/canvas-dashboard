import { type ChildProcess, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchCalendarFeed } from "../server/canvas.js";
import { selectDueAssignments } from "../shared/assignments.js";
import { appleReminders } from "./appleReminders.js";
import { createHelper } from "./helper.js";
import { HELPER_DIRECTORY, HelperFiles } from "./helperFiles.js";

// Runs in the background on the Mac, started at login by launchd, so reminders
// don't depend on a browser being open.
const TICK_MS = 5 * 1000;
const CHIME_SOUND = "/System/Library/Sounds/Glass.aiff";
const ALARM_SOUND = "/System/Library/Sounds/Sosumi.aiff";

const execFileAsync = promisify(execFile);

function logFailure(error: Error | null): void {
  if (error) {
    console.error("A Mac command failed.", error.message);
  }
}

// Titles arrive as arguments, never pasted into the script, so an assignment's
// name can't change what the script does.
async function runAppleScript(lines: string[], values: string[]): Promise<string> {
  const { stdout } = await execFileAsync("osascript", [
    ...lines.flatMap((line) => ["-e", line]),
    ...values,
  ]);
  return stdout.trim();
}

async function ringUntilStopped(message: string): Promise<void> {
  let stopped = false;
  let player: ChildProcess | undefined;
  const playAgain = (): void => {
    if (!stopped) {
      player = execFile("afplay", [ALARM_SOUND], playAgain);
    }
  };
  playAgain();
  try {
    await runAppleScript(
      [
        "on run argv",
        "activate",
        `display alert "What's Due" message (item 1 of argv) as critical buttons {"Stop alarm"} default button 1`,
        "end run",
      ],
      [message],
    );
  } finally {
    stopped = true;
    player?.kill();
  }
}

const helper = createHelper(new HelperFiles(HELPER_DIRECTORY), {
  async fetchAssignments(feedUrl) {
    const feed = await fetchCalendarFeed(feedUrl);
    return selectDueAssignments(feed.assignments, new Date());
  },
  banner(title, body) {
    runAppleScript(
      [
        "on run argv",
        "display notification (item 2 of argv) with title (item 1 of argv)",
        "end run",
      ],
      [title, body],
    ).catch(logFailure);
  },
  chime() {
    execFile("afplay", [CHIME_SOUND], logFailure);
  },
  ringUntilStopped,
  phone: appleReminders(runAppleScript),
});

async function run(): Promise<void> {
  try {
    await helper.tick(new Date());
  } catch (error) {
    console.error("The helper hit a problem.", error instanceof Error ? error.message : error);
  }
  setTimeout(run, TICK_MS);
}

run();
