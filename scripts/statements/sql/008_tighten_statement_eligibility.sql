-- Run once in the Supabase SQL editor. Companion to 007_auto_generate_statements.sql.
--
-- Bug: the Dividend and Annual auto-generate triggers' eligibility check
-- was "has this investor EVER made an approved capital_injection" with no
-- date bound — so once an investor made their first capital injection,
-- they became eligible for a statement covering every FY/distribution on
-- record, including ones that closed years before they had any
-- investment. (The other source of the same bug, documents.html's
-- "Generate All Statements" bulk loop, and the generate-statement edge
-- function itself, are fixed separately in this same change — the edge
-- function's handleDividend/handleAnnual now reject a request for a
-- period before the investor's first approved capital injection, which is
-- the authoritative fix; this migration just brings these two trigger
-- functions' own eligibility check in line with it, so they don't even
-- attempt to call the edge function for a period that will just be
-- rejected.)
--
-- Redefines the same two functions 007 created — same triggers, no new
-- ones to (re)create.

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
  select id, end_date into fy_row from public.fy_settings where label = new.fy limit 1;
  if fy_row.id is null then
    return new; -- no matching fy_settings row yet — nothing to generate against
  end if;

  for target in
    select p.id as investor_id
    from public.profiles p
    where exists (
      select 1 from public.capital_injection ci
      where ci.uid = p.id and ci.status = 'Approved' and ci.date <= fy_row.end_date
    )
    union
    select ja.id as investor_id
    from public.joint_accounts ja
    where exists (
      select 1 from public.capital_injection ci
      where ci.status = 'Approved' and ci.date <= fy_row.end_date
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
    select id, end_date from public.fy_settings where end_date = (current_date - 1)
  loop
    for target in
      select p.id as investor_id
      from public.profiles p
      where exists (
        select 1 from public.capital_injection ci
        where ci.uid = p.id and ci.status = 'Approved' and ci.date <= fy_row.end_date
      )
      union
      select ja.id as investor_id
      from public.joint_accounts ja
      where exists (
        select 1 from public.capital_injection ci
        where ci.status = 'Approved' and ci.date <= fy_row.end_date
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
