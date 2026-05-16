-- Reapontar FK de game_events.external_player_convocation_id (e related)
-- de external_player_convocations(id) para game_squads(id).
--
-- Contexto:
-- Após o refactor unificado de convocatórias (PR #128-#136, Mai 2026),
-- game_squads é a fonte de verdade. Os UUIDs em game_squads.id divergiram
-- dos UUIDs em external_player_convocations.id (backfill criou rows com
-- IDs novos). Resultado: substituições de externos falhavam com FK
-- violation porque o cliente envia game_squads.id mas a FK aponta para
-- external_player_convocations.id.
--
-- Esta migration:
-- 1. Drop FKs antigas (apontavam para external_player_convocations)
-- 2. Backfill: actualiza game_events.external_player_convocation_id (e related)
--    para o game_squads.id correspondente, baseado em (game_id, external_name)
-- 3. Hard-fail se sobraram órfãos
-- 4. Add FKs novas (apontam para game_squads)
--
-- ORDEM IMPORTANTE: drop antes do backfill. Se a FK antiga ainda estiver
-- activa quando tentarmos UPDATE para game_squads.id, o Postgres bloqueia
-- com FK violation 23503 (esses UUIDs não existem em
-- external_player_convocations). Por isso a sequência é drop → backfill →
-- add, tudo dentro de uma transacção atómica.

BEGIN;

-- 1. Drop FKs antigas
ALTER TABLE public.game_events
  DROP CONSTRAINT IF EXISTS game_events_external_player_convocation_id_fkey;

ALTER TABLE public.game_events
  DROP CONSTRAINT IF EXISTS game_events_external_related_player_convocation_id_fkey;

-- 2. Backfill de external_player_convocation_id
WITH backfill_map AS (
  SELECT
    ge.id AS event_id,
    gs.id AS new_id
  FROM public.game_events ge
  JOIN public.external_player_convocations epc
    ON epc.id = ge.external_player_convocation_id
  JOIN public.game_squads gs
    ON gs.game_id = ge.game_id
    AND gs.player_id IS NULL
    AND gs.external_name = epc.name
  WHERE ge.external_player_convocation_id IS NOT NULL
    AND ge.external_player_convocation_id <> gs.id
)
UPDATE public.game_events ge
SET external_player_convocation_id = bm.new_id
FROM backfill_map bm
WHERE ge.id = bm.event_id;

-- 3. Backfill de external_related_player_convocation_id
WITH backfill_map AS (
  SELECT
    ge.id AS event_id,
    gs.id AS new_id
  FROM public.game_events ge
  JOIN public.external_player_convocations epc
    ON epc.id = ge.external_related_player_convocation_id
  JOIN public.game_squads gs
    ON gs.game_id = ge.game_id
    AND gs.player_id IS NULL
    AND gs.external_name = epc.name
  WHERE ge.external_related_player_convocation_id IS NOT NULL
    AND ge.external_related_player_convocation_id <> gs.id
)
UPDATE public.game_events ge
SET external_related_player_convocation_id = bm.new_id
FROM backfill_map bm
WHERE ge.id = bm.event_id;

-- 4. Hard-fail se sobraram órfãos
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.game_events ge
  WHERE ge.external_player_convocation_id IS NOT NULL
    AND ge.external_player_convocation_id NOT IN (SELECT id FROM public.game_squads);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % refs em external_player_convocation_id sem correspondencia em game_squads. Migration abortada.',
      orphan_count;
  END IF;

  SELECT COUNT(*) INTO orphan_count
  FROM public.game_events ge
  WHERE ge.external_related_player_convocation_id IS NOT NULL
    AND ge.external_related_player_convocation_id NOT IN (SELECT id FROM public.game_squads);

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % refs em external_related_player_convocation_id sem correspondencia em game_squads. Migration abortada.',
      orphan_count;
  END IF;
END $$;

-- 5. Add FKs novas (apontam para game_squads)
ALTER TABLE public.game_events
  ADD CONSTRAINT game_events_external_player_convocation_id_fkey
  FOREIGN KEY (external_player_convocation_id)
  REFERENCES public.game_squads(id)
  ON DELETE SET NULL;

ALTER TABLE public.game_events
  ADD CONSTRAINT game_events_external_related_player_convocation_id_fkey
  FOREIGN KEY (external_related_player_convocation_id)
  REFERENCES public.game_squads(id)
  ON DELETE SET NULL;

-- 6. Documentar a mudança nas colunas
COMMENT ON COLUMN public.game_events.external_player_convocation_id IS
  'FK para game_squads(id) onde player_id IS NULL (externos). Reapontada em Mai 2026 do legacy external_player_convocations apos refactor unificado.';

COMMENT ON COLUMN public.game_events.external_related_player_convocation_id IS
  'FK para game_squads(id) onde player_id IS NULL (externos). Reapontada em Mai 2026 do legacy external_player_convocations apos refactor unificado.';

COMMIT;
