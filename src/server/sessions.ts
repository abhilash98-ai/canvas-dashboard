import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readJsonFile, writeJsonFile } from "./jsonFile.js";

// Who is logged in. Each visitor's Canvas calendar link stays on the server;
// their browser only holds a random session ID in a cookie. Sessions are saved to a
// file so people stay logged in across server restarts, until they log out.
export interface Session {
  feedUrl: string;
  name: string;
}

export const SESSION_COOKIE = "whats_due_session";
// Browsers keep a cookie for at most 400 days; it's renewed on every visit.
export const COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

// What the sessions file holds: the link is encrypted, so the file alone is
// useless without the server's secret.
interface SavedSession {
  name: string;
  encryptedFeedUrl: string;
}

// AES-256-GCM: the output is iv.ciphertext.tag, and opening fails if any part
// was changed.
function encrypt(text: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, ciphertext, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

function decrypt(sealed: string, key: Buffer): string {
  const [iv, ciphertext, tag] = sealed.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export class SessionStore {
  private readonly key: Buffer;
  private readonly sessions: Map<string, SavedSession>;

  // filePath null keeps sessions in memory only (used by tests).
  constructor(
    secret: string,
    private readonly filePath: string | null,
  ) {
    this.key = createHash("sha256").update(secret).digest();
    this.sessions = new Map(Object.entries(filePath ? readJsonFile<SavedSession>(filePath) : {}));
  }

  private save(): void {
    if (this.filePath) {
      writeJsonFile(this.filePath, Object.fromEntries(this.sessions));
    }
  }

  create(session: Session): string {
    const id = randomBytes(32).toString("hex");
    this.sessions.set(id, {
      name: session.name,
      encryptedFeedUrl: encrypt(session.feedUrl, this.key),
    });
    this.save();
    return id;
  }

  get(id: string | undefined): Session | undefined {
    const saved = id ? this.sessions.get(id) : undefined;
    if (!saved) {
      return undefined;
    }
    try {
      return { name: saved.name, feedUrl: decrypt(saved.encryptedFeedUrl, this.key) };
    } catch {
      // Saved under a different secret; treat it as logged out.
      return undefined;
    }
  }

  delete(id: string | undefined): void {
    if (id && this.sessions.delete(id)) {
      this.save();
    }
  }
}

// Finds one cookie in a request's Cookie header, e.g. "a=1; whats_due_session=abc".
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  for (const pair of cookieHeader?.split(";") ?? []) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
  return undefined;
}
