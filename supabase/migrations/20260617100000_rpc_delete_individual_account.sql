-- Eliminacao de conta de treinador individual: passo final da cascata total.
--
-- A purga de dados (escaloes, equipas, jogos, treinos, atletas, storage) corre
-- ANTES, em TS, reutilizando purgeClubData (a mesma logica testada do DELETE
-- /api/club e do cron de purga RGPD). Esta RPC remove apenas o que essa purga
-- deixa de proposito: a linha de clubs (e as invoices, que sao RESTRICT).
--
-- Seguranca:
--  * Deriva o clube do utilizador autenticado a partir de auth.uid() via
--    club_memberships (criada no onboarding com role 'club_coordinator').
--    NUNCA aceita um club_id vindo do cliente.
--  * So actua sobre plan_type='individual' (o tier clube nunca se auto-elimina).
--  * Aborta se ainda existir um escalao no clube (a purga tem de ter corrido),
--    em vez de deixar rebentar o erro cru do FK RESTRICT age_groups.club_id.
--  * SECURITY DEFINER para ultrapassar RLS no DELETE, mas com guarda propria de
--    ownership/plan_type (GRANT e RLS sao camadas independentes).

drop function if exists public.rpc_delete_individual_account();

create function public.rpc_delete_individual_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_club_id uuid;
  v_plan_type text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Derivar o clube do proprio utilizador (membership de coordenador de clube).
  select cm.club_id into v_club_id
  from public.club_memberships cm
  where cm.profile_id = v_uid
    and cm.role = 'club_coordinator'
  order by cm.created_at asc
  limit 1;

  if v_club_id is null then
    raise exception 'no_owned_club';
  end if;

  select c.plan_type into v_plan_type
  from public.clubs c
  where c.id = v_club_id;

  if v_plan_type is null then
    raise exception 'club_not_found';
  end if;

  if v_plan_type is distinct from 'individual' then
    -- Defesa em profundidade: contas de clube sao geridas por backoffice.
    raise exception 'not_individual_account';
  end if;

  -- A purga de dados tem de ter corrido antes (age_groups.club_id e RESTRICT).
  if exists (select 1 from public.age_groups ag where ag.club_id = v_club_id) then
    raise exception 'age_groups_present';
  end if;

  -- Faturacao: invoices.club_id e RESTRICT (retencao legal no tier clube). No
  -- tier individual a fatura fiscal vive no Stripe e esta tabela esta vazia;
  -- remover liberta o RESTRICT para apagar a linha de clubs.
  delete from public.invoices where club_id = v_club_id;

  -- game_squads.club_id e NO ACTION; a purga ja os removeu via cascata de
  -- games, mas garantir antes de apagar a linha de clubs (defensivo).
  delete from public.game_squads where club_id = v_club_id;

  -- Apagar a linha de clubs cascateia o restante club-direct (club_memberships,
  -- team_staff, age_group_categories, exercises/opponents de clube, etc.).
  delete from public.clubs where id = v_club_id;

  return jsonb_build_object('club_id', v_club_id, 'deleted', true);
end;
$$;

-- Postgres concede EXECUTE a PUBLIC por omissao e o Supabase concede ainda a
-- anon via default privileges. Revogar ambos e conceder so a authenticated,
-- como nas restantes RPCs sensiveis (ex: create_club_onboarding). GRANT e RLS
-- sao camadas independentes.
revoke execute on function public.rpc_delete_individual_account() from public;
revoke execute on function public.rpc_delete_individual_account() from anon;
grant execute on function public.rpc_delete_individual_account() to authenticated;
