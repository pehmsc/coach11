-- Recolha de respostas do questionario de validacao (treinadores de formacao).
-- Espelha o padrao da tabela `waitlist`: INSERT anonimo da pagina publica,
-- leitura apenas pelo dashboard/service_role. GRANT e RLS sao camadas
-- independentes — e preciso conceder o GRANT alem da policy de INSERT.

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  email TEXT,
  user_agent TEXT
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

-- GRANT (camada independente da RLS): sem isto, o INSERT anonimo falha com
-- "permission denied for table" antes mesmo de a policy correr.
GRANT INSERT ON public.survey_responses TO anon, authenticated;

-- Qualquer pessoa pode submeter o questionario (formulario publico).
-- Idempotente: drop antes de create para o replay nao falhar.
DROP POLICY IF EXISTS "survey_responses_anon_insert" ON public.survey_responses;
CREATE POLICY "survey_responses_anon_insert" ON public.survey_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Sem policies de SELECT/UPDATE/DELETE: a leitura fica reservada ao
-- service_role / dashboard Supabase (o Pedro consulta diretamente).
