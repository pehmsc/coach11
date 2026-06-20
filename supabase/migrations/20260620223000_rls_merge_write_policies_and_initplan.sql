-- =============================================================================
-- RLS Lote 2 — fusao dos pares PERMISSIVOS de escrita + initplan club_memberships
-- =============================================================================
-- Follow-up do PR #314 (consolidacao de leitura). Fecha dois avisos residuais do
-- advisor SEM impacto de performance no utilizador (comandos de escrita de baixa
-- frequencia + tabela de 9 linhas) -- objetivo: higiene/advisor-zero.
--
-- PRINCIPIO: para policies PERMISSIVE no mesmo comando, P1(qual=A,check=X) +
-- P2(qual=B,check=Y) e EXATAMENTE equivalente a uma unica policy com
-- qual=(A OR B) e with_check=(X OR Y). Aqui faz-se o OR FIEL dos predicados
-- (copia tal e qual, sem simplificar/fatorizar/limpar). Quando os dois predicados
-- sao identicos, o merge degenera para uma policy com esse predicado.
--
-- NAO ALTERAR (preservado tal e qual):
--  - Policies RESTRICTIVE *_domain_boundary_* (isolamento de clube).
--  - Funcoes user_can_* (continuam SECURITY DEFINER STABLE).
--  - O bypass de status pre-existente em games/training_sessions UPDATE: o ramo
--    *_update_v1 (user_can_write_age_group_scope, sem guard de status) ja contorna
--    o guard "nao editar jogo completed" do ramo *_staff_update_v1 -- porque
--    permissivas sao OR. O merge MANTEM isto. Corrigi-lo seria mudar a semantica
--    e esta FORA DE AMBITO.
--  - Roles de cada policy (todas as de escrita sao TO authenticated; a SELECT de
--    club_memberships e TO public).
--
-- Equivalencia provada por smoke matrix de escrita before==after (3 perfis): ver PR.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- games  (INSERT / UPDATE / DELETE)
-- -----------------------------------------------------------------------------
drop policy if exists games_insert_v1 on public.games;
drop policy if exists games_staff_insert_v1 on public.games;
create policy games_insert on public.games
  as permissive for insert to authenticated
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (
      (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
      and (exists (select 1 from teams t
            where t.id = games.team_id
              and (games.age_group_id is null or games.age_group_id = t.age_group_id)))
    )
  );

drop policy if exists games_update_v1 on public.games;
drop policy if exists games_staff_update_v1 on public.games;
create policy games_update on public.games
  as permissive for update to authenticated
  using (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (
      (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
      and ((coalesce(status, 'scheduled') <> 'completed')
        or ((team_id is not null) and user_is_team_coordinator(team_id))
        or ((age_group_id is not null) and user_is_age_group_coordinator(age_group_id)))
    )
  )
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (
      (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
      and ((coalesce(status, 'scheduled') <> 'completed')
        or ((team_id is not null) and user_is_team_coordinator(team_id))
        or ((age_group_id is not null) and user_is_age_group_coordinator(age_group_id)))
      and (exists (select 1 from teams t
            where t.id = games.team_id
              and (games.age_group_id is null or games.age_group_id = t.age_group_id)))
    )
  );

drop policy if exists games_delete_v1 on public.games;
drop policy if exists games_staff_delete_v1 on public.games;
create policy games_delete on public.games
  as permissive for delete to authenticated
  using (
    user_can_manage_age_group_v2(age_group_id)
    or (((team_id is not null) and user_is_team_coordinator(team_id))
        or ((age_group_id is not null) and user_is_age_group_coordinator(age_group_id)))
  );

-- -----------------------------------------------------------------------------
-- training_sessions  (INSERT / UPDATE / DELETE)
-- -----------------------------------------------------------------------------
drop policy if exists training_sessions_insert_v1 on public.training_sessions;
drop policy if exists training_sessions_staff_insert_v1 on public.training_sessions;
create policy training_sessions_insert on public.training_sessions
  as permissive for insert to authenticated
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (
      (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
      and (exists (select 1 from teams t
            where t.id = training_sessions.team_id
              and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)))
    )
  );

drop policy if exists training_sessions_update_v1 on public.training_sessions;
drop policy if exists training_sessions_staff_update_v1 on public.training_sessions;
create policy training_sessions_update on public.training_sessions
  as permissive for update to authenticated
  using (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
  )
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or (
      (((team_id is not null) and user_can_access_team(team_id))
        or ((age_group_id is not null) and user_can_access_age_group(age_group_id)))
      and (exists (select 1 from teams t
            where t.id = training_sessions.team_id
              and (training_sessions.age_group_id is null or training_sessions.age_group_id = t.age_group_id)))
    )
  );

drop policy if exists training_sessions_delete_v1 on public.training_sessions;
drop policy if exists training_sessions_staff_delete_v1 on public.training_sessions;
create policy training_sessions_delete on public.training_sessions
  as permissive for delete to authenticated
  using (
    user_can_manage_age_group_v2(age_group_id)
    or (((team_id is not null) and user_is_team_coordinator(team_id))
        or ((age_group_id is not null) and user_is_age_group_coordinator(age_group_id)))
  );

-- -----------------------------------------------------------------------------
-- competitions  (INSERT / UPDATE)  -- DELETE ja era unico apos #314, nao se toca
-- -----------------------------------------------------------------------------
drop policy if exists competitions_insert_v1 on public.competitions;
drop policy if exists competitions_staff_insert_v1 on public.competitions;
create policy competitions_insert on public.competitions
  as permissive for insert to authenticated
  with check (
    user_can_access_team(team_id)
    or (user_can_access_team(team_id)
        and (exists (select 1 from teams t
              where t.id = competitions.team_id and t.club_id = competitions.club_id)))
  );

drop policy if exists competitions_update_v1 on public.competitions;
drop policy if exists competitions_staff_update_v1 on public.competitions;
create policy competitions_update on public.competitions
  as permissive for update to authenticated
  using ( user_can_access_team(team_id) )  -- ambos os ramos USING eram identicos
  with check (
    user_can_access_team(team_id)
    or (user_can_access_team(team_id)
        and (exists (select 1 from teams t
              where t.id = competitions.team_id and t.club_id = competitions.club_id)))
  );

-- -----------------------------------------------------------------------------
-- kit_pieces  (INSERT / UPDATE / DELETE)
-- -----------------------------------------------------------------------------
drop policy if exists kit_pieces_insert_v1 on public.kit_pieces;
drop policy if exists kit_pieces_staff_insert_v1 on public.kit_pieces;
create policy kit_pieces_insert on public.kit_pieces
  as permissive for insert to authenticated
  with check (
    user_can_access_team(team_id)
    or (user_can_access_team(team_id)
        and (exists (select 1 from teams t
              where t.id = kit_pieces.team_id and t.club_id = kit_pieces.club_id)))
  );

drop policy if exists kit_pieces_update_v1 on public.kit_pieces;
drop policy if exists kit_pieces_staff_update_v1 on public.kit_pieces;
create policy kit_pieces_update on public.kit_pieces
  as permissive for update to authenticated
  using ( user_can_access_team(team_id) )  -- ambos os ramos USING eram identicos
  with check (
    user_can_access_team(team_id)
    or (user_can_access_team(team_id)
        and (exists (select 1 from teams t
              where t.id = kit_pieces.team_id and t.club_id = kit_pieces.club_id)))
  );

drop policy if exists kit_pieces_delete_v1 on public.kit_pieces;
drop policy if exists kit_pieces_staff_delete_v1 on public.kit_pieces;
create policy kit_pieces_delete on public.kit_pieces
  as permissive for delete to authenticated
  using ( user_can_access_team(team_id) );  -- duplicado exato -> policy unica

-- -----------------------------------------------------------------------------
-- players  (INSERT / UPDATE)  -- DELETE ja era unico, nao se toca
-- -----------------------------------------------------------------------------
drop policy if exists players_insert_v1 on public.players;
drop policy if exists players_staff_insert_v1 on public.players;
create policy players_insert on public.players
  as permissive for insert to authenticated
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or user_can_access_age_group(age_group_id)
  );

drop policy if exists players_update_v1 on public.players;
drop policy if exists players_staff_update_v1 on public.players;
create policy players_update on public.players
  as permissive for update to authenticated
  using (
    user_can_write_age_group_scope(age_group_id, club_id)
    or user_can_access_age_group(age_group_id)
  )
  with check (
    user_can_write_age_group_scope(age_group_id, club_id)
    or user_can_access_age_group(age_group_id)
  );

-- -----------------------------------------------------------------------------
-- training_attendance  (DELETE)  -- INSERT/UPDATE ja eram unicos, nao se tocam
-- -----------------------------------------------------------------------------
drop policy if exists training_attendance_delete_v1 on public.training_attendance;
drop policy if exists training_attendance_staff_delete_v1 on public.training_attendance;
create policy training_attendance_delete on public.training_attendance
  as permissive for delete to authenticated
  using (
    ((training_session_id is not null) and user_is_training_session_coordinator(training_session_id))
    or ((training_session_id is not null) and user_can_access_training_session_v2(training_session_id))
  );

-- -----------------------------------------------------------------------------
-- club_memberships — initplan: envolver auth.uid() em (select auth.uid())
-- (user_can_manage_club mantem-se tal e qual; roles TO public preservado.
--  Excecao registada na allowlist do guard: sql-club-wrapper-usage.)
-- -----------------------------------------------------------------------------
drop policy if exists club_memberships_self_or_admin_select_v1 on public.club_memberships;
create policy club_memberships_self_or_admin_select_v1 on public.club_memberships
  as permissive for select to public
  using ( (profile_id = (select auth.uid())) or user_can_manage_club(club_id) );

-- =============================================================================
-- ROLLBACK (reversao na cabeca — recria os pares _v1/_staff_v1 originais; nao executado)
-- O snapshot exato (qual/with_check) de cada policy original consta da descricao
-- do PR (Fase 1). Estrutura da reversao:
--   drop policy if exists games_insert on public.games;  (idem _update/_delete e
--   restantes tabelas)  e recriar games_insert_v1 + games_staff_insert_v1, etc.
--   club_memberships: recriar com (profile_id = auth.uid()) (sem o select-wrap).
-- =============================================================================
