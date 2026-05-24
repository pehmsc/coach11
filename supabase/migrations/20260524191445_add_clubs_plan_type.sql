-- Adiciona segmentacao de contas a coach11 via clubs.plan_type.
--
-- Contexto: coach11 vai oferecer 2 produtos distintos a partir do mesmo
-- backend (decisao 2026-05-24):
--   - 'individual' — treinador individual. Aquisicao self-service via website
--     com Stripe Checkout. UI simplificada (nav single-team), 1 escalao + 1
--     utilizador, sem features cross-escalao.
--   - 'club'       — clube. Aquisicao sales-led (contacto -> quote ->
--     onboarding manual no backoffice). UI completa (nav multi-team),
--     multiplos escaloes, hierarquia de staff/coordenadores.
--
-- Modelado como "clube simplificado" em vez de entidade separada — backend
-- nao muda (`club_id` continua central), upgrade individual -> clube e
-- trivial (flag muda, sem migration), 1 produto + 1 codebase.
--
-- Esta migration apenas adiciona a coluna. A UI condicional baseada no
-- plan_type vem em PR seguinte (Fase 2 da migracao nav single->multi-team).
--
-- Default 'club' para todos os clubes existentes — preserva o comportamento
-- actual (todos os clubes pre-migration sao do segmento sales-led, nao
-- self-service). Quando o onboarding self-service for criado, novos
-- registos individuais marcam-se explicitamente.
--
-- CHECK constraint enforca os 2 valores validos. Pode ser expandido no
-- futuro se houver novos planos (ex: 'enterprise', 'agency').

ALTER TABLE public.clubs
  ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'club';

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_plan_type_check
  CHECK (plan_type IN ('individual', 'club'));

COMMENT ON COLUMN public.clubs.plan_type IS
  'Segmentacao de produto: ''individual'' (treinador self-service) ou ''club'' (sales-led). Controla UI condicional, billing e onboarding.';
