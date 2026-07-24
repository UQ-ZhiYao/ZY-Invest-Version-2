-- Run once in the Supabase SQL editor. Companion to 010_dividend_per_distribution.sql
-- and 007_auto_generate_statements.sql/008_tighten_statement_eligibility.sql
-- (which this further redefines).
--
-- Dividend statements are now one-per-distribution, each priced off the
-- investor's holding as of that distribution's own ex_date (see
-- generate-statement/index.ts's handleDividend()) — not one-per-FY priced
-- off the FY-end holding. The trigger already fires once per distributions
-- row insert, so `new` already IS the one distribution in question — no
-- need to loop fy_settings or pass a fyId, and eligibility/dedup both key
-- off new.ex_date / new.id directly instead of a financial year.

create or replace function public._auto_generate_dividend_statements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
begin
  for target in
    select p.id as investor_id
    from public.profiles p
    where exists (
      select 1 from public.capital_injection ci
      where ci.uid = p.id and ci.status = 'Approved' and ci.date <= new.ex_date
    )
    union
    select ja.id as investor_id
    from public.joint_accounts ja
    where exists (
      select 1 from public.capital_injection ci
      where ci.status = 'Approved' and ci.date <= new.ex_date
        and (
          ci.uid = ja.id
          or ci.uid in (select p2.id from public.profiles p2 where p2.joint_account_id = ja.id)
        )
    )
  loop
    if not exists (
      select 1 from public.statements
      where type = 'Dividend' and investor_id = target.investor_id and distribution_id = new.id
    ) then
      perform public._call_generate_statement(
        jsonb_build_object('type', 'Dividend', 'investorId', target.investor_id, 'distributionId', new.id)
      );
    end if;
  end loop;
  return new;
end;
$$;
