-- Migrar categorias de exercícios para formato EMJOGO (13 → 10)
-- Adicionar campos orientation, regime, notes, status

-- 1. Actualizar dados existentes para novas categorias
UPDATE public.exercises SET category = 'qualidades_fisicas' WHERE category IN ('warmup', 'cooldown', 'physical');
UPDATE public.exercises SET category = 'principios_de_jogo' WHERE category = 'technical';
UPDATE public.exercises SET category = 'estrategia' WHERE category IN ('tactical', 'formal_game', 'strategy');
UPDATE public.exercises SET category = 'finalizacao' WHERE category = 'finishing';
UPDATE public.exercises SET category = 'organizacao_defensiva' WHERE category = 'defensive_org';
UPDATE public.exercises SET category = 'organizacao_ofensiva' WHERE category = 'offensive_org';
UPDATE public.exercises SET category = 'transicao_defensiva' WHERE category = 'transition';
UPDATE public.exercises SET category = 'esquemas_taticos' WHERE category = 'set_pieces';
UPDATE public.exercises SET category = 'attb' WHERE category = 'other';

-- 2. Drop o CHECK constraint inline (PostgreSQL gera nome automatico)
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.exercises'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%category%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.exercises DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

-- 3. Adicionar novo CHECK constraint com categorias EMJOGO
ALTER TABLE public.exercises ADD CONSTRAINT exercises_category_emjogo_v1
  CHECK (category IN (
    'attb', 'esquemas_taticos', 'estrategia', 'finalizacao',
    'organizacao_defensiva', 'organizacao_ofensiva',
    'principios_de_jogo', 'qualidades_fisicas',
    'transicao_defensiva', 'transicao_ofensiva'
  ));

-- 4. Adicionar campos novos
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS orientation TEXT CHECK (orientation IN ('recovery', 'strength', 'endurance', 'speed', 'flexibility', 'other')),
  ADD COLUMN IF NOT EXISTS regime TEXT CHECK (regime IN ('aerobic', 'anaerobic_lactic', 'anaerobic_alactic')),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'));
