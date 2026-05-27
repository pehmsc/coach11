import { z } from "zod";

const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
// game_datetime e timestamp WITHOUT time zone (hora local PT) — string sem
// indicador de fuso, formato "YYYY-MM-DDTHH:MM[:SS]". Ver src/lib/events/time.ts.
const GAME_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export const gameUpdateSchema = z
  .object({
    competition_id: z.string().uuid().nullable().optional(),
    opponent_id: z.string().uuid().nullable().optional(),
    opponent_name: z.string().trim().max(120).optional(),
    opponent_short_name: z.string().trim().max(40).nullable().optional(),
    opponent_tactical_system: z.string().trim().max(40).nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    game_datetime: z
      .string()
      .regex(GAME_DATETIME_RE, "game_datetime inválido (esperado YYYY-MM-DDTHH:MM[:SS])")
      .optional(),
    end_time: z
      .string()
      .regex(TIME_RE, "hora inválida")
      .nullable()
      .optional(),
    concentration_time: z
      .string()
      .regex(TIME_RE)
      .nullable()
      .optional(),
    location: z.string().trim().max(200).nullable().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    formatted_address: z.string().trim().max(300).nullable().optional(),
    osm_place_id: z.string().trim().max(100).nullable().optional(),
    location_source: z.string().trim().max(40).nullable().optional(),
    is_home: z.boolean().optional(),
    game_type: z.string().trim().max(40).optional(),
    equipment: z.string().trim().max(40).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    additional_info: z.string().max(2000).nullable().optional(),
    positive_aspects: z.string().max(2000).nullable().optional(),
    negative_aspects: z.string().max(2000).nullable().optional(),
    coach_notes: z.string().max(2000).nullable().optional(),
    tactical_system: z.string().trim().max(40).nullable().optional(),
    aspects_to_improve: z.string().max(2000).nullable().optional(),
    team_notes: z.string().max(2000).nullable().optional(),
    image_url: z.string().max(2000).nullable().optional(),
  })
  .strict();
