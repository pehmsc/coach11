/**
 * Sistemas tácticos por formato de futebol.
 * Sugestões; equipas podem adoptar variações. O Pedro pode expandir esta
 * lista conforme uso real do produto. Mantida inline por agora — promoção
 * para tabela DB virá quando houver justificação (versionamento,
 * personalização por clube, etc.).
 */
export const TACTICAL_SYSTEMS_BY_FORMAT: Record<string, readonly string[]> = {
  "5": ["1-1-2-1", "1-2-1-1", "1-2-2", "1-3-1", "Outro"],
  "7": ["1-2-3-1", "1-3-2-1", "1-3-1-2", "1-1-3-2", "1-2-2-2", "Outro"],
  "9": ["1-3-3-2", "1-3-2-3", "1-2-3-3", "1-3-4-1", "1-4-3-1", "Outro"],
  "11": [
    "1-4-3-3",
    "1-4-4-2",
    "1-4-2-3-1",
    "1-3-5-2",
    "1-4-3-2-1",
    "1-3-4-3",
    "Outro",
  ],
};

/**
 * Devolve as opções para um football_format específico. Se o formato não
 * for reconhecido, devolve uma lista vazia (caller usa fallback livre).
 */
export function getTacticalSystemOptions(
  footballFormat: string | null | undefined,
): readonly string[] {
  if (!footballFormat) return [];
  return TACTICAL_SYSTEMS_BY_FORMAT[footballFormat] ?? [];
}
