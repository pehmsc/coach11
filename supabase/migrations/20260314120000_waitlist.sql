-- Tabela para recolha de emails da landing page
CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'landing_page',
  CONSTRAINT waitlist_email_unique UNIQUE (email)
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode submeter email (formulário público)
CREATE POLICY "Anyone can join waitlist" ON public.waitlist
  FOR INSERT WITH CHECK (true);

-- Apenas utilizadores autenticados podem ler (para exportar leads)
CREATE POLICY "Only authenticated users can read waitlist" ON public.waitlist
  FOR SELECT USING (auth.role() = 'authenticated');
