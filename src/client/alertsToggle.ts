export type AlertPermission = NotificationPermission | "unsupported";

export interface AlertsToggleView {
  // Whether the header switch shows as on. Alerts are only sent when it is.
  on: boolean;
  // True when the page can't change the answer, so the switch can't be used.
  locked: boolean;
  // How to get alerts working, or null when they already are.
  banner: string | null;
}

// A page can't take back a permission the browser has granted, so the switch
// is the app's own setting and alerts need both it and the browser's permission.
export function alertsToggleView(
  permission: AlertPermission,
  switchedOn: boolean,
): AlertsToggleView {
  switch (permission) {
    case "unsupported":
      return {
        on: false,
        locked: true,
        banner: "This browser can't show notifications. Open What's Due in Chrome or Safari.",
      };
    case "denied":
      return {
        on: false,
        locked: true,
        banner:
          "Notifications are blocked for this site. In Chrome, click the icon left of the " +
          "address bar and allow Notifications. In Safari, go to Safari > Settings > Websites > " +
          "Notifications and choose Allow for this site.",
      };
    case "default":
      return {
        on: false,
        locked: false,
        banner:
          "Alerts are off. Flip the Alerts switch in Settings, then choose Allow when your browser asks.",
      };
    case "granted":
      return switchedOn
        ? { on: true, locked: false, banner: null }
        : {
            on: false,
            locked: false,
            banner:
              "Alerts are off, so you won't get reminders. Flip the Alerts switch in Settings to turn them on.",
          };
  }
}
