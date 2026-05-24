-- Live: permitir event_type = 'penalty_goal' em game_events.
--
-- Contexto: o tipo aplicacional GameEventType, o ALLOWED_EVENT_TYPES da API,
-- isGoalEventType, GameSummaryView, matchReport PDF, PublicGameLivePanel,
-- useStatisticsData e os RPCs rpc_statistics_players_* JA tratam 'penalty_goal'
-- como variante de golo (count = goal + penalty_goal). Falta apenas alargar o
-- CHECK constraint na tabela para a UI do live conseguir gravar este valor.
--
-- Mudanca: DROP do CHECK actual e ADD do novo CHECK com 'penalty_goal'
-- adicionado a lista existente.
--
-- Backfill: nao se aplica. Nenhum golo registado e' penalti hoje; novos
-- penaltis sao gravados a partir da UI.

ALTER TABLE public.game_events
  DROP CONSTRAINT IF EXISTS game_events_event_type_check;

ALTER TABLE public.game_events
  ADD CONSTRAINT game_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'goal',
    'penalty_goal',
    'assist',
    'own_goal',
    'yellow_card',
    'red_card',
    'substitution_in',
    'substitution_out'
  ]));
