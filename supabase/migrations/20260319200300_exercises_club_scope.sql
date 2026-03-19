-- Migration 4: Tornar age_group_id nullable em exercises
-- Exercícios pertencem ao clube, não ao escalão.

ALTER TABLE exercises
  ALTER COLUMN age_group_id DROP NOT NULL;
