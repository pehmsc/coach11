-- Editor de diagramas táticos (SVG): suporte a diagramas reeditáveis.
--
-- Aditivo, sem tocar em dados existentes. `diagram_url` mantém a sua semântica
-- (PNG consumido pela UT e pelo link público). `diagram_json` guarda o conteúdo
-- reeditável do editor; `diagram_type` distingue upload de imagem vs editor.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS diagram_json jsonb,
  ADD COLUMN IF NOT EXISTS diagram_type text;

-- type: 'image' (upload) | 'editor' (criado no editor). NULL = legado (tratar como 'image').
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercises_diagram_type_chk'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_diagram_type_chk
      CHECK (diagram_type IS NULL OR diagram_type IN ('image', 'editor'));
  END IF;
END $$;
