-- BUG CRÍTICO: rpc_redeem_age_coordinator_invite alterava age_groups.coordinator_id.
--
-- Causa: a migration 20260323120000_add_age_coordinator_invite.sql usava
-- UPDATE age_groups SET coordinator_id = v_uid para "definir o coordenador".
-- Isto é incorrecto — coordinator_id é o DONO/CRIADOR do escalão (o club_coordinator
-- que o criou). Nunca deve ser alterado pelo redeem de um convite de staff.
--
-- Consequências do bug:
-- 1. O club_coordinator original (pehmsc) perdia acesso ao escalão (coordinator_id mudou).
-- 2. O trigger repair_club_membership_state via after update of coordinator_id em age_groups
--    atribuía club_memberships.role = 'coordinator' ao age_group_coordinator convidado (cfbu14),
--    tornando-o visualmente "Coordenador do Clube" na UI.
-- 3. O resolveUserTeamContext do club_coordinator deixava de encontrar o escalão
--    (query age_groups WHERE coordinator_id = pehmsc já não retornava Iniciados B).
--
-- Correcção:
-- 1. Não alterar coordinator_id.
-- 2. Inserir em age_group_staff com role = 'age_group_coordinator'.
-- 3. Usar club_memberships.role = 'staff' (não 'coordinator').
--
-- Fix de dados: corrigir membros que receberam club_memberships.role = 'coordinator'
-- erroneamente por serem age_group_coordinator via convite (sem serem coordinator_id
-- de nenhum age_group).

-- 1. Corrigir dados: reverter roles incorrectos em club_memberships
UPDATE public.club_memberships cm
SET role = 'staff'
WHERE cm.role = 'coordinator'
  AND EXISTS (
    SELECT 1 FROM public.age_group_staff ags
    WHERE ags.profile_id = cm.profile_id
      AND ags.club_id = cm.club_id
      AND ags.role = 'age_group_coordinator'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.age_groups ag
    WHERE ag.coordinator_id = cm.profile_id
      AND ag.club_id = cm.club_id
  );

-- 2. Corrigir a função RPC
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
  v_already_linked BOOLEAN := false;
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
    WHERE id = v_uid AND role NOT IN ('coordinator', 'admin');
  END IF;

  -- CORRECÇÃO: NÃO alterar age_groups.coordinator_id.
  -- coordinator_id é o DONO do escalão (club_coordinator que o criou).
  -- O age_group_coordinator é uma função de staff — adicionado via age_group_staff.

  -- Adicionar entrada em age_group_staff com role 'age_group_coordinator'
  SELECT EXISTS (
    SELECT 1 FROM public.age_group_staff
    WHERE profile_id = v_uid AND age_group_id = v_invite.age_group_id
  ) INTO v_already_linked;

  IF NOT v_already_linked THEN
    INSERT INTO public.age_group_staff (
      age_group_id,
      club_id,
      profile_id,
      role
    )
    VALUES (
      v_invite.age_group_id,
      v_age_group_club_id,
      v_uid,
      'age_group_coordinator'
    )
    ON CONFLICT (profile_id, age_group_id) DO UPDATE
      SET role = 'age_group_coordinator';
  END IF;

  -- Adicionar a club_memberships como 'staff' (não 'coordinator')
  IF v_age_group_club_id IS NOT NULL THEN
    INSERT INTO public.club_memberships (club_id, profile_id, role)
    VALUES (v_age_group_club_id, v_uid, 'staff')
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
    'already_linked', v_already_linked,
    'role', 'age_group_coordinator',
    'age_group_name', v_age_group_name,
    'age_group_club_name', v_age_group_club_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_redeem_age_coordinator_invite FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_redeem_age_coordinator_invite FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_redeem_age_coordinator_invite TO authenticated;
