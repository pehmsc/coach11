-- ============================================================================
-- Cleanup: schema de localização em games e training_sessions
-- ============================================================================
-- Remove 3 colunas dead que duplicam dados ou nunca foram alimentadas:
--   - location_address (duplica formatted_address)
--   - location_lat (dead, 0 linhas em ambas as tabelas)
--   - location_lng (dead, 0 linhas em ambas as tabelas)
--
-- Antes do DROP:
--   1) Back-fill formatted_address a partir de location_address onde só
--      location_address está preenchido
--   2) Validação defensiva: lat/lng não podem ter ganho dados entretanto
--   3) Validação defensiva: location_address e formatted_address estão em
--      sincronia onde ambos existem
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (1) BACK-FILL: formatted_address ← location_address onde só o antigo existe
-- ----------------------------------------------------------------------------

-- training_sessions: 3 linhas conhecidas têm location_address mas não formatted_address
UPDATE public.training_sessions
SET formatted_address = location_address
WHERE location_address IS NOT NULL
  AND formatted_address IS NULL
  AND TRIM(location_address) <> '';

-- games: confirmar e fazer mesmo back-fill
UPDATE public.games
SET formatted_address = location_address
WHERE location_address IS NOT NULL
  AND formatted_address IS NULL
  AND TRIM(location_address) <> '';


-- ----------------------------------------------------------------------------
-- (2) VALIDAÇÃO DEFENSIVA: location_lat/lng continuam vazios?
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_games_lat INTEGER;
  v_games_lng INTEGER;
  v_train_lat INTEGER;
  v_train_lng INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_games_lat FROM public.games WHERE location_lat IS NOT NULL;
  SELECT COUNT(*) INTO v_games_lng FROM public.games WHERE location_lng IS NOT NULL;
  SELECT COUNT(*) INTO v_train_lat FROM public.training_sessions WHERE location_lat IS NOT NULL;
  SELECT COUNT(*) INTO v_train_lng FROM public.training_sessions WHERE location_lng IS NOT NULL;

  IF v_games_lat > 0 OR v_games_lng > 0 OR v_train_lat > 0 OR v_train_lng > 0 THEN
    RAISE EXCEPTION
      'Não é seguro fazer DROP: location_lat/lng têm dados (games: %/%, training: %/%). Auditar antes de remover.',
      v_games_lat, v_games_lng, v_train_lat, v_train_lng;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- (3) VALIDAÇÃO DEFENSIVA: depois do back-fill, location_address e
--     formatted_address estão em sincronia onde ambos existem?
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_games_diff INTEGER;
  v_train_diff INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_games_diff
  FROM public.games
  WHERE location_address IS NOT NULL
    AND formatted_address IS NOT NULL
    AND location_address <> formatted_address;

  SELECT COUNT(*) INTO v_train_diff
  FROM public.training_sessions
  WHERE location_address IS NOT NULL
    AND formatted_address IS NOT NULL
    AND location_address <> formatted_address;

  IF v_games_diff > 0 OR v_train_diff > 0 THEN
    RAISE EXCEPTION
      'Não é seguro fazer DROP: location_address e formatted_address divergem (games: %, training: %).',
      v_games_diff, v_train_diff;
  END IF;
END $$;


-- ----------------------------------------------------------------------------
-- (4) DROP COLUMNS
-- ----------------------------------------------------------------------------

ALTER TABLE public.games
  DROP COLUMN IF EXISTS location_address,
  DROP COLUMN IF EXISTS location_lat,
  DROP COLUMN IF EXISTS location_lng;

ALTER TABLE public.training_sessions
  DROP COLUMN IF EXISTS location_address,
  DROP COLUMN IF EXISTS location_lat,
  DROP COLUMN IF EXISTS location_lng;
