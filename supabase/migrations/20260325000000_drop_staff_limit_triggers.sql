-- Remove triggers e funções de limite de staff técnico (beta).
-- O limite era aplicado no DB via trigger; foi removido da API (PR #103).
-- Mantém a função age_group_technical_staff_usage() usada pela UI para exibição.

-- Remover triggers de enforcement
DROP TRIGGER IF EXISTS trg_age_group_staff_limit_technical_staff ON public.age_group_staff;
DROP TRIGGER IF EXISTS trg_team_staff_limit_technical_staff ON public.team_staff;

-- Remover função de enforcement (trigger function)
DROP FUNCTION IF EXISTS public.check_age_group_technical_staff_limit() CASCADE;
DROP FUNCTION IF EXISTS public.assert_age_group_technical_staff_limit(uuid, integer, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.assert_age_group_technical_staff_limit(uuid) CASCADE;

-- Remover função de bypass (não necessária sem enforcement)
DROP FUNCTION IF EXISTS public.age_group_has_unlimited_technical_staff(uuid) CASCADE;
