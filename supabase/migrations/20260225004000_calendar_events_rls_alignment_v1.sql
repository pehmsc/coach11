-- C7: alinhamento RLS para calendar/events em server client + cascades de delete.
-- Objetivos:
-- 1) manter modelo age_group-first intra-clube para leitura/edição de calendário;
-- 2) permitir deletes coordenador com cascades sem service_role;
-- 3) manter boundary cross-club via policies RESTRICTIVE *_club_boundary_v1 já existentes.

create or replace function public.user_is_training_session_coordinator(p_training_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.training_sessions ts
    where ts.id = p_training_session_id
      and public.user_can_access_club(ts.club_id)
      and (
        (ts.team_id is not null and public.user_is_team_coordinator(ts.team_id))
        or (ts.age_group_id is not null and public.user_is_age_group_coordinator(ts.age_group_id))
      )
  );
$$;

-- training_sessions: age_group-first (sem quebrar consistência team<->age_group)
drop policy if exists training_sessions_staff_select_v1 on public.training_sessions;
create policy training_sessions_staff_select_v1
on public.training_sessions
for select
to authenticated
using (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
);

drop policy if exists training_sessions_staff_insert_v1 on public.training_sessions;
create policy training_sessions_staff_insert_v1
on public.training_sessions
for insert
to authenticated
with check (
  (
    (team_id is not null and public.user_can_access_team(team_id))
    or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
  )
  and exists (
    select 1
    from public.teams t
    where t.id = training_sessions.team_id
      and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)
  )
);

drop policy if exists training_sessions_staff_update_v1 on public.training_sessions;
create policy training_sessions_staff_update_v1
on public.training_sessions
for update
to authenticated
using (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
)
with check (
  (
    (team_id is not null and public.user_can_access_team(team_id))
    or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
  )
  and exists (
    select 1
    from public.teams t
    where t.id = training_sessions.team_id
      and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)
  )
);

drop policy if exists training_sessions_staff_delete_v1 on public.training_sessions;
create policy training_sessions_staff_delete_v1
on public.training_sessions
for delete
to authenticated
using (
  (team_id is not null and public.user_is_team_coordinator(team_id))
  or (age_group_id is not null and public.user_is_age_group_coordinator(age_group_id))
);

-- games: age_group-first (mantendo regra completed => coordinator)
drop policy if exists games_staff_select_v1 on public.games;
create policy games_staff_select_v1
on public.games
for select
to authenticated
using (
  (team_id is not null and public.user_can_access_team(team_id))
  or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
);

drop policy if exists games_staff_insert_v1 on public.games;
create policy games_staff_insert_v1
on public.games
for insert
to authenticated
with check (
  (
    (team_id is not null and public.user_can_access_team(team_id))
    or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
  )
  and exists (
    select 1
    from public.teams t
    where t.id = games.team_id
      and (games.age_group_id is null or games.age_group_id = t.age_group_id)
  )
);

drop policy if exists games_staff_update_v1 on public.games;
create policy games_staff_update_v1
on public.games
for update
to authenticated
using (
  (
    (team_id is not null and public.user_can_access_team(team_id))
    or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
  )
  and (
    coalesce(status, 'scheduled') <> 'completed'
    or (team_id is not null and public.user_is_team_coordinator(team_id))
    or (age_group_id is not null and public.user_is_age_group_coordinator(age_group_id))
  )
)
with check (
  (
    (team_id is not null and public.user_can_access_team(team_id))
    or (age_group_id is not null and public.user_can_access_age_group(age_group_id))
  )
  and (
    coalesce(status, 'scheduled') <> 'completed'
    or (team_id is not null and public.user_is_team_coordinator(team_id))
    or (age_group_id is not null and public.user_is_age_group_coordinator(age_group_id))
  )
  and exists (
    select 1
    from public.teams t
    where t.id = games.team_id
      and (games.age_group_id is null or games.age_group_id = t.age_group_id)
  )
);

drop policy if exists games_staff_delete_v1 on public.games;
create policy games_staff_delete_v1
on public.games
for delete
to authenticated
using (
  (team_id is not null and public.user_is_team_coordinator(team_id))
  or (age_group_id is not null and public.user_is_age_group_coordinator(age_group_id))
);

-- Deletes de domínio live/convocation necessários para delete cascade de jogos.
drop policy if exists convocations_write_delete_v1 on public.convocations;
create policy convocations_write_delete_v1
on public.convocations
for delete
to authenticated
using (public.user_is_game_coordinator(game_id));

drop policy if exists game_live_checkpoints_write_delete_v1 on public.game_live_checkpoints;
create policy game_live_checkpoints_write_delete_v1
on public.game_live_checkpoints
for delete
to authenticated
using (public.user_is_game_coordinator(game_id));

drop policy if exists game_stats_live_write_delete_v1 on public.game_stats_live;
create policy game_stats_live_write_delete_v1
on public.game_stats_live
for delete
to authenticated
using (public.user_is_game_coordinator(game_id));

drop policy if exists game_final_stats_write_delete_v1 on public.game_final_stats;
create policy game_final_stats_write_delete_v1
on public.game_final_stats
for delete
to authenticated
using (public.user_is_game_coordinator(game_id));

-- Deletes de presença/sessão: criar dinamicamente para compatibilidade com schemas legacy.
do $$
declare
  v_expr text := null;
begin
  if to_regclass('public.training_attendance') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'training_attendance' and column_name = 'training_session_id'
    ) then
      v_expr := '(training_session_id is not null and public.user_is_training_session_coordinator(training_session_id))';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'training_attendance' and column_name = 'session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(session_id is not null and public.user_is_training_session_coordinator(session_id))';
    end if;

    if v_expr is null then
      v_expr := 'false';
    end if;

    execute 'drop policy if exists training_attendance_delete_v1 on public.training_attendance';
    execute format(
      'create policy training_attendance_delete_v1 on public.training_attendance for delete to authenticated using (%s)',
      v_expr
    );
  end if;

  v_expr := null;
  if to_regclass('public.attendance_records') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'attendance_records' and column_name = 'training_session_id'
    ) then
      v_expr := '(training_session_id is not null and public.user_is_training_session_coordinator(training_session_id))';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'attendance_records' and column_name = 'session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(session_id is not null and public.user_is_training_session_coordinator(session_id))';
    end if;

    if v_expr is null then
      v_expr := 'false';
    end if;

    execute 'drop policy if exists attendance_records_delete_v1 on public.attendance_records';
    execute format(
      'create policy attendance_records_delete_v1 on public.attendance_records for delete to authenticated using (%s)',
      v_expr
    );
  end if;

  v_expr := null;
  if to_regclass('public.pse_records') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pse_records' and column_name = 'game_id'
    ) then
      v_expr := '(game_id is not null and public.user_is_game_coordinator(game_id))';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(training_session_id is not null and public.user_is_training_session_coordinator(training_session_id))';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pse_records' and column_name = 'session_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(session_id is not null and public.user_is_training_session_coordinator(session_id))';
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pse_records' and column_name = 'training_id'
    ) then
      v_expr := coalesce(v_expr || ' or ', '') ||
        '(training_id is not null and public.user_is_training_session_coordinator(training_id))';
    end if;

    if v_expr is null then
      v_expr := 'false';
    end if;

    execute 'drop policy if exists pse_records_delete_v1 on public.pse_records';
    execute format(
      'create policy pse_records_delete_v1 on public.pse_records for delete to authenticated using (%s)',
      v_expr
    );
  end if;
end $$;
