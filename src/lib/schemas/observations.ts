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
