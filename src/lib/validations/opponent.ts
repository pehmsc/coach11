import { z } from "zod";

// Telefone PT: aceita +351 opcional, espacos, 9 digitos comecados em 2/3/9
const PHONE_PT_REGEX = /^(\+351\s?)?[239]\d{2}\s?\d{3}\s?\d{3}$/;

const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_PT_REGEX, "Formato de telefone invalido (ex: +351 912 345 678)")
  .or(z.literal(""))
  .optional()
  .nullable();

export const opponentBaseSchema = z
  .object({
    name: z.string().trim().min(1, "Nome e obrigatorio").max(120),
    short_name: z.string().trim().min(2).max(5).optional().nullable().or(z.literal("")),
    logo_url: z.string().url().optional().nullable().or(z.literal("")),
    tactical_formation: z.string().trim().max(20).optional().nullable().or(z.literal("")),
    pontos_fortes: z.string().trim().max(2000).optional().nullable(),
    pontos_fracos: z.string().trim().max(2000).optional().nullable(),
    atletas_chave: z.string().trim().max(2000).optional().nullable(),
    notas_gerais: z.string().trim().max(2000).optional().nullable(),
    home_ground: z.string().trim().max(120).optional().nullable(),
    home_ground_address: z.string().trim().max(300).optional().nullable(),
    home_ground_lat: z.number().min(-90).max(90).optional().nullable(),
    home_ground_lng: z.number().min(-180).max(180).optional().nullable(),
    coach_name: z.string().trim().max(120).optional().nullable(),
    phone: phoneSchema,
    contact_info: z.string().trim().max(1000).optional().nullable(),
    youth_academy_notes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const opponentCreateSchema = opponentBaseSchema
  .pick({ name: true, short_name: true })
  .strict();

export const opponentUpdateSchema = opponentBaseSchema.partial().strict();

export type OpponentInput = z.infer<typeof opponentBaseSchema>;
export type OpponentCreate = z.infer<typeof opponentCreateSchema>;
export type OpponentUpdate = z.infer<typeof opponentUpdateSchema>;
