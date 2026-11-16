import type { GrabbedData } from "../shared/grabbed.js";
import { requestJson } from "./api.js";
import { demoTests } from "./demoAssignments.js";

export function fetchGrabbed(isDemo: boolean): Promise<GrabbedData> {
  return isDemo ? Promise.resolve(demoTests(new Date())) : requestJson<GrabbedData>("/api/grabbed");
}

// Sends something the extension grabbed to the server; it's checked there.
export function saveGrab(grab: unknown): Promise<GrabbedData> {
  return requestJson<GrabbedData>("/api/grabbed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(grab),
  });
}
