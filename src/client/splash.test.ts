import { describe, expect, it } from "vitest";
import { LOADING_JOKES, MIN_SPLASH_MS, remainingSplashTime, shuffledJokes } from "./splash.js";

describe("remainingSplashTime", () => {
  it("keeps swirling when Canvas answers fast, so the animation doesn't just flash", () => {
    expect(remainingSplashTime(300)).toBe(MIN_SPLASH_MS - 300);
  });

  it("adds no extra wait when Canvas was already slow", () => {
    expect(remainingSplashTime(MIN_SPLASH_MS + 2000)).toBe(0);
  });
});

describe("shuffledJokes", () => {
  it("uses every joke exactly once", () => {
    expect(shuffledJokes().sort()).toEqual([...LOADING_JOKES].sort());
  });

  it("starts on a different joke depending on luck", () => {
    expect(shuffledJokes(() => 0)[0]).not.toBe(shuffledJokes(() => 0.99)[0]);
  });
});
