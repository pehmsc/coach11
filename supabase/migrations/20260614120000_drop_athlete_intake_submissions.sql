-- Desmantelamento total do intake de atletas.
--
-- O fluxo de scouting via questionario publico (public/questionario.html ->
-- INSERT anonimo) com revisao na pagina standalone (public/admin.html) foi
-- sempre temporario e e agora descontinuado. As paginas, os vendor scripts e
-- as asserces de teste de intake saem no mesmo PR.
--
-- A tabela esta isolada (verificado por SQL em producao): 0 linhas, sem FKs
-- (de entrada ou saida), nenhuma RPC dependente, nenhuma tabela satelite.
-- As policies (intake_insert_public, intake_select_reviewer,
-- intake_update_reviewer, intake_delete_reviewer) e os grants de
-- anon/authenticated caem em cascata com a tabela; os DROP POLICY explicitos
-- abaixo sao por clareza/idempotencia. Sem CASCADE: nao ha dependencias.

drop policy if exists "intake_insert_public" on public.athlete_intake_submissions;
drop policy if exists "intake_select_reviewer" on public.athlete_intake_submissions;
drop policy if exists "intake_update_reviewer" on public.athlete_intake_submissions;
drop policy if exists "intake_delete_reviewer" on public.athlete_intake_submissions;

drop table if exists public.athlete_intake_submissions;
