-- ============================================================================
-- Sprint 3 / PR 3.1 — Schema da ficha de jogo
-- ============================================================================
-- Estende a tabela games com 3 colunas adicionais para a ficha pós-jogo, e
-- cria a tabela game_opponent_observations para suportar o fluxo de captura
-- no live + promoção para perfil permanente do adversário.
--
-- DECISÃO: nomenclatura inglesa consistente com positive_aspects /
-- negative_aspects / coach_notes (já existentes). UI em português, schema em
-- inglês — mesmo padrão de todo o projecto.
--
-- Distinção semântica documentada em COMMENT ON COLUMN para evitar confusão:
--   - games.notes = público (atletas + famílias via link público)
--   - games.coach_notes = interno privado do treinador
--   - games.team_notes = interno operacional da equipa
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) Estender games com 3 colunas novas
-- ----------------------------------------------------------------------------

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS tactical_system TEXT,
  ADD COLUMN IF NOT EXISTS aspects_to_improve TEXT,
  ADD COLUMN IF NOT EXISTS team_notes TEXT;


-- ----------------------------------------------------------------------------
-- (2) COMMENT ON COLUMN — documentação semântica das 7 colunas de notas
-- ----------------------------------------------------------------------------

COMMENT ON COLUMN public.games.notes IS
  'PÚBLICO — instruções pré-jogo para atletas e famílias (equipamento obrigatório, regras de pontualidade, ponto de encontro). Renderizado em markdown no link público. NÃO usar para notas internas — usar coach_notes ou team_notes.';

COMMENT ON COLUMN public.games.tactical_system IS
  'Sistema táctico do nosso clube neste jogo (ex: "1-4-3-3"). Dropdown filtrado pelo football_format do escalão. Parte da ficha pós-jogo (Sprint 3).';

COMMENT ON COLUMN public.games.positive_aspects IS
  'Aspectos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno.';

COMMENT ON COLUMN public.games.negative_aspects IS
  'Aspectos menos positivos identificados pelo treinador neste jogo. Parte da ficha pós-jogo (Sprint 3). Interno.';

COMMENT ON COLUMN public.games.aspects_to_improve IS
  'Aspectos a melhorar para próximos jogos/treinos. Parte da ficha pós-jogo (Sprint 3). Interno.';

COMMENT ON COLUMN public.games.team_notes IS
  'Notas tácticas e operacionais da equipa sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — visível ao staff do escalão, não ao público.';

COMMENT ON COLUMN public.games.coach_notes IS
  'Notas privadas do treinador sobre o jogo. Parte da ficha pós-jogo (Sprint 3). Interno — privado.';


-- ----------------------------------------------------------------------------
-- (3) Tabela game_opponent_observations
-- ----------------------------------------------------------------------------
-- N observações por jogo sobre o adversário. Capturadas durante o live ou
-- adicionadas pós-jogo. Podem ser "promovidas" para o perfil permanente do
-- adversário (pontos_fortes / pontos_fracos / atletas_chave / notas_gerais).

CREATE TABLE public.game_opponent_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vínculos
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  opponent_id UUID NOT NULL REFERENCES public.opponents(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,

  -- Conteúdo
  observation TEXT NOT NULL CHECK (TRIM(observation) <> ''),

  -- Estado de promoção
  promoted_to_opponent_at TIMESTAMPTZ,
  promoted_to_field TEXT CHECK (promoted_to_field IN ('pontos_fortes', 'pontos_fracos', 'atletas_chave', 'notas_gerais')),
  promoted_by UUID REFERENCES auth.users(id),

  -- Auditoria
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.game_opponent_observations IS
  'Observações específicas de um jogo sobre o adversário. Capturadas durante o live ou pós-jogo. Podem ser promovidas para o perfil permanente do adversário (opponents.pontos_fortes/fracos/atletas_chave/notas_gerais) via modal de revisão (PR 3.3).';

COMMENT ON COLUMN public.game_opponent_observations.promoted_to_field IS
  'Se NULL, observação ainda não foi promovida. Se preenchido, indica para que campo do opponent a observação foi promovida.';


-- ----------------------------------------------------------------------------
-- (4) Índices
-- ----------------------------------------------------------------------------

CREATE INDEX idx_goo_game_id ON public.game_opponent_observations(game_id);
CREATE INDEX idx_goo_opponent_id ON public.game_opponent_observations(opponent_id);
CREATE INDEX idx_goo_club_id ON public.game_opponent_observations(club_id);
CREATE INDEX idx_goo_not_promoted ON public.game_opponent_observations(opponent_id) WHERE promoted_to_opponent_at IS NULL;


-- ----------------------------------------------------------------------------
-- (5) Trigger updated_at (reusa set_updated_at do projecto)
-- ----------------------------------------------------------------------------

CREATE TRIGGER set_updated_at_game_opponent_observations
  BEFORE UPDATE ON public.game_opponent_observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ----------------------------------------------------------------------------
-- (6) RLS
-- ----------------------------------------------------------------------------

ALTER TABLE public.game_opponent_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_opponent_observations FORCE ROW LEVEL SECURITY;

-- RLS alinhada com o padrão dos jogos: staff do escalão pode tudo via game_id
-- (resolvemos age_group_id via JOIN com games).

CREATE POLICY "goo_select_age_group_staff" ON public.game_opponent_observations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_opponent_observations.game_id
        AND public.user_can_access_age_group(g.age_group_id)
    )
  );

CREATE POLICY "goo_insert_age_group_staff" ON public.game_opponent_observations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_opponent_observations.game_id
        AND public.user_can_access_age_group(g.age_group_id)
    )
  );

CREATE POLICY "goo_update_age_group_staff" ON public.game_opponent_observations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_opponent_observations.game_id
        AND public.user_can_access_age_group(g.age_group_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_opponent_observations.game_id
        AND public.user_can_access_age_group(g.age_group_id)
    )
  );

CREATE POLICY "goo_delete_age_group_staff" ON public.game_opponent_observations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_opponent_observations.game_id
        AND public.user_can_access_age_group(g.age_group_id)
    )
  );
