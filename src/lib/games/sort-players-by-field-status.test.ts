import { describe, expect, it } from "vitest";
import {
  sortPlayersByFieldStatus,
  comparePlayersByFootballPriority,
} from "./sort-players-by-field-status";
import type { LivePlayer } from "@/components/games/live/types";

function make(
  overrides: Partial<LivePlayer> & { id: string } & Pick<LivePlayer, "isOnField">,
): LivePlayer {
  return {
    first_name: "Test",
    last_name: "Player",
    isInitialBench: !overrides.isOnField,
    ...overrides,
  } as unknown as LivePlayer;
}

describe("sortPlayersByFieldStatus", () => {
  describe("agrupamento (campo → banco → expulso)", () => {
    it("[1] coloca em campo antes do banco", () => {
      const result = sortPlayersByFieldStatus([
        make({ id: "b", first_name: "Bench", isOnField: false }),
        make({ id: "f", first_name: "Field", isOnField: true }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["f", "b"]);
    });

    it("[2] coloca expulsos no fim, mesmo que estivessem em campo", () => {
      const result = sortPlayersByFieldStatus(
        [
          make({ id: "f", first_name: "Field", isOnField: true }),
          make({ id: "e", first_name: "Expelled", isOnField: true }),
          make({ id: "b", first_name: "Bench", isOnField: false }),
        ],
        new Set(["e"]),
      );
      expect(result.map((p) => p.id)).toEqual(["f", "b", "e"]);
    });
  });

  describe("ordenação dentro de cada grupo: GR → jersey → nome", () => {
    it("[3] GR primeiro mesmo que tenha jersey alto", () => {
      const result = sortPlayersByFieldStatus([
        make({
          id: "p10",
          first_name: "Striker",
          isOnField: true,
          jersey_number: 10,
          preferred_position: "AV",
        }),
        make({
          id: "p1",
          first_name: "Keeper",
          isOnField: true,
          jersey_number: 99,
          preferred_position: "GR",
        }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["p1", "p10"]);
    });

    it("[4] ordena por jersey ASC entre não-GR", () => {
      const result = sortPlayersByFieldStatus([
        make({ id: "p7", jersey_number: 7, isOnField: true }),
        make({ id: "p3", jersey_number: 3, isOnField: true }),
        make({ id: "p10", jersey_number: 10, isOnField: true }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["p3", "p7", "p10"]);
    });

    it("[5] jersey null/undefined vai para o fim", () => {
      const result = sortPlayersByFieldStatus([
        make({ id: "p_null", isOnField: true }),
        make({ id: "p3", jersey_number: 3, isOnField: true }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["p3", "p_null"]);
    });

    it("[6] fallback alfabético quando jerseys iguais ou ambos null", () => {
      const result = sortPlayersByFieldStatus([
        make({
          id: "p_zz",
          first_name: "Zé",
          last_name: "Zorrinho",
          isOnField: true,
        }),
        make({
          id: "p_aa",
          first_name: "André",
          last_name: "Almeida",
          isOnField: true,
        }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["p_aa", "p_zz"]);
    });

    it("[7] reconhece variações de GR (gr, gk, guarda)", () => {
      const result = sortPlayersByFieldStatus([
        make({ id: "p_gr", preferred_position: "GR", isOnField: true }),
        make({ id: "p_gk", preferred_position: "GK", isOnField: true }),
        make({
          id: "p_guarda",
          preferred_position: "guarda-redes",
          isOnField: true,
        }),
        make({ id: "p_other", preferred_position: "AV", isOnField: true }),
      ]);
      expect(result[result.length - 1].id).toBe("p_other");
      expect(result.slice(0, 3).map((p) => p.id).sort()).toEqual([
        "p_gk",
        "p_gr",
        "p_guarda",
      ]);
    });
  });

  describe("combinação grupo + ordenação", () => {
    it("[8] aplica regra GR → jersey → nome em campo, banco e expulso separadamente", () => {
      const result = sortPlayersByFieldStatus(
        [
          make({
            id: "field_av",
            jersey_number: 10,
            isOnField: true,
            preferred_position: "AV",
          }),
          make({
            id: "field_gr",
            jersey_number: 99,
            isOnField: true,
            preferred_position: "GR",
          }),
          make({
            id: "bench_def",
            jersey_number: 4,
            isOnField: false,
            preferred_position: "DEF",
          }),
          make({
            id: "bench_gr",
            jersey_number: 12,
            isOnField: false,
            preferred_position: "GR",
          }),
          make({ id: "expelled", jersey_number: 5, isOnField: true }),
        ],
        new Set(["expelled"]),
      );
      expect(result.map((p) => p.id)).toEqual([
        "field_gr",
        "field_av",
        "bench_gr",
        "bench_def",
        "expelled",
      ]);
    });
  });

  describe("edge cases", () => {
    it("[9] lista vazia retorna vazia", () => {
      expect(sortPlayersByFieldStatus([])).toEqual([]);
    });

    it("[10] sentOffPlayerIds undefined funciona (default)", () => {
      const players = [make({ id: "p1", isOnField: true })];
      expect(sortPlayersByFieldStatus(players)).toEqual(players);
    });

    it("[11] desempate por last_name quando first_name é igual", () => {
      const result = sortPlayersByFieldStatus([
        make({ id: "1", first_name: "Pedro", last_name: "Silva", isOnField: true }),
        make({ id: "2", first_name: "Pedro", last_name: "Costa", isOnField: true }),
      ]);
      expect(result.map((p) => p.id)).toEqual(["2", "1"]);
    });
  });
});

describe("comparePlayersByFootballPriority (helper exportado)", () => {
  it("[1] GR antes de não-GR mesmo com jersey alto", () => {
    const gr = make({
      id: "gr",
      jersey_number: 99,
      preferred_position: "GR",
      isOnField: true,
    });
    const av = make({
      id: "av",
      jersey_number: 10,
      preferred_position: "AV",
      isOnField: true,
    });
    expect(comparePlayersByFootballPriority(gr, av)).toBeLessThan(0);
    expect(comparePlayersByFootballPriority(av, gr)).toBeGreaterThan(0);
  });

  it("[2] jersey ASC entre não-GR", () => {
    const p7 = make({ id: "p7", jersey_number: 7, isOnField: true });
    const p3 = make({ id: "p3", jersey_number: 3, isOnField: true });
    expect(comparePlayersByFootballPriority(p3, p7)).toBeLessThan(0);
  });

  it("[3] jersey null/undefined vai para o fim", () => {
    const pNull = make({ id: "p_null", isOnField: true });
    const p3 = make({ id: "p3", jersey_number: 3, isOnField: true });
    expect(comparePlayersByFootballPriority(p3, pNull)).toBeLessThan(0);
  });

  it("[4] fallback alfabético quando jerseys iguais", () => {
    const pa = make({
      id: "pa",
      first_name: "Anabela",
      jersey_number: 5,
      isOnField: true,
    });
    const pz = make({
      id: "pz",
      first_name: "Zé",
      jersey_number: 5,
      isOnField: true,
    });
    expect(comparePlayersByFootballPriority(pa, pz)).toBeLessThan(0);
  });

  it("[5] array.sort() aplica a regra completa GR → jersey → nome", () => {
    const players = [
      make({
        id: "p10",
        jersey_number: 10,
        preferred_position: "AV",
        isOnField: true,
      }),
      make({
        id: "p_gr",
        jersey_number: 99,
        preferred_position: "GR",
        isOnField: true,
      }),
      make({
        id: "p3",
        jersey_number: 3,
        preferred_position: "DEF",
        isOnField: true,
      }),
    ];
    const sorted = [...players].sort(comparePlayersByFootballPriority);
    expect(sorted.map((p) => p.id)).toEqual(["p_gr", "p3", "p10"]);
  });
});
