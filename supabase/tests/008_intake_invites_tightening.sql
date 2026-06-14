-- Asserção 8 (micro-PR tightening intake/staff_invites).
-- intake: só a allowlist de revisores lê/actualiza; outros autenticados
-- veem 0 linhas. staff_invites: sem as policies largas, autenticado de
-- outro clube não lê nem actualiza convite alheio; o email convidado
-- continua a ver o próprio convite (pre-lookup do redeem); a RPC
-- get_staff_invite_by_code serve o ecrã pré-login em qualquer status
-- sem expor dados pessoais do convidado.

begin;
select plan(36);

-- seeds (como postgres)
insert into public.athlete_intake_submissions (id, first_name)
values ('11000000-0000-4000-8000-000000000101', 'Atleta Sensivel');

insert into public.staff_invites
  (id, age_group_id, club_id, invited_by, first_name, last_name, email,
   invite_code, role, status)
values
  ('12000000-0000-4000-8000-000000000102',
   'e1000000-0000-4000-8000-000000000006',
   'c1000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000001',
   'Convidado', 'Novo', 'convidado.novo@coach11.test',
   'TIGHT001', 'head_coach', 'pending'),
  ('13000000-0000-4000-8000-000000000103',
   'e1000000-0000-4000-8000-000000000006',
   'c1000000-0000-4000-8000-000000000004',
   'a1000000-0000-4000-8000-000000000001',
   'Convidado', 'Revogado', 'convidado.revogado@coach11.test',
   'TIGHT002', 'head_coach', 'revoked');

-- como B1 (coordenador do clube Y): intake invisivel e imutavel
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"b1@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.athlete_intake_submissions),
  0,
  'autenticado fora da allowlist le 0 fichas de intake');

select lives_ok(
  $$update public.athlete_intake_submissions
       set reviewed = true
     where id = '11000000-0000-4000-8000-000000000101'$$,
  'UPDATE de intake fora da allowlist nao da erro (GRANT passa, RLS filtra)');

-- como B1: convite do clube X invisivel e imutavel
select is(
  (select count(*)::int from public.staff_invites
    where invite_code = 'TIGHT001'),
  0,
  'B1 NAO le o convite do clube X por codigo');

select lives_ok(
  $$update public.staff_invites
       set status = 'accepted',
           accepted_by = 'b1000000-0000-4000-8000-000000000003'
     where invite_code = 'TIGHT001'$$,
  'UPDATE de convite alheio nao da erro (GRANT passa, RLS filtra)');

-- como postgres: provar que nada mudou
reset role;

select is(
  (select reviewed from public.athlete_intake_submissions
    where id = '11000000-0000-4000-8000-000000000101'),
  false,
  'ficha de intake continua por rever apos a tentativa de B1');

select is(
  (select status from public.staff_invites
    where invite_code = 'TIGHT001'),
  'pending',
  'convite do clube X continua pending apos a tentativa de B1');

-- como revisor allowlisted (pehmsc@gmail.com)
select set_config('request.jwt.claims',
  '{"sub":"ee000000-0000-4000-8000-000000000201","role":"authenticated","email":"pehmsc@gmail.com"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.athlete_intake_submissions
    where id = '11000000-0000-4000-8000-000000000101'),
  1,
  'revisor allowlisted (pehmsc) le a ficha de intake');

select lives_ok(
  $$update public.athlete_intake_submissions
       set reviewed = true, reviewed_at = now()
     where id = '11000000-0000-4000-8000-000000000101'$$,
  'revisor allowlisted executa UPDATE da ficha');

-- como postgres: o UPDATE do revisor produziu efeito
reset role;

select is(
  (select reviewed from public.athlete_intake_submissions
    where id = '11000000-0000-4000-8000-000000000101'),
  true,
  'ficha de intake ficou marcada como revista pelo revisor');

-- como segundo email da allowlist (pedro.campos@befirstrs.com)
select set_config('request.jwt.claims',
  '{"sub":"ee000000-0000-4000-8000-000000000202","role":"authenticated","email":"pedro.campos@befirstrs.com"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.athlete_intake_submissions),
  1,
  'revisor allowlisted (befirstrs) le as fichas de intake');

-- como o email convidado: ve o proprio convite (pre-lookup do redeem)
reset role;
select set_config('request.jwt.claims',
  '{"sub":"ee000000-0000-4000-8000-000000000203","role":"authenticated","email":"convidado.novo@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.staff_invites
    where invite_code = 'TIGHT001'),
  1,
  'convidado (email do JWT) le o proprio convite');

-- como A1 (coordenador do escalao do clube X): gestao intacta
reset role;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"a1@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.staff_invites
    where invite_code = 'TIGHT001'),
  1,
  'A1 (coordenador do escalao) continua a ler o convite');

-- como anon: leitura directa bloqueada, RPC por codigo funciona
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  (select count(*)::int from public.staff_invites),
  0,
  'anon continua a ler 0 staff_invites diretamente');

select is(
  (public.get_staff_invite_by_code('TIGHT001') ->> 'status'),
  'pending',
  'RPC devolve o convite por codigo (status)');

select is(
  (public.get_staff_invite_by_code('TIGHT001') ->> 'role'),
  'head_coach',
  'RPC devolve o role do convite');

select is(
  (public.get_staff_invite_by_code('TIGHT001') ->> 'age_group_name'),
  'Escalao Teste X',
  'RPC devolve o nome do escalao');

select is(
  (public.get_staff_invite_by_code('TIGHT001') ->> 'club_name'),
  'Clube Teste X',
  'RPC devolve o nome do clube (fallback clubs.name)');

select is(
  (public.get_staff_invite_by_code('TIGHT001') ->> 'invited_by_name'),
  'Coordenador',
  'RPC reduz quem convidou ao primeiro nome');

select ok(
  not (public.get_staff_invite_by_code('TIGHT001')
    ?| array['email', 'phone', 'first_name', 'last_name', 'invite_code']),
  'RPC nao expoe dados pessoais do convidado');

select is(
  (public.get_staff_invite_by_code('TIGHT002') ->> 'status'),
  'revoked',
  'RPC devolve convites revogados (ecra pre-login precisa do estado real)');

select is(
  (public.get_staff_invite_by_code('tight001') ->> 'status'),
  'pending',
  'RPC normaliza o codigo (case-insensitive)');

select ok(
  public.get_staff_invite_by_code('NAOEXISTE') is null,
  'RPC devolve NULL para codigo inexistente');

-- catalogo e grants (como postgres)
reset role;

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and ((tablename = 'staff_invites'
              and policyname in ('anyone_can_read_invite_by_code',
                                 'authenticated_can_update_invite'))
        or (tablename = 'athlete_intake_submissions'
              and policyname in ('intake_select_auth', 'intake_update_auth')))),
  0,
  'policies largas removidas do catalogo');

select ok(has_function_privilege('anon',
  'public.get_staff_invite_by_code(text)', 'EXECUTE'),
  'anon COM EXECUTE na RPC de lookup por codigo');

select ok(has_function_privilege('authenticated',
  'public.get_staff_invite_by_code(text)', 'EXECUTE'),
  'authenticated COM EXECUTE na RPC de lookup por codigo');

select ok(not has_table_privilege('anon',
  'public.athlete_intake_submissions', 'DELETE'),
  'anon sem DELETE em intake');

select ok(not has_table_privilege('anon',
  'public.athlete_intake_submissions', 'TRUNCATE'),
  'anon sem TRUNCATE em intake');

select ok(has_table_privilege('authenticated',
  'public.athlete_intake_submissions', 'DELETE'),
  'authenticated COM DELETE em intake (GRANT do hard delete RGPD; a defesa e a policy)');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public'
      and tablename = 'athlete_intake_submissions'
      and policyname = 'intake_delete_reviewer'
      and cmd = 'DELETE'),
  1,
  'policy intake_delete_reviewer existe no catalogo');

select ok(has_table_privilege('anon',
  'public.athlete_intake_submissions', 'INSERT'),
  'anon mantem INSERT em intake (formulario publico)');

select ok(
  (select array_to_string(p.proconfig, ';') like '%search_path=public, pg_temp%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_staff_invite_by_code'),
  'get_staff_invite_by_code com search_path=public, pg_temp');

-- DELETE de intake (hard delete RGPD): so a allowlist apaga -------------------

-- como B1 (autenticado fora da allowlist): GRANT passa, policy filtra -> no-op
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"b1@coach11.test"}',
  true);
set local role authenticated;

select lives_ok(
  $$delete from public.athlete_intake_submissions
     where id = '11000000-0000-4000-8000-000000000101'$$,
  'DELETE de intake fora da allowlist nao da erro (GRANT passa, RLS filtra)');

-- como postgres: a ficha persiste (o DELETE de B1 foi no-op)
reset role;
select is(
  (select count(*)::int from public.athlete_intake_submissions
    where id = '11000000-0000-4000-8000-000000000101'),
  1,
  'ficha de intake persiste apos tentativa de DELETE de B1');

-- como anon: sem GRANT DELETE, bloqueado ja na camada de GRANT (42501)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$delete from public.athlete_intake_submissions
     where id = '11000000-0000-4000-8000-000000000101'$$,
  '42501',
  null,
  'anon nao consegue DELETE de intake (sem GRANT, permission denied)');

-- como revisor allowlisted (pehmsc): apaga de facto
reset role;
select set_config('request.jwt.claims',
  '{"sub":"ee000000-0000-4000-8000-000000000201","role":"authenticated","email":"pehmsc@gmail.com"}',
  true);
set local role authenticated;
select lives_ok(
  $$delete from public.athlete_intake_submissions
     where id = '11000000-0000-4000-8000-000000000101'$$,
  'revisor allowlisted executa DELETE da ficha');

-- como postgres: a ficha desapareceu (hard delete confirmado)
reset role;
select is(
  (select count(*)::int from public.athlete_intake_submissions
    where id = '11000000-0000-4000-8000-000000000101'),
  0,
  'ficha de intake apagada definitivamente pelo revisor (hard delete)');

select * from finish();
rollback;
