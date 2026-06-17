import { describe, it, expect } from "vitest";
import { getPlanEntitlements } from "./plan-entitlements";

describe("getPlanEntitlements", () => {
  it("individual: 1 escalão, sem convites de staff", () => {
    expect(getPlanEntitlements("individual")).toEqual({
      maxAgeGroups: 1,
      canInviteStaff: false,
    });
  });

  it("club: escalões ilimitados, com staff", () => {
    const entitlements = getPlanEntitlements("club");
    expect(entitlements.maxAgeGroups).toBe(Number.POSITIVE_INFINITY);
    expect(entitlements.canInviteStaff).toBe(true);
  });

  it("default conservador: null/undefined/tier futuro tratam como club", () => {
    expect(getPlanEntitlements(null).canInviteStaff).toBe(true);
    expect(getPlanEntitlements(undefined).maxAgeGroups).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(getPlanEntitlements("club_pro").canInviteStaff).toBe(true);
  });
});
