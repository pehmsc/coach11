-- Asserção 6 (Bloco E): tabelas exclusivas do service role.
-- gdpr_purge_audit e audit_logs: RLS activa, zero policies, zero GRANTs a
-- anon/authenticated — SELECT falha com permission denied (42501).

begin;
select plan(12);

select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'gdpr_purge_audit'),
  'gdpr_purge_audit com RLS activa');
select ok(
  (select c.relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'audit_logs'),
  'audit_logs com RLS activa');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'gdpr_purge_audit'),
  0,
  'gdpr_purge_audit sem policies');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'),
  0,
  'audit_logs sem policies');

select ok(not has_table_privilege('anon', 'public.gdpr_purge_audit', 'SELECT'),
  'anon sem GRANT SELECT em gdpr_purge_audit');
select ok(not has_table_privilege('authenticated', 'public.gdpr_purge_audit', 'SELECT'),
  'authenticated sem GRANT SELECT em gdpr_purge_audit');
select ok(not has_table_privilege('anon', 'public.audit_logs', 'SELECT'),
  'anon sem GRANT SELECT em audit_logs');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'),
  'authenticated sem GRANT SELECT em audit_logs');

-- como anon: SELECT falha (permission denied — camada GRANT, nao RLS)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select * from public.gdpr_purge_audit$$, '42501', null,
  'anon: SELECT em gdpr_purge_audit -> permission denied');
select throws_ok(
  $$select * from public.audit_logs$$, '42501', null,
  'anon: SELECT em audit_logs -> permission denied');

-- como authenticated (A1): igual
reset role;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated","email":"a1@coach11.test"}',
  true);
set local role authenticated;
select throws_ok(
  $$select * from public.gdpr_purge_audit$$, '42501', null,
  'authenticated: SELECT em gdpr_purge_audit -> permission denied');
select throws_ok(
  $$select * from public.audit_logs$$, '42501', null,
  'authenticated: SELECT em audit_logs -> permission denied');

select * from finish();
rollback;
