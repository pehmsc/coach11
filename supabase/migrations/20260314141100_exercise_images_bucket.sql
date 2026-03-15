insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images',
  'exercise-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exercise_images_upload on storage.objects;
create policy exercise_images_upload
on storage.objects
for insert
to authenticated
with check (bucket_id = 'exercise-images');

drop policy if exists exercise_images_read on storage.objects;
create policy exercise_images_read
on storage.objects
for select
to authenticated
using (bucket_id = 'exercise-images');
