// Lógica pura de detecção de sobreposição entre intervalos de jogos.
// Não depende de Supabase/RPC — apenas combina os campos de tempo do jogo
// (`game_datetime`, `concentration_time`, `end_time`) num intervalo `[start, end)`
// e oferece um predicado `intervalsOverlap`.
//
// Assunção: jogos de formação não cruzam meia-noite (kickoff + 2h30 não passa
// para o dia seguinte na esmagadora maioria dos casos). Se essa assunção
// deixar de se manter, alargar a janela de busca em route.ts para
// [dayStart - 1, dayEnd + 1] e revisitar a lógica de overlap.

import { portugalDateTimeToUtc } from "../events/presence-window";
import { parseGameDateTime } from "../events/time";

export interface GameTimeSource {
  /**
   * Wall-clock PT do kickoff. game_datetime e timestamp WITHOUT time zone
   * na DB; PostgREST devolve "YYYY-MM-DDTHH:MM:SS" sem indicador de fuso.
   */
  game_datetime: string;
  /**
   * Concentração — coluna `text` na DB. Aceita HH:MM (formato actual da UI)
   * ou ISO wall-clock PT "YYYY-MM-DDTHH:MM:SS". Se invalido, ignorado e o
   * `start` cai para o `game_datetime`.
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

const ISO_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;
const HHMM_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parseConcentrationOrNull(
  value: string | null | undefined,
  fallbackDateKey: string | null,
): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Caso 1: ISO wall-clock PT "YYYY-MM-DDTHH:MM:SS".
  if (ISO_PREFIX_RE.test(trimmed)) {
    return parseGameDateTime(trimmed);
  }
  // Caso 2: HH:MM ou HH:MM:SS — combinar com a data do jogo.
  if (HHMM_RE.test(trimmed) && fallbackDateKey) {
    return portugalDateTimeToUtc(fallbackDateKey, trimmed);
  }
  return null;
}

export function gameInterval(g: GameTimeSource): GameInterval {
  const kickoff = parseGameDateTime(g.game_datetime);
  if (!kickoff) {
    // game_datetime invalido — devolvemos intervalo vazio assumindo agora.
    // Defensivo: a UI ja valida antes de chamar.
    const now = new Date();
    return {
      start: now,
      end: new Date(now.getTime() + FALLBACK_DURATION_MS),
      endIsEstimated: true,
    };
  }
  const dateKey = ISO_PREFIX_RE.exec(g.game_datetime.trim())?.[1] ?? null;

  // Start = COALESCE(concentration_time, kickoff). Concentration_time aceita
  // HH:MM ou ISO; se invalido, fallback para kickoff.
  const concentration = parseConcentrationOrNull(g.concentration_time, dateKey);
  const start = concentration ?? kickoff;

  // End = COALESCE(end_time, start + 2h30). end_time e HH:MM[:SS]; combinar
  // com a data PT do kickoff para obter Date em UTC.
  let end: Date;
  let endIsEstimated = false;

  if (g.end_time) {
    const combined = dateKey ? portugalDateTimeToUtc(dateKey, g.end_time) : null;
    if (combined && combined.getTime() > start.getTime()) {
      end = combined;
    } else {
      // end_time invalido ou anterior ao start → fallback
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
