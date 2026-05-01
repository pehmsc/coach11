// Lógica pura de detecção de sobreposição entre intervalos de jogos.
// Não depende de Supabase/RPC — apenas combina os campos de tempo do jogo
// (`game_datetime`, `concentration_time`, `end_time`) num intervalo `[start, end)`
// e oferece um predicado `intervalsOverlap`.
//
// Assunção: jogos de formação não cruzam meia-noite (kickoff + 2h30 não passa
// para o dia seguinte na esmagadora maioria dos casos). Se essa assunção
// deixar de se manter, alargar a janela de busca em route.ts para
// [dayStart - 1, dayEnd + 1] e revisitar a lógica de overlap.

import {
  getPortugalDateKey,
  portugalDateTimeToUtc,
} from "../events/presence-window";

export interface GameTimeSource {
  /** Timestamp ISO do kickoff (timestamp with time zone na DB). */
  game_datetime: string;
  /**
   * Concentração — coluna `text` na DB; quando preenchida deve conter um
   * timestamp ISO parseável por `new Date()`. Se for inválido, é ignorado
   * e o `start` cai para o `game_datetime`.
   */
  concentration_time: string | null;
  /** `time without time zone` (HH:MM ou HH:MM:SS) na DB. */
  end_time: string | null;
}

export interface GameInterval {
  start: Date;
  end: Date;
  /** `true` quando `end_time` era null e foi aplicado o fallback de 2h30. */
  endIsEstimated: boolean;
}

const FALLBACK_DURATION_MS = 150 * 60_000; // 2h30

function parseDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function gameInterval(g: GameTimeSource): GameInterval {
  const kickoff = new Date(g.game_datetime);

  // Start = COALESCE(concentration_time, kickoff). Concentration_time é text
  // na DB; se não for um timestamp parseável, ignoramos e usamos kickoff.
  const concentration = parseDateOrNull(g.concentration_time);
  const start = concentration ?? kickoff;

  // End = COALESCE(end_time, start + 2h30).
  // end_time é HH:MM[:SS]; combinamos com a data calendário (Portugal) do
  // kickoff para obter um Date em UTC.
  let end: Date;
  let endIsEstimated = false;

  if (g.end_time) {
    const dateKey = getPortugalDateKey(g.game_datetime);
    const combined = dateKey ? portugalDateTimeToUtc(dateKey, g.end_time) : null;
    if (combined && combined.getTime() > start.getTime()) {
      end = combined;
    } else {
      // end_time inválido ou anterior ao start → cai para fallback
      end = new Date(start.getTime() + FALLBACK_DURATION_MS);
      endIsEstimated = true;
    }
  } else {
    end = new Date(start.getTime() + FALLBACK_DURATION_MS);
    endIsEstimated = true;
  }

  return { start, end, endIsEstimated };
}

/**
 * Intervalos `[start, end)` (fechado-aberto). Dois jogos que terminam e
 * começam exactamente na mesma hora **NÃO** estão em conflito.
 */
export function intervalsOverlap(a: GameInterval, b: GameInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

// ─── Construção de labels (puro) ──────────────────────────────────────────
//
// Estas funções recebem entradas já calculadas (start/end como Date) e o
// formatador de tempo Portugal — assim ficam totalmente testáveis sem
// depender de Supabase ou do route handler.

export interface SameDayEntry {
  start: Date;
  end: Date;
  endIsEstimated: boolean;
  connector: string;
  opponentName: string;
  isOverlap: boolean;
}

export type TimeFormatter = (isoTimestamp: string) => string | null;

/** Label vermelha de sobreposição. Caller já escolheu a entry com overlap. */
export function buildConflictLabel(
  overlapEntry: SameDayEntry,
  formatTime: TimeFormatter,
): string {
  const startLabel = formatTime(overlapEntry.start.toISOString());
  const endLabelRaw = formatTime(overlapEntry.end.toISOString());
  const endLabel =
    overlapEntry.endIsEstimated && endLabelRaw
      ? `~${endLabelRaw}`
      : endLabelRaw;
  if (startLabel && endLabel) {
    return `Sobreposição: ${overlapEntry.connector} ${overlapEntry.opponentName} (${startLabel}–${endLabel})`;
  }
  return `Sobreposição: ${overlapEntry.connector} ${overlapEntry.opponentName}`;
}

/**
 * Label amarela informativa: jogador convocado em outro(s) jogo(s) do
 * mesmo dia SEM sobreposição. Lista todos por ordem de início. Devolve
 * `null` se não há entries (defensivo).
 */
export function buildInfoLabel(
  entries: SameDayEntry[],
  formatTime: TimeFormatter,
): string | null {
  const sorted = [...entries].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const parts = sorted
    .map((e) => {
      const startLabel = formatTime(e.start.toISOString());
      return startLabel
        ? `${e.connector} ${e.opponentName} (${startLabel})`
        : `${e.connector} ${e.opponentName}`;
    })
    .filter(Boolean);
  if (parts.length === 0) return null;
  return `Convocado: ${parts.join(", ")}`;
}
