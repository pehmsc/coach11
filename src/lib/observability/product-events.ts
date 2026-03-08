export const PRODUCT_EVENT_NAMES = [
  "attendance_marked",
  "convocation_created",
  "game_started",
  "game_event_recorded",
  "game_finalized",
  "player_added",
  "staff_invited",
  "pdf_generated",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

type ProductEventValue = string | number | boolean | null | undefined;

export type ProductEventProperties = Record<string, ProductEventValue>;

// Normaliza propriedades antes de enviar para analytics para evitar payloads ruidosos.
export function sanitizeProductEventProperties(
  properties: ProductEventProperties,
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => {
      if (value === undefined) return false;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    }),
  );
}
