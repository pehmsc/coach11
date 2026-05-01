import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "players-photos";
const SIGNED_URL_TTL_SECONDS = 3600;

export const PLAYER_PHOTO_BUCKET = BUCKET;
export const PLAYER_PHOTO_SIGNED_URL_TTL = SIGNED_URL_TTL_SECONDS;

/**
 * Constrói o path canónico de uma foto de atleta no bucket players-photos.
 * Formato esperado pela RLS: `{ageGroupId}/{playerId}.webp`.
 */
export function buildPlayerPhotoPath(
  ageGroupId: string,
  playerId: string,
): string {
  return `${ageGroupId}/${playerId}.webp`;
}

/**
 * Gera signed URL temporária (TTL 1h por defeito) para um path do bucket
 * privado. Devolve `null` se path é vazio ou se o Storage rejeitar (e.g.
 * ficheiro removido). Erros são logados — chamador trata `null` como
 * "sem foto disponível".
 */
export async function getPlayerPhotoSignedUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!path || typeof path !== "string" || path.trim().length === 0) {
    return null;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) {
    console.error("[players-photos] createSignedUrl failed", {
      path,
      error: error?.message,
    });
    return null;
  }
  return data.signedUrl;
}

/**
 * Upload directo via cliente Supabase. Espera Blob/File já comprimido
 * para webp pelo `browser-image-compression`. Faz upsert para sobrescrever
 * a foto anterior do atleta (path único por playerId).
 */
export async function uploadPlayerPhoto(
  supabase: SupabaseClient,
  ageGroupId: string,
  playerId: string,
  blob: Blob,
): Promise<{ path: string; error: Error | null }> {
  const path = buildPlayerPhotoPath(ageGroupId, playerId);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: "image/webp",
      upsert: true,
      cacheControl: "3600",
    });
  return {
    path,
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Apaga a foto do atleta do bucket. Falha silenciosamente (devolve erro
 * mas não throwa) — chamador decide se reporta ao utilizador.
 */
export async function removePlayerPhoto(
  supabase: SupabaseClient,
  path: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return { error: error ? new Error(error.message) : null };
}
