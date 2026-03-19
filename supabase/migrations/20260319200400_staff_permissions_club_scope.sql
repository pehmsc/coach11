-- Migration 5: Adicionar scope e age_group_id a staff_permissions
-- Permite distinguir permissões de clube (acesso a todos os escalões)
-- de permissões de escalão (acesso só ao escalão específico).

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS age_group_id UUID
    REFERENCES age_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'age_group'
    CHECK (scope IN ('age_group', 'club'));

CREATE INDEX IF NOT EXISTS idx_staff_permissions_age_group
  ON staff_permissions(age_group_id)
  WHERE age_group_id IS NOT NULL;

-- Migrar: ligar cada permissão ao escalão do seu staff member
UPDATE staff_permissions sp
SET age_group_id = ags.age_group_id,
    scope = 'age_group'
FROM age_group_staff ags
WHERE ags.id = sp.staff_id
  AND ags.age_group_id IS NOT NULL
  AND sp.age_group_id IS NULL;
