-- Tightening RLS (furos reportados pela Fase 1 do Bloco D):
--
-- 1) athlete_intake_submissions: intake_select_auth / intake_update_auth
--    davam SELECT/UPDATE a qualquer autenticado de qualquer clube. A tabela
--    contem dados de menores externos ao clube (fichas publicas de intake)
--    e nao tem coluna de tenant — o unico revisor legitimo e o operador da
--    pagina standalone (public/admin.html). Passa a allowlist por email do
--    JWT (padrao Bloco A: initplan wrap + TO authenticated). O INSERT
--    anonimo do formulario publico (questionario.html, Prefer:
--    return=minimal) mantem-se intacto.
--    Higiene de GRANT: REVOKE dos privilegios que nenhuma superficie usa
--    (TRUNCATE nem sequer passa por RLS).
--
-- 2) staff_invites: drop das policies legacy largas
--    anyone_can_read_invite_by_code (SELECT a qualquer autenticado) e
--    authenticated_can_update_invite (UPDATE a qualquer autenticado, sem
--    with_check). Nenhum fluxo da app depende delas: a aceitacao e feita
--    pelas RPCs SECURITY DEFINER rpc_redeem_* e as leituras de sessao sao
--    cobertas por staff_invites_select_v1 (escalao ou email do JWT).
--
-- 3) get_staff_invite_by_code: RPC SECURITY DEFINER estreita para o ecra de
--    aceitacao pre-login (/api/invite/info deixa de usar admin client).
--    Devolve apenas os campos do ecra, com quem convidou reduzido ao
--    primeiro nome (RGPD) e convites em qualquer status — o ecra pre-login
--    precisa do estado real (revogado/expirado incluidos).

-- 1) athlete_intake_submissions ---------------------------------------------

drop policy if exists "intake_select_auth" on public.athlete_intake_submissions;
drop policy if exists "intake_update_auth" on public.athlete_intake_submissions;

create policy "intake_select_reviewer" on public.athlete_intake_submissions
  for select to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) in
      ('pehmsc@gmail.com', 'pedro.campos@befirstrs.com')
  );

create policy "intake_update_reviewer" on public.athlete_intake_submissions
  for update to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) in
      ('pehmsc@gmail.com', 'pedro.campos@befirstrs.com')
  )
  with check (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) in
      ('pehmsc@gmail.com', 'pedro.campos@befirstrs.com')
  );

revoke delete, truncate, references, trigger
  on public.athlete_intake_submissions
  from anon, authenticated;

-- 2) staff_invites -----------------------------------------------------------

drop policy if exists "anyone_can_read_invite_by_code" on public.staff_invites;
drop policy if exists "authenticated_can_update_invite" on public.staff_invites;

-- 3) RPC de lookup pre-login por codigo --------------------------------------

drop function if exists public.get_staff_invite_by_code(text);

create function public.get_staff_invite_by_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'club_name', coalesce(ag.club_name, c.name),
    'age_group_name', ag.name,
    'role', si.role,
    'status', si.status,
    'invited_by_name', nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), '')
  )
  from public.staff_invites si
  left join public.age_groups ag on ag.id = si.age_group_id
  left join public.clubs c on c.id = si.club_id
  left join public.profiles pr on pr.id = si.invited_by
  where upper(trim(si.invite_code)) = upper(trim(coalesce(p_code, '')))
  limit 1;
$$;

revoke all on function public.get_staff_invite_by_code(text) from public;
grant execute on function public.get_staff_invite_by_code(text)
  to anon, authenticated;
