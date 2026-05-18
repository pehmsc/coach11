import type { Player } from "@/types/database";

export interface PlayerWithStatus extends Player {
  isConvocated: boolean;
  isBlocked: boolean; // já convocado noutro jogo SOBREPOSTO no mesmo dia
  isExternal?: boolean;
  externalConvocationId?: string | null;
  /**
   * Quando o atleta foi convocado via cross-age (i.e., player_id real
   * dum atleta de outro escalão do mesmo clube), guarda aqui o
   * `source_age_group_id` para que a UI mostre badge com nome do
   * escalão de origem. `null`/`undefined` significa atleta do escalão
   * actual (sem badge).
   */
  sourceAgeGroupId?: string | null;
  /** Vermelho/destructive — sobreposição real, jogador bloqueado. */
  sameDayConflictLabel?: string | null;
  /** Amarelo/warning — convocado noutro(s) jogo(s) sem sobreposição, jogador disponível. */
  sameDayInfoLabel?: string | null;
}

export interface KitPieceRow {
  id: string;
  kit_number: number;
  player_type: "field" | "field_player" | "goalkeeper";
  piece_type: "shirt" | "jersey" | "shorts" | "socks";
  color_name: string | null;
  color_hex: string | null;
}

export type KitSelection = {
  fp_jersey_kit_id: string | null;
  fp_shorts_kit_id: string | null;
  fp_socks_kit_id: string | null;
  gk_jersey_kit_id: string | null;
  gk_shorts_kit_id: string | null;
  gk_socks_kit_id: string | null;
};

export const EMPTY_KIT_SELECTION: KitSelection = {
  fp_jersey_kit_id: null,
  fp_shorts_kit_id: null,
  fp_socks_kit_id: null,
  gk_jersey_kit_id: null,
  gk_shorts_kit_id: null,
  gk_socks_kit_id: null,
};

export const UI_PIECE_TYPES = ["shirt", "shorts", "socks"] as const;

export const PIECE_LABEL: Record<(typeof UI_PIECE_TYPES)[number], string> = {
  shirt: "Camisola",
  shorts: "Calções",
  socks: "Meias",
};

export const FORMATIONS_BY_FORMAT: Record<string, string[]> = {
  "5": ["1-2-2", "1-1-3", "1-3-1"],
  "7": ["1-2-3-1", "1-3-2-1", "1-2-2-2", "1-1-3-2", "1-2-1-3"],
  "9": ["1-3-3-2", "1-4-3-1", "1-3-4-1", "1-2-4-2", "1-2-5-1", "1-3-2-3"],
  "11": ["4-4-2", "4-3-3", "3-5-2", "4-2-3-1", "3-4-3", "4-5-1", "5-3-2"],
};

export function getPlayerCardMeta(player: Pick<PlayerWithStatus, "jersey_number" | "preferred_position">) {
  const parts: string[] = [];

  if (typeof player.jersey_number === "number") {
    parts.push(`#${player.jersey_number}`);
  }

  if (
    typeof player.preferred_position === "string" &&
    player.preferred_position.trim().length > 0
  ) {
    parts.push(player.preferred_position.trim());
  }

  return parts.join(" · ");
}

export function samePieceType(
  dbPieceType: KitPieceRow["piece_type"],
  requestedPieceType: (typeof UI_PIECE_TYPES)[number],
) {
  if (requestedPieceType === "shirt") {
    return dbPieceType === "shirt" || dbPieceType === "jersey";
  }
  return dbPieceType === requestedPieceType;
}

export function samePlayerType(
  dbPlayerType: KitPieceRow["player_type"],
  requestedPlayerType: "field" | "goalkeeper",
) {
  if (requestedPlayerType === "field") {
    return dbPlayerType === "field" || dbPlayerType === "field_player";
  }
  return dbPlayerType === requestedPlayerType;
}

export function normalizePlayerTypeForKitKey(value: KitPieceRow["player_type"]) {
  return value === "field_player" ? "field" : value;
}

export function normalizePieceTypeForKitKey(value: KitPieceRow["piece_type"]) {
  return value === "jersey" ? "shirt" : value;
}

export function getKitColor(piece: KitPieceRow | null | undefined) {
  const hex = piece?.color_hex?.trim() || "";
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? hex : "#e2e8f0";
}

export const isGkPlayer = (p: PlayerWithStatus) =>
  p.preferred_position != null && /gr|gk|guarda/i.test(p.preferred_position);
