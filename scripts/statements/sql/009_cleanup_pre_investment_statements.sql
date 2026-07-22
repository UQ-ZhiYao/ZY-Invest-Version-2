-- Run once in the Supabase SQL editor, AFTER 008_tighten_statement_eligibility.sql
-- and after redeploying the generate-statement edge function (both close off
-- the bug so it can't recur). This script removes the bad Annual/Dividend
-- statements the bug already produced: any statement for a FY that ended
-- before the investor's own first Approved capital_injection date — a
-- period they had no investment record for yet.
--
-- Targeting mirrors 006_distribution_ledger_backfill.sql's investor-scope
-- resolution (personal profiles + joint accounts, co-holder uids unioned
-- in either direction).
--
-- Deletes, in dependency order: the distribution_ledger rows linked to a
-- bad statement, then the statements row itself.
--
-- The PDF files themselves are NOT deleted here — Supabase blocks direct
-- SQL DELETE on storage.objects (a protect_delete() trigger raises
-- "Direct deletion from storage tables is not allowed. Use the Storage
-- API instead."), even though admins already have a delete policy for
-- the 'statements' bucket via that API (002_statements_admin_storage_delete.sql).
-- Part 3 below prints the storage paths this script removed the DB rows
-- for — after running this file, open the browser console on
-- admin/documents.html (already signed in as admin, so `sb` is ready)
-- and run:
--   await sb.storage.from('statements').remove([ /* paste the JSON array
--   Part 3's final SELECT prints */ ]);
--
-- Inspect what this will remove BEFORE running the deletes below, by
-- running the SELECT in Part 1 on its own first.

-- ---------------------------------------------------------------------
-- Part 1: build the list of bad statement ids (session-scoped temp table)
-- ---------------------------------------------------------------------
drop table if exists _bad_statements;
create temporary table _bad_statements as
with joint_uids as (
  select ja.id as joint_account_id, ja.id as uid from public.joint_accounts ja
  union all
  select p.joint_account_id, p.id from public.profiles p where p.joint_account_id is not null
),
joint_scope as (
  select joint_account_id, array_agg(distinct uid) as ci_uids
  from joint_uids
  group by joint_account_id
),
investor_scope as (
  select p.id as investor_id, array_remove(array[p.id, p.joint_account_id], null) as ci_uids
  from public.profiles p
  union all
  select js.joint_account_id as investor_id, js.ci_uids
  from joint_scope js
),
first_injection as (
  select s.investor_id, min(ci.date) as first_date
  from investor_scope s
  join public.capital_injection ci
    on ci.uid = any(s.ci_uids) and ci.status = 'Approved'
  group by s.investor_id
)
select st.id, st.storage_path, st.type, st.investor_id, fy.label as fy_label, fy.end_date as fy_end_date,
  fi.first_date as investor_first_injection_date
from public.statements st
join public.fy_settings fy on fy.id = st.fy_id
left join first_injection fi on fi.investor_id = st.investor_id
where st.type in ('Annual', 'Dividend')
  and (fi.first_date is null or fi.first_date > fy.end_date);

-- Inspect before deleting:
select * from _bad_statements order by investor_id, fy_end_date;

-- ---------------------------------------------------------------------
-- Part 2: delete the DB rows — comment this whole block out if you just
-- want to review Part 1's output first, then re-run the file once
-- satisfied.
-- ---------------------------------------------------------------------
delete from public.distribution_ledger
where statement_id in (select id from _bad_statements);

delete from public.statements
where id in (select id from _bad_statements);

select count(*) as deleted_statements from _bad_statements;

-- ---------------------------------------------------------------------
-- Part 3: the storage paths whose DB rows were just deleted — copy this
-- JSON array straight into the sb.storage.from('statements').remove([...])
-- call described above to finish deleting the actual PDF files.
-- ---------------------------------------------------------------------
select json_agg(storage_path) as storage_paths_to_delete from _bad_statements;

drop table _bad_statements;
