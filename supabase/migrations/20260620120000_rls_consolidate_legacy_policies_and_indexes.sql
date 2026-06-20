-- =============================================================================
-- Consolidação de policies RLS + índices nas tabelas quentes (performance SSR)
-- =============================================================================
-- Contexto: o TTFB residual (~350-450 ms quente) é trabalho de query real. O
-- EXPLAIN às tabelas quentes mostrava o planner a gastar mais tempo a planear que
-- a executar — sintoma de predicado RLS inchado. Em `games`/`training_sessions`
-- coexistiam policies PERMISSIVAS legadas (pré-club-first) com o conjunto `_v1`,
-- gerando ~30 InitPlans e vários SubPlans repetidos (nested loops sobre
-- age_groups/teams/team_staff) por cada SELECT.
--
-- Esta migração remove a redundância PERMISSIVA SEM alterar a semântica de acesso
-- e adiciona índices nas colunas de filtro/FK. As policies RESTRICTIVE
-- (`*_domain_boundary_*`, isolamento de clube) NÃO são tocadas — são elas que,
-- estando AND-ed e a exigir `user_can_access_team`/`user_can_access_age_group`,
-- tornam as legadas comprovadamente redundantes (qualquer grant permissivo é
-- intersectado com elas).
--
-- Prova de equivalência (smoke tests before/after, 3 perfis, escrita negada) e
-- EXPLAIN before/after: ver descrição do PR.
--
-- NOTA DE ÂMBITO: a tabela `clubs` foi DELIBERADAMENTE EXCLUÍDA. Aí as legadas
-- concedem mais que as `_v1` (membro de clube sem escalão; `user_can_access_club`
-- exige >=1 escalão) e `clubs` não tem policy RESTRICTIVE de rede — pelo que
-- remover as legadas seria uma alteração real de acesso. Fica para micro-PR próprio.
--
-- Reversibilidade: ver bloco "ROLLBACK" no fim deste ficheiro (recria o estado
-- anterior exato a partir do snapshot da Fase 1).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ETAPA A — Remover policies PERMISSIVAS legadas (humanas, pré-club-first)
-- (9 tabelas; `clubs` excluída por decisão de âmbito)
-- -----------------------------------------------------------------------------

-- games
drop policy if exists "Age group access games" on public.games;
drop policy if exists "Team access games" on public.games;

-- training_sessions
drop policy if exists "Age group access training sessions" on public.training_sessions;
drop policy if exists "Team access training_sessions" on public.training_sessions;

-- competitions
drop policy if exists "Team access competitions" on public.competitions;

-- kit_pieces
drop policy if exists "Team access kits" on public.kit_pieces;

-- players
drop policy if exists "Player access" on public.players;

-- staff_invites
drop policy if exists "Coordinator manages invites" on public.staff_invites;
drop policy if exists "coordinator_can_delete_invite" on public.staff_invites;
drop policy if exists "coordinator_can_insert_invite" on public.staff_invites;
drop policy if exists "coordinator_can_manage_invites" on public.staff_invites;

-- team_staff
-- (`authenticated_can_insert_staff` é neutralizada pela RESTRICTIVE
--  team_staff_domain_boundary_v2 e pelo trigger guard_team_staff_projection_only;
--  team_staff é projeção de age_group_staff — inserts diretos já são negados.)
drop policy if exists "coordinator_can_delete_staff" on public.team_staff;
drop policy if exists "authenticated_can_insert_staff" on public.team_staff;
drop policy if exists "coordinator_can_view_staff" on public.team_staff;
drop policy if exists "staff_can_view_own" on public.team_staff;

-- -----------------------------------------------------------------------------
-- ETAPA B — Remover policies PERMISSIVAS `_v1` redundantes (duplicado exato /
-- subsumido por outra `_v1` retida). Apenas DROPs — nenhuma policy nova criada.
-- -----------------------------------------------------------------------------

-- games: `games_select_v1` (user_can_access_age_group) é subsumido pelo ramo
-- age_group de `games_staff_select_v1` (que se mantém).
drop policy if exists games_select_v1 on public.games;

-- training_sessions: idem (mantém-se training_sessions_staff_select_v1).
drop policy if exists training_sessions_select_v1 on public.training_sessions;

-- competitions: par SELECT/DELETE com predicado idêntico (user_can_access_team).
-- Mantêm-se competitions_select_v1 e competitions_delete_v1.
drop policy if exists competitions_staff_select_v1 on public.competitions;
drop policy if exists competitions_staff_delete_v1 on public.competitions;

-- players: par SELECT idêntico (user_can_access_age_group). Mantém-se players_select_v1.
drop policy if exists players_staff_select_v1 on public.players;

-- kit_pieces: par SELECT idêntico (user_can_access_team). Mantém-se kit_pieces_select_v1.
drop policy if exists kit_pieces_staff_select_v1 on public.kit_pieces;

-- -----------------------------------------------------------------------------
-- ETAPA B4 — club_memberships: remover policy SELECT subsumida.
-- (A optimização initplan auth.uid() -> (select auth.uid()) na
--  club_memberships_self_or_admin_select_v1 foi DEIXADA DE FORA: tocá-la obrigaria
--  a reescrever o helper de club no ficheiro, o que o guard de arquitectura bloqueia
--  (sql-club-wrapper-usage — decommission ativo dos club-wrappers). Ganho marginal
--  numa tabela de ~9 linhas; não justifica excepção ao guard.)
-- -----------------------------------------------------------------------------

-- `club_memberships_own_select` (profile_id = (select auth.uid())) é subsumida por
-- `club_memberships_self_or_admin_select_v1`, que se mantém intacta (já contém o
-- mesmo ramo profile_id = utilizador).
drop policy if exists club_memberships_own_select on public.club_memberships;

-- -----------------------------------------------------------------------------
-- ETAPA C — Índices (btree) nas colunas de filtro/FK das tabelas quentes.
-- `create index if not exists` (não-concurrent) — tabelas pequenas, lock irrelevante,
-- e corre dentro da transação da migração (concurrently não correria).
-- Ignoram-se FKs frias (kits/ground/jersey) para não gerar "unused index".
-- -----------------------------------------------------------------------------

create index if not exists games_age_group_id_idx
  on public.games (age_group_id);
create index if not exists games_team_id_idx
  on public.games (team_id);
create index if not exists games_competition_id_idx
  on public.games (competition_id);

create index if not exists training_sessions_age_group_id_idx
  on public.training_sessions (age_group_id);
create index if not exists training_sessions_team_id_idx
  on public.training_sessions (team_id);

create index if not exists players_age_group_id_idx
  on public.players (age_group_id);

create index if not exists competitions_team_id_idx
  on public.competitions (team_id);

create index if not exists pse_records_player_id_idx
  on public.pse_records (player_id);
create index if not exists pse_records_training_session_id_idx
  on public.pse_records (training_session_id);

-- =============================================================================
-- ROLLBACK (reversão na cabeça — recria o estado anterior exato; não executado)
-- =============================================================================
-- -- Índices:
-- drop index if exists public.games_age_group_id_idx;
-- drop index if exists public.games_team_id_idx;
-- drop index if exists public.games_competition_id_idx;
-- drop index if exists public.training_sessions_age_group_id_idx;
-- drop index if exists public.training_sessions_team_id_idx;
-- drop index if exists public.players_age_group_id_idx;
-- drop index if exists public.competitions_team_id_idx;
-- drop index if exists public.pse_records_player_id_idx;
-- drop index if exists public.pse_records_training_session_id_idx;
--
-- -- ETAPA B4 (recriar a policy subsumida):
-- create policy club_memberships_own_select on public.club_memberships
--   as permissive for select to authenticated
--   using (profile_id = (select auth.uid()));
--
-- -- ETAPA B (recriar duplicados):
-- create policy games_select_v1 on public.games
--   as permissive for select to authenticated
--   using (public.user_can_access_age_group(age_group_id));
-- create policy training_sessions_select_v1 on public.training_sessions
--   as permissive for select to authenticated
--   using (public.user_can_access_age_group(age_group_id));
-- create policy competitions_staff_select_v1 on public.competitions
--   as permissive for select to authenticated
--   using (public.user_can_access_team(team_id));
-- create policy competitions_staff_delete_v1 on public.competitions
--   as permissive for delete to authenticated
--   using (public.user_can_access_team(team_id));
-- create policy players_staff_select_v1 on public.players
--   as permissive for select to authenticated
--   using (public.user_can_access_age_group(age_group_id));
-- create policy kit_pieces_staff_select_v1 on public.kit_pieces
--   as permissive for select to authenticated
--   using (public.user_can_access_team(team_id));
--
-- -- ETAPA A (recriar legadas): ver snapshot completo (qual/with_check) na
-- -- descrição do PR — omitido aqui por extensão. As definições constam do
-- -- relatório da Fase 1 (pg_policies).
-- =============================================================================
