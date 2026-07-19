-- Run once in the Supabase SQL editor (or `supabase db push` if you adopt the CLI later).
--
-- Assumes an `is_admin()` function already exists in this project — the admin
-- console's own error copy references it ("Check ... that is_admin() returns
-- true for your account", assets/js/admin-supabase.js) — so these policies
-- reuse it rather than redefining admin-detection logic.

create table if not exists public.statements (
  id              uuid primary key default gen_random_uuid(),
  investor_id     uuid not null references public.profiles(id) on delete cascade,
  type            text not null check (type in ('Subscription', 'Redemption', 'Dividend', 'Annual')),
  period_label    text not null,               -- e.g. '12/12/2025' or 'FY2025 (1/12/2024 - 30/11/2025)'
  transaction_id  uuid references public.capital_injection(id) on delete set null,
  fy_id           uuid references public.fy_settings(id) on delete set null,
  storage_path    text not null,               -- bucket-relative path in the 'statements' bucket
  file_name       text not null,
  generated_at    timestamptz not null default now()
);

create index if not exists statements_investor_id_idx on public.statements(investor_id);
create index if not exists statements_transaction_id_idx on public.statements(transaction_id);

alter table public.statements enable row level security;

-- Investors can list/download only their own statements.
create policy "investors read own statements"
  on public.statements for select
  using (auth.uid() = investor_id);

-- Admins (the generator script runs with the service role key, which bypasses
-- RLS entirely — these policies are for the admin console reading over the
-- anon/authenticated key instead).
create policy "admins read all statements"
  on public.statements for select
  using (is_admin());

create policy "admins manage statements"
  on public.statements for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------
-- Storage: create a private 'statements' bucket (Dashboard → Storage → New
-- bucket → uncheck "Public") then run the two policies below on
-- storage.objects. Objects are stored at {investor_id}/{type}/{file_name}.pdf
-- so the folder-name check below scopes each investor to their own prefix.
-- ---------------------------------------------------------------------

create policy "investors read own statement files"
  on storage.objects for select
  using (
    bucket_id = 'statements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "admins read all statement files"
  on storage.objects for select
  using (bucket_id = 'statements' and is_admin());
