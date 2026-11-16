import { requestJson } from "./api.js";

export interface HelperStatus {
  // False in places the helper can't work, such as a server that isn't a Mac.
  supported: boolean;
  connected: boolean;
  running: boolean;
  // Also keeping a "What's Due" list in Apple Reminders for the iPhone.
  phoneOn: boolean;
  // Why the Reminders list couldn't be updated last time, or null.
  phoneProblem: string | null;
}

export const NO_HELPER: HelperStatus = {
  supported: false,
  connected: false,
  running: false,
  phoneOn: false,
  phoneProblem: null,
};

export function fetchHelperStatus(): Promise<HelperStatus> {
  return requestJson<HelperStatus>("/api/mac-helper");
}

export function saveHelperSettings(
  connected: boolean,
  alertsOn: boolean,
  soundOn: boolean,
  phoneOn: boolean,
): Promise<HelperStatus> {
  return requestJson<HelperStatus>("/api/mac-helper", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connected, alertsOn, soundOn, phoneOn }),
  });
}

export function startHelperTest(): Promise<HelperStatus> {
  return requestJson<HelperStatus>("/api/mac-helper/test", { method: "POST" });
}
