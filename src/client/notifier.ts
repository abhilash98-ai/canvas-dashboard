import type { DueAssignment } from "../shared/assignments.js";
import type { HiddenRules } from "../shared/hiding.js";
import { alertsToSend, type DueAlert, practiceReminder, practiceSummary } from "./alerts.js";
import { type AlertPermission, alertsToggleView } from "./alertsToggle.js";
import { loadSwitchedOn, saveSwitchedOn } from "./switchSetting.js";

// Mac notifications for upcoming work, sent by the browser while a What's Due
// tab is open (even in the background). Which alerts were sent is remembered in
// this browser, so reloading the page doesn't repeat them.
const SENT_STORAGE_KEY = "whats-due-alerts-sent";
const SWITCHED_OFF_STORAGE_KEY = "whats-due-alerts-switched-off";
const CHECK_EVERY_MS = 60 * 1000;

export interface AlertSource {
  assignments(): DueAssignment[];
  hiddenRules(): HiddenRules;
  // True when the Mac helper is sending reminders, so this tab shouldn't too.
  helperHandlesAlerts(): boolean;
}

export interface Notifier {
  // Sends any alerts that are due now.
  check(): void;
  // Asks for permission without waiting for a click (Abhilash's choice). Some
  // browsers, like Safari, ignore this; the switch still works there.
  askRightAway(): void;
  // Sets off today's reminders without marking them sent, and says what happened.
  practice(): string;
  // The Alerts setting itself, whatever this browser's permission is.
  switchedOn(): boolean;
}

export interface AlertControls {
  toggle: HTMLInputElement;
  testButton: HTMLButtonElement;
  note: HTMLParagraphElement;
  banner: HTMLParagraphElement;
  // A dot on the Settings tab, for when alerts are stuck until something is fixed there.
  attentionDot: HTMLElement;
}

function loadSentKeys(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SENT_STORAGE_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function currentPermission(): AlertPermission {
  return "Notification" in window ? Notification.permission : "unsupported";
}

export function setUpAlerts(
  controls: AlertControls,
  source: AlertSource,
  onAlertsSent: (alerts: DueAlert[]) => void,
): Notifier {
  const { toggle, testButton, note, banner, attentionDot } = controls;
  const sentKeys = loadSentKeys();
  let switchedOn = loadSwitchedOn(SWITCHED_OFF_STORAGE_KEY);

  function showState(): void {
    const view = alertsToggleView(currentPermission(), switchedOn);
    toggle.checked = view.on;
    toggle.disabled = view.locked;
    testButton.hidden = !view.on;
    note.textContent = view.on
      ? "Alerts on: 1 day, 3 hours and 1 hour before things are due, while this tab is open."
      : "";
    banner.hidden = view.banner === null;
    banner.textContent = view.banner;
    attentionDot.hidden = !view.locked;
  }

  function notify(title: string, body: string, tag?: string): void {
    const notification = new Notification(title, { body, tag });
    // Clicking the alert brings you back to this tab.
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }

  function check(): void {
    if (source.helperHandlesAlerts() || !alertsToggleView(currentPermission(), switchedOn).on) {
      return;
    }
    const assignments = source.assignments();
    const alerts = alertsToSend(assignments, source.hiddenRules(), new Date(), sentKeys);
    for (const alert of alerts) {
      notify(alert.title, alert.body, alert.key);
      sentKeys.add(alert.key);
    }
    onAlertsSent(alerts);
    // Forget alerts for work that's no longer on the list, so this stays small.
    const onList = new Set(assignments.map((assignment) => `${assignment.id}@`));
    for (const key of sentKeys) {
      if (!onList.has(key.slice(0, key.indexOf("@") + 1))) {
        sentKeys.delete(key);
      }
    }
    localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify([...sentKeys]));
  }

  async function askForPermission(): Promise<void> {
    try {
      await Notification.requestPermission();
    } catch {
      // Older browsers or a blocked request; the switch shows what happened.
    }
    syncWithBrowser();
  }

  function syncWithBrowser(): void {
    showState();
    check();
  }

  toggle.addEventListener("change", () => {
    switchedOn = toggle.checked;
    saveSwitchedOn(SWITCHED_OFF_STORAGE_KEY, switchedOn);
    if (switchedOn && currentPermission() === "default") {
      askForPermission();
    } else {
      syncWithBrowser();
    }
  });

  testButton.addEventListener("click", () => {
    notify(
      "Test alert from What's Due",
      "Alerts are working. You'll get one 1 day, 3 hours and 1 hour before things are due.",
    );
  });

  // Unblocking in the browser's settings updates the page without a reload.
  // Not every browser reports the change, so coming back to the tab checks too.
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((status) => {
      status.onchange = syncWithBrowser;
    })
    .catch(() => undefined);
  window.addEventListener("focus", syncWithBrowser);

  showState();
  window.setInterval(check, CHECK_EVERY_MS);

  return {
    check,
    askRightAway() {
      if (switchedOn && currentPermission() === "default") {
        askForPermission();
      }
    },
    practice() {
      const reminder = practiceReminder(source.assignments(), source.hiddenRules(), new Date());
      if (alertsToggleView(currentPermission(), switchedOn).on) {
        for (const alert of reminder.alerts) {
          notify(`Practice: ${alert.title}`, alert.body);
        }
      }
      onAlertsSent(reminder.alerts);
      return practiceSummary(reminder);
    },
    switchedOn: () => switchedOn,
  };
}
