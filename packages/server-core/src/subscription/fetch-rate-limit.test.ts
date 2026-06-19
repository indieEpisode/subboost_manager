import { describe, expect, it } from "vitest";
import { evaluateFixedWindow, type FixedWindowConfig, type FixedWindowState } from "./fetch-rate-limit";

const CONFIG: FixedWindowConfig = { limit: 3, windowSeconds: 600, cooldownSeconds: 86_400 };
const EMPTY: FixedWindowState = { windowStartedAt: null, countInWindow: 0, throttledUntil: null };
const base = new Date("2026-06-19T00:00:00.000Z");
const at = (seconds: number) => new Date(base.getTime() + seconds * 1000);

describe("evaluateFixedWindow", () => {
  it("allows the first request and starts a window", () => {
    const d = evaluateFixedWindow(base, EMPTY, CONFIG);
    expect(d.allowed).toBe(true);
    expect(d.justTripped).toBe(false);
    expect(d.nextState).toEqual({ windowStartedAt: base, countInWindow: 1, throttledUntil: null });
  });

  it("allows up to the limit within the window", () => {
    let state = EMPTY;
    for (let i = 1; i <= CONFIG.limit; i++) {
      const d = evaluateFixedWindow(at(i), state, CONFIG);
      expect(d.allowed).toBe(true);
      expect(d.nextState.countInWindow).toBe(i);
      state = d.nextState;
    }
  });

  it("trips cooldown on the request past the limit", () => {
    let state = EMPTY;
    for (let i = 1; i <= CONFIG.limit; i++) {
      state = evaluateFixedWindow(at(i), state, CONFIG).nextState;
    }
    const tripAt = at(CONFIG.limit + 1);
    const d = evaluateFixedWindow(tripAt, state, CONFIG);
    expect(d.allowed).toBe(false);
    expect(d.justTripped).toBe(true);
    expect(d.retryAfterSeconds).toBe(CONFIG.cooldownSeconds);
    expect(d.nextState.throttledUntil).toEqual(new Date(tripAt.getTime() + CONFIG.cooldownSeconds * 1000));
  });

  it("rejects during cooldown without re-counting and decrements retry-after", () => {
    const throttledUntil = at(100 + CONFIG.cooldownSeconds);
    const state: FixedWindowState = { windowStartedAt: at(100), countInWindow: CONFIG.limit + 1, throttledUntil };
    const d = evaluateFixedWindow(at(110), state, CONFIG);
    expect(d.allowed).toBe(false);
    expect(d.justTripped).toBe(false);
    expect(d.retryAfterSeconds).toBe(CONFIG.cooldownSeconds - 10);
    expect(d.nextState).toBe(state); // 冷却中不改状态
  });

  it("allows again after cooldown expires and resets the window", () => {
    const state: FixedWindowState = {
      windowStartedAt: at(-500),
      countInWindow: CONFIG.limit + 1,
      throttledUntil: at(100),
    };
    const resumeAt = at(100); // now >= throttledUntil
    const d = evaluateFixedWindow(resumeAt, state, CONFIG);
    expect(d.allowed).toBe(true);
    expect(d.nextState.countInWindow).toBe(1);
    expect(d.nextState.windowStartedAt).toEqual(resumeAt);
    expect(d.nextState.throttledUntil).toBeNull();
  });

  it("resets the count when the window naturally expires", () => {
    const state: FixedWindowState = { windowStartedAt: base, countInWindow: 2, throttledUntil: null };
    const d = evaluateFixedWindow(at(CONFIG.windowSeconds), state, CONFIG);
    expect(d.allowed).toBe(true);
    expect(d.nextState.countInWindow).toBe(1);
    expect(d.nextState.windowStartedAt).toEqual(at(CONFIG.windowSeconds));
  });

  it("never throttles when the limit or window is non-positive", () => {
    const disabledByLimit: FixedWindowConfig = { limit: 0, windowSeconds: 600, cooldownSeconds: 10 };
    const d = evaluateFixedWindow(base, EMPTY, disabledByLimit);
    expect(d.allowed).toBe(true);
    expect(d.nextState).toBe(EMPTY);

    const disabledByWindow: FixedWindowConfig = { limit: 5, windowSeconds: 0, cooldownSeconds: 10 };
    expect(evaluateFixedWindow(base, EMPTY, disabledByWindow).allowed).toBe(true);
  });
});
