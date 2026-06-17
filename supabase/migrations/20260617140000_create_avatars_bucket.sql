-- Bucket avatars: foto de perfil do utilizador (profiles.avatar_url).
--
-- Causa do bug "Erro ao carregar imagem": o bucket nunca foi criado. O upload
-- client-side (src/app/(dashboard)/settings/page.tsx -> handleAvatarChange)
-- escreve em avatars/<auth.uid()>.<ext> com upsert:true. Como profiles.id ===
-- auth.uid(), o path do objecto bate exactamente com o scope das policies abaixo.
--
-- Bucket publico (imagens servidas por getPublicUrl, que NAO passa por RLS) com
-- paridade de limites ao club-logos: 2 MB e png/jpeg/jpg/webp.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2 * 1024 * 1024, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- SELECT publico: bucket publico, leitura por URL. (getPublicUrl ja serve as
-- imagens sem RLS; esta policy cobre .list()/.download() para o proprio fluxo.)
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- INSERT — apenas authenticated e SO no proprio path: avatars/<auth.uid()>.*
DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || auth.uid()::text || '.%'
);

-- UPDATE — mesmo scope (necessario para o upsert:true sobrescrever a foto)
DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || auth.uid()::text || '.%'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || auth.uid()::text || '.%'
);

-- DELETE — proprio path. A eliminacao de conta (#302) usa service role
-- (deleteUserAvatarStorage) e nao depende desta policy, mas permite ao
-- utilizador remover a propria foto via client.
DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND name LIKE 'avatars/' || auth.uid()::text || '.%'
);
