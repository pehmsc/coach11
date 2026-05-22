-- RPC para promover observações capturadas durante o jogo para o perfil
-- permanente do adversário. Atómico: anexa texto a opponents.<campo> e
-- marca as observações como promovidas, numa única transação.
--
-- SECURITY INVOKER: respeita a RLS do utilizador (precisa de UPDATE em
-- opponents e em game_opponent_observations — ambos cobertos pelas policies
-- via user_can_access_age_group).

CREATE OR REPLACE FUNCTION public.rpc_promote_observations(
  p_opponent_id uuid,
  p_observation_ids uuid[],
  p_target_field text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_appended text;
  v_existing text;
BEGIN
  -- Validar target_field contra whitelist (SQL dinâmico só no nome da
  -- coluna; whitelist evita injection).
  IF p_target_field NOT IN ('pontos_fortes','pontos_fracos','atletas_chave','notas_gerais') THEN
    RAISE EXCEPTION 'Campo de destino inválido: %', p_target_field;
  END IF;

  IF array_length(p_observation_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhuma observação seleccionada';
  END IF;

  -- Construir texto a anexar: cada observação como bullet "- <texto>".
  -- Apenas observações deste opponent E ainda não promovidas.
  SELECT string_agg('- ' || observation, E'\n' ORDER BY created_at)
    INTO v_appended
  FROM game_opponent_observations
  WHERE id = ANY(p_observation_ids)
    AND opponent_id = p_opponent_id
    AND promoted_to_opponent_at IS NULL;

  IF v_appended IS NULL OR v_appended = '' THEN
    RAISE EXCEPTION 'Nenhuma observação válida para promover';
  END IF;

  -- Ler valor existente do campo de destino (nome da coluna já validado).
  EXECUTE format('SELECT %I FROM opponents WHERE id = $1', p_target_field)
    INTO v_existing USING p_opponent_id;

  -- Anexar preservando o existente (separação por linha em branco se já tem).
  EXECUTE format(
    'UPDATE opponents SET %I = CASE
        WHEN $1 IS NULL OR btrim($1) = '''' THEN $2
        ELSE $1 || E''\n'' || $2
      END,
      updated_at = now()
     WHERE id = $3',
    p_target_field
  ) USING v_existing, v_appended, p_opponent_id;

  -- Marcar as observações como promovidas.
  UPDATE game_opponent_observations
  SET promoted_to_field = p_target_field,
      promoted_to_opponent_at = now(),
      promoted_by = auth.uid(),
      updated_at = now()
  WHERE id = ANY(p_observation_ids)
    AND opponent_id = p_opponent_id
    AND promoted_to_opponent_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_promote_observations(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_promote_observations(uuid, uuid[], text) TO authenticated;
