-- Fecha enumeracao de ficheiros em 3 buckets publicos.
-- Decisao (Opcao 1): manter os buckets public:true (imagens continuam a servir
-- via URL directo, que nao passa por RLS), mas remover/apertar as policies de
-- SELECT em storage.objects que abriam a listagem (.list()) a public/authenticated
-- sem scope.
--
-- IMPORTANTE: getPublicUrl() em buckets publicos NAO passa por RLS, logo os
-- <img src> continuam a funcionar tanto na app autenticada como nos links publicos.
-- A policy de SELECT em storage.objects controla apenas .list(), .download() e
-- signed URLs.

-- ============================================================
-- exercise-images: remover policy redundante que furava o scoping
-- ============================================================
-- A policy boa exercise_images_read (scoped por user_can_read_club_scope) ja chega.
-- A _v1 abria tudo a authenticated, anulando o scope.
-- Codigo nao usa .list() neste bucket — DROP seguro.

DROP POLICY IF EXISTS "exercise_images_read_v1" ON storage.objects;

-- ============================================================
-- event-images: substituir policy aberta por scoped
-- ============================================================
-- O endpoint /api/event-images (biblioteca de imagens do escalao) faz .list()
-- legitimo via SSR client. Nao posso fazer DROP cego — substituo por policy
-- scoped por user_can_access_age_group, no mesmo padrao do players-photos.
-- Path actual: <ageGroupId>/<filename> (confirmado em api/event-images/route.ts).

DROP POLICY IF EXISTS "Public read event images" ON storage.objects;

CREATE POLICY "event_images_read_scoped"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'event-images'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND user_can_access_age_group((split_part(name, '/', 1))::uuid)
  );

-- ============================================================
-- opponent-logos: fechar listagem (servido por URL directo, sem .list())
-- ============================================================

DROP POLICY IF EXISTS "opponent_logos_read_public" ON storage.objects;
