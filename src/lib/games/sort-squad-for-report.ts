/**
 * Ordena entries de squad/stats/presenças para o PDF.
 *
 * Regra (Mai 2026):
 * 1. Titulares (lineupLabel === "Titular") antes de suplentes/convocados
 * 2. Dentro de cada grupo:
 *    - GR primeiro (preferred_position matches /gr|gk|guarda/i)
 *    - Depois ordem ascendente por jersey_number (null/undefined no fim)
 * 3. Fallback: alfabético por name (estabilidade)
 */

export type SortableSquadRow = {
  lineupLabel?: string | null;
  preferred_position?: string | null;
  jersey_number?: number | null;
  name?: string | null;
};

const GOALKEEPER_REGEX = /gr|gk|guarda/i;

function isGoalkeeper(preferredPosition: string | null | undefined): boolean {
  if (!preferredPosition) return false;
  return GOALKEEPER_REGEX.test(preferredPosition);
}

function isStarter(lineupLabel: string | null | undefined): boolean {
  return lineupLabel === "Titular";
}

export function sortSquadForReport<T extends SortableSquadRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aStarter = isStarter(a.lineupLabel);
    const bStarter = isStarter(b.lineupLabel);
    if (aStarter !== bStarter) return aStarter ? -1 : 1;

    const aGK = isGoalkeeper(a.preferred_position);
    const bGK = isGoalkeeper(b.preferred_position);
    if (aGK !== bGK) return aGK ? -1 : 1;

    const aJersey = a.jersey_number ?? Number.POSITIVE_INFINITY;
    const bJersey = b.jersey_number ?? Number.POSITIVE_INFINITY;
    if (aJersey !== bJersey) return aJersey - bJersey;

    return (a.name ?? "").localeCompare(b.name ?? "", "pt", {
      sensitivity: "base",
    });
  });
}
