import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDiagramPng, prepareExportSvg } from "@/lib/editor/export";

const SVG_NS = "http://www.w3.org/2000/svg";

function buildSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "10 10 60 40");
  const keep = document.createElementNS(SVG_NS, "rect");
  keep.setAttribute("x", "1");
  keep.setAttribute("data-keep", "yes");
  svg.appendChild(keep);
  const ignore = document.createElementNS(SVG_NS, "circle");
  ignore.setAttribute("data-export-ignore", "true");
  svg.appendChild(ignore);
  return svg;
}

describe("prepareExportSvg", () => {
  it("remove artefactos de UI e repõe o viewBox para o campo inteiro", () => {
    const out = prepareExportSvg(buildSvg());
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("data-keep");
    expect(out).not.toContain("data-export-ignore");
    expect(out).toContain('viewBox="0 0 120 80"');
    expect(out).toContain('width="120"');
    expect(out).toContain('height="80"');
  });
});

describe("exportDiagramPng", () => {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = "";
    set src(value: string) {
      this._src = value;
      Promise.resolve().then(() => this.onload?.());
    }
    get src() {
      return this._src;
    }
  }

  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb: BlobCallback) =>
      cb(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gera um Blob PNG não vazio", async () => {
    const blob = await exportDiagramPng(buildSvg(), 2);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("image/png");
  });
});
