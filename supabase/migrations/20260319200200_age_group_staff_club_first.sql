-- Migration 3: Tornar age_group_id nullable em age_group_staff
-- Staff pertence ao clube. O escalão é associação opcional.
-- Permite staff ao nível de clube sem escalão específico.

ALTER TABLE age_group_staff
  ALTER COLUMN age_group_id DROP NOT NULL;
