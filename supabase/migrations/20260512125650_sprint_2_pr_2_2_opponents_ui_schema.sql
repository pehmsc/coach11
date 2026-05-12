-- ============================================================================
-- Sprint 2 / PR 2.2 — Campos adicionais + bucket de logos para a UI
-- ============================================================================
-- Adiciona granularidade ao home_ground (nome + morada + coordenadas) e
-- separa telefone do textarea generico de contactos. Cria bucket dedicado
-- opponent-logos com RLS scoped por age_group (path: <age_group_id>/<id>.<ext>).
-- ============================================================================

-- ============================================================================
-- 1. Novos campos em opponents
-- ============================================================================

ALTER TABLE public.opponents
  ADD COLUMN IF NOT EXISTS home_ground_address TEXT,
  ADD COLUMN IF NOT EXISTS home_ground_lat NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS home_ground_lng NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS phone TEXT;

COMMENT ON COLUMN public.opponents.home_ground IS
  'Nome do campo do adversario (ex: "Campo Municipal de Lourel"). A morada vai em home_ground_address.';

COMMENT ON COLUMN public.opponents.home_ground_address IS
  'Morada completa do campo, formato livre. Usado para preencher jogos fora de casa.';

COMMENT ON COLUMN public.opponents.home_ground_lat IS
  'Latitude do campo (preenchida por autocomplete ou manualmente).';

COMMENT ON COLUMN public.opponents.home_ground_lng IS
  'Longitude do campo.';

COMMENT ON COLUMN public.opponents.phone IS
  'Telefone principal de contacto. Validacao formato PT no client (regex Zod).';

COMMENT ON COLUMN public.opponents.contact_info IS
  'Contactos diversos (email, redes sociais, outros telefones). Texto livre.';

-- ============================================================================
-- 2. Bucket de logos
-- ============================================================================
-- Path convention: opponent-logos/<age_group_id>/<opponent_id>.webp
-- Publico (logos nao sao sensiveis), 200KB max (cliente faz redimensionamento
-- para 256x256 WebP), 3 mime types.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'opponent-logos',
  'opponent-logos',
  true,
  204800,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies: alinhadas com user_can_access_age_group (mesmo helper das opponents
-- na PR 2.1). Path 1o segmento = age_group_id; valida acesso ao escalao.
-- SELECT publico porque bucket e publico (necessario para <img src>).

DROP POLICY IF EXISTS "opponent_logos_read_public" ON storage.objects;
CREATE POLICY "opponent_logos_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'opponent-logos');

DROP POLICY IF EXISTS "opponent_logos_insert_age_group_staff" ON storage.objects;
CREATE POLICY "opponent_logos_insert_age_group_staff"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'opponent-logos'
    AND public.user_can_access_age_group(
      (regexp_split_to_array(name, '/'))[1]::uuid
    )
  );

DROP POLICY IF EXISTS "opponent_logos_update_age_group_staff" ON storage.objects;
CREATE POLICY "opponent_logos_update_age_group_staff"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'opponent-logos'
    AND public.user_can_access_age_group(
      (regexp_split_to_array(name, '/'))[1]::uuid
    )
  );

DROP POLICY IF EXISTS "opponent_logos_delete_age_group_staff" ON storage.objects;
CREATE POLICY "opponent_logos_delete_age_group_staff"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'opponent-logos'
    AND public.user_can_access_age_group(
      (regexp_split_to_array(name, '/'))[1]::uuid
    )
  );

-- ============================================================================
-- 3. Verificacao
-- ============================================================================

DO $$
DECLARE
  v_columns INT;
  v_bucket BOOL;
BEGIN
  SELECT COUNT(*) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'opponents'
    AND column_name IN ('home_ground_address','home_ground_lat','home_ground_lng','phone');
  IF v_columns < 4 THEN
    RAISE EXCEPTION 'PR 2.2: faltam colunas (% encontradas, esperadas 4)', v_columns;
  END IF;

  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'opponent-logos') INTO v_bucket;
  IF NOT v_bucket THEN
    RAISE EXCEPTION 'PR 2.2: bucket opponent-logos nao foi criado';
  END IF;

  RAISE NOTICE 'PR 2.2: 4 colunas adicionadas, bucket opponent-logos pronto';
END $$;
