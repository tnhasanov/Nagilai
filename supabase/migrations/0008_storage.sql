-- =====================================================================
-- Nagilai · 0008 · Storage buckets and object policies
-- =====================================================================
-- Every bucket is private. The application mints short-lived signed URLs
-- server-side; no object is ever reachable by guessing a path (§24).
--
-- Object key convention (the first path segment is always the owner's
-- user id, which is what the policies below match on):
--
--   child-photos/{owner_id}/{child_id}/{uuid}.{ext}
--   illustrations/{owner_id}/{story_id}/{version_id}/{page|cover}.png
--   narrations/{owner_id}/{story_id}/{version_id}/{scope}-{hash}.mp3
--   story-pdfs/{owner_id}/{story_id}/{version_id}/{variant}-{hash}.pdf
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('child-photos',  'child-photos',  false, 8388608,   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('illustrations', 'illustrations', false, 16777216,  array['image/png', 'image/jpeg', 'image/webp']),
  ('narrations',    'narrations',    false, 52428800,  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/opus']),
  ('story-pdfs',    'story-pdfs',    false, 104857600, array['application/pdf']),
  ('public-assets', 'public-assets', true,  10485760,  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- child-photos — the only bucket a browser uploads to directly, and only
-- ever under the uploader's own prefix.
-- ---------------------------------------------------------------------
drop policy if exists child_photos_read_own on storage.objects;
create policy child_photos_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'child-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists child_photos_insert_own on storage.objects;
create policy child_photos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'child-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists child_photos_update_own on storage.objects;
create policy child_photos_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'child-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists child_photos_delete_own on storage.objects;
create policy child_photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'child-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Generated assets — read-only for the owner; written by the service
-- role from background jobs. Deletion is allowed so a parent deleting a
-- story really removes the files.
-- ---------------------------------------------------------------------
drop policy if exists generated_assets_read_own on storage.objects;
create policy generated_assets_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id in ('illustrations', 'narrations', 'story-pdfs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists generated_assets_delete_own on storage.objects;
create policy generated_assets_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('illustrations', 'narrations', 'story-pdfs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- public-assets — marketing imagery, theme tiles, voice samples.
-- ---------------------------------------------------------------------
drop policy if exists public_assets_read on storage.objects;
create policy public_assets_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'public-assets');
