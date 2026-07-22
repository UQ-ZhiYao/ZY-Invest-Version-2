-- Run once in the Supabase SQL editor.
--
-- A joint account has never had its own mailing address or settlement
-- bank account — only its individual co-holder profiles do. Adds the same
-- fields profiles already has (see addressFromProfile() in
-- generate-statement/lib/compute.ts and the member phone app's
-- profile-edit.html), with identical names/types, so joint_accounts can
-- carry its own values independently of any one co-holder's.
--
-- No RLS changes needed — these are new columns on a table members can
-- already SELECT their own row from (member-api.js's
-- mpLoadJointAccountName() already reads joint_accounts.display_name
-- client-side); Postgres RLS is row-level, so the existing policy covers
-- these columns automatically.

alter table public.joint_accounts
  add column if not exists address text,
  add column if not exists address2 text,
  add column if not exists postcode text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists bank_name text,
  add column if not exists bank_account_no text,
  add column if not exists bank_account_holder text;
