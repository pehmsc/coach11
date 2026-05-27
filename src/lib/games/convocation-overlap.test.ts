import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildConflictLabel,
  buildInfoLabel,
  gameInterval,
  intervalsOverlap,
  type GameTimeSource,
  type SameDayEntry,
  type TimeFormatter,
} from "./convocation-overlap";

// game_datetime e wall-clock PT (timestamp without time zone). Os testes
// passam strings literais no formato "YYYY-MM-DDTHH:MM:SS" e validam que a
// logica de overlap continua correcta com runtime em UTC.
const originalTZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  process.env.TZ = originalTZ;
});

function makeGame(
  wallClockKickoff: string,
  endTime: string | null = null,
  concentrationTime: string | null = null,
): GameTimeSource {
  return {
    game_datetime: wallClockKickoff,
    concentration_time: concentrationTime,
    end_time: endTime,
  };
}

describe("gameInterval", () => {
  it("usa fallback de 2h30 quando end_time e null", () => {
    // 09:00 PT em Abril DST (UTC+1) = 08:00 UTC
    const interval = gameInterval(makeGame("2026-04-15T09:00:00"));
    expect(interval.start.toISOString()).toBe("2026-04-15T08:00:00.000Z");
    expect(interval.end.toISOString()).toBe("2026-04-15T10:30:00.000Z");
    expect(interval.endIsEstimated).toBe(true);
  });

  it("usa end_time real quando fornecido", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T09:00:00", "11:00:00"),
    );
    // 11:00 PT = 10:00 UTC em DST
    expect(interval.end.toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(interval.endIsEstimated).toBe(false);
  });

  it("aceita concentration_time como HH:MM (formato actual da UI)", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T09:00:00", null, "08:30"),
    );
    // 08:30 PT = 07:30 UTC em DST
    expect(interval.start.toISOString()).toBe("2026-04-15T07:30:00.000Z");
  });

  it("aceita concentration_time como wall-clock ISO PT", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T09:00:00", null, "2026-04-15T08:30:00"),
    );
    expect(interval.start.toISOString()).toBe("2026-04-15T07:30:00.000Z");
  });

  it("ignora concentration_time invalido", () => {
    const interval = gameInterval(
      makeGame("2026-04-15T09:00:00", null, "not-a-date"),
    );
    expect(interval.start.toISOString()).toBe("2026-04-15T08:00:00.000Z");
  });
});

describe("intervalsOverlap — cenarios em horario local PT", () => {
  it("[#1] A 08:00-10:30, B 17:00-19:30 mesmo dia -> nao conflito", () => {
    const a = makeGame("2026-04-15T08:00:00", "10:30:00");
    const b = makeGame("2026-04-15T17:00:00", "19:30:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#2] A 09:00-11:00, B 10:30-12:30 -> conflito", () => {
    const a = makeGame("2026-04-15T09:00:00", "11:00:00");
    const b = makeGame("2026-04-15T10:30:00", "12:30:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#3] A 09:00-11:00, B 11:00-13:00 (encostados) -> nao conflito (aberto)", () => {
    const a = makeGame("2026-04-15T09:00:00", "11:00:00");
    const b = makeGame("2026-04-15T11:00:00", "13:00:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#4] A 09:00 sem end_time, B 12:00 mesmo dia -> nao conflito (A 11:30)", () => {
    const a = makeGame("2026-04-15T09:00:00");
    const b = makeGame("2026-04-15T12:00:00", "14:00:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#5] A 09:00 sem end_time, B 11:00 -> conflito (A fallback ate 11:30 > 11:00)", () => {
    const a = makeGame("2026-04-15T09:00:00");
    const b = makeGame("2026-04-15T11:00:00", "13:00:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#6] dias diferentes -> nao conflito", () => {
    const a = makeGame("2026-04-15T10:00:00", "12:00:00");
    const b = makeGame("2026-04-16T10:00:00", "12:00:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });

  it("[#8] A 08:00-10:30, B 10:00 sem end_time -> conflito (10:00 < 10:30)", () => {
    const a = makeGame("2026-04-15T08:00:00", "10:30:00");
    const b = makeGame("2026-04-15T10:00:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(true);
  });

  it("[#9] A 09:00 sem end_time, B 11:30 sem end_time -> nao conflito", () => {
    const a = makeGame("2026-04-15T09:00:00");
    const b = makeGame("2026-04-15T11:30:00");
    expect(intervalsOverlap(gameInterval(a), gameInterval(b))).toBe(false);
  });
});

describe("intervalsOverlap — concentration_time", () => {
  it("[#10] concentration_time = null em ambos -> start = game_datetime, logica normal", () => {
    const a = gameInterval(makeGame("2026-04-15T09:00:00", "11:00:00"));
    const b = gameInterval(makeGame("2026-04-15T11:00:00", "13:00:00"));
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it("conflito real quando concentracao cobre o inicio do outro jogo", () => {
    // A: kickoff 10:00 PT, end 12:00, concentracao 09:00
    // B: kickoff 09:30 PT sem end_time -> fallback ate 12:00 PT
    const a = gameInterval(makeGame("2026-04-15T10:00:00", "12:00:00", "09:00"));
    const b = gameInterval(makeGame("2026-04-15T09:30:00"));
    expect(intervalsOverlap(a, b)).toBe(true);
  });
});

describe("endIsEstimated flag", () => {
  it("[#11a] true quando end_time e null", () => {
    expect(gameInterval(makeGame("2026-04-15T09:00:00")).endIsEstimated).toBe(true);
  });

  it("[#11b] false quando end_time e definido", () => {
    expect(
      gameInterval(makeGame("2026-04-15T09:00:00", "11:00:00")).endIsEstimated,
    ).toBe(false);
  });

  it("true quando end_time e anterior ao start (fallback)", () => {
    expect(
      gameInterval(makeGame("2026-04-15T20:00:00", "08:00:00")).endIsEstimated,
    ).toBe(true);
  });
});

// Formatter deterministico para testes (HH:mm UTC, sem timezone shenanigans).
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
