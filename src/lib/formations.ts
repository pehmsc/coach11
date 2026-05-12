import type { FootballFormat } from "@/types/database";

export const FORMATIONS_BY_FORMAT: Record<FootballFormat, readonly string[]> = {
  "5": ["1-2-1", "1-1-2", "1-3-0", "2-1-1"],
  "7": ["1-2-3-1", "1-3-2-1", "1-2-1-2-1", "1-3-1-2", "1-2-3-1"],
  "9": ["1-3-3-2", "1-3-2-3", "1-4-3-1", "1-2-3-3", "1-3-4-1"],
  "11": ["1-4-3-3", "1-4-4-2", "1-4-2-3-1", "1-3-5-2", "1-5-3-2", "1-3-4-3"],
};

export function getFormationsForFormat(
  format: FootballFormat | null | undefined,
): readonly string[] {
  if (!format) return [];
  return FORMATIONS_BY_FORMAT[format] ?? [];
}
