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

export const PLAYER_R = 2.2; // raio "m" (default) — usado p/ seleção/hit aproximados
export const PLAYER_SIZE_R: Record<"s" | "m" | "l", number> = { s: 1.7, m: 2.2, l: 2.8 };
export const BALL_R = 1.5;
export const TEXT_SIZE = 3.6;
export const ZONE_DEFAULT = { w: 26, h: 18 };
export const ARROW_STROKE = 0.55;

// Camisola minimal centrada em (cx,cy), escalada pelo raio do tamanho.
function jerseyPath(cx: number, cy: number, r: number): string {
  const W = r * 1.0; // meia-largura na bainha
  const SH = r * 1.05; // meia-largura dos ombros
  const SLW = r * 0.5; // largura da manga
  const SLD = r * 0.7; // queda da manga
  const top = cy - r * 1.0;
  const bot = cy + r * 1.05;
  const neck = r * 0.38;
  return [
    `M ${(cx - SH).toFixed(2)} ${top.toFixed(2)}`,
    `L ${(cx - SH - SLW).toFixed(2)} ${(top + SLD).toFixed(2)}`,
    `L ${(cx - W * 0.85).toFixed(2)} ${(top + SLD * 0.95).toFixed(2)}`,
    `L ${(cx - W).toFixed(2)} ${bot.toFixed(2)}`,
    `L ${(cx + W).toFixed(2)} ${bot.toFixed(2)}`,
    `L ${(cx + W * 0.85).toFixed(2)} ${(top + SLD * 0.95).toFixed(2)}`,
    `L ${(cx + SH + SLW).toFixed(2)} ${(top + SLD).toFixed(2)}`,
    `L ${(cx + SH).toFixed(2)} ${top.toFixed(2)}`,
    `L ${(cx + neck).toFixed(2)} ${top.toFixed(2)}`,
    `L ${cx.toFixed(2)} ${(top + neck * 0.9).toFixed(2)}`,
    `L ${(cx - neck).toFixed(2)} ${top.toFixed(2)}`,
    "Z",
  ].join(" ");
}

// Objetos de treino: cor de identidade fixa (ignoram el.color), (x,y) = centro.
function ObjectShape({ el }: { el: Extract<DiagramElement, { kind: "object" }> }) {
  const { x, y, shape } = el;
  switch (shape) {
    case "cone-stick":
      return (
        <g>
          <ellipse cx={x} cy={y + 1.3} rx={1.0} ry={0.3} fill="#7F1D1D" />
          <rect x={x - 0.22} y={y - 2.2} width={0.44} height={3.4} rx={0.22} fill="#DC2626" />
        </g>
      );
    case "mannequin":
      return (
        <g>
          <ellipse cx={x} cy={y + 1.5} rx={0.9} ry={0.28} fill="#475569" />
          <path
            d={`M ${x - 0.9} ${y - 1.0} L ${x + 0.9} ${y - 1.0} L ${x + 0.6} ${y + 1.4} L ${x - 0.6} ${y + 1.4} Z`}
            fill="#64748B"
            fillOpacity={0.9}
          />
          <circle cx={x} cy={y - 1.7} r={0.6} fill="#64748B" />
        </g>
      );
    case "goal": {
      const lines = [];
      for (let i = 1; i <= 5; i += 1) {
        const gx = x - 3.5 + (i * 7) / 6;
        lines.push(<line key={`v${i}`} x1={gx} y1={y - 1.4} x2={gx} y2={y + 0.8} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.12} />);
      }
      for (let j = 1; j <= 2; j += 1) {
        const gy = y - 1.4 + (j * 2.2) / 3;
        lines.push(<line key={`h${j}`} x1={x - 3.5} y1={gy} x2={x + 3.5} y2={gy} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.12} />);
      }
      return (
        <g>
          {lines}
          <rect x={x - 3.5} y={y - 1.4} width={7} height={2.2} fill="none" stroke="#E5E7EB" strokeWidth={0.35} strokeLinejoin="round" />
        </g>
      );
    }
    case "ring":
      return <ellipse cx={x} cy={y} rx={1.7} ry={0.9} fill="none" stroke="#EAB308" strokeWidth={0.45} />;
    default:
      return null;
  }
}

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
      const r = PLAYER_SIZE_R[el.size ?? "m"];
      if ((el.style ?? "circle") === "jersey") {
        return <path d={jerseyPath(el.x, el.y, r)} fill={fill} stroke="#fff" strokeWidth={0.4} strokeLinejoin="round" />;
      }
      return <circle cx={el.x} cy={el.y} r={r} fill={fill} stroke="#fff" strokeWidth={0.5} />;
    }
    case "ball":
      return (
        <g>
          <circle cx={el.x} cy={el.y} r={BALL_R} fill={BALL_FILL} stroke={BALL_STROKE} strokeWidth={0.3} />
          <circle cx={el.x} cy={el.y} r={BALL_R * 0.42} fill={BALL_STROKE} />
        </g>
      );
    case "cone": {
      // Cone pequeno (≈2.1 alto) com elipse de base — bem menor que o jogador.
      const { x, y } = el;
      const tri = `M ${x} ${y - 1.3} L ${x + 1.05} ${y + 0.75} L ${x - 1.05} ${y + 0.75} Z`;
      return (
        <g>
          <ellipse cx={x} cy={y + 0.8} rx={1.2} ry={0.35} fill="#C2660C" />
          <path d={tri} fill={CONE_COLOR} stroke="#B45309" strokeWidth={0.22} strokeLinejoin="round" />
        </g>
      );
    }
    case "object":
      return <ObjectShape el={el} />;
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
      // "line" = segmento reto sem ponta de seta.
      if (el.variant === "line") {
        return (
          <path d={arrowLinePath(el)} fill="none" stroke={c} strokeWidth={ARROW_STROKE} strokeLinecap="round" />
        );
      }
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
