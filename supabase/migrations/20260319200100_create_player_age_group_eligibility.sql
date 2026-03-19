-- Migration 2: Tabela de elegibilidade de jogadores por escalão
-- Define em que escalões um jogador pode ser convocado.
-- Ex: Mamade Mendes (Sub-15) pode ser convocado pelos Sub-14 como reforço.

CREATE TABLE IF NOT EXISTS player_age_group_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  age_group_id UUID NOT NULL REFERENCES age_groups(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(player_id, age_group_id)
);

CREATE INDEX IF NOT EXISTS idx_player_eligibility_player
  ON player_age_group_eligibility(player_id);
CREATE INDEX IF NOT EXISTS idx_player_eligibility_age_group
  ON player_age_group_eligibility(age_group_id);
CREATE INDEX IF NOT EXISTS idx_player_eligibility_club
  ON player_age_group_eligibility(club_id);

-- RLS
ALTER TABLE player_age_group_eligibility ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer staff do clube
CREATE POLICY "staff_clube_le_elegibilidade"
  ON player_age_group_eligibility FOR SELECT
  TO authenticated
  USING (
    club_id IN (
      SELECT ags.club_id FROM age_group_staff ags
      WHERE ags.profile_id = auth.uid()
      UNION
      SELECT cm.club_id FROM club_memberships cm
      WHERE cm.profile_id = auth.uid()
      UNION
      SELECT ag.club_id FROM age_groups ag
      WHERE ag.coordinator_id = auth.uid()
    )
  );

-- Escrita: coordenadores do clube
CREATE POLICY "coordenadores_gerem_elegibilidade"
  ON player_age_group_eligibility FOR ALL
  TO authenticated
  USING (
    club_id IN (
      SELECT cm.club_id FROM club_memberships cm
      WHERE cm.profile_id = auth.uid()
      UNION
      SELECT ag.club_id FROM age_groups ag
      WHERE ag.coordinator_id = auth.uid()
    )
  )
  WITH CHECK (
    club_id IN (
      SELECT cm.club_id FROM club_memberships cm
      WHERE cm.profile_id = auth.uid()
      UNION
      SELECT ag.club_id FROM age_groups ag
      WHERE ag.coordinator_id = auth.uid()
    )
  );

-- Popular com dados existentes: cada jogador é elegível no seu escalão principal
INSERT INTO player_age_group_eligibility
  (player_id, age_group_id, club_id, is_primary)
SELECT
  p.id,
  p.primary_age_group_id,
  p.club_id,
  TRUE
FROM players p
WHERE p.primary_age_group_id IS NOT NULL
  AND p.club_id IS NOT NULL
ON CONFLICT (player_id, age_group_id) DO NOTHING;
