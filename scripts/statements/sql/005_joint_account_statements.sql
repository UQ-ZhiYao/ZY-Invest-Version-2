-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql
-- and 004_distribution_ledger.sql.
--
-- Statements and distribution_ledger rows can now belong to a JOINT ACCOUNT
-- (public.joint_accounts.id), not just an individual investor
-- (public.profiles.id) — see generate-statement/index.ts's
-- resolveInvestorScope(). Both tables' investor_id column was declared
-- `references public.profiles(id)`, which rejects any insert where
-- investor_id is actually a joint_accounts.id — exactly what happens when
-- generating an Annual/Dividend statement for a joint account (the insert
-- fails with a foreign key violation). There's no clean way for a single
-- column to reference "either of two tables", so this drops that FK and
-- widens the RLS policies so a joint account's co-holders can still see
-- their own joint statements/ledger rows despite investor_id no longer
-- being their own auth.uid().

-- 1. Drop the FK constraints that only allowed profiles.id.
alter table public.statements drop constraint if exists statements_investor_id_fkey;
alter table public.distribution_ledger drop constraint if exists distribution_ledger_investor_id_fkey;

-- 2. Widen "investors read own ..." to also cover joint accounts: a
--    co-holder can see a row whose investor_id is either their own id, or
--    the joint_account_id already recorded on their own profile.
drop policy if exists "investors read own statements" on public.statements;
create policy "investors read own statements"
  on public.statements for select
  using (
    auth.uid() = investor_id
    or investor_id in (
      select joint_account_id from public.profiles
      where id = auth.uid() and joint_account_id is not null
    )
  );

drop policy if exists "investors read own distribution ledger" on public.distribution_ledger;
create policy "investors read own distribution ledger"
  on public.distribution_ledger for select
  using (
    auth.uid() = investor_id
    or investor_id in (
      select joint_account_id from public.profiles
      where id = auth.uid() and joint_account_id is not null
    )
  );

-- 3. Same widening for the statements Storage bucket policy — objects are
--    stored at {investor_id}/{type}/{file_name}.pdf, so the folder name is
--    investor_id as text.
drop policy if exists "investors read own statement files" on storage.objects;
create policy "investors read own statement files"
  on storage.objects for select
  using (
    bucket_id = 'statements'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (storage.foldername(name))[1] in (
        select joint_account_id::text from public.profiles
        where id = auth.uid() and joint_account_id is not null
      )
    )
  );

-- 4. Admins need to be able to list joint accounts at all — the Document
--    Generator's investor dropdown queries public.joint_accounts directly
--    over the admin's regular (non-service-role) session. RLS policies for
--    the same command are OR'd together, so adding this is additive and
--    safe regardless of whatever policy already exists on this table.
alter table public.joint_accounts enable row level security;
drop policy if exists "admins read all joint accounts" on public.joint_accounts;
create policy "admins read all joint accounts"
  on public.joint_accounts for select
  using (is_admin());
