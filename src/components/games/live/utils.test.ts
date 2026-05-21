import { describe, it, expect } from "vitest";
import {
  clampToValidMatchMinute,
  isClockStateStale,
  sanitizeHydratedClockState,
} from "./utils";
import type { ClockState } from "./types";

describe("clampToValidMatchMinute", () => {
  it("devolve o minuto quando válido", () => {
    expect(clampToValidMatchMinute(45)).toBe(45);
    expect(clampToValidMatchMinute(0)).toBe(0);
    expect(clampToValidMatchMinute(90)).toBe(90);
    expect(clampToValidMatchMinute(120)).toBe(120);
  });

  it("trunca decimais", () => {
    expect(clampToValidMatchMinute(45.7)).toBe(45);
  });

  it("devolve null para valores absurdos (>200)", () => {
    expect(clampToValidMatchMinute(201)).toBeNull();
    expect(clampToValidMatchMinute(1408)).toBeNull();
    expect(clampToValidMatchMinute(2011)).toBeNull();
  });

  it("devolve null para negativos", () => {
    expect(clampToValidMatchMinute(-1)).toBeNull();
    expect(clampToValidMatchMinute(-100)).toBeNull();
  });

  it("devolve null para NaN/Infinity/undefined/null", () => {
    expect(clampToValidMatchMinute(NaN)).toBeNull();
    expect(clampToValidMatchMinute(Infinity)).toBeNull();
    expect(clampToValidMatchMinute(-Infinity)).toBeNull();
    expect(clampToValidMatchMinute(undefined)).toBeNull();
    expect(clampToValidMatchMinute(null)).toBeNull();
  });

  it("aceita 200 (limite incluído)", () => {
    expect(clampToValidMatchMinute(200)).toBe(200);
  });
});

describe("sanitizeHydratedClockState", () => {
  const NOW = 1_700_000_000_000;

  it("devolve estado inalterado quando runningSinceMs é null", () => {
    const state: ClockState = { baseSeconds: 1000, runningSinceMs: null };
    expect(sanitizeHydratedClockState(state, NOW)).toEqual(state);
  });

  it("devolve estado inalterado quando runningSinceMs é recente (<6h)", () => {
    const state: ClockState = {
      baseSeconds: 1000,
      runningSinceMs: NOW - 1000,
    };
    expect(sanitizeHydratedClockState(state, NOW)).toEqual(state);
  });

  it("devolve estado inalterado em 5h59min (limite inferior)", () => {
    const state: ClockState = {
      baseSeconds: 1000,
      runningSinceMs: NOW - (5 * 60 * 60 * 1000 + 59 * 60 * 1000),
    };
    expect(sanitizeHydratedClockState(state, NOW)).toEqual(state);
  });

  it("pausa em 6h01min (limite excedido) preservando baseSeconds", () => {
    const state: ClockState = {
      baseSeconds: 1000,
      runningSinceMs: NOW - (6 * 60 * 60 * 1000 + 60 * 1000),
    };
    expect(sanitizeHydratedClockState(state, NOW)).toEqual({
      baseSeconds: 1000,
      runningSinceMs: null,
    });
  });

  it("pausa em 33h (caso real Real SC) preservando baseSeconds corrompido", () => {
    const state: ClockState = {
      baseSeconds: 84846,
      runningSinceMs: NOW - 33 * 60 * 60 * 1000,
    };
    expect(sanitizeHydratedClockState(state, NOW)).toEqual({
      baseSeconds: 84846,
      runningSinceMs: null,
    });
  });
});

describe("isClockStateStale", () => {
  const NOW = 1_700_000_000_000;

  it("false para runningSinceMs recente (<6h)", () => {
    expect(
      isClockStateStale(
        { baseSeconds: 0, runningSinceMs: NOW - 1000 },
        NOW,
      ),
    ).toBe(false);
  });

  it("true para runningSinceMs >6h atrás", () => {
    expect(
      isClockStateStale(
        { baseSeconds: 0, runningSinceMs: NOW - 7 * 3600 * 1000 },
        NOW,
      ),
    ).toBe(true);
  });

  it("false quando runningSinceMs é null", () => {
    expect(
      isClockStateStale({ baseSeconds: 0, runningSinceMs: null }, NOW),
    ).toBe(false);
  });
});
