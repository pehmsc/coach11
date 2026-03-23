-- Adicionar campos adicionais à tabela clubs
-- Permite que club_coordinator preencha informações de contacto e identidade do clube

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS morada text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS email_contacto text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS cor_primaria text,
  ADD COLUMN IF NOT EXISTS cor_secundaria text,
  ADD COLUMN IF NOT EXISTS distrito text,
  ADD COLUMN IF NOT EXISTS associacao text;

-- RLS: club_coordinator pode ler e actualizar o seu próprio clube
-- (admin já tem acesso irrestrito via service_role)

-- Política de leitura: qualquer autenticado pode ler o clube do seu contexto
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clubs' AND policyname = 'clubs_select_member'
  ) THEN
    CREATE POLICY clubs_select_member ON public.clubs
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.club_memberships cm
          WHERE cm.club_id = id AND cm.profile_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.age_groups ag
          WHERE ag.club_id = id AND ag.coordinator_id = auth.uid()
        )
      );
  END IF;
END $$;
