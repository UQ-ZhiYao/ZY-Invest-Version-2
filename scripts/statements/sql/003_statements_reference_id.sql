-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql.
--
-- Adds the statement's own reference number, generated at statement-creation
-- time by the generate-statement edge function: {TypeLetter}{YYMMDD}{UID}{XX}
-- where TypeLetter is I/S/R/D for Annual/Subscription/Redemption/Dividend,
-- YYMMDD is the generation date, UID is the first 3 characters of the
-- investor's Account ID, and XX is a running count of that investor's
-- statements of that type. This is distinct from
-- capital_injection.reference_id, which identifies the underlying
-- transaction rather than the generated statement document.

alter table public.statements
  add column if not exists reference_id text;

create unique index if not exists statements_reference_id_idx
  on public.statements(reference_id);
