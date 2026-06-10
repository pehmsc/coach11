import { describe, it, expect } from "vitest";
import {
  computePurgeScheduleUpdate,
  PURGE_GRACE_DAYS,
  type PurgeClubState,
  type PurgeSubscriptionSnapshot,
} from "./purge-schedule";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const PERIOD_END = "2026-07-01T00:00:00.000Z";

function makeClub(partial: Partial<PurgeClubState> = {}): PurgeClubState {
  return {
    plan_type: "individual",
    data_purge_scheduled_at: null,
    ...partial,
  };
}

function makeSub(
  partial: Partial<PurgeSubscriptionSnapshot> = {},
): PurgeSubscriptionSnapshot {
  return {
    status: "active",
    cancel_at_period_end: false,
    current_period_end: PERIOD_END,
    ...partial,
  };
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

describe("computePurgeScheduleUpdate", () => {
  it("clube sales-led nunca agenda purga, mesmo cancelado", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub({ plan_type: "club" }),
        makeSub({ status: "canceled" }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });

  it("clube sales-led nunca limpa agendamento (nao o devia ter)", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub({ plan_type: "club", data_purge_scheduled_at: PERIOD_END }),
        makeSub({ status: "active" }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });

  it("cancel_at_period_end=true agenda period_end + 60 dias", () => {
    const result = computePurgeScheduleUpdate(
      makeClub(),
      makeSub({ cancel_at_period_end: true }),
      NOW,
    );
    expect(result).toEqual({
      kind: "set",
      data_purge_scheduled_at: addDays(PERIOD_END, PURGE_GRACE_DAYS),
    });
  });

  it("status canceled agenda period_end + 60 dias", () => {
    const result = computePurgeScheduleUpdate(
      makeClub(),
      makeSub({ status: "canceled" }),
      NOW,
    );
    expect(result).toEqual({
      kind: "set",
      data_purge_scheduled_at: addDays(PERIOD_END, PURGE_GRACE_DAYS),
    });
  });

  it("canceled sem period_end usa o momento actual + 60 dias", () => {
    const result = computePurgeScheduleUpdate(
      makeClub(),
      makeSub({ status: "canceled", current_period_end: null }),
      NOW,
    );
    expect(result).toEqual({
      kind: "set",
      data_purge_scheduled_at: addDays(NOW.toISOString(), PURGE_GRACE_DAYS),
    });
  });

  it("agendamento existente nunca se move em eventos repetidos", () => {
    const existing = addDays(PERIOD_END, PURGE_GRACE_DAYS);
    expect(
      computePurgeScheduleUpdate(
        makeClub({ data_purge_scheduled_at: existing }),
        makeSub({
          status: "canceled",
          current_period_end: "2026-08-01T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });

  it("reactivacao (active sem cancel_at_period_end) limpa agendamento", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub({ data_purge_scheduled_at: addDays(PERIOD_END, 60) }),
        makeSub({ status: "active" }),
        NOW,
      ),
    ).toEqual({ kind: "clear" });
  });

  it("trialing sem cancel_at_period_end limpa agendamento", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub({ data_purge_scheduled_at: addDays(PERIOD_END, 60) }),
        makeSub({ status: "trialing" }),
        NOW,
      ),
    ).toEqual({ kind: "clear" });
  });

  it("active sem agendamento nao faz nada", () => {
    expect(
      computePurgeScheduleUpdate(makeClub(), makeSub(), NOW),
    ).toEqual({ kind: "none" });
  });

  it("past_due nao agenda nem limpa (so cancelamento explicito agenda)", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub(),
        makeSub({ status: "past_due" }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
    expect(
      computePurgeScheduleUpdate(
        makeClub({ data_purge_scheduled_at: addDays(PERIOD_END, 60) }),
        makeSub({ status: "past_due" }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });

  it("unpaid nao agenda purga (dunning cancela no Stripe, fora do codigo)", () => {
    expect(
      computePurgeScheduleUpdate(
        makeClub(),
        makeSub({ status: "unpaid" }),
        NOW,
      ),
    ).toEqual({ kind: "none" });
  });
});
