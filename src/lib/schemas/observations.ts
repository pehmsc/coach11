import { z } from "zod";

export const observationCreateSchema = z.object({
  observation: z
    .string()
    .trim()
    .min(1, "A observação não pode estar vazia.")
    .max(2000, "A observação é demasiado longa."),
  minute: z.number().int().min(0).max(200).nullable().optional(),
});

export type ObservationCreateInput = z.infer<typeof observationCreateSchema>;

export const PROMOTE_TARGET_FIELDS = [
  "pontos_fortes",
  "pontos_fracos",
  "atletas_chave",
  "notas_gerais",
] as const;

export type PromoteTargetField = (typeof PROMOTE_TARGET_FIELDS)[number];

export const observationPromoteSchema = z.object({
  observationIds: z
    .array(z.string().uuid())
    .min(1, "Selecciona pelo menos uma observação."),
  targetField: z.enum(PROMOTE_TARGET_FIELDS),
});

export type ObservationPromoteInput = z.infer<typeof observationPromoteSchema>;
