/**
 * Normaliza string para comparacao case-insensitive e accent-insensitive.
 *
 * Uso tipico:
 *   const normalizedQuery = normalizeForSearch("Joao");
 *   const normalizedName = normalizeForSearch(player.first_name + " " + player.last_name);
 *   if (normalizedName.includes(normalizedQuery)) { ... }
 *
 * "Joao" e "Joao" tornam-se "joao" — permite match independente de acentos,
 * util em mobile onde o coach pode escrever sem acentos.
 */
// Combining diacritical marks (Unicode range U+0300–U+036F) — removidos para
// que "João" e "Joao" se tornem iguais apos normalizacao NFD.
const DIACRITICS_REGEX = /[̀-ͯ]/g;

export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(DIACRITICS_REGEX, "");
}
