-- Extensão da tabela waitlist para suportar o formulário de contacto
-- (segmentação por persona, campos opcionais para clubes)

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS persona TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS club_name TEXT,
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE public.waitlist
  DROP CONSTRAINT IF EXISTS waitlist_persona_check;

ALTER TABLE public.waitlist
  ADD CONSTRAINT waitlist_persona_check
  CHECK (persona IS NULL OR persona IN ('individual', 'club'));
