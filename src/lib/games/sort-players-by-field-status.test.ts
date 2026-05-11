import { describe, expect, it } from "vitest";
import { sortPlayersByFieldStatus } from "./sort-players-by-field-status";
import type { LivePlayer } from "@/components/games/live/types";

function make(
  id: string,
  firstName: string,
  lastName: string,
  isOnField: boolean,
): LivePlayer {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    isOnField,
    isInitialBench: !isOnField,
  } as unknown as LivePlayer;
}

describe("sortPlayersByFieldStatus", () => {
  it("[1] coloca em campo antes do banco, ambos alfabéticos", () => {
    const result = sortPlayersByFieldStatus([
      make("1", "Zé", "Silva", false),
      make("2", "Bruno", "Costa", true),
      make("3", "Ana", "Mota", false),
      make("4", "André", "Pinto", true),
    ]);
    expect(result.map((p) => p.first_name)).toEqual([
      "André", // em campo
      "Bruno", // em campo
      "Ana", // banco
      "Zé", // banco
    ]);
  });

  it("[2] jogadores expulsos vão para o banco", () => {
    const result = sortPlayersByFieldStatus(
      [make("1", "Bruno", "X", true), make("2", "André", "Y", true)],
      new Set(["1"]),
    );
    // André em campo, Bruno expulso (banco)
    expect(result.map((p) => p.id)).toEqual(["2", "1"]);
  });

  it("[3] lista vazia retorna vazia", () => {
    expect(sortPlayersByFieldStatus([])).toEqual([]);
  });

  it("[4] todos no banco: ordem alfabética", () => {
    const result = sortPlayersByFieldStatus([
      make("1", "Carlos", "Z", false),
      make("2", "Ana", "A", false),
      make("3", "Bruno", "M", false),
    ]);
    expect(result.map((p) => p.first_name)).toEqual(["Ana", "Bruno", "Carlos"]);
  });

  it("[5] todos em campo: ordem alfabética", () => {
    const result = sortPlayersByFieldStatus([
      make("1", "Carlos", "Z", true),
      make("2", "Ana", "A", true),
    ]);
    expect(result.map((p) => p.first_name)).toEqual(["Ana", "Carlos"]);
  });

  it("[6] desempate por last_name quando first_name é igual", () => {
    const result = sortPlayersByFieldStatus([
      make("1", "Pedro", "Silva", true),
      make("2", "Pedro", "Costa", true),
    ]);
    expect(result.map((p) => p.id)).toEqual(["2", "1"]);
  });
});
