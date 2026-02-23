-- C5 (2D faseado): wrappers AUTH para RPCs atómicas de jogo.
-- Opção B: mantém RPCs internas service_role-only e expõe wrappers validados para authenticated.

create or replace function public.rpc_finalize_game_auth(
  p_game_id uuid,
  p_final_stats jsonb,
  p_score_home integer,
  p_score_away integer,
  p_final_minute integer default null,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_effective_updated_by uuid;
begin
  if v_auth_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.game_exists(p_game_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if not public.user_can_write_game(p_game_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and coalesce(g.status, 'scheduled') = 'completed'
  ) and not public.user_is_game_coordinator(p_game_id) then
    raise exception 'completed_requires_coordinator' using errcode = '42501';
  end if;

  v_effective_updated_by := coalesce(p_updated_by, v_auth_user);
  if v_effective_updated_by <> v_auth_user then
    raise exception 'updated_by_mismatch' using errcode = '42501';
  end if;

  return public.rpc_finalize_game(
    p_game_id,
    p_final_stats,
    p_score_home,
    p_score_away,
    p_final_minute,
    v_effective_updated_by
  );
end;
$$;

create or replace function public.rpc_recalculate_game_summary_auth(
  p_game_id uuid,
  p_rows jsonb,
  p_score_home integer,
  p_score_away integer,
  p_final_minute integer,
  p_updated_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user uuid := auth.uid();
  v_effective_updated_by uuid;
begin
  if v_auth_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.game_exists(p_game_id) then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if not public.user_is_game_coordinator(p_game_id) then
    raise exception 'coordinator_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and coalesce(g.status, 'scheduled') = 'completed'
  ) then
    raise exception 'game_not_completed' using errcode = '22023';
  end if;

  if not public.user_can_write_game(p_game_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_effective_updated_by := coalesce(p_updated_by, v_auth_user);
  if v_effective_updated_by <> v_auth_user then
    raise exception 'updated_by_mismatch' using errcode = '42501';
  end if;

  return public.rpc_recalculate_game_summary(
    p_game_id,
    p_rows,
    p_score_home,
    p_score_away,
    p_final_minute,
    v_effective_updated_by
  );
end;
$$;

revoke all on function public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid) from public;
revoke all on function public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid) from anon;
revoke all on function public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid) from authenticated;
grant execute on function public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid) to authenticated;
grant execute on function public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid) to service_role;

revoke all on function public.rpc_recalculate_game_summary_auth(uuid, jsonb, integer, integer, integer, uuid) from public;
revoke all on function public.rpc_recalculate_game_summary_auth(uuid, jsonb, integer, integer, integer, uuid) from anon;
revoke all on function public.rpc_recalculate_game_summary_auth(uuid, jsonb, integer, integer, integer, uuid) from authenticated;
grant execute on function public.rpc_recalculate_game_summary_auth(uuid, jsonb, integer, integer, integer, uuid) to authenticated;
grant execute on function public.rpc_recalculate_game_summary_auth(uuid, jsonb, integer, integer, integer, uuid) to service_role;
