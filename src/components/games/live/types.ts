import type { Player, GameEventType } from "@/types/database";

export interface LivePlayer extends Player {
  isOnField: boolean;
  isInitialBench: boolean; // was set as bench in pre-match
  isExternal?: boolean;
  externalConvocationId?: string | null;
}

export type MatchPhase =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "review"
  | "completed";

export type ClockState = {
  baseSeconds: number;
  runningSinceMs: number | null;
};

export type PersistedClockState = {
  version: 1;
  phase: MatchPhase;
  baseSeconds: number;
  runningSinceMs: number | null;
  savedAt: number;
};

export type BackendCheckpointState = {
  phase: MatchPhase;
  baseSeconds: number;
  runningSinceMs: number | null;
  savedAt: number;
};

export type LiveStatus = "on_field" | "substitute" | "substituted";
export type PlayerAvailabilityLabel = "Em campo" | "Banco" | "Expulso";
export type PlayerAvailability = {
  label: PlayerAvailabilityLabel;
  selectable: boolean;
};

export type LiveEventInput = {
  event_type: string;
  player_id?: string | null;
  related_player_id?: string | null;
  minute: number;
  is_opponent_event: boolean;
};

export type FinalStatPayloadRow = {
  player_id: string;
  lineup_type: "starter" | "substitute";
  minutes_played: number;
  goals: number;
  own_goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  coach_rating: number | null;
  is_mvp: boolean;
  is_finalized: boolean;
};

export type ModalType = GameEventType | "substitution";

export const EVENT_LABELS: Record<string, string> = {
  goal: "⚽ Golo",
  penalty_goal: "⚽ Penálti",
  assist: "🅰️ Assistência",
  own_goal: "⚽ Autogolo",
  yellow_card: "🟨 Cartão Amarelo",
  red_card: "🟥 Cartão Vermelho",
  substitution_in: "🔄 Substituição",
  substitution_out: "🔄 Substituição",
};
