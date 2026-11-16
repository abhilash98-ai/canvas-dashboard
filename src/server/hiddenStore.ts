import { createHmac } from "node:crypto";
import { type GrabbedData, NOTHING_GRABBED } from "../shared/grabbed.js";
import { type HiddenRules, NO_HIDDEN_RULES } from "../shared/hiding.js";
import { readJsonFile, writeJsonFile } from "./jsonFile.js";

// Something saved for each person. It's filed under a scrambled fingerprint of
// the person's Canvas calendar link rather than their login session, so it
// survives logging out and back in, and the file never holds the link itself.
export class PersonStore<T> {
  private readonly valueByPerson: Map<string, T>;

  // filePath null keeps everything in memory only (used by tests).
  constructor(
    private readonly secret: string,
    private readonly filePath: string | null,
    private readonly emptyValue: T,
  ) {
    this.valueByPerson = new Map(Object.entries(filePath ? readJsonFile<T>(filePath) : {}));
  }

  private personKey(feedUrl: string): string {
    return createHmac("sha256", this.secret).update(feedUrl).digest("hex");
  }

  get(feedUrl: string): T {
    return this.valueByPerson.get(this.personKey(feedUrl)) ?? this.emptyValue;
  }

  set(feedUrl: string, value: T): void {
    this.valueByPerson.set(this.personKey(feedUrl), value);
    if (this.filePath) {
      writeJsonFile(this.filePath, Object.fromEntries(this.valueByPerson));
    }
  }
}

// Each person's Done marks, "Hide all like this" rules, mutes and comments.
export class HiddenStore extends PersonStore<HiddenRules> {
  constructor(secret: string, filePath: string | null) {
    super(secret, filePath, NO_HIDDEN_RULES);
  }
}

// What each person grabbed with the Brave extension (grades and exams).
export class GrabbedStore extends PersonStore<GrabbedData> {
  constructor(secret: string, filePath: string | null) {
    super(secret, filePath, NOTHING_GRABBED);
  }
}
