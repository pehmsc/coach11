-- Refactor schema: unifica convocation_players + external_player_convocations
-- numa única tabela game_squads.
--
-- Decisões fixadas (2026-05-11):
-- - D1: game_stats_live.status MANTÉM-SE viva nesta migration (drop adiado).
-- - Apenas internal_lineup_status passa a ser fonte de verdade nova.
-- - Tabelas legacy passam a read-only (SELECT mantido para 2 semanas).
--
-- Funções DB reaproveitadas (verificado em SQL_INVENTORY_PRE_REFACTOR.md):
-- - public.set_updated_at()  (já existe)
-- - public.sync_club_id_from_domain_refs()  (já existe, lookup via games.club_id)
-- - public.user_can_access_game / user_can_write_game / user_is_game_coordinator

-- ============================================================================
-- 1. Tabela game_squads
-- ============================================================================

CREATE TABLE public.game_squads (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  club_id                UUID NOT NULL REFERENCES public.clubs(id),

  player_id              UUID REFERENCES public.players(id) ON DELETE SET NULL,
  external_name          TEXT,
  external_jersey_number INT CHECK (external_jersey_number BETWEEN 0 AND 99),
  external_position      TEXT,

  source_age_group_id    UUID REFERENCES public.age_groups(id) ON DELETE SET NULL,

  is_present             BOOLEAN,
  response_status        TEXT CHECK (response_status IN ('pending','confirmed','declined')),
  response_at            TIMESTAMPTZ,

  initial_lineup_status  TEXT NOT NULL CHECK (initial_lineup_status IN ('starter','substitute')),
  jersey_number          INT CHECK (jersey_number BETWEEN 0 AND 99),

  -- Avaliação pós-jogo (B1: garantir que externos podem ser avaliados)
  evaluation_rating      NUMERIC(3,1) CHECK (evaluation_rating IS NULL OR evaluation_rating BETWEEN 0 AND 10),
  evaluation_notes       TEXT,
  is_mvp                 BOOLEAN NOT NULL DEFAULT false,

  data_quality           TEXT NOT NULL DEFAULT 'authoritative'
                           CHECK (data_quality IN (
                             'authoritative',
                             'inferred_from_final_stats',
                             'inferred_default_substitute'
                           )),

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT player_xor_external CHECK (
    (player_id IS NOT NULL AND external_name IS NULL)
    OR
    (player_id IS NULL AND external_name IS NOT NULL AND char_length(trim(external_name)) >= 2)
  )
);

CREATE UNIQUE INDEX game_squads_unique_player
  ON public.game_squads (game_id, player_id) WHERE player_id IS NOT NULL;
CREATE INDEX game_squads_game_id_idx ON public.game_squads (game_id);
CREATE INDEX game_squads_club_id_idx ON public.game_squads (club_id);

-- Apenas 1 MVP por jogo
CREATE UNIQUE INDEX game_squads_one_mvp_per_game
  ON public.game_squads (game_id) WHERE is_mvp = true;

-- ============================================================================
-- 2. Alterar tabelas existentes
-- ============================================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS convocation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (convocation_status IN ('draft', 'published'));

ALTER TABLE public.game_events
  ADD COLUMN IF NOT EXISTS game_squad_id UUID REFERENCES public.game_squads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS related_game_squad_id UUID REFERENCES public.game_squads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS game_events_game_squad_id_idx
  ON public.game_events (game_squad_id);

-- ============================================================================
-- 3. Triggers
-- ============================================================================

-- 3.1 Trigger de imutabilidade do initial_lineup_status pós-apito
CREATE OR REPLACE FUNCTION public.enforce_initial_lineup_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_game_status TEXT;
BEGIN
  IF OLD.initial_lineup_status IS DISTINCT FROM NEW.initial_lineup_status THEN
    SELECT status INTO current_game_status FROM public.games WHERE id = NEW.game_id;
    IF current_game_status IS NOT NULL AND current_game_status NOT IN ('scheduled') THEN
      RAISE EXCEPTION 'initial_lineup_status só pode ser alterado enquanto o jogo está scheduled (atual: %)', current_game_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER game_squads_immutable_initial_lineup
  BEFORE UPDATE ON public.game_squads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_initial_lineup_immutability();

-- 3.2 updated_at via função partilhada existente
CREATE TRIGGER game_squads_set_updated_at
  BEFORE UPDATE ON public.game_squads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3.3 sync club_id via função partilhada existente
CREATE TRIGGER game_squads_sync_club_id
  BEFORE INSERT OR UPDATE OF game_id ON public.game_squads
  FOR EACH ROW EXECUTE FUNCTION public.sync_club_id_from_domain_refs();

-- ============================================================================
-- 4. RPC atómica de substituição
-- ============================================================================
-- NOTA: game_events NÃO tem colunas `period` nem `created_by` no schema
-- actual, logo a RPC aceita só (game_id, squad_out, squad_in, minute) e os
-- events ficam com (game_id, event_type, minute, game_squad_id,
-- related_game_squad_id, is_opponent_event=false, created_at=NOW()).

CREATE OR REPLACE FUNCTION public.rpc_register_substitution(
  p_game_id UUID,
  p_squad_out_id UUID,
  p_squad_in_id UUID,
  p_minute INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_squad_out_exists INT;
  v_squad_in_exists INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_can_write_game(p_game_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_squad_out_exists FROM public.game_squads
   WHERE id = p_squad_out_id AND game_id = p_game_id;
  SELECT COUNT(*) INTO v_squad_in_exists FROM public.game_squads
   WHERE id = p_squad_in_id AND game_id = p_game_id;

  IF v_squad_out_exists = 0 OR v_squad_in_exists = 0 THEN
    RAISE EXCEPTION 'squad_not_found_in_game' USING ERRCODE = '22023';
  END IF;

  IF p_squad_out_id = p_squad_in_id THEN
    RAISE EXCEPTION 'sub_out_equals_sub_in' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.game_events (
    game_id, event_type, minute,
    game_squad_id, related_game_squad_id,
    is_opponent_event, created_at
  ) VALUES
    (p_game_id, 'substitution_out', p_minute, p_squad_out_id, p_squad_in_id, false, NOW()),
    (p_game_id, 'substitution_in',  p_minute, p_squad_in_id,  p_squad_out_id, false, NOW());

  RETURN jsonb_build_object(
    'success', true,
    'squad_out_id', p_squad_out_id,
    'squad_in_id', p_squad_in_id,
    'minute', p_minute
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_register_substitution(UUID, UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_register_substitution(UUID, UUID, UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_register_substitution(UUID, UUID, UUID, INTEGER) TO authenticated;

-- ============================================================================
-- 5. RLS policies para game_squads
-- ============================================================================

ALTER TABLE public.game_squads ENABLE ROW LEVEL SECURITY;

CREATE POLICY game_squads_domain_boundary_v1 ON public.game_squads
  FOR ALL TO authenticated
  USING (public.user_can_access_game(game_id))
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY game_squads_read_v1 ON public.game_squads
  FOR SELECT TO authenticated
  USING (public.user_can_access_game(game_id));

CREATE POLICY game_squads_write_insert_v1 ON public.game_squads
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY game_squads_write_update_v1 ON public.game_squads
  FOR UPDATE TO authenticated
  USING (public.user_can_write_game(game_id))
  WITH CHECK (public.user_can_write_game(game_id));

CREATE POLICY game_squads_write_delete_v1 ON public.game_squads
  FOR DELETE TO authenticated
  USING (public.user_is_game_coordinator(game_id));

-- ============================================================================
-- 6. Grants de coluna para anon (defesa em profundidade — endpoints públicos
-- usam adminClient hoje, mas se algum dia mudar, esta camada protege).
-- ============================================================================

REVOKE ALL ON public.game_squads FROM anon;
GRANT SELECT (
  id, game_id, club_id, player_id,
  external_name, external_jersey_number, external_position,
  source_age_group_id, response_status, jersey_number,
  created_at, updated_at
) ON public.game_squads TO anon;
-- NÃO incluir: initial_lineup_status, is_present, data_quality, evaluation_*,
-- is_mvp (informação interna).

-- ============================================================================
-- 7. Back-fill de dados
-- ============================================================================

-- 7.1 convocation_players → game_squads (internos)
INSERT INTO public.game_squads (
  game_id, club_id, player_id,
  response_status, response_at, is_present,
  initial_lineup_status, jersey_number,
  evaluation_rating, evaluation_notes, is_mvp,
  data_quality
)
SELECT
  conv.game_id,
  cp.club_id,
  cp.player_id,
  cp.response_status,
  cp.response_at,
  cp.is_present,
  COALESCE(
    (SELECT gfs.lineup_type
       FROM public.game_final_stats gfs
       WHERE gfs.game_id = conv.game_id AND gfs.player_id = cp.player_id
       LIMIT 1),
    'substitute'
  ),
  p.jersey_number,
  (SELECT gfs.coach_rating FROM public.game_final_stats gfs
     WHERE gfs.game_id = conv.game_id AND gfs.player_id = cp.player_id LIMIT 1),
  (SELECT gfs.notes FROM public.game_final_stats gfs
     WHERE gfs.game_id = conv.game_id AND gfs.player_id = cp.player_id LIMIT 1),
  COALESCE(
    (SELECT gfs.is_mvp FROM public.game_final_stats gfs
       WHERE gfs.game_id = conv.game_id AND gfs.player_id = cp.player_id LIMIT 1),
    false
  ),
  CASE
    WHEN EXISTS (SELECT 1 FROM public.game_final_stats gfs
                  WHERE gfs.game_id = conv.game_id AND gfs.player_id = cp.player_id)
      THEN 'inferred_from_final_stats'
    ELSE 'inferred_default_substitute'
  END
FROM public.convocation_players cp
JOIN public.convocations conv ON conv.id = cp.convocation_id
JOIN public.players p ON p.id = cp.player_id
ON CONFLICT DO NOTHING;

-- 7.2 external_player_convocations → game_squads (externos)
INSERT INTO public.game_squads (
  game_id, club_id, external_name, external_jersey_number, external_position,
  initial_lineup_status, jersey_number, data_quality
)
SELECT
  game_id, club_id, name, jersey_number, position,
  CASE lineup_status WHEN 'on_field' THEN 'starter' ELSE 'substitute' END,
  jersey_number,
  'authoritative'
FROM public.external_player_convocations;

-- 7.3 games.convocation_status (mapping de convocations.status)
-- convocations não tem updated_at, logo ordenamos por created_at DESC.
UPDATE public.games g
SET convocation_status = COALESCE(
  (SELECT CASE
            WHEN c.status IN ('closed', 'confirmed', 'published') THEN 'published'
            ELSE 'draft'
          END
     FROM public.convocations c
     WHERE c.game_id = g.id
     ORDER BY c.created_at DESC LIMIT 1),
  'draft'
);

-- 7.4 Re-pointing de game_events para internos
UPDATE public.game_events ge
SET game_squad_id = gs.id
FROM public.game_squads gs
WHERE gs.game_id = ge.game_id
  AND gs.player_id = ge.player_id
  AND ge.player_id IS NOT NULL
  AND ge.game_squad_id IS NULL;

UPDATE public.game_events ge
SET related_game_squad_id = gs.id
FROM public.game_squads gs
WHERE gs.game_id = ge.game_id
  AND gs.player_id = ge.related_player_id
  AND ge.related_player_id IS NOT NULL
  AND ge.related_game_squad_id IS NULL;

-- 7.5 Re-pointing de game_events para externos
UPDATE public.game_events ge
SET game_squad_id = gs.id
FROM public.game_squads gs, public.external_player_convocations epc
WHERE ge.external_player_convocation_id = epc.id
  AND gs.game_id = epc.game_id
  AND gs.external_name = epc.name
  AND ge.game_squad_id IS NULL;

UPDATE public.game_events ge
SET related_game_squad_id = gs.id
FROM public.game_squads gs, public.external_player_convocations epc
WHERE ge.external_related_player_convocation_id = epc.id
  AND gs.game_id = epc.game_id
  AND gs.external_name = epc.name
  AND ge.related_game_squad_id IS NULL;

-- ============================================================================
-- 8. Bloquear escritas em tabelas legacy (read-only durante 2 semanas)
-- ============================================================================

REVOKE INSERT, UPDATE, DELETE ON public.convocation_players FROM authenticated;
DROP POLICY IF EXISTS convocation_players_write_insert_v1 ON public.convocation_players;
DROP POLICY IF EXISTS convocation_players_write_update_v1 ON public.convocation_players;
DROP POLICY IF EXISTS convocation_players_write_delete_v1 ON public.convocation_players;

REVOKE INSERT, UPDATE, DELETE ON public.external_player_convocations FROM authenticated;
DROP POLICY IF EXISTS external_player_convocations_write_insert_v1 ON public.external_player_convocations;
DROP POLICY IF EXISTS external_player_convocations_write_update_v1 ON public.external_player_convocations;
DROP POLICY IF EXISTS external_player_convocations_write_delete_v1 ON public.external_player_convocations;

REVOKE INSERT, UPDATE, DELETE ON public.convocations FROM authenticated;
DROP POLICY IF EXISTS convocations_write_insert_v1 ON public.convocations;
DROP POLICY IF EXISTS convocations_write_update_v1 ON public.convocations;
DROP POLICY IF EXISTS convocations_write_delete_v1 ON public.convocations;

-- SELECT mantido nas 3 tabelas (legacy read-only).

-- ============================================================================
-- 9. Validação pós-migração (DO block)
-- ============================================================================

DO $$
DECLARE
  v_orphan_internal INT;
  v_orphan_external INT;
  v_orphan_events INT;
  v_squad_count INT;
  v_authoritative_count INT;
  v_inferred_count INT;
BEGIN
  SELECT COUNT(*) INTO v_orphan_internal
  FROM public.convocation_players cp
  JOIN public.convocations conv ON conv.id = cp.convocation_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.game_squads gs
    WHERE gs.game_id = conv.game_id AND gs.player_id = cp.player_id
  );

  SELECT COUNT(*) INTO v_orphan_external
  FROM public.external_player_convocations epc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.game_squads gs
    WHERE gs.game_id = epc.game_id AND gs.external_name = epc.name
  );

  SELECT COUNT(*) INTO v_orphan_events
  FROM public.game_events
  WHERE (player_id IS NOT NULL OR external_player_convocation_id IS NOT NULL)
    AND game_squad_id IS NULL;

  SELECT COUNT(*) INTO v_squad_count FROM public.game_squads;
  SELECT COUNT(*) INTO v_authoritative_count FROM public.game_squads WHERE data_quality = 'authoritative';
  SELECT COUNT(*) INTO v_inferred_count FROM public.game_squads WHERE data_quality LIKE 'inferred_%';

  RAISE NOTICE 'Migration result:';
  RAISE NOTICE '  Total squads: %', v_squad_count;
  RAISE NOTICE '  Authoritative: %', v_authoritative_count;
  RAISE NOTICE '  Inferred: %', v_inferred_count;
  RAISE NOTICE '  Orphan internals: %', v_orphan_internal;
  RAISE NOTICE '  Orphan externals: %', v_orphan_external;
  RAISE NOTICE '  Orphan events: %', v_orphan_events;

  IF v_orphan_internal > 0 OR v_orphan_external > 0 OR v_orphan_events > 0 THEN
    RAISE EXCEPTION 'Migração incompleta: internal=%, external=%, events=%',
      v_orphan_internal, v_orphan_external, v_orphan_events;
  END IF;
END $$;
