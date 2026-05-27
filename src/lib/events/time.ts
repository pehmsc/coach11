// game_datetime e timestamp WITHOUT time zone (hora local Europe/Lisbon).
// NUNCA usar new Date(game_datetime) ou parseISO(game_datetime) directamente:
// o JS interpreta strings sem TZ com o fuso do runtime, e Vercel corre em UTC,
// pelo que "2026-05-30T12:00:00" passa a ser tratado como 12:00 UTC e
// reaparece como 13:00 quando formatado em Europe/Lisbon — o bug de fuso
// volta invertido.
//
// As funcoes deste modulo tratam game_datetime como string opaca "wall-clock".
// Para aritmetica de instantes (comparacoes com Date.now(), janelas no cron,
// detecao de sobreposicao) usar parseGameDateTime() que converte a wall-clock
// PT no instante UTC correcto via portugalDateTimeToUtc.

import { portugalDateTimeToUtc } from "./presence-window";

export function normalizeTimeValue(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})/.exec(trimmed);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

export function buildDateTimeFromDateAndTime(
  date: string | null | undefined,
  time: string | null | undefined,
) {
  if (typeof date !== "string" || !date.trim()) return null;
  return `${date.trim()}T${normalizeTimeValue(time) || "00:00"}:00`;
}

const ISO_LIKE_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/;

type ParsedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseLocalParts(value: string | null | undefined): ParsedParts | null {
  if (typeof value !== "string") return null;
  const match = ISO_LIKE_RE.exec(value.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0"),
  };
}

/**
 * Converte uma wall-clock PT em Date (instante UTC correcto). Use isto quando
 * precisar comparar com `Date.now()` ou outras Date instances (crons, janelas,
 * sobreposicao). Devolve null se input invalido.
 */
export function parseGameDateTime(
  value: string | null | undefined,
): Date | null {
  const parts = parseLocalParts(value);
  if (!parts) return null;
  const dateStr = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const timeStr = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
  return portugalDateTimeToUtc(dateStr, timeStr);
}

/**
 * Converte um instante (Date) na sua wall-clock PT como string
 * "YYYY-MM-DDTHH:MM:SS" sem indicador de fuso. Usar para construir limites de
 * janela em queries que filtram contra colunas timestamp without time zone
 * (ex: `games.game_datetime`). Sem dependencia em date-fns-tz.
 */
export function toPortugalWallClock(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const lookup: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  return `${lookup.year}-${lookup.month}-${lookup.day}T${lookup.hour}:${lookup.minute}:${lookup.second}`;
}

/**
 * Apenas a parte de data (YYYY-MM-DD) da wall-clock PT de um instante.
 */
export function toPortugalDateKey(date: Date): string {
  return toPortugalWallClock(date).slice(0, 10);
}

/**
 * Extrai HH:MM literal da string. Aceita "YYYY-MM-DDTHH:MM:SS",
 * "YYYY-MM-DD HH:MM:SS" e HH:MM/HH:MM:SS isolados. Como o valor ja representa
 * hora local PT, nao ha conversao de fuso — extraccao pura.
 */
export function extractTimeFromDateTime(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  const parts = parseLocalParts(trimmed);
  if (parts) {
    const hh = String(parts.hour).padStart(2, "0");
    const mm = String(parts.minute).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // Fallback: string HH:MM ou HH:MM:SS isolada.
  return normalizeTimeValue(trimmed);
}

/**
 * Variantes de formato para `formatGameDateTime`. Reflectem os 5 formatos
 * que existiam dispersos pelo codigo antes da uniformizacao via PR B.
 *
 * - `longWithoutYear`: "domingo, 24 de maio · 19:20" (GameDetailView)
 * - `longWithYear`:    "domingo, 24 de maio de 2026 · 19:20" (detalhe publico)
 * - `shortWithYear`:   "24/05/2026 · 19:20" (lista publica)
 * - `shortWithoutYear`:"24/05 · 19:20" (GameSummaryView, scoreboard live)
 * - `monthYear`:       "maio de 2026" (agregacao por mes em GamesSection)
 */
export type GameDateTimeFormat =
  | "longWithoutYear"
  | "longWithYear"
  | "shortWithYear"
  | "shortWithoutYear"
  | "monthYear";

const WEEKDAYS_LONG_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

const MONTHS_LONG_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function weekdayLongPt(parts: ParsedParts): string {
  // Zeller-like via Date construido em UTC para evitar TZ do runtime.
  const dt = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0),
  );
  return WEEKDAYS_LONG_PT[dt.getUTCDay()] ?? "";
}

/**
 * Formata um datetime para display. A coluna ja esta em hora local Europe/
 * Lisbon, pelo que o formatador extrai partes da string literal sem instanciar
 * Date — garante o mesmo resultado em qualquer TZ de runtime (browser PT ou
 * Vercel UTC).
 *
 * - Aceita "YYYY-MM-DDTHH:MM:SS" e "YYYY-MM-DD HH:MM:SS".
 * - Devolve "Data por definir" para input null/undefined/vazio.
 * - Devolve o input original se o parse falhar.
 */
export function formatGameDateTime(
  value: string | null | undefined,
  format: GameDateTimeFormat,
): string {
  if (typeof value !== "string" || !value.trim()) return "Data por definir";
  const parts = parseLocalParts(value);
  if (!parts) return value;

  const dayNum = parts.day;
  const monthLong = MONTHS_LONG_PT[parts.month - 1] ?? "";
  const monthShortNum = String(parts.month).padStart(2, "0");
  const dayPadded = String(parts.day).padStart(2, "0");
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  const year = parts.year;
  const weekday = weekdayLongPt(parts);
  const timePart = `${hh}:${mm}`;

  switch (format) {
    case "monthYear":
      return `${monthLong} de ${year}`;
    case "longWithoutYear":
      return `${weekday}, ${dayNum} de ${monthLong} · ${timePart}`;
    case "longWithYear":
      return `${weekday}, ${dayNum} de ${monthLong} de ${year} · ${timePart}`;
    case "shortWithYear":
      return `${dayPadded}/${monthShortNum}/${year} · ${timePart}`;
    case "shortWithoutYear":
      return `${dayPadded}/${monthShortNum} · ${timePart}`;
  }
}

export type GameDateTimeParts = {
  /** Dia do mes, ex: "24". */
  day: string;
  /** Mes abreviado em pt-PT lowercase, ex: "mai". */
  monthShort: string;
  /** Hora HH:MM, ex: "18:20". */
  time: string;
};

/**
 * Decompoe um datetime em partes (dia/mes-curto/hora) para usos em componentes
 * que renderizam cada campo separadamente (ex: card de jogo em GamesSection
 * com layout vertical). Devolve `null` para input null/undefined/invalido.
 *
 * `monthShort` e os primeiros 3 caracteres do mes longo em pt-PT, ex: "mai".
 */
export function formatGameDateTimeParts(
  value: string | null | undefined,
): GameDateTimeParts | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parts = parseLocalParts(value);
  if (!parts) return null;

  const monthLong = MONTHS_LONG_PT[parts.month - 1] ?? "";
  return {
    day: String(parts.day),
    monthShort: monthLong.slice(0, 3).toLowerCase(),
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function formatTimeRange(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  const start = normalizeTimeValue(startTime);
  const end = normalizeTimeValue(endTime);

  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  if (end) return end;
  return "--:--";
}

export function addMinutesToTime(
  time: string | null | undefined,
  minutesToAdd: number,
) {
  const normalized = normalizeTimeValue(time);
  if (!normalized) return null;

  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const totalMinutes = ((hours * 60 + minutes + minutesToAdd) % 1440 + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const nextMinutes = (totalMinutes % 60).toString().padStart(2, "0");

  return `${nextHours}:${nextMinutes}`;
}
