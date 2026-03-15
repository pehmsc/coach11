-- Adicionar campo age_level à tabela age_groups
-- age_groups.name passa a ser o nome da equipa (ex: "Infantis A")
-- age_groups.age_level passa a ser o escalão/faixa etária (ex: "Sub-13")
-- Para dados existentes, copiar name para age_level pois historicamente
-- o campo name guardava o escalão (ex: "Sub-14").

ALTER TABLE age_groups ADD COLUMN IF NOT EXISTS age_level text;

-- Inicializar age_level com o valor actual de name para dados existentes
UPDATE age_groups SET age_level = name WHERE age_level IS NULL;
