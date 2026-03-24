-- Adicionar coluna age_group_ids para suporte multi-escalão em convites de staff
-- Permite que um club_coordinator convide staff para múltiplos escalões de uma só vez.

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS age_group_ids UUID[] NOT NULL DEFAULT '{}';
