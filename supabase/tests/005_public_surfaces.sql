-- Asserção 5: superfícies públicas intencionais.
-- anon INSERT em waitlist e athlete_intake_submissions ✓;
-- anon SELECT em staff_invites devolve 0 linhas (GRANT existe, RLS
-- bloqueia — não é erro).

begin;
select plan(3);

-- semear um convite como postgres para o "0 linhas" do anon ter significado
insert into public.staff_invites
  (age_group_id, invited_by, first_name, last_name, email, invite_code, role)
values
  ('e1000000-0000-4000-8000-000000000006',
   'a1000000-0000-4000-8000-000000000001',
   'Convidado', 'Teste', 'convidado@coach11.test', 'TESTE001', 'head_coach');

-- como anon
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select lives_ok(
  $$insert into public.waitlist (email) values ('anon-teste@coach11.test')$$,
  'anon consegue INSERT em waitlist');

select lives_ok(
  $$insert into public.athlete_intake_submissions (first_name) values ('Atleta Teste')$$,
  'anon consegue INSERT em athlete_intake_submissions');

select is(
  (select count(*)::int from public.staff_invites),
  0,
  'anon le zero staff_invites (RLS bloqueia, sem erro)');

select * from finish();
rollback;
