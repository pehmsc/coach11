import { describe, expect, it } from "vitest";
import { filterLiveStatsBySelected } from "./lineup-ghost-filter";

describe("filterLiveStatsBySelected", () => {
  it("[Teste 1a] mantém apenas rows cujo player_id está em selectedIds; descarta ghosts", () => {
    const rows = [
      { player_id: "a", status: "starter" },
      { player_id: "b", status: "on_bench" },
      { player_id: "c", status: "starter" },
      { player_id: "ghost", status: "starter" },
    ];
    const selected = new Set(["a", "b", "c"]);
    const result = filterLiveStatsBySelected(rows, selected);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.player_id).sort()).toEqual(["a", "b", "c"]);
  });

  it("[Teste 1b] selectedIds vazio devolve array vazio", () => {
    const rows = [
      { player_id: "a", status: "starter" },
      { player_id: "b", status: "on_bench" },
    ];
    const result = filterLiveStatsBySelected(rows, new Set());
    expect(result).toEqual([]);
  });

  it("descarta rows com player_id null/undefined/non-string", () => {
    const rows = [
      { player_id: "a", status: "starter" },
      { player_id: null, status: "starter" },
      { player_id: undefined, status: "starter" },
    ];
    const result = filterLiveStatsBySelected(rows, new Set(["a"]));
    expect(result).toEqual([{ player_id: "a", status: "starter" }]);
  });

  it("rows vazias devolve []", () => {
    expect(filterLiveStatsBySelected([], new Set(["a", "b"]))).toEqual([]);
  });

  it("preserva campos extra (start_minute, etc) das rows mantidas", () => {
    const rows = [
      { player_id: "a", status: "starter", start_minute: 0 },
      { player_id: "ghost", status: "starter", start_minute: 0 },
    ];
    const result = filterLiveStatsBySelected(rows, new Set(["a"]));
    expect(result).toEqual([
      { player_id: "a", status: "starter", start_minute: 0 },
    ]);
  });
});

describe("integração: cenário do bug original", () => {
  it("ghost row pré-fix produzia 11 starters; pós-fix produz 10", () => {
    const liveStatsBeforeCleanup = [
      { player_id: "p1", status: "starter" },
      { player_id: "p2", status: "starter" },
      { player_id: "p3", status: "starter" },
      { player_id: "p4", status: "starter" },
      { player_id: "p5", status: "starter" },
      { player_id: "p6", status: "starter" },
      { player_id: "p7", status: "starter" },
      { player_id: "p8", status: "starter" },
      { player_id: "p9", status: "starter" },
      { player_id: "p10", status: "starter" },
      { player_id: "ghost", status: "starter" },
      { player_id: "sub1", status: "on_bench" },
      { player_id: "sub2", status: "on_bench" },
      { player_id: "sub3", status: "on_bench" },
      { player_id: "sub4", status: "on_bench" },
      { player_id: "sub5", status: "on_bench" },
    ];
    const selectedIds = new Set([
      "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10",
      "sub1", "sub2", "sub3", "sub4", "sub5",
    ]);

    const naiveStarters = liveStatsBeforeCleanup.filter(
      (r) => r.status === "starter",
    ).length;
    expect(naiveStarters).toBe(11);

    const filtered = filterLiveStatsBySelected(
      liveStatsBeforeCleanup,
      selectedIds,
    );
    const realStarters = filtered.filter((r) => r.status === "starter").length;
    expect(realStarters).toBe(10);
  });
});
