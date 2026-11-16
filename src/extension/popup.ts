import { readPage, siteFor } from "./readers.js";
import { addPending, describeGrab } from "./pending.js";

// Runs when you click the extension's button: reads the page you're on and
// queues what it found for What's Due, which picks it up when it's open.

const message = document.querySelector<HTMLParagraphElement>("#message")!;
const openLink = document.querySelector<HTMLAnchorElement>("#open")!;

function show(text: string, isError = false): void {
  message.textContent = text;
  message.className = isError ? "error" : "";
}

async function grabCurrentTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !siteFor(tab.url)) {
    show("Open a Gradescope course page or your PrairieTest home page, then click again.", true);
    return;
  }
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  const page = new DOMParser().parseFromString(String(result?.result ?? ""), "text/html");
  const grab = readPage(page, tab.url, new Date());
  if (!grab) {
    show(
      "This page doesn't have grades or tests I know how to read. On PrairieTest, use the home page.",
      true,
    );
    return;
  }
  await addPending(grab);
  show(`${describeGrab(grab)} It shows up in What's Due as soon as that tab is open.`);
  openLink.hidden = false;
}

grabCurrentTab().catch((error: unknown) => {
  show(`Couldn't read this page. ${error instanceof Error ? error.message : String(error)}`, true);
});
