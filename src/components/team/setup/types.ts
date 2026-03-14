import type { AgeGroup, KitPiece, KitNumber, PlayerType, PieceType } from "@/types/database";

export type { AgeGroup, KitPiece, KitNumber, PlayerType, PieceType };

export interface StaffInvite {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  invite_code: string;
  accepted_at?: string;
  accepted_by?: string;
  invite_sent_at: string;
}

export const FOOTBALL_FORMATS = [
  { value: "5", label: "Futebol 5" },
  { value: "7", label: "Futebol 7" },
  { value: "9", label: "Futebol 9" },
  { value: "11", label: "Futebol 11" },
];

export const AGE_GROUPS = [
  "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12",
  "Sub-13", "Sub-14", "Sub-15", "Sub-17", "Sub-19", "Sénior",
];

export const ROLE_OPTIONS = [
  { value: "coach", label: "Treinador Principal" },
  { value: "assistant_coach", label: "Treinador Adjunto" },
];

export const ROLE_LABELS: Record<string, string> = {
  coach: "Treinador Principal",
  assistant_coach: "Treinador Adjunto",
  coordinator: "Coordenador",
};

export const KIT_NUMBERS: KitNumber[] = [1, 2];
export const KIT_LABELS: Record<KitNumber, string> = { 1: "1.º Kit", 2: "2.º Kit", 3: "3.º Kit" };
export const PIECE_TYPES: PieceType[] = ["shirt", "shorts", "socks"];
export const PIECE_LABELS: Record<PieceType, string> = { shirt: "Camisola", shorts: "Calções", socks: "Meias" };
export const PLAYER_TYPES: PlayerType[] = ["field", "goalkeeper"];
export const PLAYER_TYPE_LABELS: Record<PlayerType, string> = { field: "Campo", goalkeeper: "Guarda-redes" };

export const EMPTY_STAFF_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "assistant_coach",
};

export function normalizePlayerTypeForComparison(value: string | undefined) {
  if (!value) return "";
  return value === "field_player" ? "field" : value;
}

export function normalizePieceTypeForComparison(value: string | undefined) {
  if (!value) return "";
  return value === "jersey" ? "shirt" : value;
}

export function samePieceType(dbPieceType: string | undefined, requestedPieceType: string) {
  if (!dbPieceType) return false;
  return (
    normalizePieceTypeForComparison(dbPieceType) ===
    normalizePieceTypeForComparison(requestedPieceType)
  );
}

export function normalizeColorHex(value: string | null | undefined) {
  if (!value) return "#cccccc";
  const normalized = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : "#cccccc";
}
