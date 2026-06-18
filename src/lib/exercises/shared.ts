import { z } from "zod";

export const EXERCISE_CATEGORIES = [
  "attb",
  "esquemas_taticos",
  "estrategia",
  "finalizacao",
  "organizacao_defensiva",
  "organizacao_ofensiva",
  "principios_de_jogo",
  "qualidades_fisicas",
  "transicao_defensiva",
  "transicao_ofensiva",
] as const;

const ORIENTATION_VALUES = ["recovery", "strength", "endurance", "speed", "flexibility", "other"] as const;
const REGIME_VALUES = ["aerobic", "anaerobic_lactic", "anaerobic_alactic"] as const;
const STATUS_VALUES = ["active", "archived"] as const;

// Diagrama do editor (jsonb reeditável). Validado por kind; só o PNG
// (diagram_url) é consumido pela UT — este JSON serve para reabrir/editar.
const diagramElementSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string(),
    kind: z.literal("player"),
    team: z.enum(["home", "away"]),
    x: z.number(),
    y: z.number(),
    label: z.string().optional(),
    color: z.string().optional(),
    style: z.enum(["circle", "jersey"]).optional(),
    size: z.enum(["s", "m", "l"]).optional(),
  }),
  z.object({ id: z.string(), kind: z.literal("ball"), x: z.number(), y: z.number(), color: z.string().optional() }),
  z.object({ id: z.string(), kind: z.literal("cone"), x: z.number(), y: z.number(), color: z.string().optional() }),
  z.object({
    id: z.string(),
    kind: z.literal("object"),
    x: z.number(),
    y: z.number(),
    shape: z.enum([
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
    ]),
    color: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("text"),
    x: z.number(),
    y: z.number(),
    text: z.string(),
    color: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("zone"),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    color: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal("arrow"),
    variant: z.enum(["move", "pass", "dribble", "line"]),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    color: z.string().optional(),
  }),
]);

export const exerciseDiagramSchema = z.object({
  v: z.literal(1),
  preset: z.enum(["full", "half", "area", "free"]),
  color: z.string(),
  elements: z.array(diagramElementSchema),
});

export const createExerciseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  category: z.enum(EXERCISE_CATEGORIES),
  description: z.string().nullish(),
  objectives: z.string().nullish(),
  success_criteria: z.string().nullish(),
  subcategory: z.string().nullish(),
  game_format: z.string().nullish(),
  duration_minutes: z.number().int().positive().nullish(),
  rest_minutes: z.number().int().min(0).default(0),
  min_players: z.number().int().positive().nullish(),
  max_players: z.number().int().positive().nullish(),
  field_dimensions: z.string().nullish(),
  material: z.string().nullish(),
  diagram_url: z.string().url().nullish(),
  diagram_json: exerciseDiagramSchema.nullish(),
  diagram_type: z.enum(["image", "editor"]).nullish(),
  orientation: z.enum(ORIENTATION_VALUES).nullish(),
  regime: z.enum(REGIME_VALUES).nullish(),
  notes: z.string().nullish(),
  status: z.enum(STATUS_VALUES).default("active"),
});

export const ACCEPTED_EXERCISE_IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export const ACCEPTED_EXERCISE_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const MAX_EXERCISE_IMAGE_BYTES = 5 * 1024 * 1024;

type ExerciseImageExtension = (typeof ACCEPTED_EXERCISE_IMAGE_EXTENSIONS)[number];
type ExerciseImageMimeType = (typeof ACCEPTED_EXERCISE_IMAGE_MIME_TYPES)[number];

type ExerciseImageValidation =
  | {
      ok: true;
      extension: "png" | "jpg" | "webp";
      contentType: ExerciseImageMimeType;
    }
  | {
      ok: false;
      error: "invalid_type" | "too_large";
    };

function normalizeExtension(extension: string | undefined): ExerciseImageExtension | null {
  if (!extension) return null;
  const normalized = extension.toLowerCase();

  if (
    (ACCEPTED_EXERCISE_IMAGE_EXTENSIONS as readonly string[]).includes(normalized)
  ) {
    return normalized as ExerciseImageExtension;
  }

  return null;
}

function normalizeMimeType(mimeType: string | undefined): ExerciseImageMimeType | null {
  if (!mimeType) return null;
  const normalized = mimeType.toLowerCase();

  if (normalized === "application/octet-stream") return null;

  if (
    (ACCEPTED_EXERCISE_IMAGE_MIME_TYPES as readonly string[]).includes(normalized)
  ) {
    return normalized as ExerciseImageMimeType;
  }

  return null;
}

function getMimeTypeForExtension(extension: "png" | "jpg" | "webp"): ExerciseImageMimeType {
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
}

export function resolveExerciseImageExtension(
  fileName: string,
  mimeType?: string,
): "png" | "jpg" | "webp" {
  const rawExtension = fileName.split(".").pop();
  const normalizedExtension = normalizeExtension(rawExtension);

  if (normalizedExtension === "png" || normalizedExtension === "webp") {
    return normalizedExtension;
  }

  if (normalizedExtension === "jpg" || normalizedExtension === "jpeg") {
    return "jpg";
  }

  const normalizedMimeType = normalizeMimeType(mimeType);
  if (normalizedMimeType === "image/png") return "png";
  if (normalizedMimeType === "image/webp") return "webp";
  if (normalizedMimeType === "image/jpeg") return "jpg";

  return "png";
}

export function validateExerciseImageUpload(input: {
  fileName: string;
  mimeType?: string;
  size: number;
}): ExerciseImageValidation {
  const rawExtension = input.fileName.split(".").pop();
  const normalizedExtension = normalizeExtension(rawExtension);
  const normalizedMimeType = normalizeMimeType(input.mimeType);

  if (!normalizedMimeType && !normalizedExtension) {
    return { ok: false, error: "invalid_type" };
  }

  if (normalizedMimeType === null && input.mimeType && input.mimeType !== "application/octet-stream") {
    return { ok: false, error: "invalid_type" };
  }

  if (input.size > MAX_EXERCISE_IMAGE_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const extension = resolveExerciseImageExtension(input.fileName, input.mimeType);

  return {
    ok: true,
    extension,
    contentType: normalizedMimeType ?? getMimeTypeForExtension(extension),
  };
}
