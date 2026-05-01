import type { Player } from "@/types/database";
import type { PlayerUpdateInput } from "@/lib/schemas/players";

/**
 * Estado do formulário de edição. Strings vazias representam o estado UI
 * (input vazio); são normalizadas para `null` quando o utilizador grava.
 */
export interface PlayerFormState {
  first_name: string;
  last_name: string;
  birth_date: string; // "" ou "YYYY-MM-DD"
  preferred_position: string; // "" ou enum
  secondary_position: string; // "" ou enum
  jersey_number: string; // "" ou número como string
  phone: string;
  email: string;
  notes: string;
  parent_email: string;
  parent_phone: string;
  status: Player["status"];
  photo_consent_given: boolean;
}

function normalizeString(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value;
}

/** Cria o estado inicial do form a partir de um Player. */
export function playerToFormState(player: Player): PlayerFormState {
  return {
    first_name: player.first_name,
    last_name: player.last_name,
    birth_date: normalizeString(player.birth_date),
    preferred_position: normalizeString(player.preferred_position),
    secondary_position: normalizeString(player.secondary_position),
    jersey_number:
      typeof player.jersey_number === "number"
        ? String(player.jersey_number)
        : "",
    phone: normalizeString(player.phone),
    email: normalizeString(player.email),
    notes: normalizeString(player.notes),
    parent_email: normalizeString(player.parent_email),
    parent_phone: normalizeString(player.parent_phone),
    status: player.status,
    photo_consent_given: player.photo_consent_given ?? false,
  };
}

function normalizeForCompare(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Compara o estado actual do form com o player original e devolve apenas
 * os campos alterados. PATCH parcial — campos não tocados ficam fora do
 * payload, evitando sobrescrever edições paralelas.
 *
 * Regras:
 * - String vazia no form vs `null`/`undefined` no player → não é alteração.
 * - String vazia no form vs valor no player → alteração para `null`.
 * - Trim antes de comparar (whitespace-only não é alteração).
 * - jersey_number "" vs `undefined`/`null` → não é alteração.
 */
export function diffPayload(
  original: Player,
  current: PlayerFormState,
): Partial<PlayerUpdateInput> {
  const diff: Partial<PlayerUpdateInput> = {};

  const origFirst = original.first_name.trim();
  const currFirst = current.first_name.trim();
  if (currFirst !== origFirst) diff.first_name = currFirst;

  const origLast = original.last_name.trim();
  const currLast = current.last_name.trim();
  if (currLast !== origLast) diff.last_name = currLast;

  const origBirth = original.birth_date ?? null;
  const currBirth = normalizeForCompare(current.birth_date);
  if (currBirth !== origBirth) diff.birth_date = currBirth;

  const origPP = original.preferred_position ?? null;
  const currPP = normalizeForCompare(current.preferred_position);
  if (currPP !== origPP) {
    diff.preferred_position =
      currPP as PlayerUpdateInput["preferred_position"];
  }

  const origSP = original.secondary_position ?? null;
  const currSP = normalizeForCompare(current.secondary_position);
  if (currSP !== origSP) {
    diff.secondary_position =
      currSP as PlayerUpdateInput["secondary_position"];
  }

  const origJersey =
    typeof original.jersey_number === "number" ? original.jersey_number : null;
  const currJerseyTrim = current.jersey_number.trim();
  const currJersey =
    currJerseyTrim.length === 0 ? null : Number.parseInt(currJerseyTrim, 10);
  if (currJersey !== origJersey) {
    diff.jersey_number = Number.isNaN(currJersey as number)
      ? null
      : (currJersey as number | null);
  }

  const origPhone = original.phone ?? null;
  const currPhone = normalizeForCompare(current.phone);
  if (currPhone !== origPhone) diff.phone = currPhone;

  const origEmail = original.email ?? null;
  const currEmail = normalizeForCompare(current.email);
  if (currEmail !== origEmail) diff.email = currEmail;

  const origNotes = original.notes ?? null;
  const currNotes = current.notes.length === 0 ? null : current.notes;
  if (currNotes !== origNotes) diff.notes = currNotes;

  const origParentEmail = original.parent_email ?? null;
  const currParentEmail = normalizeForCompare(current.parent_email);
  if (currParentEmail !== origParentEmail) {
    diff.parent_email = currParentEmail;
  }

  const origParentPhone = original.parent_phone ?? null;
  const currParentPhone = normalizeForCompare(current.parent_phone);
  if (currParentPhone !== origParentPhone) {
    diff.parent_phone = currParentPhone;
  }

  if (current.status !== original.status) {
    diff.status = current.status;
  }

  const origConsent = original.photo_consent_given ?? false;
  if (current.photo_consent_given !== origConsent) {
    diff.photo_consent_given = current.photo_consent_given;
  }

  return diff;
}
