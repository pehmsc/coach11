-- HOTFIX do PR #175.
--
-- Contexto: o PR #175 adicionou policies PERMISSIVE para INSERT/UPDATE/
-- DELETE nas 3 tabelas legacy de convocatorias (convocations,
-- convocation_players, external_player_convocations). As policies estao
-- correctas, mas o DELETE continua a falhar com:
--
--   ERROR: 42501: permission denied for table convocation_players
--
-- Causa raiz: GRANT e RLS sao camadas independentes. PostgreSQL verifica
-- primeiro o GRANT da tabela ao role; se passa, aplica RLS. As 3 tabelas
-- tinham o padrao INVERTIDO em relacao ao resto da DB:
--   - `authenticated` apenas com SELECT/REFERENCES/TRIGGER/TRUNCATE
--   - `anon` com TODOS os privilegios (incluindo DELETE/INSERT/UPDATE)
--
-- Origem provavel: migration antiga na fase de consolidacao para
-- `game_squads` executou REVOKE no role errado, ou aplicou GRANT em anon
-- quando deveria ter sido em authenticated. Bug passou despercebido
-- porque o cliente raramente escreve estas tabelas legacy directamente.
--
-- Auditoria via Supabase MCP confirmou que apenas estas 3 tabelas tem o
-- padrao invertido — nenhuma outra na DB precisa de fix identico.
--
-- Esta migration alinha as 3 tabelas com o padrao usado em game_squads
-- e todas as outras tabelas: authenticated tem escritas, anon nao tem.
-- As policies RLS PERMISSIVE (PR #175) continuam a garantir que o
-- authenticated so consegue escrever em recursos a que tem acesso —
-- defesa em profundidade preservada.
--
-- Resolve Sentry COACH11-V definitivamente.

BEGIN;

-- ============================================================
-- GRANT escritas ao role authenticated (alinhar com padrao)
-- ============================================================

GRANT INSERT, UPDATE, DELETE ON public.convocations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.convocation_players TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.external_player_convocations TO authenticated;

-- ============================================================
-- REVOKE escritas do role anon (eliminar exposicao)
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON public.convocations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.convocation_players FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.external_player_convocations FROM anon;

COMMIT;
