-- RGPD (art. 17.o, direito ao apagamento) para fichas de menores:
-- permitir hard delete de athlete_intake_submissions aos revisores da
-- allowlist (os mesmos da pagina public/admin.html). Sem isto o DELETE
-- falha com 42501: o #287 revogou DELETE de authenticated e nao existe
-- policy de DELETE.
--
-- Duas peças independentes (PG verifica GRANT antes de RLS):
--   1) GRANT DELETE a authenticated
--   2) policy de DELETE com a MESMA allowlist das policies irmas
--      (intake_select_reviewer / intake_update_reviewer): padrao Bloco A,
--      TO authenticated, initplan wrap e COALESCE para JWT sem email.
--
-- NAO altera INSERT anonimo (intake_insert_public) nem as policies de
-- SELECT/UPDATE. anon continua bloqueado (sem GRANT DELETE, sem policy).

grant delete on public.athlete_intake_submissions to authenticated;

drop policy if exists "intake_delete_reviewer" on public.athlete_intake_submissions;
create policy "intake_delete_reviewer" on public.athlete_intake_submissions
  for delete to authenticated
  using (
    lower(coalesce(((select auth.jwt()) ->> 'email'::text), ''::text)) = any
      (array['pehmsc@gmail.com'::text, 'pedro.campos@befirstrs.com'::text])
  );
