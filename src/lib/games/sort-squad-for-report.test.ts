import { describe, it, expect } from "vitest";
import { sortSquadForReport } from "./sort-squad-for-report";

describe("sortSquadForReport", () => {
  it("titular GR aparece antes de titular nao-GR", () => {
    const result = sortSquadForReport([
      { name: "Jogador A", lineupLabel: "Titular", preferred_position: "DC", jersey_number: 5 },
      { name: "GR Titular", lineupLabel: "Titular", preferred_position: "GR", jersey_number: 1 },
    ]);
    expect(result[0]!.name).toBe("GR Titular");
    expect(result[1]!.name).toBe("Jogador A");
  });

  it("titular GR aparece antes de suplente GR", () => {
    const result = sortSquadForReport([
      { name: "GR Suplente", lineupLabel: "Suplente", preferred_position: "GR", jersey_number: 12 },
      { name: "GR Titular", lineupLabel: "Titular", preferred_position: "GR", jersey_number: 1 },
    ]);
    expect(result[0]!.name).toBe("GR Titular");
    expect(result[1]!.name).toBe("GR Suplente");
  });

  it("dentro do mesmo grupo ordena por jersey_number ascendente", () => {
    const result = sortSquadForReport([
      { name: "C", lineupLabel: "Titular", preferred_position: "DC", jersey_number: 30 },
      { name: "A", lineupLabel: "Titular", preferred_position: "DC", jersey_number: 4 },
      { name: "B", lineupLabel: "Titular", preferred_position: "DC", jersey_number: 11 },
    ]);
    expect(result.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("jersey_number null/undefined vao para o fim do subgrupo", () => {
    const result = sortSquadForReport([
      { name: "Sem numero", lineupLabel: "Titular", preferred_position: "DC", jersey_number: null },
      { name: "Com numero 7", lineupLabel: "Titular", preferred_position: "DC", jersey_number: 7 },
    ]);
    expect(result[0]!.name).toBe("Com numero 7");
    expect(result[1]!.name).toBe("Sem numero");
  });

  it("aceita preferred_position com variacoes (GK, Guarda-Redes)", () => {
    const result = sortSquadForReport([
      { name: "Jogador campo", lineupLabel: "Titular", preferred_position: "MC", jersey_number: 8 },
      { name: "GK", lineupLabel: "Titular", preferred_position: "GK", jersey_number: 1 },
      { name: "Guarda-Redes", lineupLabel: "Titular", preferred_position: "Guarda-Redes", jersey_number: 25 },
    ]);
    expect(result[0]!.name).toBe("GK");
    expect(result[1]!.name).toBe("Guarda-Redes");
    expect(result[2]!.name).toBe("Jogador campo");
  });
});
