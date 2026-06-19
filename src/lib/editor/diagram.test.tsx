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

  it("preserva a cor por elemento no round-trip", () => {
    const d: ExerciseDiagram = {
      v: 1,
      preset: "full",
      color: "#000000",
      elements: [
        { id: "p1", kind: "player", team: "home", x: 10, y: 10, color: "#DC2626" },
        { id: "a1", kind: "arrow", variant: "pass", x1: 0, y1: 0, x2: 10, y2: 10, color: "#16A34A" },
        { id: "z1", kind: "zone", x: 2, y: 2, w: 20, h: 10, color: "#7C3AED" },
      ],
    };
    expect(parseDiagram(serializeDiagram(d))).toEqual(d);
  });

  it("round-trip de objetos (cada shape), jogador com style+size e seta line", () => {
    const d: ExerciseDiagram = {
      v: 1,
      preset: "full",
      color: "#000000",
      elements: [
        { id: "o1", kind: "object", x: 10, y: 10, shape: "chapeu" },
        { id: "o2", kind: "object", x: 20, y: 20, shape: "baliza-a" },
        { id: "o3", kind: "object", x: 30, y: 30, shape: "stairs", color: "#16A34A" },
        { id: "o4", kind: "object", x: 40, y: 40, shape: "mark" },
        { id: "o5", kind: "object", x: 45, y: 45, shape: "vara" },
        { id: "p1", kind: "player", team: "home", x: 50, y: 50, style: "jersey", size: "l" },
        { id: "a1", kind: "arrow", variant: "line", x1: 0, y1: 0, x2: 60, y2: 60 },
      ],
    };
    expect(parseDiagram(serializeDiagram(d))).toEqual(d);
  });

  it("preserva rotation (object/cone/zone) no round-trip", () => {
    const d: ExerciseDiagram = {
      v: 1,
      preset: "full",
      color: "#000000",
      elements: [
        { id: "o1", kind: "object", x: 10, y: 10, shape: "baliza-a", rotation: 45 },
        { id: "c1", kind: "cone", x: 20, y: 20, rotation: 90 },
        { id: "z1", kind: "zone", x: 2, y: 2, w: 20, h: 10, rotation: 30 },
      ],
    };
    expect(parseDiagram(serializeDiagram(d))).toEqual(d);
  });

  it("descarta object com shape inválido (ex.: goal removido)", () => {
    const parsed = parseDiagram({
      v: 1,
      preset: "full",
      color: "#000",
      elements: [
        { id: "ok", kind: "object", x: 1, y: 2, shape: "baliza-b" },
        { id: "bad", kind: "object", x: 1, y: 2, shape: "goal" },
      ],
    });
    expect(parsed?.elements).toEqual([{ id: "ok", kind: "object", x: 1, y: 2, shape: "baliza-b" }]);
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
