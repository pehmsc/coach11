// Tipos do editor de diagramas táticos (SVG).
//
// Coordenadas: todos os x/y/w/h em UNIDADES DO viewBox (0–120 em x, 0–80 em y
// para campo inteiro), nunca em pixels. O viewBox é fixo em 120x80; os presets
// de campo são desenhados dentro dele.

export type FieldPreset = "full" | "half" | "area" | "free";

export type ArrowVariant = "move" | "pass" | "dribble";

// `color?` é um snapshot da paleta no momento da criação — cada elemento guarda
// a sua cor para coexistirem várias equipas/cores no mesmo diagrama. O render lê
// `el.color ?? diagram.color`; bola e cone ignoram `color` (cor de identidade).
export type DiagramElement =
  | { id: string; kind: "player"; team: "home" | "away"; x: number; y: number; label?: string; color?: string }
  | { id: string; kind: "ball"; x: number; y: number; color?: string }
  | { id: string; kind: "cone"; x: number; y: number; color?: string }
  | { id: string; kind: "text"; x: number; y: number; text: string; color?: string }
  | { id: string; kind: "zone"; x: number; y: number; w: number; h: number; color?: string }
  | { id: string; kind: "arrow"; variant: ArrowVariant; x1: number; y1: number; x2: number; y2: number; color?: string };

export type DiagramElementKind = DiagramElement["kind"];

export type ExerciseDiagram = {
  v: 1;
  preset: FieldPreset;
  color: string; // cor ativa de desenho (ex.: "#4E7BFF")
  elements: DiagramElement[];
};

// Dimensões canónicas do viewBox do campo.
export const FIELD_VIEWBOX = { width: 120, height: 80 } as const;

// Cor de desenho por defeito.
export const DEFAULT_DIAGRAM_COLOR = "#4E7BFF";
