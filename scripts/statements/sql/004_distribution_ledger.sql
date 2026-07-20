-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql.
--
-- `distributions` records one fund-wide declaration (ex_date, pay_date, dps,
-- ...) with no per-investor breakdown, so there is nowhere to persist what
-- each investor was actually paid, or to link that payout to the Dividend
-- statement it was reported on. distribution_ledger fills that gap: one row
-- per (distribution, investor) pair, carrying the holding units and amount
-- used in that investor's payout calculation and a link to the generated
-- statement, the same way capital_injection.id is linked via
-- statements.transaction_id.

create table if not exists public.distribution_ledger (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  investor_id     uuid not null references public.profiles(id) on delete cascade,
  holding_units   numeric not null,   -- investor's units as of the distribution's ex_date
  dps             numeric not null,   -- copied from distributions.dps at ledger-creation time
  amount          numeric not null,   -- holding_units * dps / 100, rounded to cents
  statement_id    uuid references public.statements(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (distribution_id, investor_id)
);

create index if not exists distribution_ledger_investor_id_idx on public.distribution_ledger(investor_id);
create index if not exists distribution_ledger_distribution_id_idx on public.distribution_ledger(distribution_id);
create index if not exists distribution_ledger_statement_id_idx on public.distribution_ledger(statement_id);

alter table public.distribution_ledger enable row level security;

-- Investors can view only their own ledger rows.
create policy "investors read own distribution ledger"
  on public.distribution_ledger for select
  using (auth.uid() = investor_id);

-- Admins (the generator script runs with the service role key, which bypasses
-- RLS entirely — these policies are for the admin console reading over the
-- anon/authenticated key instead).
create policy "admins read all distribution ledger"
  on public.distribution_ledger for select
  using (is_admin());

create policy "admins manage distribution ledger"
  on public.distribution_ledger for all
  using (is_admin())
  with check (is_admin());
