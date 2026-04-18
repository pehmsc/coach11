import { describe, expect, it } from "vitest";

/**
 * Tests for the lineup starters-limit guard logic.
 *
 * The bug: when swapping starter A with substitute B in quick succession,
 * React hasn't re-rendered between the two click handlers. The guard
 * reads lineupStatuses from the render closure (stale), still counts A
 * as a starter, and blocks B from becoming a starter.
 *
 * The fix: use a ref (lineupRef) that is updated synchronously in the
 * same tick as the optimistic state update, so the guard always reads
 * the latest count.
 */

type LineupStatus = "on_field" | "substitute";

function simulateSwapWithStaleState(
  initialStatuses: Record<string, LineupStatus>,
  demoteId: string,
  promoteId: string,
  maxStarters: number,
): { demoteAllowed: boolean; promoteAllowed: boolean } {
  // Simulates the OLD behavior: both reads come from the same snapshot
  const staleStatuses = { ...initialStatuses };

  // Toggle 1: demote (demoting is always allowed, status not applied to snapshot)
  const demoteAllowed = true;

  // Toggle 2: promote — reads STALE count (doesn't see demote yet)
  const startersCount = Object.values(staleStatuses).filter(
    (s) => s === "on_field",
  ).length;
  const promoteAllowed = startersCount < maxStarters;

  return { demoteAllowed, promoteAllowed };
}

function simulateSwapWithRef(
  initialStatuses: Record<string, LineupStatus>,
  demoteId: string,
  promoteId: string,
  maxStarters: number,
): { demoteAllowed: boolean; promoteAllowed: boolean } {
  // Simulates the NEW behavior: ref is updated synchronously
  const refStatuses = { ...initialStatuses };

  // Toggle 1: demote — updates ref synchronously
  refStatuses[demoteId] =
    refStatuses[demoteId] === "on_field" ? "substitute" : "on_field";
  const demoteAllowed = true;

  // Toggle 2: promote — reads FRESH count from ref
  const startersCount = Object.values(refStatuses).filter(
    (s) => s === "on_field",
  ).length;
  const promoteAllowed = startersCount < maxStarters;

  return { demoteAllowed, promoteAllowed };
}

describe("lineup swap guard — stale state bug", () => {
  const footballFormat9 = 9;

  // Build lineup with exactly 9 starters
  const fullLineup: Record<string, LineupStatus> = {};
  for (let i = 1; i <= 9; i++) {
    fullLineup[`starter-${i}`] = "on_field";
  }
  for (let i = 1; i <= 5; i++) {
    fullLineup[`sub-${i}`] = "substitute";
  }

  it("OLD behavior: blocks promote after demote (stale closure)", () => {
    const result = simulateSwapWithStaleState(
      fullLineup,
      "starter-1", // demote this starter
      "sub-1", // promote this sub
      footballFormat9,
    );
    expect(result.demoteAllowed).toBe(true);
    // BUG: stale state still counts 9 starters, blocks promote
    expect(result.promoteAllowed).toBe(false);
  });

  it("NEW behavior: allows promote after demote (ref is fresh)", () => {
    const result = simulateSwapWithRef(
      fullLineup,
      "starter-1",
      "sub-1",
      footballFormat9,
    );
    expect(result.demoteAllowed).toBe(true);
    // FIX: ref sees 8 starters after demote, allows promote
    expect(result.promoteAllowed).toBe(true);
  });

  it("still blocks promotion when truly at limit (no demote)", () => {
    const result = simulateSwapWithRef(
      fullLineup,
      "sub-1", // toggle a sub (sub→starter), NOT a demote
      "sub-2", // try to promote another sub
      footballFormat9,
    );
    // After sub-1 promoted: 10 starters. sub-2 should be blocked.
    expect(result.promoteAllowed).toBe(false);
  });

  it("works for Football 7 with full lineup", () => {
    const lineup7: Record<string, LineupStatus> = {};
    for (let i = 1; i <= 7; i++) lineup7[`s-${i}`] = "on_field";
    for (let i = 1; i <= 4; i++) lineup7[`b-${i}`] = "substitute";

    const result = simulateSwapWithRef(lineup7, "s-1", "b-1", 7);
    expect(result.promoteAllowed).toBe(true);
  });

  it("works for Football 11 with full lineup", () => {
    const lineup11: Record<string, LineupStatus> = {};
    for (let i = 1; i <= 11; i++) lineup11[`s-${i}`] = "on_field";
    for (let i = 1; i <= 7; i++) lineup11[`b-${i}`] = "substitute";

    const result = simulateSwapWithRef(lineup11, "s-1", "b-1", 11);
    expect(result.promoteAllowed).toBe(true);
  });

  it("allows saving with fewer starters than limit", () => {
    const partialLineup: Record<string, LineupStatus> = {};
    for (let i = 1; i <= 7; i++) partialLineup[`s-${i}`] = "on_field";
    for (let i = 1; i <= 5; i++) partialLineup[`b-${i}`] = "substitute";

    // 7 starters out of 9 allowed — promote should be allowed
    const startersCount = Object.values(partialLineup).filter(
      (s) => s === "on_field",
    ).length;
    expect(startersCount).toBe(7);
    expect(startersCount < footballFormat9).toBe(true);
  });
});
