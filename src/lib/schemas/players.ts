import { z } from "zod";

export const PLAYER_POSITIONS = [
  "GR",
  "DD",
  "DC",
  "DE",
  "MD",
  "MC",
  "MO",
  "ME",
  "AV",
  "EE",
  "ED",
  "SA",
] as const;

export const PLAYER_STATUSES = [
  "active",
  "injured",
  "suspended",
  "inactive",
] as const;

// Helper: aceita "" e converte para null (UX: permitir limpar campo).
const emptyStringToNull = z
  .string()
  .max(0)
  .transform(() => null);

const optionalEmail = z
  .union([
    z.string().trim().email("Email inválido").max(254),
    emptyStringToNull,
    z.null(),
  ])
  .optional();

const optionalPhone = z
  .union([
    z.string().trim().min(1).max(20),
    emptyStringToNull,
    z.null(),
  ])
  .optional();

const optionalShortText = (max: number) =>
  z
    .union([z.string().trim().min(1).max(max), emptyStringToNull, z.null()])
    .optional();

const optionalLongText = (max: number) =>
  z.union([z.string().max(max), z.null()]).optional();

const optionalDate = z
  .union([
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (formato YYYY-MM-DD)"),
    emptyStringToNull,
    z.null(),
  ])
  .optional();

/**
 * Schema partilhado entre cliente e servidor para PATCH /api/players/[id].
 *
 * Notas:
 * - `.strict()` rejeita campos desconhecidos (defesa contra typos).
 * - Campos `invite_*` mantidos porque o flow de convite existente envia-os
 *   directamente. Se forem removidos, partir esse flow.
 * - `avatar_url` NÃO está incluído — entra no PR 3 (upload de foto).
 */
export const playerUpdateSchema = z
  .object({
    first_name: z
      .string()
      .trim()
      .min(2, "Nome demasiado curto")
      .max(100)
      .optional(),
    last_name: z
      .string()
      .trim()
      .min(2, "Apelido demasiado curto")
      .max(100)
      .optional(),
    birth_date: optionalDate,
    preferred_position: z
      .union([z.enum(PLAYER_POSITIONS), z.null(), emptyStringToNull])
      .optional(),
    secondary_position: z
      .union([z.enum(PLAYER_POSITIONS), z.null(), emptyStringToNull])
      .optional(),
    jersey_number: z
      .union([z.number().int().min(0).max(99), z.null()])
      .optional(),
    phone: optionalPhone,
    email: optionalEmail,
    notes: optionalLongText(2000),
    parent_email: optionalEmail,
    parent_phone: optionalPhone,
    status: z.enum(PLAYER_STATUSES).optional(),
    photo_consent_given: z.boolean().optional(),
    // Mantidos para compat com flow de convite existente:
    invite_code: optionalShortText(40),
    invite_method: optionalShortText(20),
    invite_sent_at: optionalShortText(40),
    invite_accepted_at: optionalShortText(40),
  })
  .strict();

export type PlayerUpdateInput = z.infer<typeof playerUpdateSchema>;
