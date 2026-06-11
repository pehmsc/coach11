-- Asserção 1 (Bloco A): isolamento de profiles.
-- profiles_read_same_club_v1 — próprio perfil ✓, colega do mesmo clube ✓,
-- membro de outro clube ✗, anon lê zero perfis ✗.

begin;
select plan(4);

-- como A1 (coordenador do clube X)
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"a1@coach11.test"}',
  true);
set local role authenticated;

select is(
  (select count(*)::int from public.profiles
    where id = 'a1000000-0000-4000-8000-000000000001'),
  1,
  'A1 le o proprio perfil');

select is(
  (select count(*)::int from public.profiles
    where id = 'a2000000-0000-4000-8000-000000000002'),
  1,
  'A1 le o perfil do colega A2 (mesmo clube)');

select is(
  (select count(*)::int from public.profiles
    where id = 'b1000000-0000-4000-8000-000000000003'),
  0,
  'A1 NAO le o perfil de B1 (outro clube)');

-- como anon
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select is(
  (select count(*)::int from public.profiles),
  0,
  'anon le zero perfis (GRANT existe, RLS bloqueia)');

select * from finish();
rollback;
