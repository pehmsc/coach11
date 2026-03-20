-- RPC separado para resgatar convites de coordenador de clube.
-- Cria entrada em club_memberships (não em age_group_staff).
-- O RPC existente (rpc_redeem_staff_invite) continua a tratar convites de staff.

CREATE OR REPLACE FUNCTION public.rpc_redeem_club_coordinator_invite(
  p_invite_code TEXT,
  p_user_email TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code TEXT := upper(trim(coalesce(p_invite_code, '')));
  v_email TEXT := nullif(lower(trim(coalesce(p_user_email, ''))), '');
  v_invite public.staff_invites%ROWTYPE;
  v_profile_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  END IF;

  -- Lock por código
  PERFORM pg_advisory_xact_lock(hashtextextended('redeem_club_coord:' || v_code, 0));

  -- Buscar convite
  SELECT si.* INTO v_invite
  FROM public.staff_invites si
  WHERE upper(trim(si.invite_code)) = v_code
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  END IF;

  -- Verificar que é convite de coordenador de clube
  IF v_invite.role <> 'club_coordinator' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_coordinator_invite');
  END IF;

  -- Verificar email
  IF v_invite.email IS NOT NULL
     AND v_email IS NOT NULL
     AND lower(trim(v_invite.email)) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  END IF;

  -- Verificar se já foi aceite por outro user
  IF v_invite.accepted_at IS NOT NULL
     AND v_invite.accepted_by IS NOT NULL
     AND v_invite.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  END IF;

  IF v_invite.club_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'club_id_missing');
  END IF;

  -- Garantir profile existe
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid)
  INTO v_profile_exists;

  IF NOT v_profile_exists THEN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
      v_uid,
      coalesce(
        nullif(trim(coalesce(v_invite.first_name, '') || ' ' || coalesce(v_invite.last_name, '')), ''),
        'Utilizador'
      ),
      'coordinator'
    );
  ELSE
    -- Actualizar role para coordinator se ainda não for
    UPDATE public.profiles
    SET role = 'coordinator'
    WHERE id = v_uid AND role <> 'coordinator';
  END IF;

  -- Criar club_membership (idempotente)
  INSERT INTO public.club_memberships (club_id, profile_id, role)
  VALUES (v_invite.club_id, v_uid, 'club_coordinator')
  ON CONFLICT (club_id, profile_id) DO NOTHING;

  -- Marcar convite como aceite
  UPDATE public.staff_invites
  SET accepted_at = now(),
      accepted_by = v_uid,
      status = 'accepted'
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'role', 'club_coordinator',
    'club_id', v_invite.club_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_redeem_club_coordinator_invite FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem_club_coordinator_invite FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_club_coordinator_invite TO authenticated;
