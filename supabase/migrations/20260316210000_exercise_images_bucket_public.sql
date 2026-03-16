-- Garantir que o bucket exercise-images existe e é público
-- Exercícios não são dados sensíveis — diagramas tácticos podem ser públicos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-images',
  'exercise-images',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Permitir leitura de imagens de exercícios a todos os utilizadores autenticados
-- (as imagens são referenciadas por URL público, mas isto garante acesso via API)
DROP POLICY IF EXISTS "exercise_images_read_v1" ON storage.objects;
CREATE POLICY "exercise_images_read_v1" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'exercise-images');

-- Permitir upload a utilizadores autenticados
DROP POLICY IF EXISTS "exercise_images_insert_v1" ON storage.objects;
CREATE POLICY "exercise_images_insert_v1" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exercise-images');
