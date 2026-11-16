import { type PendingGrab, PENDING_KEY, readPending, removePending } from "./pending.js";
import { GRAB_MESSAGE, GRAB_SAVED_MESSAGE } from "../shared/grabMessages.js";

// Runs inside the What's Due page. The page saves grabs with your login (the
// extension can't use the login itself), then says which ones it saved.

async function deliverPending(): Promise<void> {
  for (const item of await readPending()) {
    window.postMessage(
      { type: GRAB_MESSAGE, id: item.id, grab: item.grab },
      window.location.origin,
    );
  }
}

// Other pages on localhost aren't What's Due, so they get nothing.
if (document.querySelector('meta[name="whats-due"]')) {
  // Shared with the page, so What's Due can show that the extension is there.
  document.documentElement.dataset.grabber = "connected";
  window.addEventListener("message", (event) => {
    const data = event.data as { type?: unknown; id?: unknown } | null;
    if (
      event.source === window &&
      data?.type === GRAB_SAVED_MESSAGE &&
      typeof data.id === "string"
    ) {
      removePending(data.id);
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const ids = (value: unknown) =>
      ((value as PendingGrab[] | undefined) ?? []).map((item) => item.id);
    const before = ids(changes[PENDING_KEY]?.oldValue);
    const somethingNew = ids(changes[PENDING_KEY]?.newValue).some((id) => !before.includes(id));
    if (area === "local" && somethingNew) {
      deliverPending();
    }
  });
  deliverPending();
}
