import { describe, expect, it } from "vitest";
import {
  isManualOverride,
  recalculateRequestSchema,
  type PlayerOverride,
} from "./game-recalculate";

const PLAYER_A = "550e8400-e29b-41d4-a716-446655440000";
const PLAYER_B = "550e8400-e29b-41d4-a716-446655440001";

describe("recalculateRequestSchema", () => {
  it("[1] payload mínimo válido (só finalMinute + starterIds)", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("[2] override com goals=25 produz erro (max 20)", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { goals: 25 } },
    });
    expect(result.success).toBe(false);
  });

  it("[3] red_cards=2 é válido", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { red_cards: 2 } },
    });
    expect(result.success).toBe(true);
  });

  it("[4] red_cards=3 produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { red_cards: 3 } },
    });
    expect(result.success).toBe(false);
  });

  it("[5] lineup_type='manager' produz erro de enum", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { lineup_type: "manager" } },
    });
    expect(result.success).toBe(false);
  });

  it("[6] notes com 2001 chars produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { notes: "x".repeat(2001) } },
    });
    expect(result.success).toBe(false);
  });

  it("[7] coach_rating=10.5 produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { coach_rating: 10.5 } },
    });
    expect(result.success).toBe(false);
  });

  it("[8] coach_rating=null é válido", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { coach_rating: null } },
    });
    expect(result.success).toBe(true);
  });

  it("[9] override só com coach_rating → isManualOverride=false", () => {
    const override: PlayerOverride = { coach_rating: 8 };
    expect(isManualOverride(override)).toBe(false);
  });

  it("[10] override com goals → isManualOverride=true", () => {
    const override: PlayerOverride = { goals: 2 };
    expect(isManualOverride(override)).toBe(true);
  });

  it("[11] force_auto=true sem overrides é válido", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      force_auto: true,
    });
    expect(result.success).toBe(true);
  });

  it("[12] strict: campo extra no payload produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      hackerField: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("[13] strict: campo extra dentro de override produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { goals: 1, secret: true } },
    });
    expect(result.success).toBe(false);
  });

  it("[14] starterIds aceita múltiplos UUIDs", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [PLAYER_A, PLAYER_B],
    });
    expect(result.success).toBe(true);
  });

  it("[15] minutes_played > 200 produz erro", () => {
    const result = recalculateRequestSchema.safeParse({
      finalMinute: 90,
      starterIds: [],
      overrides: { [PLAYER_A]: { minutes_played: 250 } },
    });
    expect(result.success).toBe(false);
  });

  it("[16] isManualOverride para override misto (coach_rating + goals) → true", () => {
    expect(isManualOverride({ coach_rating: 8, goals: 1 })).toBe(true);
  });

  it("[17] isManualOverride para undefined → false", () => {
    expect(isManualOverride(undefined)).toBe(false);
  });
});
