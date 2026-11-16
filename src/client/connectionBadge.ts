export type ConnectionState = "checking" | "ok" | "failed";

export interface ConnectionBadge {
  kind: "ok" | "failed";
  symbol: string;
  label: string;
}

// The mark beside the greeting that tells you whether the list on screen is
// fresh from Canvas. Nothing shows until the first check finishes.
export function connectionBadge(state: ConnectionState): ConnectionBadge | null {
  switch (state) {
    case "ok":
      return { kind: "ok", symbol: "✓", label: "Connected to Canvas, assignments are up to date" };
    case "failed":
      return { kind: "failed", symbol: "!", label: "Couldn't reach Canvas on the last check" };
    case "checking":
      return null;
  }
}
