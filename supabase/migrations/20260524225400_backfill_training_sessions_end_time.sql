-- Correcao cirurgica de dados: preencher end_time em 3 treinos historicos do
-- escalao EFB Sub-13 Infantis A que ficaram sem end_time porque o modal
-- antigo nao permitia registar hora de fim. Sao registos identificados;
-- nao se aplica qualquer regra generica.
--
-- IDs (todos com start_time = 18:30, duracao standard de 60 min):
--   36d3bd1f-6e1b-4ace-8904-d262d0bf5b0f (2026-02-24)
--   877ee61f-1cbf-4773-a233-6837a7f1eac5 (2026-02-25)
--   fe3fa640-64da-41de-aa62-5fcac4b37dc4 (2026-02-27)
--
-- Efeito no KPI 'minutos de treino' do escalao: 1920 -> 2100.
--
-- Follow-up recomendado: tornar end_time obrigatorio no formulario de treinos
-- (mini-sprint a parte, fora do ambito desta migration).

UPDATE public.training_sessions
SET end_time = '19:30:00'
WHERE id IN (
  '36d3bd1f-6e1b-4ace-8904-d262d0bf5b0f',
  '877ee61f-1cbf-4773-a233-6837a7f1eac5',
  'fe3fa640-64da-41de-aa62-5fcac4b37dc4'
)
  AND start_time = '18:30:00'
  AND end_time IS NULL;
