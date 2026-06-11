-- Asserção 4 (Bloco A): search_path fixo nas funções de trigger
-- (migration 20260610100000, SEC-03). proconfig tem de conter
-- search_path=public, pg_temp.

begin;
select plan(2);

select ok(
  (select array_to_string(p.proconfig, ';') like '%search_path=public, pg_temp%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_new_user'),
  'handle_new_user com search_path=public, pg_temp');

select ok(
  (select array_to_string(p.proconfig, ';') like '%search_path=public, pg_temp%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_initial_lineup_immutability'),
  'enforce_initial_lineup_immutability com search_path=public, pg_temp');

select * from finish();
rollback;
