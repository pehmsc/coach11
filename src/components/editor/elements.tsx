// Render visual (puro) de cada elemento do diagrama, em unidades de viewBox.
// É a ÚNICA fonte de rendering: o editor desenha estes shapes ao vivo e o export
// clona o SVG ao vivo — logo o PNG é fiel ao que se vê. Setas têm a ponta
// desenhada como path explícito (robusto ao rasterizar, sem depender de markers).

import type { DiagramElement } from "@/types/editor";

export const TEAM_HOME_COLOR = "#2563EB";
export const TEAM_AWAY_COLOR = "#DC2626";
export const CONE_COLOR = "#F59E0B";
export const BALL_FILL = "#ffffff";
export const BALL_STROKE = "#111827";

export const PLAYER_R = 2.6;
export const BALL_R = 1.5;
export const CONE_H = 3.6;
export const CONE_HALF = 1.9;
export const TEXT_SIZE = 3.6;
export const ZONE_DEFAULT = { w: 26, h: 18 };
export const ARROW_STROKE = 0.55;

export function arrowLinePath(el: Extract<DiagramElement, { kind: "arrow" }>): string {
  const { x1, y1, x2, y2, variant } = el;
  if (variant !== "dribble") {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  // Condução: linha ondulada (sinusóide) ao longo do segmento.
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const px = -uy; // perpendicular unitário
  const py = ux;
  const amp = 1.3;
  const waves = Math.max(2, Math.round(len / 5));
  const steps = waves * 8;
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const off = Math.sin(t * waves * Math.PI * 2) * amp;
    const bx = x1 + ux * len * t + px * off;
    const by = y1 + uy * len * t + py * off;
    d += ` L ${bx.toFixed(2)} ${by.toFixed(2)}`;
  }
  return d;
}

export function arrowHeadPath(el: Extract<DiagramElement, { kind: "arrow" }>): string {
  const { x1, y1, x2, y2 } = el;
  const angle = Math.atan2(y2 - y1, x2 - x1);
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
      const fill = el.team === "home" ? TEAM_HOME_COLOR : TEAM_AWAY_COLOR;
      return (
        <g>
          <circle cx={el.x} cy={el.y} r={PLAYER_R} fill={fill} stroke="#fff" strokeWidth={0.5} />
          {el.label ? (
            <text
              x={el.x}
              y={el.y}
              fill="#fff"
              fontSize={PLAYER_R * 1.25}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {el.label}
            </text>
          ) : null}
        </g>
      );
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
          fill={color}
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
    case "zone":
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w}
          height={el.h}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeWidth={0.5}
          strokeDasharray="2 1.4"
          rx={1}
        />
      );
    case "arrow": {
      const dash = el.variant === "move" ? "2.4 1.6" : undefined;
      return (
        <g fill="none" stroke={color} strokeWidth={ARROW_STROKE} strokeLinecap="round" strokeLinejoin="round">
          <path d={arrowLinePath(el)} strokeDasharray={dash} />
          <path d={arrowHeadPath(el)} />
        </g>
      );
    }
    default:
      return null;
  }
}
