import { describe, it, expect } from "vitest";
import {
  hasActiveAccess,
  isReadOnly,
  daysUntilTrialEnd,
  subscriptionLabel,
  blockedRedirectPath,
  type SubscriptionLike,
} from "./subscription-status";

function makeSub(
  partial: Partial<SubscriptionLike> = {},
): SubscriptionLike {
  return {
    subscription_status: null,
    trial_ends_at: null,
    subscription_current_period_end: null,
    subscription_cancel_at_period_end: false,
    plan_type: "individual",
    ...partial,
  };
}

describe("hasActiveAccess", () => {
  it("club tier always has access", () => {
    expect(
      hasActiveAccess(makeSub({ plan_type: "club", subscription_status: null })),
    ).toBe(true);
  });

  it("trialing has access", () => {
    expect(hasActiveAccess(makeSub({ subscription_status: "trialing" }))).toBe(
      true,
    );
  });

  it("active has access", () => {
    expect(hasActiveAccess(makeSub({ subscription_status: "active" }))).toBe(
      true,
    );
  });

  it("past_due within grace has access", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    expect(
      hasActiveAccess(
        makeSub({
          subscription_status: "past_due",
          subscription_current_period_end: yesterday.toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("past_due after grace has no access", () => {
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86_400_000);
    expect(
      hasActiveAccess(
        makeSub({
          subscription_status: "past_due",
          subscription_current_period_end: fiveDaysAgo.toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it("canceled with future period_end has access", () => {
    const future = new Date(Date.now() + 10 * 86_400_000);
    expect(
      hasActiveAccess(
        makeSub({
          subscription_status: "canceled",
          subscription_current_period_end: future.toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("canceled with past period_end has no access", () => {
    const past = new Date(Date.now() - 10 * 86_400_000);
    expect(
      hasActiveAccess(
        makeSub({
          subscription_status: "canceled",
          subscription_current_period_end: past.toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it("null status has no access (must subscribe)", () => {
    expect(hasActiveAccess(makeSub({ subscription_status: null }))).toBe(false);
  });
});

describe("isReadOnly", () => {
  it("only past_due after grace is read-only", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
    expect(
      isReadOnly(
        makeSub({
          subscription_status: "past_due",
          subscription_current_period_end: fiveDaysAgo.toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it("past_due within grace is not read-only", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(
      isReadOnly(
        makeSub({
          subscription_status: "past_due",
          subscription_current_period_end: yesterday.toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it("active is not read-only", () => {
    expect(isReadOnly(makeSub({ subscription_status: "active" }))).toBe(false);
  });

  it("club tier is never read-only", () => {
    expect(
      isReadOnly(
        makeSub({ plan_type: "club", subscription_status: "past_due" }),
      ),
    ).toBe(false);
  });
});

describe("daysUntilTrialEnd", () => {
  it("returns null when not trialing", () => {
    expect(
      daysUntilTrialEnd(makeSub({ subscription_status: "active" })),
    ).toBeNull();
  });

  it("returns 0 when trial_ends_at is past", () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(
      daysUntilTrialEnd(
        makeSub({
          subscription_status: "trialing",
          trial_ends_at: past.toISOString(),
        }),
      ),
    ).toBe(0);
  });

  it("returns positive days when trialing", () => {
    const inFiveDays = new Date(Date.now() + 5 * 86_400_000 + 1000);
    expect(
      daysUntilTrialEnd(
        makeSub({
          subscription_status: "trialing",
          trial_ends_at: inFiveDays.toISOString(),
        }),
      ),
    ).toBe(5);
  });
});

describe("subscriptionLabel", () => {
  it("shows trial days remaining", () => {
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000 + 1000);
    const label = subscriptionLabel(
      makeSub({
        subscription_status: "trialing",
        trial_ends_at: inThreeDays.toISOString(),
      }),
    );
    expect(label).toContain("Trial");
    expect(label).toContain("3");
  });

  it("shows cancellation pending", () => {
    expect(
      subscriptionLabel(
        makeSub({
          subscription_status: "active",
          subscription_cancel_at_period_end: true,
        }),
      ),
    ).toContain("cancelado");
  });

  it("shows past_due label", () => {
    expect(
      subscriptionLabel(makeSub({ subscription_status: "past_due" })),
    ).toBe("Pagamento em atraso");
  });

  it("club shows sales-led label", () => {
    expect(subscriptionLabel(makeSub({ plan_type: "club" }))).toContain(
      "sales-led",
    );
  });
});

describe("blockedRedirectPath", () => {
  it("null status redirects to /precos", () => {
    expect(blockedRedirectPath(makeSub({ subscription_status: null }))).toBe(
      "/precos",
    );
  });

  it("incomplete redirects to /precos", () => {
    expect(
      blockedRedirectPath(makeSub({ subscription_status: "incomplete" })),
    ).toBe("/precos");
  });

  it("canceled redirects to /billing/blocked", () => {
    expect(
      blockedRedirectPath(makeSub({ subscription_status: "canceled" })),
    ).toBe("/billing/blocked");
  });
});
