-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql:
-- that migration only granted admins SELECT on storage.objects for the
-- 'statements' bucket. The admin console's Document Management page (Delete
-- action) also needs to remove the storage object itself — the 'admins
-- manage statements' policy on public.statements already covers deleting
-- the DB row, but storage.objects needs its own delete policy.

create policy "admins delete statement files"
  on storage.objects for delete
  using (bucket_id = 'statements' and is_admin());
