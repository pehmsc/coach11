import type { Player } from "@/types/database";

// ── Domain Types ──────────────────────────────────────────────────────────────

export interface AttendanceStats {
  player: Player;
  presencas: number;
  atrasados: number;
  ausencias: number;
  lesionados: number;
  minutos: number; // (presencas + atrasados) * 60
}

export interface GameStats {
  player: Player;
  golos: number;
  autoGolos: number;
  assistencias: number;
  minutos: number;
  gs: number;
  titular: number;
  suplente: number;
  convocatorias: number;
  mvp: number;
  amarelos: number;
  vermelhos: number;
  totalJogos: number; // jogos com is_finalized
  mediaNotaSum: number;
  mediaNotaCount: number;
}

export type Tab = "attendance" | "game";
export type SortDir = "asc" | "desc";
export type AttendanceSortKey =
  | "player"
  | "minutos"
  | "presencas"
  | "atrasados"
  | "ausencias"
  | "lesionados";
export type GameSortKey =
  | "player"
  | "golos"
  | "gs"
  | "assistencias"
  | "minutos"
  | "titular"
  | "suplente"
  | "convocatorias"
  | "mvp"
  | "mediaMVP"
  | "mediaNota"
  | "mediaMin"
  | "amarelos"
  | "vermelhos";

// ── API Types ─────────────────────────────────────────────────────────────────

export interface AttendanceRow {
  player_id: string;
  status: string;
}

export interface FinalStatRow {
  player_id: string;
  goals?: number;
  own_goals?: number;
  assists?: number;
  minutes_played?: number;
  lineup_type?: string;
  yellow_cards?: number;
  red_cards?: number;
  coach_rating?: number;
  is_mvp?: boolean;
  is_finalized?: boolean;
  game_id?: string;
}

export interface ConvocationPlayerRow {
  player_id: string;
  convocation_id: string;
}

export interface ConvocationRow {
  id: string;
  game_id: string;
}

export interface GameEventRow {
  game_id: string;
  player_id: string | null;
  event_type: string;
  is_opponent_event: boolean;
}

export interface StatisticsPlayersResponse {
  success?: boolean;
  players?: Player[];
  attendanceRows?: AttendanceRow[];
  finalStats?: FinalStatRow[];
  convocations?: ConvocationRow[];
  convocationPlayers?: ConvocationPlayerRow[];
  gameIds?: string[];
  gameEvents?: GameEventRow[];
}
