// Presets de campo (fiéis ao standard, sem marca de água).
//
// A relva é CONTÍNUA: o verde base + as riscas do preset cobrem todo o `extent`
// (o viewBox visível, em coords de campo), atravessando o canvas sem costura nem
// faixa escura. As MARCAÇÕES (linhas brancas) ficam fixas em 0–120/0–80,
// centradas. Cores em hex fixo: é cena física, não inverte em dark mode.

import type { FieldPreset } from "@/types/editor";

const GRASS_DARK = "#2B542E";
const GRASS_LIGHT = "#315B34";
const LINE = "#fff";

type LayerExtent = { x: number; y: number; w: number; h: number };
type LayerProps = { preset: FieldPreset; showMarkings?: boolean; extent?: LayerExtent };

const FIELD_EXTENT: LayerExtent = { x: 0, y: 0, w: 120, h: 80 };

// Bandas claras (#315B34) tile-adas ao longo de um eixo, com a fase ancorada ao
// campo standard (origem da 1ª banda clara) — assim 0–120/0–80 fica idêntico ao
// preset original e a relva continua para lá das linhas.
function VerticalStripes({ extent, originX, bandW }: { extent: LayerExtent; originX: number; bandW: number }) {
  const startK = Math.floor((extent.x - originX) / bandW);
  const endK = Math.ceil((extent.x + extent.w - originX) / bandW);
  const bands: { x: number; w: number }[] = [];
  for (let k = startK; k <= endK; k += 1) {
    if (k % 2 !== 0) continue; // k par = banda clara
    const bx = originX + k * bandW;
    const x0 = Math.max(bx, extent.x);
    const x1 = Math.min(bx + bandW, extent.x + extent.w);
    if (x1 > x0) bands.push({ x: x0, w: x1 - x0 });
  }
  return (
    <>
      {bands.map((b) => (
        <rect key={b.x} x={b.x} y={extent.y} width={b.w} height={extent.h} fill={GRASS_LIGHT} />
      ))}
    </>
  );
}

function HorizontalStripes({ extent, originY, bandH }: { extent: LayerExtent; originY: number; bandH: number }) {
  const startK = Math.floor((extent.y - originY) / bandH);
  const endK = Math.ceil((extent.y + extent.h - originY) / bandH);
  const bands: { y: number; h: number }[] = [];
  for (let k = startK; k <= endK; k += 1) {
    if (k % 2 !== 0) continue;
    const by = originY + k * bandH;
    const y0 = Math.max(by, extent.y);
    const y1 = Math.min(by + bandH, extent.y + extent.h);
    if (y1 > y0) bands.push({ y: y0, h: y1 - y0 });
  }
  return (
    <>
      {bands.map((b) => (
        <rect key={b.y} x={extent.x} y={b.y} width={extent.w} height={b.h} fill={GRASS_LIGHT} />
      ))}
    </>
  );
}

function GrassLayer({ preset, extent }: { preset: FieldPreset; extent: LayerExtent }) {
  return (
    <g>
      <rect
        x={extent.x}
        y={extent.y}
        width={extent.w}
        height={extent.h}
        fill={preset === "free" ? GRASS_LIGHT : GRASS_DARK}
      />
      {preset === "full" && <VerticalStripes extent={extent} originX={6} bandW={13.5} />}
      {preset === "half" && <HorizontalStripes extent={extent} originY={5} bandH={8.375} />}
      {preset === "area" && <HorizontalStripes extent={extent} originY={3} bandH={13.8} />}
    </g>
  );
}

// ── Marcações (confinadas a 0–120/0–80) ─────────────────────────────────────

function FullMarkings() {
  return (
    <g fill="none" stroke={LINE}>
      <rect x="6" y="4" width="108" height="72" strokeWidth="0.36" />
      <line x1="60" y1="4" x2="60" y2="76" strokeWidth="0.32" />
      <circle cx="60" cy="40" r="9.55" strokeWidth="0.32" />
      <circle cx="60" cy="40" r="0.28" fill={LINE} stroke="none" />
      <rect x="6" y="18.654" width="16.971" height="42.692" strokeWidth="0.32" />
      <rect x="6" y="30.301" width="5.657" height="19.398" strokeWidth="0.32" />
      <rect x="97.029" y="18.654" width="16.971" height="42.692" strokeWidth="0.32" />
      <rect x="108.343" y="30.301" width="5.657" height="19.398" strokeWidth="0.32" />
      <circle cx="17.314" cy="40" r="0.28" fill={LINE} stroke="none" />
      <circle cx="102.686" cy="40" r="0.28" fill={LINE} stroke="none" />
      <path d="M 22.971 32.306 A 9.55 9.55 0 0 1 22.971 47.694" strokeWidth="0.32" />
      <path d="M 97.029 32.306 A 9.55 9.55 0 0 0 97.029 47.694" strokeWidth="0.32" />
      <path d="M 7.029 4 A 1.029 1.029 0 0 1 6 5.029" strokeWidth="0.32" />
      <path d="M 112.971 4 A 1.029 1.029 0 0 0 114 5.029" strokeWidth="0.32" />
      <path d="M 6 74.971 A 1.029 1.029 0 0 1 7.029 76" strokeWidth="0.32" />
      <path d="M 114 74.971 A 1.029 1.029 0 0 0 112.971 76" strokeWidth="0.32" />
      <rect x="3.704" y="36.125" width="2.296" height="7.751" strokeWidth="0.2816" />
      <rect x="114" y="36.125" width="2.296" height="7.751" strokeWidth="0.2816" />
    </g>
  );
}

function HalfMarkings() {
  return (
    <g fill="none" stroke={LINE}>
      <rect x="16" y="5" width="88" height="67" strokeWidth="0.36" />
      <path d="M 48.241 5 A 11.759 11.759 0 0 0 71.759 5" strokeWidth="0.32" />
      <circle cx="60" cy="5" r="0.28" fill={LINE} stroke="none" />
      <rect x="33.911" y="50.943" width="52.179" height="21.057" strokeWidth="0.32" />
      <rect x="48.146" y="64.981" width="23.708" height="7.019" strokeWidth="0.32" />
      <rect x="55.264" y="72" width="9.473" height="2.827" strokeWidth="0.2816" />
      <circle cx="60" cy="57.962" r="0.28" fill={LINE} stroke="none" />
      <path d="M 50.565 50.943 A 11.759 11.759 0 0 1 69.435 50.943" strokeWidth="0.32" />
      <path d="M 17.276 72 A 1.276 1.276 0 0 1 16 70.724" strokeWidth="0.32" />
      <path d="M 104 70.724 A 1.276 1.276 0 0 1 102.724 72" strokeWidth="0.32" />
    </g>
  );
}

function AreaMarkings() {
  return (
    <g fill="none" stroke={LINE}>
      <rect x="4" y="3" width="112" height="69" strokeWidth="0.34" />
      <rect x="26.795" y="42.039" width="66.409" height="29.961" strokeWidth="0.32" />
      <rect x="44.913" y="62.013" width="30.174" height="9.987" strokeWidth="0.32" />
      <rect x="53.972" y="72" width="12.056" height="3.809" strokeWidth="0.2816" />
      <circle cx="60" cy="52.026" r="0.28" fill={LINE} stroke="none" />
      <path d="M 47.702 42.039 A 15.843 15.843 0 0 1 72.298 42.039" strokeWidth="0.32" />
      <path d="M 5.647 72 A 1.647 1.647 0 0 1 4 70.353" strokeWidth="0.32" />
      <path d="M 116 70.353 A 1.647 1.647 0 0 1 114.353 72" strokeWidth="0.32" />
    </g>
  );
}

function FreeMarkings() {
  return <rect x="6" y="4" width="108" height="72" fill="none" stroke={LINE} strokeWidth="0.36" />;
}

function Markings({ preset }: { preset: FieldPreset }) {
  switch (preset) {
    case "half":
      return <HalfMarkings />;
    case "area":
      return <AreaMarkings />;
    case "free":
      return <FreeMarkings />;
    case "full":
    default:
      return <FullMarkings />;
  }
}

export function FieldPresetLayer({ preset, showMarkings = true, extent = FIELD_EXTENT }: LayerProps) {
  return (
    <g>
      <GrassLayer preset={preset} extent={extent} />
      {showMarkings && <Markings preset={preset} />}
    </g>
  );
}

export const FIELD_PRESET_OPTIONS: { value: FieldPreset; label: string }[] = [
  { value: "full", label: "Inteiro" },
  { value: "half", label: "Meio campo" },
  { value: "area", label: "Área" },
  { value: "free", label: "Livre" },
];
