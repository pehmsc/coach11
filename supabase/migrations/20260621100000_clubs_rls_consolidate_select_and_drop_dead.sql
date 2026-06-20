-- =============================================================================
-- clubs RLS — consolidacao do SELECT (preservando filiacao) + remocao de policy morta
-- =============================================================================
-- `clubs` foi excluida do #314 por divergencia semantica e por nao ter policy
-- RESTRICTIVE de rede. Este micro-PR trata-a isoladamente. NAO e performance
-- (tabela de poucas linhas, fora do caminho quente) -- e correcao + higiene.
--
-- DECISAO DE PRODUTO (Pedro): um membro de um clube AINDA SEM ESCALAO deve
-- continuar a ver o proprio clube. Onboarding = criar clube -> adicionar membro
-- -> ainda sem escalao. Logo a consolidacao PRESERVA o ramo de filiacao.
--
-- NAO ALTERAR / fora de ambito:
--  - Nao adicionar policy RESTRICTIVE de isolamento a clubs (decisao arquitetural
--    separada; aqui so consolidamos o que existe).
--  - Nao alterar role das policies que ficam (clubs_member_update_v1 mantem-se
--    TO public, tal e qual).
--  - Funcoes user_can_* intactas (SECURITY DEFINER STABLE).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ETAPA A — consolidar as 3 SELECT sobrepostas numa policy (OR fiel das vivas)
-- Hoje, a uniao das 3 SELECT = filiacao OR user_can_access_club. O 2o ramo de
-- `clubs_select_member` -- EXISTS(age_groups WHERE ag.club_id = ag.id ...) -- e
-- MORTO (compara club_id do escalao com o id do proprio escalao; praticamente
-- nunca verdadeiro) e e descartado sem perda de acesso.
-- -----------------------------------------------------------------------------
drop policy if exists club_members_can_read on public.clubs;
drop policy if exists clubs_member_select_v1 on public.clubs;
drop policy if exists clubs_select_member on public.clubs;

create policy clubs_select on public.clubs
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.club_memberships cm
      where cm.club_id = clubs.id
        and cm.profile_id = (select auth.uid())
    )
    or user_can_access_club(id)
  );

-- -----------------------------------------------------------------------------
-- ETAPA B — remover policy UPDATE morta
-- `club_admins_can_update` filtra por role = 'admin', que nao existe (so existem
-- staff / club_coordinator / age_group_coordinator). O UPDATE legitimo continua
-- coberto por `clubs_member_update_v1` (user_can_manage_club), que NAO se toca.
-- -----------------------------------------------------------------------------
drop policy if exists club_admins_can_update on public.clubs;

-- =============================================================================
-- ROLLBACK (reversao na cabeca; nao executado) — recria o estado anterior:
-- -- ETAPA B:
-- create policy club_admins_can_update on public.clubs
--   as permissive for update to authenticated
--   using (exists (select 1 from club_memberships
--     where club_memberships.club_id = clubs.id
--       and club_memberships.profile_id = (select auth.uid())
--       and club_memberships.role = 'admin'));
-- -- ETAPA A:
-- drop policy if exists clubs_select on public.clubs;
-- create policy club_members_can_read on public.clubs
--   as permissive for select to authenticated
--   using (exists (select 1 from club_memberships
--     where club_memberships.club_id = clubs.id
--       and club_memberships.profile_id = (select auth.uid())));
-- create policy clubs_member_select_v1 on public.clubs
--   as permissive for select to public using (user_can_access_club(id));
-- create policy clubs_select_member on public.clubs
--   as permissive for select to authenticated
--   using ((exists (select 1 from club_memberships cm
--             where cm.club_id = clubs.id and cm.profile_id = (select auth.uid())))
--          or (exists (select 1 from age_groups ag
--             where ag.club_id = ag.id and ag.coordinator_id = (select auth.uid()))));
-- =============================================================================
