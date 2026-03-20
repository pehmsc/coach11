-- RPC SECURITY DEFINER para criar clube no onboarding.
-- Resolve o paradoxo de bootstrap: o user precisa de criar um clube
-- mas as RLS policies exigem club_membership que ainda não existe.

CREATE OR REPLACE FUNCTION public.create_club_onboarding(
  p_name TEXT,
  p_short_name TEXT DEFAULT NULL,
  p_slug TEXT DEFAULT 'clube',
  p_logo_url TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_final_slug TEXT;
  v_attempt INT := 0;
BEGIN
  -- Verificar autenticação
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Idempotência: se já tem clube, retornar o existente
  SELECT cm.club_id INTO v_club_id
  FROM public.club_memberships cm
  WHERE cm.profile_id = v_uid
  ORDER BY cm.created_at ASC
  LIMIT 1;

  IF v_club_id IS NOT NULL THEN
    RETURN jsonb_build_object('club_id', v_club_id, 'already_existed', true);
  END IF;

  -- Gerar slug único com retry
  v_final_slug := COALESCE(NULLIF(TRIM(p_slug), ''), 'clube');
  WHILE v_attempt < 10 LOOP
    BEGIN
      INSERT INTO public.clubs (name, short_name, slug, logo_url)
      VALUES (
        TRIM(p_name),
        NULLIF(TRIM(COALESCE(p_short_name, '')), ''),
        CASE WHEN v_attempt = 0 THEN v_final_slug
             ELSE v_final_slug || '-' || v_attempt
        END,
        NULLIF(TRIM(COALESCE(p_logo_url, '')), '')
      )
      RETURNING id INTO v_club_id;
      EXIT; -- sucesso
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
    END;
  END LOOP;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'slug_conflict';
  END IF;

  -- Criar membership de coordenador de clube
  INSERT INTO public.club_memberships (club_id, profile_id, role)
  VALUES (v_club_id, v_uid, 'club_coordinator');

  RETURN jsonb_build_object('club_id', v_club_id, 'already_existed', false);
END;
$$;

-- Apenas utilizadores autenticados podem chamar (a função verifica internamente)
REVOKE ALL ON FUNCTION public.create_club_onboarding FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_club_onboarding FROM anon;
GRANT EXECUTE ON FUNCTION public.create_club_onboarding TO authenticated;
