-- C7: wrapper autenticado para redeem de staff invite.
-- Mantém a RPC base atómica (service_role-only) e expõe apenas wrapper validado para authenticated.

create or replace function public.rpc_redeem_staff_invite_auth(
  p_invite_code text,
  p_user_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim_email text := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  v_effective_email text := nullif(lower(trim(coalesce(p_user_email, v_claim_email, ''))), '');
  v_code text := upper(trim(coalesce(p_invite_code, '')));
  v_invite_club_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_code = '' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_code');
  end if;

  -- Defesa em profundidade: bloqueia redeem quando o utilizador já pertence a clube diferente.
  select si.club_id
    into v_invite_club_id
  from public.staff_invites si
  where upper(trim(si.invite_code)) = v_code
  limit 1;

  if v_invite_club_id is not null and exists (
    select 1
    from public.club_memberships cm
    where cm.profile_id = v_uid
      and cm.club_id is distinct from v_invite_club_id
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'cross_club_forbidden');
  end if;

  return public.rpc_redeem_staff_invite(v_code, v_uid, v_effective_email);
end;
$$;

revoke all on function public.rpc_redeem_staff_invite_auth(text, text) from public;
revoke all on function public.rpc_redeem_staff_invite_auth(text, text) from anon;
revoke all on function public.rpc_redeem_staff_invite_auth(text, text) from authenticated;
grant execute on function public.rpc_redeem_staff_invite_auth(text, text) to authenticated;
grant execute on function public.rpc_redeem_staff_invite_auth(text, text) to service_role;
