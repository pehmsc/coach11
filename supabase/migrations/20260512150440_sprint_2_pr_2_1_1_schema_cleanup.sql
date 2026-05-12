-- ============================================================================
-- Sprint 2 / PR 2.1.1 — Cosmético: UNIQUE case-insensitive + FK SET NULL
-- ============================================================================
-- Correcções de dívidas técnicas dos PRs #140 e #141:
--   1) UNIQUE (name, age_group_id) case-sensitive → UNIQUE (LOWER(TRIM(name)), age_group_id)
--   2) FK competition_id ON DELETE CASCADE → ON DELETE SET NULL
--
-- Sem código aplicacional. Sem migração de dados (já validado: 0 duplicados
-- case-insensitive em produção em 12/05).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) UNIQUE case-insensitive
-- ----------------------------------------------------------------------------
-- A constraint actual é UNIQUE (name, age_group_id) que deixa passar variações
-- como "Casa Pia" vs "casa pia". Substitui-se por um índice único em expressão
-- (LOWER(TRIM(name)), age_group_id) que normaliza ambos.
--
-- Nota técnica: PostgreSQL não suporta CONSTRAINT UNIQUE com expressões; é
-- necessário usar CREATE UNIQUE INDEX. Funcionalmente equivalente do ponto de
-- vista de cobertura, erros 23505 e EXPLAIN.

-- 1.1 — Validação defensiva: garantir que não há duplicados antes do DROP
DO $$
DECLARE
  v_duplicates INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_duplicates
  FROM (
    SELECT LOWER(TRIM(name)), age_group_id
    FROM public.opponents
    GROUP BY LOWER(TRIM(name)), age_group_id
    HAVING COUNT(*) > 1
  ) dup;

  IF v_duplicates > 0 THEN
    RAISE EXCEPTION 'Não é possível aplicar UNIQUE case-insensitive: % grupo(s) duplicado(s) encontrado(s). Resolver via rpc_merge_opponents primeiro.', v_duplicates;
  END IF;
END $$;

-- 1.2 — Drop da constraint antiga
ALTER TABLE public.opponents
  DROP CONSTRAINT IF EXISTS opponents_name_age_group_unique;

-- 1.3 — Criar índice único em expressão (case-insensitive + trim)
CREATE UNIQUE INDEX opponents_name_age_group_unique_ci
  ON public.opponents (LOWER(TRIM(name)), age_group_id);

COMMENT ON INDEX public.opponents_name_age_group_unique_ci IS
  'Garante unicidade case-insensitive e trim-insensitive de (name, age_group_id). Substitui constraint UNIQUE simples para prevenir duplicados como "Casa Pia" vs "casa pia".';


-- ----------------------------------------------------------------------------
-- (2) FK competition_id: CASCADE → SET NULL
-- ----------------------------------------------------------------------------
-- competition_id ficou com ON DELETE CASCADE da migration legacy. Como agora é
-- opcional e adversário existe independente de competição, apagar uma
-- competição não deve apagar opponents.

ALTER TABLE public.opponents
  DROP CONSTRAINT IF EXISTS opponents_competition_id_fkey;

ALTER TABLE public.opponents
  ADD CONSTRAINT opponents_competition_id_fkey
    FOREIGN KEY (competition_id)
    REFERENCES public.competitions(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.opponents.competition_id IS
  'Competição inicial em que o adversário foi registado (opcional, ON DELETE SET NULL). Adversário existe independente de competição — usar para tracking histórico ou criação inicial. Após back-fill PR 2.1, todos os opponents têm valor NULL.';
