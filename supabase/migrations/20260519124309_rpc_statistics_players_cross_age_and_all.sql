-- Estende rpc_statistics_players para suportar dois cenarios novos:
--
-- 1. Modo "Todos os escaloes": quando p_age_group_id IS NULL, agregar de
--    todos os escaloes acessiveis ao user via user_can_access_age_group_v2.
--
-- 2. Cross-age stats no escalao de origem: v_game_ids inclui agora jogos
--    onde atletas do escalao alvo participaram emprestados a outros
--    escaloes (via EXISTS public.game_squads). Resultado: golos sofridos
--    e outras stats de jogos cross-age contam para o escalao de origem
--    do atleta (mecanica federativa).
--
-- v_final_stats ja filtrava por player_id (capta automaticamente
-- cross-age via game_final_stats). v_game_events agora filtra por
-- game_id IN v_game_ids (que inclui cross-age), permitindo ao frontend
-- atribuir GS aos players certos via cross-reference player_id.

CREATE OR REPLACE FUNCTION public.rpc_statistics_players(p_age_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
  v_has_access boolean := false;
  v_accessible_age_group_ids uuid[] := '{}'::uuid[];
  v_target_age_group_ids uuid[] := '{}'::uuid[];
  v_players jsonb := '[]'::jsonb;
  v_player_ids uuid[] := '{}'::uuid[];
  v_session_ids uuid[] := '{}'::uuid[];
  v_game_ids uuid[] := '{}'::uuid[];
  v_convocation_ids uuid[] := '{}'::uuid[];
  v_attendance_rows jsonb := '[]'::jsonb;
  v_final_stats jsonb := '[]'::jsonb;
  v_convocations jsonb := '[]'::jsonb;
  v_convocation_players jsonb := '[]'::jsonb;
  v_game_events jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error_code', 'not_authenticated');
  end if;

  -- 1) Resolver lista de escaloes alvo:
  --    - p_age_group_id NULL: todos os escaloes acessiveis ao user
  --    - p_age_group_id !=NULL: so esse escalao (com check de acesso)
  if p_age_group_id is null then
    select coalesce(array_agg(ag.id), '{}'::uuid[])
      into v_accessible_age_group_ids
    from public.age_groups ag
    where public.user_can_access_age_group_v2(ag.id);

    if cardinality(v_accessible_age_group_ids) = 0 then
      return jsonb_build_object(
        'ok', true,
        'players', '[]'::jsonb,
        'attendanceRows', '[]'::jsonb,
        'finalStats', '[]'::jsonb,
        'convocations', '[]'::jsonb,
        'convocationPlayers', '[]'::jsonb,
        'gameIds', '[]'::jsonb,
        'gameEvents', '[]'::jsonb
      );
    end if;

    v_target_age_group_ids := v_accessible_age_group_ids;
  else
    select public.user_can_access_age_group_v2(p_age_group_id)
      into v_has_access;

    if not v_has_access then
      return jsonb_build_object('ok', false, 'error_code', 'forbidden');
    end if;

    v_target_age_group_ids := array[p_age_group_id];
  end if;

  -- 2) Atletas dos escaloes alvo
  select
    coalesce(jsonb_agg(to_jsonb(p) order by p.first_name asc, p.last_name asc), '[]'::jsonb),
    coalesce(array_agg(p.id), '{}'::uuid[])
  into v_players, v_player_ids
  from public.players p
  where p.age_group_id = any(v_target_age_group_ids)
    and p.status = 'active';

  -- 3) Training sessions
  select coalesce(array_agg(ts.id), '{}'::uuid[])
    into v_session_ids
  from public.training_sessions ts
  where ts.age_group_id = any(v_target_age_group_ids);

  -- 4) Attendance
  if cardinality(v_session_ids) > 0 and cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'player_id', ta.player_id,
          'status', ta.status
        )
      ),
      '[]'::jsonb
    )
    into v_attendance_rows
    from public.training_attendance ta
    where ta.training_session_id = any(v_session_ids)
      and ta.player_id = any(v_player_ids);
  end if;

  -- 5) Final stats — filtra por player_id, captura automaticamente cross-age
  if cardinality(v_player_ids) > 0 then
    select coalesce(
      jsonb_agg(to_jsonb(fs)),
      '[]'::jsonb
    )
    into v_final_stats
    from (
      select
        gfs.player_id,
        gfs.goals,
        gfs.own_goals,
        gfs.assists,
        gfs.minutes_played,
        gfs.lineup_type,
        gfs.yellow_cards,
        gfs.red_cards,
        gfs.coach_rating,
        gfs.is_mvp,
        gfs.is_finalized,
        gfs.game_id
      from public.game_final_stats gfs
      where gfs.player_id = any(v_player_ids)
        and gfs.is_finalized = true
    ) fs;
  end if;

  -- 6) Game IDs: jogos do(s) escalao(oes) alvo + jogos cross-age onde
  --    atletas do escalao participaram emprestados a outros escaloes
  if cardinality(v_player_ids) > 0 then
    select coalesce(array_agg(distinct g.id), '{}'::uuid[])
      into v_game_ids
    from public.games g
    where (
      g.age_group_id = any(v_target_age_group_ids)
    )
      or exists (
        select 1
        from public.game_squads gs
        where gs.game_id = g.id
          and gs.player_id = any(v_player_ids)
      );
  end if;

  -- 7) Convocations legacy + game events
  if cardinality(v_game_ids) > 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'game_id', c.game_id
        )
      ),
      '[]'::jsonb
    )
    into v_convocations
    from public.convocations c
    where c.game_id = any(v_game_ids);

    select coalesce(array_agg(c.id), '{}'::uuid[])
      into v_convocation_ids
    from public.convocations c
    where c.game_id = any(v_game_ids);

    if cardinality(v_convocation_ids) > 0 and cardinality(v_player_ids) > 0 then
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'player_id', cp.player_id,
            'convocation_id', cp.convocation_id
          )
        ),
        '[]'::jsonb
      )
      into v_convocation_players
      from public.convocation_players cp
      where cp.convocation_id = any(v_convocation_ids)
        and cp.player_id = any(v_player_ids);
    end if;

    -- Game events: filtra por game_id (todos os jogos onde atletas
    -- participaram incluindo cross-age). Frontend cruza ge.player_id com
    -- v_player_ids para atribuir golos correctos.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'game_id', ge.game_id,
          'player_id', ge.player_id,
          'event_type', ge.event_type,
          'is_opponent_event', ge.is_opponent_event
        )
      ),
      '[]'::jsonb
    )
    into v_game_events
    from public.game_events ge
    where ge.game_id = any(v_game_ids)
      and ge.event_type = any(array['goal', 'penalty_goal', 'own_goal']);
  end if;

  return jsonb_build_object(
    'ok', true,
    'players', v_players,
    'attendanceRows', v_attendance_rows,
    'finalStats', v_final_stats,
    'convocations', v_convocations,
    'convocationPlayers', v_convocation_players,
    'gameIds', to_jsonb(v_game_ids),
    'gameEvents', v_game_events
  );
end;
$$;
