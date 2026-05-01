import { describe, expect, it } from "vitest";
import {
  buildConflictLabel,
  buildInfoLabel,
  gameInterval,
  intervalsOverlap,
  type GameTimeSource,
  type SameDayEntry,
  type TimeFormatter,
} from "./convocation-overlap";

/**
 * Helper para construir um GameTimeSource com kickoff a uma hora específica
 * em Portugal (Europe/Lisbon). Os jogos são sempre num dia "verão DST"
 * (UTC+1) por defeito — irrelevante para a lógica de overlap, que é em UTC.
 */
function makeGame(
  isoKickoff: string,
  endTime: string | null = null,
  concentrationTime: string | null = null,
): GameTimeSource {
  return {
    game_datetime: isoKickoff,
    concentration_time: concentrationTime,
    end_time: endTime,
  };
}

describe("gameInterval", () => {
  it("usa fallback de 2h30 quando end_time é null", () => {
    const interval = gameInterval(makeGame("2026-04-15T08:00:00.000Z"));
    expect(interval.start.toISOString()).toBe("2026-04-15T08:00:00.000Z");
    expect(interval.end.toISOString()).toBe("2026-04-15T10:30:00.000Z");
    expect(interval.endIsEstimated).toBe(true);
  });

  it("usa end_time real quando fornecido", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T08:00:00.000Z", "10:00:00"),
    );
    // 10:00 hora local Portugal em 2026-04-15 (UTC+1, DST) = 09:00 UTC
    expect(interval.end.toISOString()).toBe("2026-04-15T09:00:00.000Z");
    expect(interval.endIsEstimated).toBe(false);
  });

  it("usa concentration_time como start quando definido", () => {
    const interval = gameInterval(
      makeGame(
        "2026-04-15T08:00:00.000Z",
        null,
        "2026-04-15T07:30:00.000Z",
      ),
    );
    expect(interval.start.toISOString()).toBe("2026-04-15T07:30:00.000Z");
  });

  it("ignora concentration_time inválido", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T08:00:00.000Z", null, "not-a-date"),
    );
    expect(interval.start.toISOString()).toBe("2026-04-15T08:00:00.000Z");
  });
});

describe("intervalsOverlap — cenários do prompt", () => {
  // Para evitar problemas de DST nos testes de horários precisos, usamos
  // sempre datas que estão na mesma janela DST Portugal.

  function gameAt(date: string, kickoffLocal: string, endLocal: string | null) {
    // Constrói um kickoff em Portugal e devolve a versão UTC.
    // 2026-04-15 está em horário de verão Portugal (UTC+1).
    const [year, month, day] = date.split("-").map(Number);
    const [h, m] = kickoffLocal.split(":").map(Number);
    // UTC+1 → subtrair 1h ao local para obter UTC
    const utcKickoff = new Date(
      Date.UTC(year, month - 1, day, h - 1, m, 0),
    ).toISOString();
    return makeGame(utcKickoff, endLocal);
  }

  it("[#1] A 08:00–10:30, B 17:00–19:30 (mesmo dia) → não conflito", () => {
    const a = gameAt("2026-04-15", "08:00", "10:30");
    const b = gameAt("2026-04-15", "17:00", "19:30");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#2] A 09:00–11:00, B 10:30–12:30 → conflito", () => {
    const a = gameAt("2026-04-15", "09:00", "11:00");
    const b = gameAt("2026-04-15", "10:30", "12:30");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#3] A 09:00–11:00, B 11:00–13:00 (encostados) → não conflito (intervalo aberto)", () => {
    const a = gameAt("2026-04-15", "09:00", "11:00");
    const b = gameAt("2026-04-15", "11:00", "13:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#4] A 09:00 sem end_time, B 12:00 (mesmo dia) → não conflito (A acaba 11:30)", () => {
    const a = gameAt("2026-04-15", "09:00", null);
    const b = gameAt("2026-04-15", "12:00", "14:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#5] A 09:00 sem end_time, B 11:00 → conflito (fallback A acaba 11:30 > 11:00)", () => {
    const a = gameAt("2026-04-15", "09:00", null);
    const b = gameAt("2026-04-15", "11:00", "13:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#6] jogos em dias diferentes → não conflito", () => {
    const a = gameAt("2026-04-15", "10:00", "12:00");
    const b = gameAt("2026-04-16", "10:00", "12:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#8] A 08:00–10:30, B 10:00 sem end_time, sem concentration_time → conflito (10:00 < 10:30)", () => {
    const a = gameAt("2026-04-15", "08:00", "10:30");
    const b = gameAt("2026-04-15", "10:00", null);
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#9] A 09:00 sem end_time, B 11:30 sem end_time → não conflito (A acaba 11:30, B começa 11:30)", () => {
    const a = gameAt("2026-04-15", "09:00", null);
    const b = gameAt("2026-04-15", "11:30", null);
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });
});

describe("intervalsOverlap — concentration_time", () => {
  it("[#10] concentration_time = null em ambos → start = game_datetime, lógica normal", () => {
    const a = gameInterval(makeGame("2026-04-15T08:00:00.000Z", "10:00:00"));
    const b = gameInterval(makeGame("2026-04-15T10:00:00.000Z", "12:00:00"));
    expect(a.start.toISOString()).toBe("2026-04-15T08:00:00.000Z");
    expect(b.start.toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(intervalsOverlap(a, b)).toBe(false); // 08-09 UTC vs 10-11 UTC, sem overlap (end_time é local Portugal)
  });

  it("conflito real quando concentration cobre o início do outro jogo", () => {
    // Jogo A: kickoff 09:00 UTC, end 11:00 UTC (10h Lisboa local), concentration 08:00 UTC
    // Jogo B: kickoff 08:30 UTC sem end_time → fallback até 11:00 UTC
    const a = gameInterval(
      makeGame(
        "2026-04-15T09:00:00.000Z",
        null,
        "2026-04-15T08:00:00.000Z",
      ),
    );
    const b = gameInterval(makeGame("2026-04-15T08:30:00.000Z"));
    expect(intervalsOverlap(a, b)).toBe(true);
  });
});

describe("endIsEstimated flag", () => {
  it("[#11a] true quando end_time é null", () => {
    const interval = gameInterval(makeGame("2026-04-15T08:00:00.000Z"));
    expect(interval.endIsEstimated).toBe(true);
  });

  it("[#11b] false quando end_time é definido", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T08:00:00.000Z", "10:00:00"),
    );
    expect(interval.endIsEstimated).toBe(false);
  });

  it("true quando end_time é HH:MM válido mas anterior ao start (cai para fallback)", () => {
    // Não esperado em produção, mas defensivo
    const interval = gameInterval(
      makeGame("2026-04-15T20:00:00.000Z", "08:00:00"),
    );
    expect(interval.endIsEstimated).toBe(true);
  });
});

// Formatter determinístico para testes (HH:mm UTC, sem timezone shenanigans).
const fakeFormatTime: TimeFormatter = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
};

function makeEntry(
  startIso: string,
  endIso: string,
  opts: {
    endIsEstimated?: boolean;
    isOverlap?: boolean;
    connector?: string;
    opponentName?: string;
  } = {},
): SameDayEntry {
  return {
    start: new Date(startIso),
    end: new Date(endIso),
    endIsEstimated: opts.endIsEstimated ?? false,
    connector: opts.connector ?? "vs",
    opponentName: opts.opponentName ?? "Adversário",
    isOverlap: opts.isOverlap ?? false,
  };
}

describe("buildConflictLabel", () => {
  it("formata 'Sobreposição: vs Torre (09:00–11:00)' quando end NÃO é estimado", () => {
    const entry = makeEntry(
      "2026-04-15T09:00:00.000Z",
      "2026-04-15T11:00:00.000Z",
      { isOverlap: true, opponentName: "Torre" },
    );
    expect(buildConflictLabel(entry, fakeFormatTime)).toBe(
      "Sobreposição: vs Torre (09:00–11:00)",
    );
  });

  it("[L6] prefixa end com '~' quando endIsEstimated", () => {
    const entry = makeEntry(
      "2026-04-15T09:00:00.000Z",
      "2026-04-15T11:30:00.000Z",
      { isOverlap: true, opponentName: "Torre", endIsEstimated: true },
    );
    expect(buildConflictLabel(entry, fakeFormatTime)).toBe(
      "Sobreposição: vs Torre (09:00–~11:30)",
    );
  });

  it("fallback para nome sem horas quando formatTime devolve null", () => {
    const entry = makeEntry(
      "2026-04-15T09:00:00.000Z",
      "2026-04-15T11:00:00.000Z",
      { isOverlap: true, opponentName: "Torre" },
    );
    const nullFormatter: TimeFormatter = () => null;
    expect(buildConflictLabel(entry, nullFormatter)).toBe(
      "Sobreposição: vs Torre",
    );
  });
});

describe("buildInfoLabel", () => {
  it("[L1] devolve null para lista vazia", () => {
    expect(buildInfoLabel([], fakeFormatTime)).toBeNull();
  });

  it("[L2] 1 jogo sem sobreposição: 'Convocado: vs Carcavelos (08:00)'", () => {
    const entries = [
      makeEntry(
        "2026-04-15T08:00:00.000Z",
        "2026-04-15T10:30:00.000Z",
        { opponentName: "Carcavelos" },
      ),
    ];
    expect(buildInfoLabel(entries, fakeFormatTime)).toBe(
      "Convocado: vs Carcavelos (08:00)",
    );
  });

  it("[L3] 2 jogos ordenados por hora", () => {
    const entries = [
      makeEntry(
        "2026-04-15T15:00:00.000Z",
        "2026-04-15T17:30:00.000Z",
        { opponentName: "Restelo" },
      ),
      makeEntry(
        "2026-04-15T08:00:00.000Z",
        "2026-04-15T10:30:00.000Z",
        { opponentName: "Carcavelos" },
      ),
    ];
    expect(buildInfoLabel(entries, fakeFormatTime)).toBe(
      "Convocado: vs Carcavelos (08:00), vs Restelo (15:00)",
    );
  });

  it("3 jogos ordenados por hora", () => {
    const entries = [
      makeEntry(
        "2026-04-15T20:00:00.000Z",
        "2026-04-15T22:30:00.000Z",
        { opponentName: "Belém" },
      ),
      makeEntry(
        "2026-04-15T08:00:00.000Z",
        "2026-04-15T10:30:00.000Z",
        { opponentName: "Carcavelos" },
      ),
      makeEntry(
        "2026-04-15T15:00:00.000Z",
        "2026-04-15T17:30:00.000Z",
        { opponentName: "Restelo" },
      ),
    ];
    expect(buildInfoLabel(entries, fakeFormatTime)).toBe(
      "Convocado: vs Carcavelos (08:00), vs Restelo (15:00), vs Belém (20:00)",
    );
  });

  it("conector personalizado é preservado", () => {
    const entries = [
      makeEntry(
        "2026-04-15T08:00:00.000Z",
        "2026-04-15T10:30:00.000Z",
        { opponentName: "Sport", connector: "@" },
      ),
    ];
    expect(buildInfoLabel(entries, fakeFormatTime)).toBe(
      "Convocado: @ Sport (08:00)",
    );
  });
});

describe("integração label-building (route.ts behavior)", () => {
  // Simula o algoritmo do route.ts contra um set de entries pre-calculadas
  // sem mockar Supabase. Verifica a regra de exclusão mútua.
  function pickLabels(entries: SameDayEntry[]) {
    const overlap = entries.find((e) => e.isOverlap);
    if (overlap) {
      return {
        conflict: buildConflictLabel(overlap, fakeFormatTime),
        info: null as string | null,
        blocked: true,
      };
    }
    const info = buildInfoLabel(entries, fakeFormatTime);
    return { conflict: null as string | null, info, blocked: false };
  }

  it("[L1] sem entries → ambas labels null, não bloqueado", () => {
    const r = pickLabels([]);
    expect(r).toEqual({ conflict: null, info: null, blocked: false });
  });

  it("[L4] 1 jogo com sobreposição → label conflict, sem info, bloqueado", () => {
    const r = pickLabels([
      makeEntry(
        "2026-04-15T09:00:00.000Z",
        "2026-04-15T11:00:00.000Z",
        { isOverlap: true, opponentName: "Torre" },
      ),
    ]);
    expect(r.blocked).toBe(true);
    expect(r.conflict).toBe("Sobreposição: vs Torre (09:00–11:00)");
    expect(r.info).toBeNull();
  });

  it("[L5] 1 com sobreposição + 1 sem → conflict prevalece, info=null", () => {
    const r = pickLabels([
      makeEntry(
        "2026-04-15T08:00:00.000Z",
        "2026-04-15T10:30:00.000Z",
        { opponentName: "Carcavelos" },
      ),
      makeEntry(
        "2026-04-15T09:00:00.000Z",
        "2026-04-15T11:00:00.000Z",
        { isOverlap: true, opponentName: "Torre" },
      ),
    ]);
    expect(r.blocked).toBe(true);
    expect(r.conflict).toContain("Torre");
    expect(r.info).toBeNull();
  });
});
