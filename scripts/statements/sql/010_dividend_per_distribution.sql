-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql
-- and 004_distribution_ledger.sql.
--
-- Dividend statements move from one-per-financial-year (bundling every
-- distribution declared in that FY into a single PDF, all priced off the
-- investor's FY-end holding) to one-per-distribution, each priced off the
-- investor's holding as of that specific distribution's own ex_date — see
-- generate-statement/index.ts's handleDividend(). statements needs its own
-- distribution_id the same way it already has transaction_id for
-- Subscription/Redemption, to key a Dividend statement to the one
-- distribution it actually reports on (and to dedupe against, replacing
-- the old investor+fy_id key).

alter table public.statements
  add column if not exists distribution_id uuid references public.distributions(id) on delete set null;

create index if not exists statements_distribution_id_idx on public.statements(distribution_id);
