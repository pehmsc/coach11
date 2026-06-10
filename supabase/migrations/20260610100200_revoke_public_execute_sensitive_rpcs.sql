-- Correccao da migration anterior: os REVOKEs de anon/authenticated nao
-- tiveram efeito pratico porque o EXECUTE destas funcoes vinha do grant
-- implicito a PUBLIC (anon e authenticated herdam os grants de PUBLIC).
-- Padrao correcto, igual ao ja usado em rpc_finalize_game_auth: REVOKE FROM
-- PUBLIC e GRANT explicito apenas aos roles que precisam.

-- Chamada pela app via session client -> authenticated mantem EXECUTE.
REVOKE EXECUTE ON FUNCTION public.rpc_correct_initial_lineup(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_correct_initial_lineup(uuid, jsonb, text) TO authenticated, service_role;

-- So chamada pelo wrapper SECURITY DEFINER rpc_finalize_game_auth (verificado
-- contra o owner) -> nem anon nem authenticated precisam de EXECUTE.
REVOKE EXECUTE ON FUNCTION public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_game(uuid, jsonb, integer, integer, integer, uuid, boolean) TO service_role;

-- Utilitarias de migracao/manutencao: exclusivas do service_role.
REVOKE EXECUTE ON FUNCTION public.repair_club_membership_state(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_club_membership_state(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_rows_club_id_by_ids(text, text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_rows_club_id_by_ids(text, text, uuid[], uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_rows_club_id_by_age_group(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_rows_club_id_by_age_group(text, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.rehome_age_group_to_dedicated_technical_club(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehome_age_group_to_dedicated_technical_club(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.count_rows_by_ids(text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_rows_by_ids(text, text, uuid[]) TO service_role;
