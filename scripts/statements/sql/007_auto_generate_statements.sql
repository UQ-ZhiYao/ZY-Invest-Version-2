-- Run once in the Supabase SQL editor. Companion to 001_statements_table.sql,
-- 004_distribution_ledger.sql, and ../../nta/sql/001_nta_daily_cron.sql
-- (source of the service_role key stored in Vault, reused here).
--
-- Automatically calls the generate-statement edge function:
--   1. Subscription/Redemption — the moment a capital_injection row's
--      status becomes 'Approved'.
--   2. Dividend — the moment a new distributions row is recorded, for
--      every investor (personal profile or joint account) with capital
--      injection history.
--   3. Annual — once a day (pg_cron), for every financial year whose
--      end_date was exactly yesterday, for every eligible investor.
--
-- Every path skips anything that already has a matching statement on
-- file — the same de-dup rule "Generate All Statements" already uses in
-- documents.html — so this can't spam duplicates. It doesn't replace that
-- manual bulk-generate button either: that stays as the catch-up tool for
-- anything a technical issue (edge function not redeployed yet, a failed
-- HTTP call, etc.) caused to be missed here.
--
-- Requires pg_cron and pg_net (see ../../nta/sql/001_nta_daily_cron.sql,
-- which also sets these up) and the 'nta_compute_service_role_key' Vault
-- secret that same migration created — despite the name, it's just the
-- project's service_role key, reused here rather than asking you to paste
-- it into Vault a second time.

-- Shared helper: fire an async POST to generate-statement. net.http_post
-- returns immediately with a request id — the actual HTTP call runs in
-- the background — same fire-and-forget pattern the NTA cron job uses.
-- Check net._http_response to see how a given call actually went.
create or replace function public._call_generate_statement(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://wvaibdjkjnnesefantjc.supabase.co/functions/v1/generate-statement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nta_compute_service_role_key'
      ),
      'apikey', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'nta_compute_service_role_key'
      )
    ),
    body := payload
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Subscription / Redemption — fires when a capital_injection row's
--    status transitions TO 'Approved' (covers both a brand-new row
--    inserted already-Approved, and an existing Pending row being
--    approved).
-- ---------------------------------------------------------------------

create or replace function public._auto_generate_tx_statement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Approved' and (tg_op = 'INSERT' or old.status is distinct from 'Approved') then
    if not exists (select 1 from public.statements where transaction_id = new.id) then
      perform public._call_generate_statement(jsonb_build_object('type', new.type, 'txId', new.id));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists auto_generate_tx_statement on public.capital_injection;
create trigger auto_generate_tx_statement
  after insert or update on public.capital_injection
  for each row
  execute function public._auto_generate_tx_statement();

-- ---------------------------------------------------------------------
-- 2. Dividend — fires when a new distributions row is recorded, for
--    every investor (personal profile or joint account) with capital
--    injection history — same targeting "Generate All Statements" uses.
-- ---------------------------------------------------------------------

create or replace function public._auto_generate_dividend_statements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fy_row record;
  target record;
begin
  select id into fy_row from public.fy_settings where label = new.fy limit 1;
  if fy_row.id is null then
    return new; -- no matching fy_settings row yet — nothing to generate against
  end if;

  for target in
    select p.id as investor_id
    from public.profiles p
    where exists (select 1 from public.capital_injection ci where ci.uid = p.id and ci.status = 'Approved')
    union
    select ja.id as investor_id
    from public.joint_accounts ja
    where exists (
      select 1 from public.capital_injection ci
      where ci.status = 'Approved'
        and (
          ci.uid = ja.id
          or ci.uid in (select p2.id from public.profiles p2 where p2.joint_account_id = ja.id)
        )
    )
  loop
    if not exists (
      select 1 from public.statements
      where type = 'Dividend' and investor_id = target.investor_id and fy_id = fy_row.id
    ) then
      perform public._call_generate_statement(
        jsonb_build_object('type', 'Dividend', 'investorId', target.investor_id, 'fyId', fy_row.id)
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists auto_generate_dividend_statements on public.distributions;
create trigger auto_generate_dividend_statements
  after insert on public.distributions
  for each row
  execute function public._auto_generate_dividend_statements();

-- ---------------------------------------------------------------------
-- 3. Annual — once a day, for every FY whose end_date was exactly
--    yesterday (so it runs the day after the FY actually closes).
-- ---------------------------------------------------------------------

create or replace function public._auto_generate_annual_statements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fy_row record;
  target record;
begin
  for fy_row in
    select id from public.fy_settings where end_date = (current_date - 1)
  loop
    for target in
      select p.id as investor_id
      from public.profiles p
      where exists (select 1 from public.capital_injection ci where ci.uid = p.id and ci.status = 'Approved')
      union
      select ja.id as investor_id
      from public.joint_accounts ja
      where exists (
        select 1 from public.capital_injection ci
        where ci.status = 'Approved'
          and (
            ci.uid = ja.id
            or ci.uid in (select p2.id from public.profiles p2 where p2.joint_account_id = ja.id)
          )
      )
    loop
      if not exists (
        select 1 from public.statements
        where type = 'Annual' and investor_id = target.investor_id and fy_id = fy_row.id
      ) then
        perform public._call_generate_statement(
          jsonb_build_object('type', 'Annual', 'investorId', target.investor_id, 'fyId', fy_row.id)
        );
      end if;
    end loop;
  end loop;
end;
$$;

select cron.unschedule('annual-statements-daily')
where exists (select 1 from cron.job where jobname = 'annual-statements-daily');

select cron.schedule(
  'annual-statements-daily',
  '0 10 * * *',  -- 10:00 UTC daily — after the 09:30 UTC NTA engine run
                 -- (001_nta_daily_cron.sql), so nta_daily is settled
                 -- through yesterday (the FY end date being checked)
                 -- before handleAnnual() reads it for latestNav.
  $$ select public._auto_generate_annual_statements(); $$
);

-- To test the Annual path on demand instead of waiting for the daily
-- schedule (only fires for a FY whose end_date is genuinely yesterday):
--   select public._auto_generate_annual_statements();
-- To check what the cron job has actually fired / any HTTP failures:
--   select * from net._http_response order by created desc limit 20;
-- To stop the daily Annual check:
--   select cron.unschedule('annual-statements-daily');
