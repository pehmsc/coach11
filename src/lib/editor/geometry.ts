// Matemática pura de coordenadas do editor.
//
// A conversão ecrã→SVG usa o INVERSO da matriz CTM real do <svg> (affine 2D),
// não matemática de rácio manual (que deriva com aspect-ratio/translate). Esta
// camada é pura para ser testável sem DOM; o componente passa-lhe o CTM real.

export type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

export type Point = { x: number; y: number };

export type ViewBox = { x: number; y: number; w: number; h: number };

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Inverte uma matriz affine 2D no layout do SVG/DOM (a,b,c,d,e,f):
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
export function invertMatrix(m: Matrix2D): Matrix2D {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) {
    // Matriz singular — devolve identidade para evitar NaN.
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

export function applyMatrix(m: Matrix2D, x: number, y: number): Point {
  return {
    x: m.a * x + m.c * y + m.e,
    y: m.b * x + m.d * y + m.f,
  };
}

/**
 * Converte um ponto de ecrã (clientX/clientY) para coordenadas de utilizador do
 * SVG, dado o CTM do elemento (svg.getScreenCTM()). À prova de escala.
 */
export function screenToSvgPoint(ctm: Matrix2D, clientX: number, clientY: number): Point {
  return applyMatrix(invertMatrix(ctm), clientX, clientY);
}

/** Distância euclidiana entre dois pontos. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Mantém o viewBox dentro dos limites do campo base (sem mostrar fora do relvado). */
export function clampViewBox(vb: ViewBox, baseW: number, baseH: number): ViewBox {
  const w = Math.min(vb.w, baseW);
  const h = Math.min(vb.h, baseH);
  return {
    w,
    h,
    x: clamp(vb.x, 0, baseW - w),
    y: clamp(vb.y, 0, baseH - h),
  };
}

/**
 * Aplica zoom ao viewBox em torno de um ponto-foco (em coords SVG), preservando
 * a posição relativa do foco. factor > 1 aproxima; < 1 afasta. Limitado a
 * [minScale, maxScale] relativos ao campo base.
 */
export function zoomViewBoxAround(
  vb: ViewBox,
  focusX: number,
  focusY: number,
  factor: number,
  opts: { baseW: number; baseH: number; minScale?: number; maxScale?: number },
): ViewBox {
  const { baseW, baseH, minScale = 1, maxScale = 4 } = opts;
  const currentScale = baseW / vb.w;
  const targetScale = clamp(currentScale * factor, minScale, maxScale);
  const newW = baseW / targetScale;
  const newH = baseH / targetScale;
  const fx = vb.w === 0 ? 0.5 : (focusX - vb.x) / vb.w;
  const fy = vb.h === 0 ? 0.5 : (focusY - vb.y) / vb.h;
  return clampViewBox(
    { x: focusX - fx * newW, y: focusY - fy * newH, w: newW, h: newH },
    baseW,
    baseH,
  );
}

/** Desloca (pan) o viewBox por um delta em coords SVG; o conteúdo segue o dedo. */
export function panViewBox(
  vb: ViewBox,
  dxSvg: number,
  dySvg: number,
  baseW: number,
  baseH: number,
): ViewBox {
  return clampViewBox({ x: vb.x - dxSvg, y: vb.y - dySvg, w: vb.w, h: vb.h }, baseW, baseH);
}
