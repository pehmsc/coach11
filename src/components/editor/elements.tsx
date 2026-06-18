// Render visual (puro) de cada elemento do diagrama, em unidades de viewBox.
// É a ÚNICA fonte de rendering: o editor desenha estes shapes ao vivo e o export
// clona o SVG ao vivo — logo o PNG é fiel ao que se vê. Setas têm a ponta
// desenhada como path explícito (robusto ao rasterizar, sem depender de markers).
//
// Cor: player, text, zone e arrow usam `el.color ?? color` (cor por elemento, com
// fallback na cor ativa). Bola e cone têm cor de identidade fixa (ignoram color).

import type { DiagramElement } from "@/types/editor";

export const CONE_COLOR = "#F59E0B";
export const BALL_FILL = "#ffffff";
export const BALL_STROKE = "#111827";

export const PLAYER_R = 2.2;
export const BALL_R = 1.5;
export const CONE_H = 3.6;
export const CONE_HALF = 1.9;
export const TEXT_SIZE = 3.6;
export const ZONE_DEFAULT = { w: 26, h: 18 };
export const ARROW_STROKE = 0.55;

type ArrowElement = Extract<DiagramElement, { kind: "arrow" }>;

// Parâmetros da onda da condução — PARTILHADOS entre o desenho da linha e o
// cálculo da tangente da ponta (não podem divergir, senão a ponta fica torta).
const DRIBBLE_AMP = 1.3;
function dribbleWaves(len: number): number {
  return Math.max(2, Math.round(len / 5));
}
function dribbleSteps(len: number): number {
  return dribbleWaves(len) * 8;
}

/** Posição ao longo da seta em t∈[0,1]. Linear para move/pass, sinusóide na condução. */
function arrowPointAt(el: ArrowElement, t: number): { x: number; y: number } {
  const { x1, y1, x2, y2, variant } = el;
  if (variant !== "dribble") {
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  }
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const px = -uy; // perpendicular unitário
  const py = ux;
  const off = Math.sin(t * dribbleWaves(len) * Math.PI * 2) * DRIBBLE_AMP;
  return { x: x1 + ux * len * t + px * off, y: y1 + uy * len * t + py * off };
}

export function arrowLinePath(el: ArrowElement): string {
  const { x1, y1, x2, y2, variant } = el;
  if (variant !== "dribble") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const steps = dribbleSteps(len);
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i += 1) {
    const p = arrowPointAt(el, i / steps);
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d;
}

/** Direção real do FIM da linha (último segmento desenhado), para alinhar a ponta. */
function arrowEndTangent(el: ArrowElement): { x: number; y: number } {
  if (el.variant !== "dribble") {
    return { x: el.x2 - el.x1, y: el.y2 - el.y1 };
  }
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  if (len < 0.5) return { x: el.x2 - el.x1, y: el.y2 - el.y1 };
  const steps = dribbleSteps(len);
  const pEnd = arrowPointAt(el, 1);
  const pPrev = arrowPointAt(el, 1 - 1 / steps);
  return { x: pEnd.x - pPrev.x, y: pEnd.y - pPrev.y };
}

export function arrowHeadPath(el: ArrowElement): string {
  const { x2, y2 } = el;
  const tan = arrowEndTangent(el);
  const angle = Math.atan2(tan.y, tan.x);
  const len = 3;
  const spread = Math.PI / 7;
  const ax = x2 - len * Math.cos(angle - spread);
  const ay = y2 - len * Math.sin(angle - spread);
  const bx = x2 - len * Math.cos(angle + spread);
  const by = y2 - len * Math.sin(angle + spread);
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${x2} ${y2} L ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

/** Visual de um elemento (sem alvos de hit nem handles). */
export function ElementShape({ el, color }: { el: DiagramElement; color: string }) {
  switch (el.kind) {
    case "player": {
      const fill = el.color ?? color;
      return <circle cx={el.x} cy={el.y} r={PLAYER_R} fill={fill} stroke="#fff" strokeWidth={0.5} />;
    }
    case "ball":
      return (
        <g>
          <circle cx={el.x} cy={el.y} r={BALL_R} fill={BALL_FILL} stroke={BALL_STROKE} strokeWidth={0.3} />
          <circle cx={el.x} cy={el.y} r={BALL_R * 0.42} fill={BALL_STROKE} />
        </g>
      );
    case "cone": {
      const { x, y } = el;
      const d = `M ${x} ${y - CONE_H / 2} L ${x + CONE_HALF} ${y + CONE_H / 2} L ${x - CONE_HALF} ${y + CONE_H / 2} Z`;
      return <path d={d} fill={CONE_COLOR} stroke="#7c3f00" strokeWidth={0.25} />;
    }
    case "text":
      return (
        <text
          x={el.x}
          y={el.y}
          fill={el.color ?? color}
          stroke="#fff"
          strokeWidth={0.7}
          paintOrder="stroke"
          fontSize={TEXT_SIZE}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {el.text || "Texto"}
        </text>
      );
    case "zone": {
      const c = el.color ?? color;
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill={c}
          fillOpacity={0.18}
          stroke={c}
          strokeWidth={0.5}
          strokeDasharray="2 1.4"
          rx={1}
        />
      );
    }
    case "arrow": {
      const c = el.color ?? color;
      const dash = el.variant === "move" ? "2.4 1.6" : undefined;
      return (
        <g fill="none" stroke={c} strokeWidth={ARROW_STROKE} strokeLinecap="round" strokeLinejoin="round">
          <path d={arrowLinePath(el)} strokeDasharray={dash} />
          <path d={arrowHeadPath(el)} />
        </g>
      );
    }
    default:
      return null;
  }
}
