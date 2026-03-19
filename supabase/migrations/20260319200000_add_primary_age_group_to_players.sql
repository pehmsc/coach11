-- Migration 1: Adicionar primary_age_group_id a players
-- O jogador pertence ao clube; o escalão principal é uma referência separada.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS primary_age_group_id UUID
  REFERENCES age_groups(id) ON DELETE SET NULL;

-- Migrar dados: copiar age_group_id → primary_age_group_id
UPDATE players
SET primary_age_group_id = age_group_id
WHERE age_group_id IS NOT NULL
  AND primary_age_group_id IS NULL;

-- Índice para queries por escalão principal
CREATE INDEX IF NOT EXISTS idx_players_primary_age_group
  ON players(primary_age_group_id)
  WHERE primary_age_group_id IS NOT NULL;

-- NOTA: age_group_id mantido por backward compat. Será removido depois.
