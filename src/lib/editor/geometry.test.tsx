import { describe, expect, it } from "vitest";
import {
  applyMatrix,
  clampViewBox,
  invertMatrix,
  panViewBox,
  screenToSvgPoint,
  zoomViewBoxAround,
} from "@/lib/editor/geometry";

describe("screenToSvgPoint", () => {
  it("converte sob escala + translação (CTM uniforme)", () => {
    // CTM: escala 2x, translação (10, 20). client (110,220) → svg (50,100).
    const ctm = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
    const p = screenToSvgPoint(ctm, 110, 220);
    expect(p.x).toBeCloseTo(50, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it("é o inverso exato de applyMatrix", () => {
    const ctm = { a: 3.2, b: 0.4, c: -0.7, d: 2.5, e: 12, f: -8 };
    const original = { x: 17, y: 42 };
    const screen = applyMatrix(ctm, original.x, original.y);
    const back = screenToSvgPoint(ctm, screen.x, screen.y);
    expect(back.x).toBeCloseTo(original.x, 6);
    expect(back.y).toBeCloseTo(original.y, 6);
  });

  it("invertMatrix de uma matriz singular devolve identidade segura", () => {
    const m = invertMatrix({ a: 0, b: 0, c: 0, d: 0, e: 5, f: 5 });
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });
});

describe("viewBox helpers", () => {
  it("zoom 2x em torno do centro reduz o viewBox para metade, centrado", () => {
    const vb = zoomViewBoxAround({ x: 0, y: 0, w: 120, h: 80 }, 60, 40, 2, {
      baseW: 120,
      baseH: 80,
    });
    expect(vb.w).toBeCloseTo(60, 6);
    expect(vb.h).toBeCloseTo(40, 6);
    expect(vb.x).toBeCloseTo(30, 6);
    expect(vb.y).toBeCloseTo(20, 6);
  });

  it("zoom respeita o limite mínimo (não afasta para além do campo base)", () => {
    const vb = zoomViewBoxAround({ x: 0, y: 0, w: 120, h: 80 }, 60, 40, 0.25, {
      baseW: 120,
      baseH: 80,
      minScale: 1,
    });
    expect(vb.w).toBeCloseTo(120, 6);
    expect(vb.h).toBeCloseTo(80, 6);
  });

  it("clampViewBox mantém o viewBox dentro do campo", () => {
    const vb = clampViewBox({ x: -10, y: -10, w: 200, h: 200 }, 120, 80);
    expect(vb).toEqual({ x: 0, y: 0, w: 120, h: 80 });
  });

  it("panViewBox desloca e fica preso aos limites", () => {
    const vb = panViewBox({ x: 30, y: 20, w: 60, h: 40 }, -100, -100, 120, 80);
    // empurrado para o canto inferior-direito, mas dentro do campo.
    expect(vb.x).toBeCloseTo(60, 6);
    expect(vb.y).toBeCloseTo(40, 6);
  });
});
