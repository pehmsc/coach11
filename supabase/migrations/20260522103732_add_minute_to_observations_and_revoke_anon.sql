-- Adicionar coluna minute (minuto do jogo na captura). Aditivo, NULL-safe.
ALTER TABLE public.game_opponent_observations
  ADD COLUMN IF NOT EXISTS minute integer;

COMMENT ON COLUMN public.game_opponent_observations.minute IS
  'Minuto do jogo em que a observação foi capturada no live. NULL se capturada fora do jogo (ex: review).';

-- Defesa em profundidade: anon nunca escreve nesta tabela privada.
-- A RLS já bloqueia (anon não passa user_can_access_age_group), mas
-- o padrão do projecto é revogar também o GRANT em tabelas privadas.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.game_opponent_observations FROM anon;
