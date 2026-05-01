-- PR 3/3 da página de detalhe do atleta — bucket privado para fotos de
-- atletas. Privado por defeito (RGPD: atletas são menores). Acesso via
-- signed URLs gerados server-side com TTL curto.
--
-- Convenção do path: {ageGroupId}/{playerId}.webp — gate da RLS via
-- public.user_can_access_age_group(ageGroupId).
--
-- Segue o padrão do bucket exercise-images (validação regex UUID antes
-- do cast ::uuid).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'players-photos',
  'players-photos',
  false,
  2 * 1024 * 1024, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- SELECT — staff com acesso ao age_group encoded no primeiro segmento do path
DROP POLICY IF EXISTS players_photos_staff_read ON storage.objects;
CREATE POLICY players_photos_staff_read
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'players-photos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) <> ''
  AND public.user_can_access_age_group(split_part(name, '/', 1)::uuid)
);

-- INSERT
DROP POLICY IF EXISTS players_photos_staff_insert ON storage.objects;
CREATE POLICY players_photos_staff_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'players-photos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) <> ''
  AND public.user_can_access_age_group(split_part(name, '/', 1)::uuid)
);

-- UPDATE (necessário para upsert)
DROP POLICY IF EXISTS players_photos_staff_update ON storage.objects;
CREATE POLICY players_photos_staff_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'players-photos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) <> ''
  AND public.user_can_access_age_group(split_part(name, '/', 1)::uuid)
)
WITH CHECK (
  bucket_id = 'players-photos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) <> ''
  AND public.user_can_access_age_group(split_part(name, '/', 1)::uuid)
);

-- DELETE
DROP POLICY IF EXISTS players_photos_staff_delete ON storage.objects;
CREATE POLICY players_photos_staff_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'players-photos'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND split_part(name, '/', 2) <> ''
  AND public.user_can_access_age_group(split_part(name, '/', 1)::uuid)
);

-- Comentário esclarecedor na coluna players.avatar_url (já existia desde
-- antes do PR 1; reforçamos a semântica agora que passa a apontar para
-- bucket privado).
COMMENT ON COLUMN public.players.avatar_url IS
  'Path interno no bucket players-photos (formato: {ageGroupId}/{playerId}.webp). NÃO é URL pública — o bucket é privado, requer signed URL gerada server-side via /api/players/[id].';
