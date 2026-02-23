-- Fase 2C (atomicidade): RPCs transacionais/idempotentes para finalize/recalculate.

create or replace function public.rpc_finalize_game(
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
  v_now timestamptz := now();
  v_inserted_rows integer := 0;
  v_base_seconds integer := 0;
begin
  if p_game_id is null then
    raise exception 'p_game_id é obrigatório';
  end if;

  if p_final_stats is null or jsonb_typeof(p_final_stats) <> 'array' then
    raise exception 'p_final_stats inválido (esperado array json)';
  end if;

  if p_score_home is null or p_score_away is null then
    raise exception 'score final inválido';
  end if;

  -- Lock por jogo no escopo da transação para evitar corridas concorrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_game_id::text, 0));

  perform 1
  from public.games g
  where g.id = p_game_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado';
  end if;

  delete from public.game_final_stats
  where game_id = p_game_id;

  insert into public.game_final_stats (
    game_id,
    player_id,
    lineup_type,
    minutes_played,
    goals,
    own_goals,
    assists,
    yellow_cards,
    red_cards,
    coach_rating,
    notes,
    is_mvp,
    is_finalized,
    finalized_at
  )
  select
    p_game_id,
    r.player_id,
    r.lineup_type,
    greatest(0, coalesce(r.minutes_played, 0)),
    greatest(0, coalesce(r.goals, 0)),
    greatest(0, coalesce(r.own_goals, 0)),
    greatest(0, coalesce(r.assists, 0)),
    greatest(0, coalesce(r.yellow_cards, 0)),
    greatest(0, coalesce(r.red_cards, 0)),
    case
      when r.coach_rating is null then null
      when r.coach_rating < 0 then 0
      when r.coach_rating > 10 then 10
      else r.coach_rating
    end,
    nullif(trim(coalesce(r.notes, '')), ''),
    coalesce(r.is_mvp, false),
    coalesce(r.is_finalized, true),
    coalesce(r.finalized_at, v_now)
  from jsonb_to_recordset(p_final_stats) as r(
    player_id uuid,
    lineup_type text,
    minutes_played integer,
    goals integer,
    own_goals integer,
    assists integer,
    yellow_cards integer,
    red_cards integer,
    coach_rating numeric,
    notes text,
    is_mvp boolean,
    is_finalized boolean,
    finalized_at timestamptz
  );

  get diagnostics v_inserted_rows = row_count;

  update public.games
  set
    status = 'completed',
    score_home = greatest(0, p_score_home),
    score_away = greatest(0, p_score_away)
  where id = p_game_id;

  if p_final_minute is not null then
    v_base_seconds := greatest(0, (greatest(1, p_final_minute) - 1) * 60);
  else
    select coalesce(max(greatest(0, coalesce(minutes_played, 0)) * 60), 0)
      into v_base_seconds
    from public.game_final_stats
    where game_id = p_game_id;
  end if;

  insert into public.game_live_checkpoints (
    game_id,
    phase,
    base_seconds,
    running_since_ms,
    updated_at,
    updated_by
  )
  values (
    p_game_id,
    'completed',
    v_base_seconds,
    null,
    v_now,
    p_updated_by
  )
  on conflict (game_id)
  do update
    set
      phase = excluded.phase,
      base_seconds = excluded.base_seconds,
      running_since_ms = excluded.running_since_ms,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  return jsonb_build_object(
    'insertedRows', v_inserted_rows,
    'baseSeconds', v_base_seconds
  );
end;
$$;

create or replace function public.rpc_recalculate_game_summary(
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
begin
  return public.rpc_finalize_game(
    p_game_id,
    p_rows,
    p_score_home,
    p_score_away,
    p_final_minute,
    p_updated_by
  );
end;
$$;

revoke all on function public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid) from public;
revoke all on function public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid) from anon;
revoke all on function public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid) from authenticated;
grant execute on function public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid) to service_role;

revoke all on function public.rpc_recalculate_game_summary(uuid, jsonb, integer, integer, integer, uuid) from public;
revoke all on function public.rpc_recalculate_game_summary(uuid, jsonb, integer, integer, integer, uuid) from anon;
revoke all on function public.rpc_recalculate_game_summary(uuid, jsonb, integer, integer, integer, uuid) from authenticated;
grant execute on function public.rpc_recalculate_game_summary(uuid, jsonb, integer, integer, integer, uuid) to service_role;
