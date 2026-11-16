import type { HelperFiles } from "../helper/helperFiles.js";
import type { HiddenStore } from "./hiddenStore.js";

// Marks Done whatever was ticked off in the iPhone's Reminders list, for the
// person the Mac helper is connected to. Returns how many were marked.
export function markPhoneTicksDone(helper: HelperFiles, hidden: HiddenStore): number {
  const state = helper.readState();
  if (!state) {
    return 0;
  }
  const ticked = helper.takePhoneDone();
  if (ticked.length === 0) {
    return 0;
  }
  const rules = hidden.get(state.feedUrl);
  const doneIds = [...new Set([...rules.doneIds, ...ticked])];
  const updated = { ...rules, doneIds };
  hidden.set(state.feedUrl, updated);
  // The helper hears straight away, so it stops reminding about them.
  helper.writeState({ ...state, rules: updated });
  return ticked.length;
}
