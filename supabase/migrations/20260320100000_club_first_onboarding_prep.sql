-- Preparação para onboarding club-first.
-- Torna club_name nullable em age_groups (dados de clube vivem agora em clubs).
-- NÃO remove o trigger age_groups_assign_club_id — mantém backward compat.
-- NÃO altera dados existentes.

-- Tornar campos de clube em age_groups nullable
-- (antes: club_name era required; agora: o clube é entidade própria)
ALTER TABLE age_groups
  ALTER COLUMN club_name DROP NOT NULL;

-- club_short_name e club_logo_url já são nullable — verificação de segurança
-- (estas queries são no-ops se já forem nullable)
DO $$ BEGIN
  ALTER TABLE age_groups ALTER COLUMN club_short_name DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE age_groups ALTER COLUMN club_logo_url DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Adicionar short_name à tabela clubs (para guardar a sigla do clube)
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Migrar short_name dos age_groups existentes para os clubs
-- (usar o primeiro age_group de cada clube como fonte)
UPDATE clubs c
SET short_name = (
  SELECT ag.club_short_name
  FROM age_groups ag
  WHERE ag.club_id = c.id
    AND ag.club_short_name IS NOT NULL
  ORDER BY ag.created_at ASC
  LIMIT 1
)
WHERE c.short_name IS NULL;
