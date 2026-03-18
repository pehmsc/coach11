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
with check (
  bucket_id = 'exercise-images'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and public.user_can_read_club_scope(split_part(name, '/', 1)::uuid)
  and public.user_can_write_age_group_scope(
    split_part(name, '/', 2)::uuid,
    split_part(name, '/', 1)::uuid
  )
);

drop policy if exists exercise_images_read on storage.objects;
create policy exercise_images_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exercise-images'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and split_part(name, '/', 3) <> ''
  and public.user_can_read_club_scope(split_part(name, '/', 1)::uuid)
);
