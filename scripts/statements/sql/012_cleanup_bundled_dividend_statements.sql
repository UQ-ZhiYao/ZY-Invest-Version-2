-- Run once in the Supabase SQL editor, AFTER 010_dividend_per_distribution.sql
-- and 011_auto_generate_dividend_per_distribution.sql, and after
-- redeploying the generate-statement edge function (all three close off
-- the old bug so it can't recur).
--
-- Every Dividend statement generated before this fix bundled every
-- distribution declared in an FY into one PDF, priced off the investor's
-- FY-end holding rather than each distribution's own ex_date holding —
-- both the bundling and the pricing are wrong under the new one-per-
-- distribution model. There's no way to salvage an old bundled statement
-- into the new shape, so this deletes all of them; re-run "Generate All
-- Statements" in Document Management afterwards to regenerate correct
-- per-distribution ones.
--
-- distribution_ledger rows are NOT deleted here — they get overwritten
-- with correct (ex_date-based) values automatically the moment each
-- statement is regenerated (upsert on the same distribution_id+investor_id
-- key), and distribution_ledger.statement_id already auto-nulls via its
-- own "on delete set null" FK the moment the statements row it pointed to
-- is deleted below.
--
-- Same two-step pattern as 009_cleanup_pre_investment_statements.sql:
-- Supabase blocks direct SQL DELETE on storage.objects ("Use the Storage
-- API instead"), so this only removes the DB rows and prints the storage
-- paths — finish by pasting Part 3's output into, on
-- admin/documents.html's browser console (signed in as admin):
--   await sb.storage.from('statements').remove([ /* paste array here */ ]);
--
-- Inspect what this will remove BEFORE running the deletes, by running
-- the SELECT in Part 1 on its own first.

-- ---------------------------------------------------------------------
-- Part 1: every existing Dividend statement (session-scoped temp table)
-- ---------------------------------------------------------------------
drop table if exists _bundled_dividend_statements;
create temporary table _bundled_dividend_statements as
select id, storage_path, investor_id, period_label
from public.statements
where type = 'Dividend';

-- Inspect before deleting:
select * from _bundled_dividend_statements order by investor_id, period_label;

-- ---------------------------------------------------------------------
-- Part 2: delete the DB rows — comment this block out if you just want
-- to review Part 1's output first, then re-run the file once satisfied.
-- ---------------------------------------------------------------------
delete from public.statements
where id in (select id from _bundled_dividend_statements);

select count(*) as deleted_statements from _bundled_dividend_statements;

-- ---------------------------------------------------------------------
-- Part 3: the storage paths whose DB rows were just deleted — copy this
-- JSON array into the sb.storage.from('statements').remove([...]) call
-- described above to finish deleting the actual PDF files.
-- ---------------------------------------------------------------------
select json_agg(storage_path) as storage_paths_to_delete from _bundled_dividend_statements;

drop table _bundled_dividend_statements;
