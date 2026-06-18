// Exportação do diagrama para PNG.
//
// O PNG é um raster do <svg> ao vivo: clonamos o nó, removemos artefactos de UI
// (alvos de hit, handles, guias — marcados com data-export-ignore) e repomos o
// viewBox para o campo inteiro (ignora zoom/pan ativos). Sem divergência de
// rendering entre o que se vê e o que se exporta.

import { FIELD_VIEWBOX } from "@/types/editor";

export const EXPORT_IGNORE_ATTR = "data-export-ignore";

/**
 * Clona o SVG ao vivo, limpa os artefactos de UI e devolve a string XML pronta
 * a rasterizar. viewBox e dimensões são forçados ao campo base.
 */
export function prepareExportSvg(
  svg: SVGSVGElement,
  baseW: number = FIELD_VIEWBOX.width,
  baseH: number = FIELD_VIEWBOX.height,
): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll(`[${EXPORT_IGNORE_ATTR}]`).forEach((node) => node.remove());
  // Repõe o estado canónico: campo landscape 120×80, sem cover/recorte (meet) e
  // sem a rotação de portrait do grupo de conteúdo. O PNG sai sempre 120×80.
  clone.setAttribute("viewBox", `0 0 ${baseW} ${baseH}`);
  clone.setAttribute("width", String(baseW));
  clone.setAttribute("height", String(baseH));
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.querySelectorAll("[data-editor-content]").forEach((node) => node.removeAttribute("transform"));
  clone.removeAttribute("style");
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Rasteriza uma string SVG para um Blob PNG. Browser-only (Image + canvas). */
export async function svgStringToPngBlob(
  svgString: string,
  width: number,
  height: number,
): Promise<Blob> {
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar SVG para exportar."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível.");
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar PNG."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Renderiza o SVG ao vivo para um Blob PNG. `scale` controla a resolução
 * (10 → 1200x800).
 */
export async function exportDiagramPng(
  svg: SVGSVGElement,
  scale: number = 10,
  baseW: number = FIELD_VIEWBOX.width,
  baseH: number = FIELD_VIEWBOX.height,
): Promise<Blob> {
  const svgString = prepareExportSvg(svg, baseW, baseH);
  return svgStringToPngBlob(svgString, baseW * scale, baseH * scale);
}

/** Embrulha o Blob PNG num File pronto para upload/partilha. */
export function pngBlobToFile(blob: Blob, name = "diagrama.png"): File {
  return new File([blob], name, { type: "image/png" });
}
