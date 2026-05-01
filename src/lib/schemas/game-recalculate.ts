import { z } from "zod";

export const PLAYER_LINEUP_TYPES = ["starter", "substitute"] as const;
export type PlayerLineupType = (typeof PLAYER_LINEUP_TYPES)[number];

const playerOverrideSchema = z
  .object({
    lineup_type: z.enum(PLAYER_LINEUP_TYPES).optional(),
    minutes_played: z.number().int().min(0).max(200).optional(),
    goals: z.number().int().min(0).max(20).optional(),
    own_goals: z.number().int().min(0).max(5).optional(),
    assists: z.number().int().min(0).max(20).optional(),
    yellow_cards: z.number().int().min(0).max(2).optional(),
    red_cards: z.number().int().min(0).max(2).optional(),
    coach_rating: z.number().min(0).max(10).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    is_mvp: z.boolean().optional(),
  })
  .strict();

export type PlayerOverride = z.infer<typeof playerOverrideSchema>;

export const recalculateRequestSchema = z
  .object({
    finalMinute: z.number().int().min(1).max(200),
    ratings: z
      .record(z.string().uuid(), z.number().min(0).max(10).nullable())
      .optional(),
    notes: z
      .record(z.string().uuid(), z.string().max(2000).nullable())
      .optional(),
    mvpPlayerId: z.string().uuid().nullable().optional(),
    starterIds: z.array(z.string().uuid()),
    overrides: z.record(z.string().uuid(), playerOverrideSchema).optional(),
    force_auto: z.boolean().optional(),
  })
  .strict();

export type RecalculateRequest = z.infer<typeof recalculateRequestSchema>;

/**
 * Campos numéricos cuja edição manual marca a row como `edited_manually=true`.
 * Alterar apenas `coach_rating`, `notes`, `is_mvp` ou `lineup_type` NÃO conta —
 * são tratados como ajustes "qualitativos" e não bloqueiam o recálculo
 * automático no próximo "Refazer".
 */
export const NUMERIC_OVERRIDE_FIELDS = [
  "minutes_played",
  "goals",
  "own_goals",
  "assists",
  "yellow_cards",
  "red_cards",
] as const satisfies ReadonlyArray<keyof PlayerOverride>;

export function isManualOverride(
  override: PlayerOverride | undefined,
): boolean {
  if (!override) return false;
  return NUMERIC_OVERRIDE_FIELDS.some((field) => override[field] !== undefined);
}
