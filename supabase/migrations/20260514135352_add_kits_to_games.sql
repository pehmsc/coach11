-- ============================================================================
-- PR #156a — Adicionar 6 colunas de kits à tabela games
-- ============================================================================
-- Razão: a migration create_game_squads_unified (11 Mai) tornou convocations
-- read-only (REVOKE INSERT/UPDATE/DELETE + DROP policies de escrita), mas o
-- endpoint /api/games/[id]/convocation/kits ainda usava essa tabela para
-- guardar os 6 kit_ids do jogo. Resultado: bug bloqueante de produção a
-- guardar equipamento de jogo novo (POST devolve 500 / RLS 403).
--
-- Esta migration move os 6 kit_ids para a tabela games (relação 1-1 natural,
-- cada jogo tem exactamente 1 conjunto de kits).
--
-- Schema:
--   - 6 colunas UUID FK kit_pieces ON DELETE SET NULL
--   - Nullable (jogo pode existir sem kits definidos)
--   - Sem RLS extra (herda das policies de games)
--
-- Back-fill: migrar os kits da última convocation de cada jogo para games,
-- apenas se games ainda não tem kits definidos (idempotente).
-- ============================================================================

-- (1) Adicionar colunas
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS kit_fp_jersey_id UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_fp_shorts_id UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_fp_socks_id  UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_gk_jersey_id UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_gk_shorts_id UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_gk_socks_id  UUID REFERENCES public.kit_pieces(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.games.kit_fp_jersey_id IS 'Camisola dos jogadores de campo para este jogo (FK kit_pieces).';
COMMENT ON COLUMN public.games.kit_fp_shorts_id IS 'Calções dos jogadores de campo para este jogo.';
COMMENT ON COLUMN public.games.kit_fp_socks_id  IS 'Meias dos jogadores de campo para este jogo.';
COMMENT ON COLUMN public.games.kit_gk_jersey_id IS 'Camisola do guarda-redes para este jogo.';
COMMENT ON COLUMN public.games.kit_gk_shorts_id IS 'Calções do guarda-redes para este jogo.';
COMMENT ON COLUMN public.games.kit_gk_socks_id  IS 'Meias do guarda-redes para este jogo.';

-- (2) Back-fill: migrar kits da última convocation por jogo (DISTINCT ON game_id)
-- Apenas onde games ainda não tem kits definidos (idempotente em re-runs).
UPDATE public.games g
SET
  kit_fp_jersey_id = c.fp_jersey_kit_id,
  kit_fp_shorts_id = c.fp_shorts_kit_id,
  kit_fp_socks_id  = c.fp_socks_kit_id,
  kit_gk_jersey_id = c.gk_jersey_kit_id,
  kit_gk_shorts_id = c.gk_shorts_kit_id,
  kit_gk_socks_id  = c.gk_socks_kit_id
FROM (
  SELECT DISTINCT ON (game_id)
    game_id,
    fp_jersey_kit_id, fp_shorts_kit_id, fp_socks_kit_id,
    gk_jersey_kit_id, gk_shorts_kit_id, gk_socks_kit_id
  FROM public.convocations
  ORDER BY game_id, created_at DESC, id DESC
) c
WHERE g.id = c.game_id
  AND g.kit_fp_jersey_id IS NULL
  AND g.kit_gk_jersey_id IS NULL;

-- (3) Validação defensiva — abortar migration se houver FKs órfãs
DO $$
DECLARE
  v_games_with_kits INTEGER;
  v_orphan_fks INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_games_with_kits
  FROM public.games
  WHERE kit_fp_jersey_id IS NOT NULL OR kit_gk_jersey_id IS NOT NULL;

  SELECT COUNT(*) INTO v_orphan_fks
  FROM public.games g
  WHERE (
    (g.kit_fp_jersey_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_fp_jersey_id))
    OR (g.kit_fp_shorts_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_fp_shorts_id))
    OR (g.kit_fp_socks_id  IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_fp_socks_id))
    OR (g.kit_gk_jersey_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_gk_jersey_id))
    OR (g.kit_gk_shorts_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_gk_shorts_id))
    OR (g.kit_gk_socks_id  IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.kit_pieces WHERE id = g.kit_gk_socks_id))
  );

  IF v_orphan_fks > 0 THEN
    RAISE EXCEPTION 'PR #156a falhou: % jogos com FKs órfãs em kit_pieces', v_orphan_fks;
  END IF;

  RAISE NOTICE 'PR #156a: % jogos com kits definidos após back-fill', v_games_with_kits;
END $$;
