-- C7: wrapper autenticado para atualização de sistema tático sem service_role na rota.
-- Mantém gate funcional existente (coordinator do escalão OU staff da equipa do jogo).

create or replace function public.rpc_update_game_tactical_auth(
  p_game_id uuid,
  p_tactical_system text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game record;
  v_team_id uuid;
  v_has_access boolean := false;
  v_normalized_tactical text := nullif(trim(coalesce(p_tactical_system, '')), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select g.id, g.team_id, g.age_group_id
    into v_game
  from public.games g
  where g.id = p_game_id
  limit 1;

  if v_game.id is null then
    return jsonb_build_object('ok', false, 'error_code', 'game_not_found');
  end if;

  v_team_id := v_game.team_id;

  if v_game.age_group_id is not null then
    select exists (
      select 1
      from public.age_groups ag
      where ag.id = v_game.age_group_id
        and ag.coordinator_id = v_uid
        and public.user_can_access_club(ag.club_id)
    )
    into v_has_access;
  end if;

  if not v_has_access and v_team_id is null and v_game.age_group_id is not null then
    select t.id
      into v_team_id
    from public.teams t
    where t.age_group_id = v_game.age_group_id
    order by t.created_at asc nulls last, t.id asc
    limit 1;
  end if;

  if not v_has_access and v_team_id is not null then
    select exists (
      select 1
      from public.team_staff ts
      join public.teams t on t.id = ts.team_id
      where ts.team_id = v_team_id
        and ts.profile_id = v_uid
        and public.user_can_access_club(t.club_id)
    )
    into v_has_access;
  end if;

  if not v_has_access then
    return jsonb_build_object('ok', false, 'error_code', 'forbidden');
  end if;

  update public.games
  set additional_info = v_normalized_tactical
  where id = p_game_id;

  return jsonb_build_object('ok', true, 'tactical_system', v_normalized_tactical);
end;
$$;

revoke all on function public.rpc_update_game_tactical_auth(uuid, text) from public;
revoke all on function public.rpc_update_game_tactical_auth(uuid, text) from anon;
revoke all on function public.rpc_update_game_tactical_auth(uuid, text) from authenticated;
grant execute on function public.rpc_update_game_tactical_auth(uuid, text) to authenticated;
grant execute on function public.rpc_update_game_tactical_auth(uuid, text) to service_role;
