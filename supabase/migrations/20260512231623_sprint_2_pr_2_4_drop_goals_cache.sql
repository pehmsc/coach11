-- ============================================================================
-- Sprint 2 / PR 2.4 — Deprecar goals_scored / goals_conceded da tabela games
-- ============================================================================
-- Estes campos existiam como "cache calculada dos eventos para query rápida"
-- mas nunca foram alimentados (rpc_finalize_game escreve apenas score_home /
-- score_away). Em produção todos os 27 jogos têm goals_scored = goals_conceded = 0.
--
-- A fonte de verdade real é score_home + score_away + is_home (perspectiva do
-- nosso clube derivada no momento da query/UI).
--
-- Auditoria pré-remoção:
--   - 0 funções DB referenciam estes campos
--   - 0 views / matviews referenciam estes campos
--   - 0 triggers referenciam estes campos
--   - Código aplicacional removido nos commits anteriores deste PR
-- ============================================================================

-- Validação defensiva: garantir que ninguém escreveu nestes campos entretanto
-- (ex: durante o desenvolvimento desta PR alguém criou um jogo com valor > 0)
DO $$
DECLARE
  v_non_zero INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_non_zero
  FROM public.games
  WHERE COALESCE(goals_scored, 0) > 0 OR COALESCE(goals_conceded, 0) > 0;

  IF v_non_zero > 0 THEN
    RAISE EXCEPTION 'Não é seguro fazer DROP: % jogos têm goals_scored ou goals_conceded > 0. Auditar antes de remover.', v_non_zero;
  END IF;
END $$;

-- Remover os campos
ALTER TABLE public.games
  DROP COLUMN IF EXISTS goals_scored,
  DROP COLUMN IF EXISTS goals_conceded;
