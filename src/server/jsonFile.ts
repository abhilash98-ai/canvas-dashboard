import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Reads a saved JSON object, or gives an empty one if nothing is saved yet.
export function readJsonFile<T>(filePath: string): Record<string, T> {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, T>;
  } catch {
    return {};
  }
}

// Writes a temporary file then swaps it in, so a crash mid-write can't leave a
// half-written file. Only this computer's user can read it.
export function writeJsonFile(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(data), { mode: 0o600 });
  renameSync(temporaryPath, filePath);
}
