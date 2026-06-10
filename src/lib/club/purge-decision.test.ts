import { describe, it, expect } from "vitest";
import {
  computePurgeAction,
  isPurgeDryRun,
  type PurgeDecisionInput,
} from "./purge-decision";

// Purga agendada para 2026-08-30; janela d30 abre a 31/07, d53 abre a 23/08.
const SCHEDULED = "2026-08-30T00:00:00.000Z";

function makeClub(
  partial: Partial<PurgeDecisionInput> = {},
): PurgeDecisionInput {
  return {
    plan_type: "individual",
    subscription_status: "canceled",
    data_purge_scheduled_at: SCHEDULED,
    purge_warning_d30_sent_at: null,
    purge_warning_d53_sent_at: null,
    ...partial,
  };
}

function at(iso: string): Date {
  return new Date(iso);
}

describe("computePurgeAction", () => {
  it("clube sales-led NUNCA e elegivel, mesmo com purga vencida", () => {
    expect(
      computePurgeAction(
        makeClub({ plan_type: "club" }),
        at("2026-12-31T00:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("sem agendamento nao ha accao", () => {
    expect(
      computePurgeAction(
        makeClub({ data_purge_scheduled_at: null }),
        at("2026-12-31T00:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("subscricao reactivada (active) nunca e elegivel — defesa em profundidade", () => {
    expect(
      computePurgeAction(
        makeClub({ subscription_status: "active" }),
        at("2026-12-31T00:00:00.000Z"),
      ),
    ).toBe("none");
    expect(
      computePurgeAction(
        makeClub({ subscription_status: "trialing" }),
        at("2026-12-31T00:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("antes da janela d30 nao ha accao", () => {
    expect(computePurgeAction(makeClub(), at("2026-07-30T23:00:00.000Z"))).toBe(
      "none",
    );
  });

  it("dentro da janela d30 envia warn_d30 uma unica vez", () => {
    const inWindow = at("2026-08-05T09:00:00.000Z");
    expect(computePurgeAction(makeClub(), inWindow)).toBe("warn_d30");
    expect(
      computePurgeAction(
        makeClub({ purge_warning_d30_sent_at: "2026-08-05T09:05:00.000Z" }),
        at("2026-08-06T09:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("dentro da janela d53 envia warn_d53 uma unica vez", () => {
    const inWindow = at("2026-08-24T09:00:00.000Z");
    expect(computePurgeAction(makeClub(), inWindow)).toBe("warn_d53");
    expect(
      computePurgeAction(
        makeClub({ purge_warning_d53_sent_at: "2026-08-24T09:05:00.000Z" }),
        at("2026-08-25T09:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("d30 nunca dispara depois da janela d53 abrir (salto silencioso)", () => {
    // d30 nao enviado, mas ja estamos a 5 dias do fim — d53 tem prioridade
    expect(computePurgeAction(makeClub(), at("2026-08-25T09:00:00.000Z"))).toBe(
      "warn_d53",
    );
    // d53 ja enviado e d30 continua null — nao volta atras para o d30
    expect(
      computePurgeAction(
        makeClub({ purge_warning_d53_sent_at: "2026-08-25T09:05:00.000Z" }),
        at("2026-08-26T09:00:00.000Z"),
      ),
    ).toBe("none");
  });

  it("purga vencida devolve purge", () => {
    expect(computePurgeAction(makeClub(), at("2026-08-30T00:00:01.000Z"))).toBe(
      "purge",
    );
    expect(computePurgeAction(makeClub(), at("2026-10-01T00:00:00.000Z"))).toBe(
      "purge",
    );
  });

  it("no limiar exacto do agendamento ja purga (>=)", () => {
    expect(computePurgeAction(makeClub(), at(SCHEDULED))).toBe("purge");
  });

  it("past_due/canceled fora de janelas nao age", () => {
    expect(
      computePurgeAction(
        makeClub({ subscription_status: "past_due" }),
        at("2026-07-01T00:00:00.000Z"),
      ),
    ).toBe("none");
  });
});

describe("isPurgeDryRun (kill-switch)", () => {
  it("default e dry-run: env ausente ou vazia", () => {
    expect(isPurgeDryRun(undefined)).toBe(true);
    expect(isPurgeDryRun("")).toBe(true);
  });

  it("apenas o literal false desliga o dry-run", () => {
    expect(isPurgeDryRun("false")).toBe(false);
    expect(isPurgeDryRun("FALSE")).toBe(false);
    expect(isPurgeDryRun(" false ")).toBe(false);
  });

  it("qualquer outro valor mantem dry-run (true, 1, off, typo)", () => {
    expect(isPurgeDryRun("true")).toBe(true);
    expect(isPurgeDryRun("1")).toBe(true);
    expect(isPurgeDryRun("off")).toBe(true);
    expect(isPurgeDryRun("flase")).toBe(true);
  });
});
