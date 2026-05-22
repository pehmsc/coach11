-- Defesa em profundidade: anon nunca escreve em opponents (tabela privada).
-- A RLS já bloqueia (anon não passa user_can_access_age_group), mas o
-- padrão do projecto é revogar também o GRANT em tabelas privadas — alinhado
-- com o revoke feito em game_opponent_observations no PR B1.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.opponents FROM anon;
