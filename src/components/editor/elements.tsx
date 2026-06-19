// Render visual (puro) de cada elemento do diagrama, em unidades de viewBox.
// É a ÚNICA fonte de rendering: o editor desenha estes shapes ao vivo e o export
// clona o SVG ao vivo — logo o PNG é fiel ao que se vê.
//
// COR: a arte é uma função art(fill) que injeta a cor DIRETAMENTE no fill/stroke
// (sem currentColor) — serializa sempre, à prova de export/canvas. No campo passa-se
// `el.color ?? color` (tonável) a todos EXCETO a bola (cores clássicas fixas). Os
// ícones de popover (só DOM, nunca exportados) podem usar art("currentColor").

import type { ReactNode } from "react";
import type { DiagramElement, ObjectShape } from "@/types/editor";

export const PLAYER_R = 2.2; // raio "m" (default) — usado p/ seleção/hit aproximados
export const PLAYER_SIZE_R: Record<"s" | "m" | "l", number> = { s: 1.7, m: 2.2, l: 2.8 };
export const TEXT_SIZE = 3.0;
export const ZONE_DEFAULT = { w: 26, h: 18 };
export const ARROW_STROKE = 0.3;

// ── Arte dos tokens (SVG autêntico, cor injetada) ───────────────────────────

export type TokenArt = { viewBox: string; w: number; h: number; art: (fill: string) => ReactNode };

export const JERSEY_VIEWBOX = "0 0 24 24";
export function jerseyArt(fill: string): ReactNode {
  return (
    <g transform="translate(12 12) scale(0.04798541243461988) translate(-250.076 -250.076)">
      <path
        d="M461.944,110.436C453.52,83.74,434.32,61.252,409.28,48.732L315.96,2.076H184.184L90.864,48.74 C65.824,61.26,46.632,83.748,38.2,110.444L0,231.412l95.44,28.632l18.632-62.128v300.16h272v-300.16l18.64,62.12l95.44-28.632 L461.944,110.436z M303.256,18.076c-5.136,12.2-18.752,32-53.184,32c-34.128,0-47.856-19.784-53.104-32H303.256z"
        fill={fill}
        fillRule="evenodd"
      />
    </g>
  );
}
export const JERSEY_ART: TokenArt = { viewBox: JERSEY_VIEWBOX, w: 4.4, h: 5.0, art: jerseyArt };

// Bola: cores clássicas fixas (ignora o fill).
export const BALL_ART: TokenArt = {
  viewBox: "0 0 1000 1000",
  w: 2,
  h: 2,
  art: () => (
    <>
      <circle cx="500" cy="500" r="485" stroke="#111827" strokeLinecap="square" strokeWidth="30" fill="#fff" />
      <path
        d="M130 226 L290 87 L418 126 L347 292 L155 355 Z M865 175 L702 57 L656 107 L794 249 L915 268 Z M643 782 L481 683 L519 480 L726 454 L792 638 Z M229 855 L232 740 L105 588 L41 626 L66 726 L130 820 z"
        fill="#111827"
        stroke="none"
      />
      <path
        d="M160 216 L100 240 M290 107 L297 70 M400 130 L676 107 M347 292 L519 480 M160 345 L105 588 M481 683 L232 740 M649 750 L611 940 M720 464 L799 239 M780 635 L926 651 M210 840 L400 970"
        fill="none"
        stroke="#111827"
        strokeLinecap="square"
        strokeWidth="30"
      />
    </>
  ),
};

// 11 tokens tonáveis (cone usa o kind próprio `cone`; os outros são `object`).
export const OBJECT_ART: Record<"cone" | ObjectShape, TokenArt> = {
  chapeu: {
    viewBox: "0 0 24 24",
    w: 3,
    h: 3,
    art: (fill) => (
      <g transform="translate(12 12) scale(0.06) translate(-200 -130)">
        <path d="M 175 70 Q 200 60 225 70 L 330 180 A 130 22 0 1 1 70 180 L 175 70 Z" fill={fill} />
      </g>
    ),
  },
  cone: {
    viewBox: "0 0 620 620",
    w: 2.8,
    h: 3.0,
    art: (fill) => (
      <>
        <polygon points="64 510, 64 521,306 610,314 610,557 521,556 510, 310 428" fill={fill} />
        <polygon points="190 510, 279 10,341 10,430 510" fill={fill} />
      </>
    ),
  },
  "cone-stick": {
    viewBox: "0 0 512 1512",
    w: 1.8,
    h: 5.2,
    art: (fill) => (
      <>
        <polygon points="10 1400, 10 1411,252 1501,260 1501,503 1411,502 1400, 256 1318" fill={fill} />
        <polygon points="136 1400, 225 900,287 900,376 1400" fill={fill} />
        <rect x="248" y="30" width="16" height="880" fill={fill} />
      </>
    ),
  },
  "baliza-a": {
    viewBox: "0 0 300 300",
    w: 8.5,
    h: 8.5,
    art: (fill) => (
      <g fill="none" stroke={fill} strokeWidth="5" strokeLinejoin="round">
        <polygon points="20 100,280 100,288 153,12 153" />
        <polygon points="20 100,33 148,26 199, 12 153" />
        <polygon points="280 100,267 148,274 199,288 153" />
        <polyline points="26 199,12 153,288 153,274 199" strokeWidth="9" />
      </g>
    ),
  },
  "baliza-b": {
    viewBox: "0 0 146 146",
    w: 7.5,
    h: 7.5,
    art: (fill) => (
      <g fill="none" stroke={fill} strokeWidth="2.5" strokeLinejoin="round">
        <polygon points="17 38,129 38,131 75,15 75" />
        <polygon points="17 38,22 72,21 106,15 75" />
        <polygon points="129 38,124 72,125 106,131 75" />
        <polyline points="21 106,15 75,131 75,125 106" strokeWidth="4.5" />
      </g>
    ),
  },
  mannequin: {
    viewBox: "0 0 24 24",
    w: 4.2,
    h: 6.6,
    art: (fill) => (
      <g transform="translate(12 12) scale(0.03428571428571429) translate(-200 -350)">
        <circle cx="200" cy="60" r="40" fill={fill} />
        <rect x="110" y="80" width="180" height="280" rx="14" fill={fill} />
        <rect x="130" y="360" width="12" height="270" fill={fill} />
        <rect x="174" y="360" width="12" height="270" fill={fill} />
        <rect x="218" y="360" width="12" height="270" fill={fill} />
        <rect x="262" y="360" width="12" height="270" fill={fill} />
        <rect x="90" y="630" width="220" height="40" rx="6" fill={fill} />
      </g>
    ),
  },
  vara: {
    viewBox: "0 0 24 24",
    w: 4,
    h: 6.6,
    art: (fill) => (
      <g transform="translate(12 12) scale(0.04285714285714286) translate(-100 -280)">
        <rect x="80" y="40" width="40" height="450" rx="6" fill={fill} />
        <path d="M 40 510 Q 40 470 100 470 Q 160 470 160 510 Z" fill={fill} />
      </g>
    ),
  },
  arcos: {
    viewBox: "0 0 24 24",
    w: 8,
    h: 4.8,
    art: (fill) => (
      <g transform="translate(12 12) scale(0.03428571428571429) translate(-350 -180)" fill="none" stroke={fill} strokeWidth="12">
        <circle cx="130" cy="110" r="65" />
        <circle cx="270" cy="110" r="65" />
        <circle cx="410" cy="110" r="65" />
        <circle cx="550" cy="110" r="65" />
        <circle cx="200" cy="240" r="65" />
        <circle cx="340" cy="240" r="65" />
        <circle cx="480" cy="240" r="65" />
        <circle cx="620" cy="240" r="65" />
      </g>
    ),
  },
  stairs: {
    viewBox: "0 0 200 54",
    w: 10,
    h: 2.7,
    art: (fill) => (
      <g stroke={fill} strokeWidth="2" strokeLinejoin="round" fill="none">
        <line x1="10" y1="12" x2="190" y2="12" />
        <line x1="10" y1="42" x2="190" y2="42" />
        <line x1="40" y1="10" x2="40" y2="44" />
        <line x1="70" y1="10" x2="70" y2="44" />
        <line x1="100" y1="10" x2="100" y2="44" />
        <line x1="130" y1="10" x2="130" y2="44" />
        <line x1="160" y1="10" x2="160" y2="44" />
      </g>
    ),
  },
  ring: {
    viewBox: "0 0 100 100",
    w: 2.4,
    h: 2.4,
    art: (fill) => <circle cx="50" cy="50" r="40" fill="none" stroke={fill} strokeWidth="5" />,
  },
  mark: {
    viewBox: "0 0 100 100",
    w: 1.7,
    h: 1.7,
    art: (fill) => <circle cx="50" cy="50" r="34" fill="none" stroke={fill} strokeWidth="32" />,
  },
};

function parseViewBox(vb: string) {
  const [x, y, w, h] = vb.split(/[ ,]+/).map(Number);
  return { x, y, w, h };
}

/**
 * Desenha um token via <g transform> (não <svg> aninhado) centrado em (x,y), à
 * escala de campo. Roda com o grupo de conteúdo (rotação de orientação em
 * portrait) e aceita rotação própria do elemento — o WebKit não rodava o <svg>
 * aninhado com o grupo, daí esta abordagem.
 */
export function TokenG({
  x,
  y,
  token,
  fill,
  rotation = 0,
}: {
  x: number;
  y: number;
  token: TokenArt;
  fill: string;
  rotation?: number;
}) {
  const vb = parseViewBox(token.viewBox);
  const s = Math.min(token.w / vb.w, token.h / vb.h); // meet (uniforme)
  const cx = vb.x + vb.w / 2;
  const cy = vb.y + vb.h / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${s}) translate(${-cx} ${-cy})`}>
      {token.art(fill)}
    </g>
  );
}

/** Ícone monocromático para popovers (DOM vivo, nunca exportado → currentColor OK). */
export function TokenIcon({ token, className }: { token: TokenArt; className?: string }) {
  return (
    <svg viewBox={token.viewBox} className={className} preserveAspectRatio="xMidYMid meet" style={{ overflow: "visible" }}>
      {token.art("currentColor")}
    </svg>
  );
}

// ── Setas ────────────────────────────────────────────────────────────────────

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

/** Ponto + tangente da base da seta em t∈[0,1]: reta, ou Bézier quadrático se há cx/cy. */
function baseAt(el: ArrowElement, t: number): { px: number; py: number; tx: number; ty: number } {
  if (el.cx == null || el.cy == null) {
    return { px: el.x1 + (el.x2 - el.x1) * t, py: el.y1 + (el.y2 - el.y1) * t, tx: el.x2 - el.x1, ty: el.y2 - el.y1 };
  }
  const mt = 1 - t;
  return {
    px: mt * mt * el.x1 + 2 * mt * t * el.cx + t * t * el.x2,
    py: mt * mt * el.y1 + 2 * mt * t * el.cy + t * t * el.y2,
    tx: 2 * mt * (el.cx - el.x1) + 2 * t * (el.x2 - el.cx),
    ty: 2 * mt * (el.cy - el.y1) + 2 * t * (el.y2 - el.cy),
  };
}

/** Posição ao longo da seta em t∈[0,1]. Base (reta/curva) + onda na condução. */
function arrowPointAt(el: ArrowElement, t: number): { x: number; y: number } {
  const b = baseAt(el, t);
  if (el.variant !== "dribble") return { x: b.px, y: b.py };
  const chord = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  if (chord < 0.5) return { x: b.px, y: b.py };
  const tl = Math.hypot(b.tx, b.ty) || 1;
  const px = -b.ty / tl; // perpendicular à tangente local
  const py = b.tx / tl;
  const off = Math.sin(t * dribbleWaves(chord) * Math.PI * 2) * DRIBBLE_AMP;
  return { x: b.px + px * off, y: b.py + py * off };
}

export function arrowLinePath(el: ArrowElement): string {
  const { x1, y1, x2, y2, variant } = el;
  if (variant !== "dribble") {
    return el.cx != null && el.cy != null
      ? `M ${x1} ${y1} Q ${el.cx} ${el.cy} ${x2} ${y2}`
      : `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  const chord = Math.hypot(x2 - x1, y2 - y1);
  if (chord < 0.5) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const steps = dribbleSteps(chord);
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i += 1) {
    const p = arrowPointAt(el, i / steps);
    d += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d;
}

/** Direção real do FIM da linha, para alinhar a ponta (segue a curva quando há cx/cy). */
function arrowEndTangent(el: ArrowElement): { x: number; y: number } {
  if (el.variant !== "dribble") {
    const b = baseAt(el, 1);
    return { x: b.tx, y: b.ty };
  }
  const chord = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  if (chord < 0.5) return { x: el.x2 - el.x1, y: el.y2 - el.y1 };
  const steps = dribbleSteps(chord);
  const pEnd = arrowPointAt(el, 1);
  const pPrev = arrowPointAt(el, 1 - 1 / steps);
  return { x: pEnd.x - pPrev.x, y: pEnd.y - pPrev.y };
}

export function arrowHeadPath(el: ArrowElement): string {
  const { x2, y2 } = el;
  const tan = arrowEndTangent(el);
  const angle = Math.atan2(tan.y, tan.x);
  const len = 1.8;
  const spread = Math.PI / 7;
  const ax = x2 - len * Math.cos(angle - spread);
  const ay = y2 - len * Math.sin(angle - spread);
  const bx = x2 - len * Math.cos(angle + spread);
  const by = y2 - len * Math.sin(angle + spread);
  return `M ${ax.toFixed(2)} ${ay.toFixed(2)} L ${x2} ${y2} L ${bx.toFixed(2)} ${by.toFixed(2)}`;
}

// ── Render por kind ────────────────────────────────────────────────────────

/** Visual de um elemento (sem alvos de hit nem handles). */
export function ElementShape({ el, color }: { el: DiagramElement; color: string }) {
  switch (el.kind) {
    case "player": {
      const fill = el.color ?? color;
      const r = PLAYER_SIZE_R[el.size ?? "m"];
      if ((el.style ?? "circle") === "jersey") {
        return <TokenG x={el.x} y={el.y} token={{ ...JERSEY_ART, w: 2.0 * r, h: 2.3 * r }} fill={fill} />;
      }
      return <circle cx={el.x} cy={el.y} r={r} fill={fill} stroke="#fff" strokeWidth={0.5} />;
    }
    case "ball":
      return <TokenG x={el.x} y={el.y} token={BALL_ART} fill="#fff" />;
    case "cone":
      return <TokenG x={el.x} y={el.y} token={OBJECT_ART.cone} fill={el.color ?? color} rotation={el.rotation ?? 0} />;
    case "object":
      return <TokenG x={el.x} y={el.y} token={OBJECT_ART[el.shape]} fill={el.color ?? color} rotation={el.rotation ?? 0} />;
    case "text":
      return (
        <text
          x={el.x}
          y={el.y}
          fill={el.color ?? color}
          stroke="#0b2310"
          strokeOpacity={0.55}
          strokeWidth={0.3}
          paintOrder="stroke"
          fontSize={TEXT_SIZE}
          fontWeight={400}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {el.text || "Texto"}
        </text>
      );
    case "zone": {
      const c = el.color ?? color;
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      const common = {
        fill: c,
        fillOpacity: 0.18,
        stroke: c,
        strokeWidth: 0.2,
        strokeDasharray: "1.6 1.1",
      } as const;
      return (
        <g transform={`rotate(${el.rotation ?? 0} ${cx} ${cy})`}>
          {el.shape === "ellipse" ? (
            <ellipse cx={cx} cy={cy} rx={el.w / 2} ry={el.h / 2} {...common} />
          ) : (
            <rect x={el.x} y={el.y} width={el.w} height={el.h} {...common} />
          )}
        </g>
      );
    }
    case "arrow": {
      const c = el.color ?? color;
      if (el.variant === "line") {
        return <path d={arrowLinePath(el)} fill="none" stroke={c} strokeWidth={ARROW_STROKE} strokeLinecap="round" />;
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
