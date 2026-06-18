import { describe, expect, it } from "vitest";
import {
  canUndo,
  commitHistory,
  emptyDiagram,
  initHistory,
  parseDiagram,
  serializeDiagram,
  undoHistory,
} from "@/lib/editor/diagram";
import type { ExerciseDiagram } from "@/types/editor";

const sample: ExerciseDiagram = {
  v: 1,
  preset: "half",
  color: "#DC2626",
  elements: [
    { id: "p1", kind: "player", team: "home", x: 30, y: 40, label: "10" },
    { id: "b1", kind: "ball", x: 60, y: 40 },
    { id: "c1", kind: "cone", x: 12, y: 12 },
    { id: "t1", kind: "text", x: 80, y: 20, text: "Pressão" },
    { id: "z1", kind: "zone", x: 10, y: 10, w: 30, h: 20 },
    { id: "a1", kind: "arrow", variant: "pass", x1: 10, y1: 10, x2: 50, y2: 50 },
  ],
};

describe("(de)serialização do diagrama", () => {
  it("round-trip preserva o diagrama", () => {
    const restored = parseDiagram(serializeDiagram(sample));
    expect(restored).toEqual(sample);
  });

  it("aceita objeto (não só string)", () => {
    const restored = parseDiagram(JSON.parse(serializeDiagram(sample)));
    expect(restored).toEqual(sample);
  });

  it("descarta elementos inválidos mas mantém os válidos", () => {
    const dirty = {
      v: 1,
      preset: "full",
      color: "#000",
      elements: [
        { id: "ok", kind: "ball", x: 1, y: 2 },
        { id: "bad-kind", kind: "spaceship", x: 1, y: 2 },
        { id: "bad-coords", kind: "ball", x: "nope" },
        { id: "bad-team", kind: "player", team: "neutral", x: 1, y: 1 },
      ],
    };
    const parsed = parseDiagram(dirty);
    expect(parsed?.elements).toEqual([{ id: "ok", kind: "ball", x: 1, y: 2 }]);
  });

  it("rejeita envelopes irrecuperáveis", () => {
    expect(parseDiagram("não é json")).toBeNull();
    expect(parseDiagram(null)).toBeNull();
    expect(parseDiagram({ v: 2, preset: "full", color: "#000", elements: [] })).toBeNull();
  });
});

describe("pilha de undo", () => {
  it("adicionar → mover → undo repõe o estado anterior", () => {
    let h = initHistory(emptyDiagram("full"));
    expect(canUndo(h)).toBe(false);

    // adicionar jogador
    const added: ExerciseDiagram = {
      ...h.present,
      elements: [{ id: "p1", kind: "player", team: "home", x: 10, y: 10, label: "1" }],
    };
    h = commitHistory(h, added);
    expect(h.present.elements).toHaveLength(1);
    expect(canUndo(h)).toBe(true);

    // mover o jogador
    const moved: ExerciseDiagram = {
      ...h.present,
      elements: [{ id: "p1", kind: "player", team: "home", x: 90, y: 60, label: "1" }],
    };
    h = commitHistory(h, moved);
    expect(h.present.elements[0]).toMatchObject({ x: 90, y: 60 });

    // undo → volta à posição original
    h = undoHistory(h);
    expect(h.present.elements[0]).toMatchObject({ x: 10, y: 10 });

    // undo → volta ao campo vazio
    h = undoHistory(h);
    expect(h.present.elements).toHaveLength(0);
    expect(canUndo(h)).toBe(false);
  });

  it("undo num histórico vazio é no-op", () => {
    const h = initHistory(emptyDiagram());
    expect(undoHistory(h)).toEqual(h);
  });

  it("respeita o limite da pilha", () => {
    let h = initHistory(emptyDiagram());
    for (let i = 0; i < 50; i += 1) {
      h = commitHistory(h, { ...h.present, color: `#${i.toString(16).padStart(6, "0")}` }, 30);
    }
    expect(h.past.length).toBeLessThanOrEqual(30);
  });
});
