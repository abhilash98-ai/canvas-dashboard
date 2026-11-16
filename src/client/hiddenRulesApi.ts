import { type HiddenRules, NO_HIDDEN_RULES, parseHiddenRules } from "../shared/hiding.js";
import { requestJson } from "./api.js";

// Where Done marks and "Hide all like this" rules are kept: on the server for a
// real login, or in this browser for demo mode, which has no login.
const DEMO_STORAGE_KEY = "whats-due-demo-hidden";

export async function fetchHiddenRules(isDemo: boolean): Promise<HiddenRules> {
  if (isDemo) {
    const saved = localStorage.getItem(DEMO_STORAGE_KEY);
    return (saved && parseHiddenRules(JSON.parse(saved))) || NO_HIDDEN_RULES;
  }
  return parseHiddenRules(await requestJson<unknown>("/api/hidden")) ?? NO_HIDDEN_RULES;
}

export async function saveHiddenRules(isDemo: boolean, rules: HiddenRules): Promise<void> {
  if (isDemo) {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(rules));
    return;
  }
  await requestJson("/api/hidden", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rules),
  });
}
