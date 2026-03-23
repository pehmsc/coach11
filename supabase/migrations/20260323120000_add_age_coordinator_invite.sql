-- Adicionar role 'age_group_coordinator' aos convites de staff.
-- Permite que um club_coordinator ou coordenador de escalão convide
-- alguém para ser coordenador de escalão.

-- 1. Actualizar constraint de role em staff_invites
ALTER TABLE public.staff_invites
  DROP CONSTRAINT IF EXISTS staff_invites_role_check;

ALTER TABLE public.staff_invites
  ADD CONSTRAINT staff_invites_role_check
  CHECK (role IN (
    'club_coordinator',
    'age_group_coordinator',
    'head_coach',
    'assistant_coach',
    'intern_coach',
    'goalkeeper_coach',
    'fitness_coach',
    'physiotherapist',
    'doctor',
    'analyst',
    'team_manager'
  ));

-- 2. RPC para resgatar convite de coordenador de escalão
CREATE OR REPLACE FUNCTION public.rpc_redeem_age_coordinator_invite(
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
  v_age_group_id uuid;
  v_age_group_name text;
  v_age_group_club_name text;
  v_age_group_club_id uuid;
  v_profile_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('redeem_age_coord:' || v_code, 0));

  SELECT si.* INTO v_invite
  FROM public.staff_invites si
  WHERE upper(trim(si.invite_code)) = v_code
  LIMIT 1
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_not_found');
  END IF;

  IF v_invite.role <> 'age_group_coordinator' THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'not_age_coordinator_invite');
  END IF;

  IF v_invite.email IS NOT NULL
     AND v_email IS NOT NULL
     AND lower(trim(v_invite.email)) <> v_email THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'email_mismatch');
  END IF;

  IF v_invite.accepted_at IS NOT NULL
     AND v_invite.accepted_by IS NOT NULL
     AND v_invite.accepted_by <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'invite_used_by_other');
  END IF;

  IF v_invite.age_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'age_group_id_missing');
  END IF;

  SELECT ag.id, ag.name, ag.club_name, ag.club_id
    INTO v_age_group_id, v_age_group_name, v_age_group_club_name, v_age_group_club_id
  FROM public.age_groups ag
  WHERE ag.id = v_invite.age_group_id
  LIMIT 1;

  IF v_age_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'age_group_not_found');
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
    UPDATE public.profiles
    SET role = 'coordinator'
    WHERE id = v_uid AND role <> 'coordinator';
  END IF;

  -- Definir como coordenador do escalão
  UPDATE public.age_groups
  SET coordinator_id = v_uid
  WHERE id = v_invite.age_group_id;

  -- Adicionar a club_memberships como coordenador (se clube associado)
  IF v_age_group_club_id IS NOT NULL THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (v_age_group_club_id, v_uid, 'coordinator')
    ON CONFLICT (club_id, profile_id) DO NOTHING;
  END IF;

  -- Marcar convite como aceite
  UPDATE public.staff_invites
  SET accepted_at = now(),
      accepted_by = v_uid,
      status = 'accepted'
  WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'ok', true,
    'role', 'age_group_coordinator',
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_redeem_age_coordinator_invite FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem_age_coordinator_invite FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_age_coordinator_invite TO authenticated;
