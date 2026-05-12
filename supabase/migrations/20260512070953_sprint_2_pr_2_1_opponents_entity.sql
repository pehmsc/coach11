-- ============================================================================
-- Sprint 2 / PR 2.1 — Adversario como entidade
-- ============================================================================
-- Refactor da tabela `opponents` (existia vazia com schema legacy):
--   - Schema alinhado com plano: uma entidade opponent por (clube + escalao)
--   - UNIQUE (name, age_group_id) garante deduplicacao no mesmo escalao
--   - competition_id passa a opcional (jogos amigaveis nao tem competicao)
--   - 12 colunas novas (short_name, tactical_formation, pontos_fortes, etc.)
-- Adiciona `games.opponent_id` FK ON DELETE SET NULL.
-- Back-fill: cria 23 opponents a partir dos 27 jogos existentes.
-- RLS alinhada com padrao moderno dos games: user_can_access_age_group.
-- RPC rpc_merge_opponents para resolucao manual de duplicados.
--
-- Diagnostico via MCP confirmou:
--   - opponents existe vazia (0 linhas), schema legacy
--   - games: 27 linhas, todas com opponent_name + age_group_id + club_id
--   - 23 distinct (TRIM(opponent_name), age_group_id) -> 23 opponents
--   - 5 jogos sem competition_id
--   - helper set_updated_at ja existe (nao reutilizamos trigger_set_updated_at)
--   - user_can_access_age_group ja existe (modelo Fase 2B/2C)
-- ============================================================================

-- ============================================================================
-- 1. Drop da policy legacy
-- ============================================================================
-- A policy "Access opponents" usa coordinator_id (modelo pre-Fase 2B) e
-- competition_id, ambos incompativeis com o novo schema. Substituida por
-- 4 policies alinhadas com o padrao dos games.

DROP POLICY IF EXISTS "Access opponents" ON public.opponents;

-- ============================================================================
-- 2. Schema: adicionar colunas + relaxar competition_id
-- ============================================================================

ALTER TABLE public.opponents
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS age_group_id UUID,
  ADD COLUMN IF NOT EXISTS club_id UUID,
  ADD COLUMN IF NOT EXISTS tactical_formation TEXT,
  ADD COLUMN IF NOT EXISTS pontos_fortes TEXT,
  ADD COLUMN IF NOT EXISTS pontos_fracos TEXT,
  ADD COLUMN IF NOT EXISTS atletas_chave TEXT,
  ADD COLUMN IF NOT EXISTS notas_gerais TEXT,
  ADD COLUMN IF NOT EXISTS home_ground TEXT,
  ADD COLUMN IF NOT EXISTS coach_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_info TEXT,
  ADD COLUMN IF NOT EXISTS youth_academy_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- competition_id passa a opcional. Cada opponent pode estar em multiplas
-- competicoes ao longo do tempo; a ligacao competition <-> opponent passa
-- a viver em games.opponent_id + games.competition_id.
ALTER TABLE public.opponents
  ALTER COLUMN competition_id DROP NOT NULL;

-- FKs novas
ALTER TABLE public.opponents
  ADD CONSTRAINT opponents_age_group_id_fkey
    FOREIGN KEY (age_group_id) REFERENCES public.age_groups(id) ON DELETE CASCADE;

ALTER TABLE public.opponents
  ADD CONSTRAINT opponents_club_id_fkey
    FOREIGN KEY (club_id) REFERENCES public.clubs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_opponents_age_group_id ON public.opponents(age_group_id);
CREATE INDEX IF NOT EXISTS idx_opponents_club_id ON public.opponents(club_id);
CREATE INDEX IF NOT EXISTS idx_opponents_competition_id ON public.opponents(competition_id);

-- Trigger updated_at: reutiliza set_updated_at (ja existe em producao desde
-- PR #133/#134). Evita criar trigger_set_updated_at redundante.
DROP TRIGGER IF EXISTS set_updated_at_opponents ON public.opponents;
CREATE TRIGGER set_updated_at_opponents
  BEFORE UPDATE ON public.opponents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3. games.opponent_id
-- ============================================================================
-- FK nullable para preservar jogos historicos mesmo apos eventual delete
-- do opponent. NAO removemos os campos legacy (opponent_name,
-- opponent_short_name, opponent_tactical_system) nesta sprint — ficam
-- como sombra ate o typeahead (PR 2.3) cobrir todos os fluxos.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS opponent_id UUID
    REFERENCES public.opponents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_games_opponent_id ON public.games(opponent_id);

-- ============================================================================
-- 4. Back-fill dos 27 jogos existentes
-- ============================================================================
-- Para cada (TRIM(opponent_name), age_group_id, club_id) distinto, cria um
-- opponent novo e liga games.opponent_id ao registo correspondente.
-- short_name e tactical_formation: primeiro valor nao-null do grupo
-- (NULLS LAST garante que aspas/valores preenchidos vencem).

WITH distinct_opponents AS (
  SELECT
    TRIM(opponent_name) AS name,
    age_group_id,
    club_id,
    (ARRAY_AGG(opponent_short_name ORDER BY opponent_short_name NULLS LAST))[1] AS short_name,
    (ARRAY_AGG(opponent_tactical_system ORDER BY opponent_tactical_system NULLS LAST))[1] AS tactical_formation
  FROM public.games
  WHERE opponent_name IS NOT NULL
    AND TRIM(opponent_name) <> ''
  GROUP BY TRIM(opponent_name), age_group_id, club_id
),
inserted AS (
  INSERT INTO public.opponents (name, short_name, age_group_id, club_id, tactical_formation)
  SELECT name, short_name, age_group_id, club_id, tactical_formation
  FROM distinct_opponents
  RETURNING id, name, age_group_id
)
UPDATE public.games g
SET opponent_id = ins.id
FROM inserted ins
WHERE TRIM(g.opponent_name) = ins.name
  AND g.age_group_id = ins.age_group_id;

-- Verificacao critica: todos os jogos com opponent_name devem ter ficado
-- com opponent_id. Se nao, aborta a migration (transactional rollback).
DO $$
DECLARE
  unmapped INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmapped
  FROM public.games
  WHERE opponent_name IS NOT NULL
    AND TRIM(opponent_name) <> ''
    AND opponent_id IS NULL;

  IF unmapped > 0 THEN
    RAISE EXCEPTION 'Back-fill incompleto: % jogos com opponent_name mas sem opponent_id', unmapped;
  END IF;
END $$;

-- ============================================================================
-- 5. Constraints finais
-- ============================================================================
-- Agora que todos os opponents foram criados via back-fill, podemos
-- exigir NOT NULL em age_group_id e club_id.

ALTER TABLE public.opponents
  ALTER COLUMN age_group_id SET NOT NULL,
  ALTER COLUMN club_id SET NOT NULL;

-- UNIQUE (name, age_group_id): mesmo nome no mesmo escalao e o mesmo
-- adversario. Permite "Casa Pia AC" coexistir em age_groups diferentes
-- (escaloes diferentes podem ter opponents com o mesmo nome).
ALTER TABLE public.opponents
  ADD CONSTRAINT opponents_name_age_group_unique UNIQUE (name, age_group_id);

-- ============================================================================
-- 6. RLS alinhada com padrao moderno dos games
-- ============================================================================
-- Decisao: usar user_can_access_age_group(age_group_id) para todas as
-- operacoes. Opponents sao scoped por escalao (UNIQUE name + age_group),
-- e este e o helper que games.games_select_v1 ja usa. user_can_access_club
-- seria mais permissivo (visivel a outros escaloes do mesmo clube), o que
-- nao corresponde a semantica de "adversario do meu escalao".

ALTER TABLE public.opponents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opponents FORCE ROW LEVEL SECURITY;

CREATE POLICY "opponents_select_v1" ON public.opponents
  FOR SELECT
  USING (public.user_can_access_age_group(age_group_id));

CREATE POLICY "opponents_insert_v1" ON public.opponents
  FOR INSERT
  WITH CHECK (public.user_can_access_age_group(age_group_id));

CREATE POLICY "opponents_update_v1" ON public.opponents
  FOR UPDATE
  USING (public.user_can_access_age_group(age_group_id))
  WITH CHECK (public.user_can_access_age_group(age_group_id));

CREATE POLICY "opponents_delete_v1" ON public.opponents
  FOR DELETE
  USING (public.user_can_access_age_group(age_group_id));

-- ============================================================================
-- 7. RPC rpc_merge_opponents
-- ============================================================================
-- Merge manual de duplicados (ex: "Associacao Torre" vs "Torre" no mesmo
-- escalao). SECURITY INVOKER deixa o RLS do utilizador filtrar — apenas
-- staff do escalao pode invocar (write policy do age_group).
--
-- Casos a NAO fazer merge automaticamente:
--   - Lourel vs Lourinhanense (clubes distintos apesar de short SCL igual)
--   - Casa Pia "A" vs Casa Pia AC (age_groups distintos no diagnostico)
-- A funcao valida same club + same age_group para prevenir merges acidentais.

CREATE OR REPLACE FUNCTION public.rpc_merge_opponents(
  p_keep_id UUID,
  p_delete_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_keep_club UUID;
  v_delete_club UUID;
  v_keep_age_group UUID;
  v_delete_age_group UUID;
  v_games_updated INTEGER;
BEGIN
  IF p_keep_id IS NULL OR p_delete_id IS NULL THEN
    RAISE EXCEPTION 'p_keep_id e p_delete_id sao obrigatorios';
  END IF;

  IF p_keep_id = p_delete_id THEN
    RAISE EXCEPTION 'p_keep_id e p_delete_id sao iguais';
  END IF;

  SELECT club_id, age_group_id INTO v_keep_club, v_keep_age_group
  FROM public.opponents WHERE id = p_keep_id;

  SELECT club_id, age_group_id INTO v_delete_club, v_delete_age_group
  FROM public.opponents WHERE id = p_delete_id;

  IF v_keep_club IS NULL OR v_delete_club IS NULL THEN
    RAISE EXCEPTION 'Adversario nao encontrado (keep=% delete=%)', p_keep_id, p_delete_id;
  END IF;

  IF v_keep_club <> v_delete_club THEN
    RAISE EXCEPTION 'Adversarios pertencem a clubes diferentes';
  END IF;

  IF v_keep_age_group <> v_delete_age_group THEN
    RAISE EXCEPTION 'Adversarios pertencem a escaloes diferentes';
  END IF;

  -- Migrar todos os jogos do delete para o keep
  UPDATE public.games
  SET opponent_id = p_keep_id
  WHERE opponent_id = p_delete_id;

  GET DIAGNOSTICS v_games_updated = ROW_COUNT;

  -- Apagar o duplicado (CASCADE em age_group/club nao se aplica)
  DELETE FROM public.opponents WHERE id = p_delete_id;

  RETURN jsonb_build_object(
    'success', true,
    'games_migrated', v_games_updated,
    'kept_id', p_keep_id,
    'deleted_id', p_delete_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_merge_opponents(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.rpc_merge_opponents IS
  'Merge manual de adversarios duplicados. Migra todos os jogos do delete_id para keep_id e apaga o delete_id. Valida que ambos pertencem ao mesmo clube + escalao.';

-- ============================================================================
-- 8. Verificacoes finais
-- ============================================================================

DO $$
DECLARE
  v_opponents_count INTEGER;
  v_games_with_id INTEGER;
  v_games_without_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_opponents_count FROM public.opponents;
  IF v_opponents_count = 0 THEN
    RAISE EXCEPTION 'Back-fill nao criou opponents';
  END IF;

  SELECT COUNT(*) INTO v_games_with_id
    FROM public.games
    WHERE opponent_id IS NOT NULL;
  SELECT COUNT(*) INTO v_games_without_id
    FROM public.games
    WHERE opponent_name IS NOT NULL
      AND TRIM(opponent_name) <> ''
      AND opponent_id IS NULL;

  IF v_games_without_id > 0 THEN
    RAISE EXCEPTION 'Sprint 2 PR 2.1: % jogos sem opponent_id apos back-fill', v_games_without_id;
  END IF;

  RAISE NOTICE 'Sprint 2 PR 2.1: % opponents criados, % jogos ligados',
    v_opponents_count, v_games_with_id;
END $$;
