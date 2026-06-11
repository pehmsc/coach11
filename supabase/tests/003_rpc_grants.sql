-- Asserção 3 (Bloco A): GRANTs de EXECUTE nas RPCs sensíveis
-- (migrations 20260610100000 + 20260610100200).
-- anon: sem EXECUTE em nenhuma das 7. authenticated: EXECUTE apenas em
-- rpc_correct_initial_lineup. Positivos de sanidade: service_role mantém
-- as internas; authenticated mantém o wrapper rpc_finalize_game_auth
-- (superfície intencional).

begin;
select plan(16);

-- anon: zero EXECUTE nas 7 funcoes sensiveis
select ok(not has_function_privilege('anon',
  'public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean)', 'EXECUTE'),
  'anon sem EXECUTE em rpc_finalize_game');
select ok(not has_function_privilege('anon',
  'public.rpc_correct_initial_lineup(uuid, jsonb, text)', 'EXECUTE'),
  'anon sem EXECUTE em rpc_correct_initial_lineup');
select ok(not has_function_privilege('anon',
  'public.repair_club_membership_state(uuid, uuid)', 'EXECUTE'),
  'anon sem EXECUTE em repair_club_membership_state');
select ok(not has_function_privilege('anon',
  'public.update_rows_club_id_by_ids(text, text, uuid[], uuid)', 'EXECUTE'),
  'anon sem EXECUTE em update_rows_club_id_by_ids');
select ok(not has_function_privilege('anon',
  'public.update_rows_club_id_by_age_group(text, uuid, uuid)', 'EXECUTE'),
  'anon sem EXECUTE em update_rows_club_id_by_age_group');
select ok(not has_function_privilege('anon',
  'public.rehome_age_group_to_dedicated_technical_club(uuid)', 'EXECUTE'),
  'anon sem EXECUTE em rehome_age_group_to_dedicated_technical_club');
select ok(not has_function_privilege('anon',
  'public.count_rows_by_ids(text, text, uuid[])', 'EXECUTE'),
  'anon sem EXECUTE em count_rows_by_ids');

-- authenticated: EXECUTE apenas em rpc_correct_initial_lineup
select ok(has_function_privilege('authenticated',
  'public.rpc_correct_initial_lineup(uuid, jsonb, text)', 'EXECUTE'),
  'authenticated COM EXECUTE em rpc_correct_initial_lineup (unica permitida)');
select ok(not has_function_privilege('authenticated',
  'public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean)', 'EXECUTE'),
  'authenticated sem EXECUTE em rpc_finalize_game (so via wrapper)');
select ok(not has_function_privilege('authenticated',
  'public.repair_club_membership_state(uuid, uuid)', 'EXECUTE'),
  'authenticated sem EXECUTE em repair_club_membership_state');
select ok(not has_function_privilege('authenticated',
  'public.update_rows_club_id_by_ids(text, text, uuid[], uuid)', 'EXECUTE'),
  'authenticated sem EXECUTE em update_rows_club_id_by_ids');
select ok(not has_function_privilege('authenticated',
  'public.update_rows_club_id_by_age_group(text, uuid, uuid)', 'EXECUTE'),
  'authenticated sem EXECUTE em update_rows_club_id_by_age_group');
select ok(not has_function_privilege('authenticated',
  'public.rehome_age_group_to_dedicated_technical_club(uuid)', 'EXECUTE'),
  'authenticated sem EXECUTE em rehome_age_group_to_dedicated_technical_club');
select ok(not has_function_privilege('authenticated',
  'public.count_rows_by_ids(text, text, uuid[])', 'EXECUTE'),
  'authenticated sem EXECUTE em count_rows_by_ids');

-- positivos de sanidade: as superficies intencionais continuam abertas
select ok(has_function_privilege('service_role',
  'public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean)', 'EXECUTE'),
  'service_role mantem EXECUTE em rpc_finalize_game');
select ok(has_function_privilege('authenticated',
  'public.rpc_finalize_game_auth(uuid, jsonb, integer, integer, integer, uuid)', 'EXECUTE'),
  'authenticated mantem EXECUTE no wrapper rpc_finalize_game_auth');

select * from finish();
rollback;
