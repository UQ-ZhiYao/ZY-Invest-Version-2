# Statement generator

Fills the finance team's Excel statement templates with live Supabase data and
renders each one to a PDF, then files it in Supabase Storage + a new
`statements` table linked back to the source transaction.

Covers 3 of the 4 sheets in `templates/ZYInvest_Statement_Templates.xlsx`:

| Statement | Sheet | Driven by |
|---|---|---|
| Subscription / Redemption | `Subscription` | one `capital_injection` row |
| Dividend | `Dividend` | one investor + one FY's `distributions` rows |
| Annual (Investment Account Statement) | `Annual` | one investor + one FY |

`Factsheet` isn't covered — it's fund-level (holdings/allocation), not tied to
an investor or a transaction, so it doesn't fit the "generate per transaction"
model the other three do.

## Setup

```bash
cd scripts/statements
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

You also need LibreOffice with the Calc component installed (`soffice` +
`libreoffice-calc` — on Debian/Ubuntu: `apt install libreoffice-calc`; the
`-core`-only package is not enough, it can't open any document format).

Run the new table + storage bucket SQL once, in the Supabase SQL editor:
`sql/001_statements_table.sql`. It assumes an `is_admin()` function already
exists in the project (the admin console's own code references one).

## Usage

```bash
python generate_statement.py subscription --tx-id <capital_injection.id>
python generate_statement.py redemption   --tx-id <capital_injection.id>
python generate_statement.py dividend     --investor-id <uuid> --fy-id <fy_settings.id>
python generate_statement.py annual       --investor-id <uuid> --fy-id <fy_settings.id>
```

Add `--no-upload` to write the PDF to `output/` only, without touching
Storage or the `statements` table (useful for a first look).

Run `python test_offline.py` any time you change the `fill_*`/`render_pdf`
modules — it exercises the whole pipeline with synthetic data and needs no
Supabase connection, so you can sanity-check a change before pointing it at
production data.

## How it works

1. Pulls the investor's profile and the relevant transaction rows straight
   from Postgres (via the service role key, bypassing RLS — this is a
   trusted backend job, not something that runs in the browser).
2. Does the same math the admin console already does client-side (units/cost
   as-of a date, mirrored from `principal-admin.js` / `distributions-admin.js`)
   plus an XIRR for the Annual statement's "Annualized Performance" figure.
3. Opens a fresh copy of the template and writes every computed number as a
   **plain value**, not a formula — deliberately, see `src/fill_common.py`'s
   docstring: a generated statement is a frozen historical record (like a
   bank statement), so it must not silently change if tomorrow's NAV or a
   later profile edit would change what a live formula resolves to.
4. Strips every other sheet from the workbook (so the PDF doesn't include the
   Control/Data/Investor Data internals), converts to PDF via headless
   LibreOffice, uploads it to the `statements` Storage bucket, and inserts a
   row into `statements` linking it back to the investor and transaction/FY.

## Known gaps

A few fields exist in the template but aren't tracked in Supabase today.
They render safely (`-`, `0`, or a sensible default) rather than a fabricated
number — search each file for the comment before "trusting" these:

- **Account Type / Joint / Nominee** — `profiles` has no such columns yet;
  every investor renders as "Direct Account" with no nominee. Add
  `account_type` / `nominee_name` columns if this needs to be real.
- **EPS / DPR** (Dividend sheet) — no per-instrument earnings data tracked;
  render as `-`.
- **Realized P&L** (Annual sheet, field `d`) — no ledger of realized gains on
  redemptions exists yet; defaults to 0, overridable with `--realized-pl`.
- **"Adjustment"** (Annual sheet, field `f`) — the original template treats
  this as a manual plug with no formula behind it either; defaults to 0,
  overridable with `--adjustment`.
- **Annual sheet's Principal Transaction table** shows Opening/Closing with
  the *net* cashflow/units for the year on the Closing row, not one row per
  transaction — the sheet's layout is fixed-size (inserting rows would shift
  the Account Summary block that shares those row numbers in a different
  column range). Generate individual Subscription/Redemption statements
  alongside the Annual one if you need every transaction itemised.
- **Dividend line-items are capped at 2** (Interim + Final) on both the
  Dividend and Annual sheets — the template ships with exactly that many
  pre-formatted rows. A third distribution in the same FY raises a clear
  error rather than corrupting the layout.

## Deployment

This is a standalone script, not a web service — run it however fits: by
hand, on a cron schedule, from a GitHub Actions workflow, or wrapped into a
small container job. Nothing here assumes a particular host.
