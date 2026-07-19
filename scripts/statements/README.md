# Statement generator

Reads live Supabase data, computes the numbers, and draws each statement
straight to PDF with [ReportLab](https://www.reportlab.com/) — a pure-Python
library with no external binary or service to install (no LibreOffice, no
headless browser, nothing to `apt install`). `pip install -r requirements.txt`
is the entire setup.

Covers 3 statement types:

| Statement | Driven by |
|---|---|
| Subscription / Redemption | one `capital_injection` row |
| Dividend | one investor + one FY's `distributions` rows |
| Annual (Investment Account Statement) | one investor + one FY |

The original finance-team template (`templates/ZYInvest_Statement_Templates.xlsx`)
is kept only as a **design reference** — its fonts/colors/layout were read
once with openpyxl to match this PDF output to it, but nothing here opens or
converts that file at runtime anymore.

**Want a button instead of a terminal?** See
`supabase/functions/generate-statement/` — a TypeScript port of this same
logic (using pdf-lib instead of ReportLab) deployed as a Supabase Edge
Function, called from the admin console's "Generate Statement" buttons
(`admin/principal.html`, `admin/investors.html`). It's a second, independent
implementation of the same math and layout — keep both in sync by hand if
you change either.

## Setup

```bash
cd scripts/statements
pip install -r requirements.txt
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

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

Run `python test_offline.py` any time you change `compute.py`/`pdf_*.py` — it
exercises the whole pipeline with synthetic data and needs no Supabase
connection, so you can sanity-check a change before pointing it at
production data.

## How it works

1. Pulls the investor's profile and the relevant transaction rows straight
   from Postgres (via the service role key, bypassing RLS — this is a
   trusted backend job, not something that runs in the browser).
2. Does the same math the admin console already does client-side (units/cost
   as-of a date, mirrored from `principal-admin.js` / `distributions-admin.js`)
   plus an XIRR for the Annual statement's "Annualized Performance" figure.
3. Draws the statement directly with ReportLab (`src/pdf_common.py` +
   `pdf_subscription.py` / `pdf_dividend.py` / `pdf_annual.py`) — every number
   is baked in as plain text, not a formula, since a generated statement is a
   frozen historical record (like a bank statement): it must not silently
   change if tomorrow's NAV or a later profile edit would change what a live
   lookup resolves to.
4. Uploads the PDF to the `statements` Storage bucket and inserts a row into
   `statements` linking it back to the investor and transaction/FY.

The Annual statement itemises every subscription/redemption and every
distribution within the FY (not just an opening/closing net summary) — the
old Excel-based version could only show Opening/Closing because inserting
rows into a fixed spreadsheet layout risked corrupting the sheet; a plain PDF
table just grows to fit.

## Known gaps

A few fields exist in the original template but aren't tracked in Supabase
today. They render safely (`-`, `0`, or a sensible default) rather than a
fabricated number — search each file for the comment before "trusting" these:

- **Account Type / Joint / Nominee** — `profiles` has no such columns yet;
  every investor renders as "Direct Account" with no nominee. Add
  `account_type` / `nominee_name` columns if this needs to be real.
- **EPS / DPR** (Dividend statement) — no per-instrument earnings data
  tracked; render as `-`.
- **Realized P&L** (Annual statement, field `d`) — no ledger of realized
  gains on redemptions exists yet; defaults to 0, overridable with
  `--realized-pl`.
- **"Adjustment"** (Annual statement, field `f`) — the original template
  treated this as a manual plug with no formula behind it either; defaults
  to 0, overridable with `--adjustment`.

## Deployment

This is a standalone script, not a web service — run it however fits: by
hand, on a cron schedule, from a GitHub Actions workflow, or wrapped into a
small container job. Being pure Python with no system dependency, it can run
anywhere `pip install` works, including inside a serverless/Edge Function
runtime that supports Python.
