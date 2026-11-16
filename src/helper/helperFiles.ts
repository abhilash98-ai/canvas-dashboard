import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type GrabbedExam, parseExams } from "../shared/grabbed.js";
import { type HiddenRules, parseHiddenRules } from "../shared/hiding.js";
import { readJsonFile, writeJsonFile } from "../server/jsonFile.js";
import type { SyncedReminder, SyncedReminders } from "./phoneReminders.js";

// macOS stops background programs from reading the Desktop, where this project
// lives, so the server leaves what the helper needs here instead.
export const HELPER_DIRECTORY = join(homedir(), "Library", "Application Support", "WhatsDue");

// The helper checks in every few seconds; this long without one means it stopped.
const RUNNING_WITHIN_MS = 30 * 1000;

export interface HelperState {
  feedUrl: string;
  rules: HiddenRules;
  // PrairieTest tests from the Brave extension; Canvas work comes from feedUrl.
  tests: GrabbedExam[];
  alertsOn: boolean;
  soundOn: boolean;
  // Also keep a "What's Due" list in Apple Reminders, which iCloud puts on the iPhone.
  phoneOn: boolean;
  // When a test requested from Settings should go off, in milliseconds.
  testAt: number | null;
}

export class HelperFiles {
  private readonly statePath: string;
  private readonly heartbeatPath: string;
  private readonly sentPath: string;
  private readonly phonePath: string;
  private readonly phoneProblemPath: string;
  private readonly phoneDonePath: string;

  constructor(directory: string) {
    this.statePath = join(directory, "state.json");
    this.heartbeatPath = join(directory, "heartbeat.json");
    this.sentPath = join(directory, "sent.json");
    this.phonePath = join(directory, "phone.json");
    this.phoneProblemPath = join(directory, "phone-problem.json");
    this.phoneDonePath = join(directory, "phone-done.json");
  }

  readState(): HelperState | null {
    const saved = readJsonFile<unknown>(this.statePath);
    const rules = parseHiddenRules(saved.rules);
    if (typeof saved.feedUrl !== "string" || !rules) {
      return null;
    }
    return {
      feedUrl: saved.feedUrl,
      rules,
      // Saved by an older version without tests: none yet.
      tests: parseExams(saved.tests) ?? [],
      alertsOn: saved.alertsOn === true,
      soundOn: saved.soundOn === true,
      phoneOn: saved.phoneOn === true,
      testAt: typeof saved.testAt === "number" ? saved.testAt : null,
    };
  }

  writeState(state: HelperState): void {
    writeJsonFile(this.statePath, state);
  }

  clearState(): void {
    rmSync(this.statePath, { force: true });
  }

  markRunning(nowMs: number): void {
    writeJsonFile(this.heartbeatPath, { at: nowMs });
  }

  isRunning(nowMs: number): boolean {
    const { at } = readJsonFile<unknown>(this.heartbeatPath);
    return typeof at === "number" && nowMs - at < RUNNING_WITHIN_MS;
  }

  readSentKeys(): Set<string> {
    const { keys } = readJsonFile<unknown>(this.sentPath);
    return new Set(Array.isArray(keys) ? (keys as string[]) : []);
  }

  writeSentKeys(keys: ReadonlySet<string>): void {
    writeJsonFile(this.sentPath, { keys: [...keys] });
  }

  readPhoneSynced(): SyncedReminders {
    return readJsonFile<SyncedReminder>(this.phonePath);
  }

  writePhoneSynced(synced: SyncedReminders): void {
    writeJsonFile(this.phonePath, synced);
  }

  // Items ticked off on the phone, waiting for the server to mark them Done.
  // The helper adds to this and the server empties it, so a tick made while
  // the server isn't running still gets through once it starts.
  addPhoneDone(ids: number[]): void {
    writeJsonFile(this.phoneDonePath, { ids: [...new Set([...this.readPhoneDone(), ...ids])] });
  }

  takePhoneDone(): number[] {
    const ids = this.readPhoneDone();
    if (ids.length > 0) {
      writeJsonFile(this.phoneDonePath, { ids: [] });
    }
    return ids;
  }

  private readPhoneDone(): number[] {
    const { ids } = readJsonFile<unknown>(this.phoneDonePath);
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isSafeInteger(id)) : [];
  }

  // Why the last update of the phone list failed, for Settings to show; null if it worked.
  readPhoneProblem(): string | null {
    const { problem } = readJsonFile<unknown>(this.phoneProblemPath);
    return typeof problem === "string" ? problem : null;
  }

  writePhoneProblem(problem: string | null): void {
    writeJsonFile(this.phoneProblemPath, { problem });
  }
}
