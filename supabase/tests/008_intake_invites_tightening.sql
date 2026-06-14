-- Assercao 8 (micro-PR tightening staff_invites).
-- staff_invites: sem as policies largas, autenticado de outro clube nao le
-- nem actualiza convite alheio; o email convidado continua a ver o proprio
-- convite (pre-lookup do redeem); a RPC get_staff_invite_by_code serve o
-- ecra pre-login em qualquer status sem expor dados pessoais do convidado.

begin;
select plan(19);

-- seeds (como postgres)
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

-- como B1 (coordenador do clube Y): convite do clube X invisivel e imutavel
select set_config('request.jwt.claims',
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","email":"b1@coach11.test"}',
  true);
set local role authenticated;

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
  (select status from public.staff_invites
    where invite_code = 'TIGHT001'),
  'pending',
  'convite do clube X continua pending apos a tentativa de B1');

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
      and tablename = 'staff_invites'
      and policyname in ('anyone_can_read_invite_by_code',
                         'authenticated_can_update_invite')),
  0,
  'policies largas removidas do catalogo');

select ok(has_function_privilege('anon',
  'public.get_staff_invite_by_code(text)', 'EXECUTE'),
  'anon COM EXECUTE na RPC de lookup por codigo');

select ok(has_function_privilege('authenticated',
  'public.get_staff_invite_by_code(text)', 'EXECUTE'),
  'authenticated COM EXECUTE na RPC de lookup por codigo');

select ok(
  (select array_to_string(p.proconfig, ';') like '%search_path=public, pg_temp%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_staff_invite_by_code'),
  'get_staff_invite_by_code com search_path=public, pg_temp');

select * from finish();
rollback;
