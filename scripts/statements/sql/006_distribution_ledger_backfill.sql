-- Run once in the Supabase SQL editor.
--
-- One-time backfill: computes distribution_ledger rows for every existing
-- distribution x investor combination that actually held units as of that
-- distribution's ex_date, using the exact same math
-- generate-statement/index.ts's handleDividend() already uses per-request
-- (holding_units = net Approved capital_injection units up to and
-- including ex_date; amount = holding_units * dps / 100, rounded to
-- cents). Investor targeting mirrors "Generate All Statements"' bulk logic
-- in documents.html: every profile whose own id appears directly on a
-- capital_injection row, and every joint account whose own id or any
-- co-holder's own id does (see resolveInvestorScope() in
-- generate-statement/index.ts) — a profile that's a co-holder also has its
-- own uid set unioned with its joint account's, same as that function.
--
-- Safe to re-run: upserts on distribution_ledger's existing
-- (distribution_id, investor_id) unique constraint, and links statement_id
-- to an already-generated Dividend statement for that investor/FY when one
-- exists (without clobbering a statement_id an earlier run already found).
--
-- Rows where the computed holding is zero (an investor who, by this
-- particular distribution's ex_date, held nothing) are skipped — this is a
-- record of who actually got paid, not a cross product of every investor
-- against every distribution ever declared.

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
targets as (
  -- Personal: every profile whose own id shows up directly on an approved
  -- capital_injection row. Also covers their own joint_account_id (if
  -- any), matching resolveInvestorScope()'s handling of a co-holder whose
  -- joint transactions were posted under their own profile id.
  select p.id as investor_id, array_remove(array[p.id, p.joint_account_id], null) as ci_uids
  from public.profiles p
  where exists (
    select 1 from public.capital_injection ci
    where ci.uid = p.id and ci.status = 'Approved'
  )
  union all
  -- Joint accounts: their own id, plus every co-holder's own profile id.
  select js.joint_account_id as investor_id, js.ci_uids
  from joint_scope js
  where exists (
    select 1 from public.capital_injection ci
    where ci.status = 'Approved' and ci.uid = any(js.ci_uids)
  )
),
holdings as (
  select
    t.investor_id,
    d.id as distribution_id,
    d.dps,
    d.fy,
    greatest(coalesce(sum(
      case when ci.type = 'Subscription' then abs(ci.units)
           when ci.type = 'Redemption' then -abs(ci.units)
           else 0 end
    ), 0), 0) as holding_units
  from targets t
  cross join public.distributions d
  left join public.capital_injection ci
    on ci.uid = any(t.ci_uids)
    and ci.status = 'Approved'
    and ci.date <= d.ex_date
  group by t.investor_id, d.id, d.dps, d.fy
)
insert into public.distribution_ledger (distribution_id, investor_id, holding_units, dps, amount, statement_id)
select
  h.distribution_id,
  h.investor_id,
  h.holding_units,
  h.dps,
  round(h.holding_units * h.dps / 100, 2) as amount,
  s.id as statement_id
from holdings h
left join public.fy_settings fy on fy.label = h.fy
left join public.statements s
  on s.type = 'Dividend'
  and s.investor_id = h.investor_id
  and s.fy_id = fy.id
where h.holding_units > 0.0001
on conflict (distribution_id, investor_id) do update set
  holding_units = excluded.holding_units,
  dps = excluded.dps,
  amount = excluded.amount,
  statement_id = coalesce(public.distribution_ledger.statement_id, excluded.statement_id);

-- To check what it produced:
--   select * from public.distribution_ledger order by created_at desc limit 50;
