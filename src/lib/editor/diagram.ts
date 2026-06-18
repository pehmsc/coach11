// Modelo de dados do diagrama: factory, (de)serialização com validação e a
// pilha de undo. Tudo puro/testável — sem dependências de DOM ou React.

import {
  DEFAULT_DIAGRAM_COLOR,
  type ArrowVariant,
  type DiagramElement,
  type DiagramElementKind,
  type ExerciseDiagram,
  type FieldPreset,
  type ObjectShape,
} from "@/types/editor";

const FIELD_PRESETS: readonly FieldPreset[] = ["full", "half", "area", "free"];
const ARROW_VARIANTS: readonly ArrowVariant[] = ["move", "pass", "dribble", "line"];
const PLAYER_STYLES: readonly string[] = ["circle", "jersey"];
const PLAYER_SIZES: readonly string[] = ["s", "m", "l"];
const OBJECT_SHAPES: readonly string[] = [
  "chapeu",
  "cone-stick",
  "baliza-a",
  "baliza-b",
  "mannequin",
  "vara",
  "arcos",
  "stairs",
  "ring",
  "mark",
];

export const HISTORY_LIMIT = 30;

export function emptyDiagram(preset: FieldPreset = "full"): ExerciseDiagram {
  return { v: 1, preset, color: DEFAULT_DIAGRAM_COLOR, elements: [] };
}

/** Clone profundo de um diagrama (dados planos — JSON round-trip é seguro). */
export function cloneDiagram(d: ExerciseDiagram): ExerciseDiagram {
  return {
    v: 1,
    preset: d.preset,
    color: d.color,
    elements: d.elements.map((el) => ({ ...el })),
  };
}

let idCounter = 0;
/** Gera um id único e estável para um elemento. */
export function newElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  idCounter += 1;
  return `el-${idCounter}`;
}

// ── Serialização ──────────────────────────────────────────────────────────

export function serializeDiagram(d: ExerciseDiagram): string {
  return JSON.stringify(d);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateElement(raw: unknown): DiagramElement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const el = raw as Record<string, unknown>;
  const kind = el.kind as DiagramElementKind;
  const id = typeof el.id === "string" && el.id ? el.id : newElementId();
  const color = typeof el.color === "string" ? { color: el.color } : {};

  switch (kind) {
    case "player":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      if (el.team !== "home" && el.team !== "away") return null;
      return {
        id,
        kind: "player",
        team: el.team,
        x: el.x,
        y: el.y,
        ...color,
        ...(typeof el.label === "string" ? { label: el.label } : {}),
        ...(PLAYER_STYLES.includes(el.style as string) ? { style: el.style as "circle" | "jersey" } : {}),
        ...(PLAYER_SIZES.includes(el.size as string) ? { size: el.size as "s" | "m" | "l" } : {}),
      };
    case "ball":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      return { id, kind: "ball", x: el.x, y: el.y, ...color };
    case "cone":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      return { id, kind: "cone", x: el.x, y: el.y, ...color };
    case "text":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      return {
        id,
        kind: "text",
        x: el.x,
        y: el.y,
        text: typeof el.text === "string" ? el.text : "",
        ...color,
      };
    case "zone":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      if (!isFiniteNumber(el.w) || !isFiniteNumber(el.h)) return null;
      return { id, kind: "zone", x: el.x, y: el.y, w: el.w, h: el.h, ...color };
    case "arrow":
      if (
        !isFiniteNumber(el.x1) ||
        !isFiniteNumber(el.y1) ||
        !isFiniteNumber(el.x2) ||
        !isFiniteNumber(el.y2)
      ) {
        return null;
      }
      if (!ARROW_VARIANTS.includes(el.variant as ArrowVariant)) return null;
      return {
        id,
        kind: "arrow",
        variant: el.variant as ArrowVariant,
        x1: el.x1,
        y1: el.y1,
        x2: el.x2,
        y2: el.y2,
        ...color,
      };
    case "object":
      if (!isFiniteNumber(el.x) || !isFiniteNumber(el.y)) return null;
      if (!OBJECT_SHAPES.includes(el.shape as string)) return null;
      return {
        id,
        kind: "object",
        x: el.x,
        y: el.y,
        shape: el.shape as ObjectShape,
        ...color,
      };
    default:
      return null;
  }
}

/**
 * Normaliza/valida um valor desconhecido (string JSON ou objeto vindo do DB)
 * para um ExerciseDiagram. Elementos inválidos são descartados; devolve null se
 * o envelope for irrecuperável.
 */
export function parseDiagram(input: unknown): ExerciseDiagram | null {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (obj.v !== 1) return null;

  const preset = FIELD_PRESETS.includes(obj.preset as FieldPreset)
    ? (obj.preset as FieldPreset)
    : "full";
  const color = typeof obj.color === "string" ? obj.color : DEFAULT_DIAGRAM_COLOR;
  const rawElements = Array.isArray(obj.elements) ? obj.elements : [];
  const elements = rawElements
    .map(validateElement)
    .filter((el): el is DiagramElement => el !== null);

  return { v: 1, preset, color, elements };
}

// ── Pilha de undo ───────────────────────────────────────────────────────────

export type DiagramHistory = {
  past: ExerciseDiagram[];
  present: ExerciseDiagram;
};

export function initHistory(present: ExerciseDiagram): DiagramHistory {
  return { past: [], present: cloneDiagram(present) };
}

/** Regista um novo estado, empurrando o atual para a pilha (limitada). */
export function commitHistory(
  h: DiagramHistory,
  next: ExerciseDiagram,
  limit: number = HISTORY_LIMIT,
): DiagramHistory {
  const past = [...h.past, h.present];
  while (past.length > limit) past.shift();
  return { past, present: cloneDiagram(next) };
}

export function canUndo(h: DiagramHistory): boolean {
  return h.past.length > 0;
}

/** Repõe o último estado da pilha. No-op se a pilha estiver vazia. */
export function undoHistory(h: DiagramHistory): DiagramHistory {
  if (h.past.length === 0) return h;
  const past = [...h.past];
  const present = past.pop() as ExerciseDiagram;
  return { past, present };
}
