// Presets de campo (fiéis ao standard, sem marca de água). Cada preset desenha
// o relvado (sempre visível) + as linhas brancas (alternáveis via showMarkings).
// Cores em hex fixo: é cena física, não inverte em dark mode.

import type { FieldPreset } from "@/types/editor";

const GRASS_DARK = "#2B542E";
const GRASS_LIGHT = "#315B34";
// Tom mais escuro para a zona fora das linhas (vinheta de relvado) quando o
// viewBox do editor é maior que o campo (edge-to-edge em landscape/portrait).
const GRASS_OUTSIDE = "#234524";
const LINE = "#fff";

type LayerExtent = { x: number; y: number; w: number; h: number };
type LayerProps = { preset: FieldPreset; showMarkings?: boolean; extent?: LayerExtent };

function FullField({ showMarkings }: { showMarkings: boolean }) {
  const stripes = [6, 19.5, 33, 46.5, 60, 73.5, 87, 100.5];
  return (
    <g>
      <rect x="0" y="0" width="120" height="80" fill={GRASS_DARK} />
      {stripes.map((x, i) => (
        <rect
          key={x}
          x={x}
          y="4"
          width="13.5"
          height="72"
          fill={i % 2 === 0 ? GRASS_LIGHT : GRASS_DARK}
        />
      ))}
      {showMarkings && (
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
      )}
    </g>
  );
}

function HalfField({ showMarkings }: { showMarkings: boolean }) {
  const stripes = Array.from({ length: 8 }, (_, i) => 5 + i * 8.375);
  return (
    <g>
      <rect x="0" y="0" width="120" height="80" fill={GRASS_DARK} />
      {stripes.map((y, i) => (
        <rect
          key={y}
          x="16"
          y={y}
          width="88"
          height="8.375"
          fill={i % 2 === 0 ? GRASS_LIGHT : GRASS_DARK}
        />
      ))}
      {showMarkings && (
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
      )}
    </g>
  );
}

function AreaField({ showMarkings }: { showMarkings: boolean }) {
  const stripes = Array.from({ length: 5 }, (_, i) => 3 + i * 13.8);
  return (
    <g>
      <rect x="0" y="0" width="120" height="80" fill={GRASS_DARK} />
      {stripes.map((y, i) => (
        <rect
          key={y}
          x="4"
          y={y}
          width="112"
          height="13.8"
          fill={i % 2 === 0 ? GRASS_LIGHT : GRASS_DARK}
        />
      ))}
      {showMarkings && (
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
      )}
    </g>
  );
}

function FreeField({ showMarkings }: { showMarkings: boolean }) {
  return (
    <g>
      <rect x="0" y="0" width="120" height="80" fill={GRASS_DARK} />
      <rect x="6" y="4" width="108" height="72" fill={GRASS_LIGHT} />
      {showMarkings && (
        <rect x="6" y="4" width="108" height="72" fill="none" stroke={LINE} strokeWidth="0.36" />
      )}
    </g>
  );
}

function FieldByPreset({ preset, showMarkings }: { preset: FieldPreset; showMarkings: boolean }) {
  switch (preset) {
    case "half":
      return <HalfField showMarkings={showMarkings} />;
    case "area":
      return <AreaField showMarkings={showMarkings} />;
    case "free":
      return <FreeField showMarkings={showMarkings} />;
    case "full":
    default:
      return <FullField showMarkings={showMarkings} />;
  }
}

export function FieldPresetLayer({ preset, showMarkings = true, extent }: LayerProps) {
  // Vinheta de relvado: só quando o viewBox visível ultrapassa o campo 120×80.
  // Fica POR TRÁS do preset (cujo rect base cobre 0–120/0–80), pelo que o campo
  // e a exportação (recortada a 120×80) ficam intactos.
  const showVignette =
    extent != null && (extent.x < 0 || extent.y < 0 || extent.w > 120 || extent.h > 80);
  return (
    <g>
      {showVignette && (
        <rect x={extent.x} y={extent.y} width={extent.w} height={extent.h} fill={GRASS_OUTSIDE} />
      )}
      <FieldByPreset preset={preset} showMarkings={showMarkings} />
    </g>
  );
}

export const FIELD_PRESET_OPTIONS: { value: FieldPreset; label: string }[] = [
  { value: "full", label: "Inteiro" },
  { value: "half", label: "Meio campo" },
  { value: "area", label: "Área" },
  { value: "free", label: "Livre" },
];
