# generate-statement (Supabase Edge Function)

Generates a Subscription/Redemption/Dividend/Annual statement PDF on demand
and files it in Supabase Storage + the `statements` table — this is what the
"Generate Statement" buttons in the admin console call
(`admin/principal.html`'s transaction detail modal, and `admin/investors.html`'s
investor drawer). It's the same math and PDF layout as the standalone
Python CLI in `scripts/statements/`, just wired up to a button instead of a
terminal — pick whichever fits: the CLI for offline/scripted runs, this
function for the in-browser button. **Keep both in sync by hand** if you
change the statement layout or the underlying math; they're independent
implementations (Python/ReportLab vs. TypeScript/pdf-lib) so nothing enforces
that automatically.

## Deploy

Requires the Supabase CLI (`npm install -g supabase` or see their docs).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase functions deploy generate-statement
```

**Important — CORS preflight will fail without this:** Supabase's platform
gateway verifies a JWT on every request by default, including the browser's
CORS preflight (`OPTIONS`), which never carries an Authorization header per
the CORS spec. That makes the gateway reject the preflight with 401 before
it reaches this function's own code, which the browser reports as a blocked
CORS request ("preflight ... does not have HTTP ok status"). The repo's
`supabase/config.toml` sets `verify_jwt = false` for this function to fix
that — this function does its own (stricter) check inside `index.ts`
anyway (valid JWT **and** `profiles.role = 'admin'`), so the platform's
blanket check isn't needed. If your Supabase CLI version doesn't pick up
`config.toml` automatically, deploy with the flag explicitly instead:

```bash
supabase functions deploy generate-statement --no-verify-jwt
```

Run `sql/001_statements_table.sql` (in `scripts/statements/sql/`) first if
you haven't already — this function writes to the same `statements` table
and `statements` Storage bucket the Python CLI uses.

No extra environment variables to set: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are injected into every Edge Function
automatically by Supabase. The function uses the service role key
server-side (bypassing RLS to read every investor's data) but only *after*
verifying the caller's JWT belongs to a `profiles.role = 'admin'` account —
see the auth check at the top of `index.ts`. Never expose this function's
logic to non-admins.

## Calling it

`POST /functions/v1/generate-statement` with an `Authorization: Bearer <admin's access token>`
header and a JSON body:

```jsonc
// Subscription or Redemption
{ "type": "Subscription", "txId": "<capital_injection.id>" }
{ "type": "Redemption", "txId": "<capital_injection.id>" }

// Dividend
{ "type": "Dividend", "investorId": "<uuid>", "fyId": "<fy_settings.id>" }

// Annual (realizedPl/adjustment optional — see "Known gaps" below)
{ "type": "Annual", "investorId": "<uuid>", "fyId": "<fy_settings.id>",
  "realizedPl": 0, "adjustment": 0 }
```

Returns the inserted `statements` row (including `storage_path`) on success,
or `{ "error": "..." }` with a 4xx/5xx status. See
`assets/js/statements-admin.js` for the browser-side call — it also fetches
a short-lived signed URL for the uploaded PDF and opens it in a new tab.

## Known gaps

Same as the Python CLI (search `scripts/statements/README.md` for "Known
gaps") — `profiles` has no Account Type/Nominee columns, EPS/DPR aren't
tracked, and Realized P&L / the Annual statement's "Adjustment" plug default
to 0.

## Testing

Deno isn't available in every dev environment (it wasn't in the one this was
built in), so this was verified by running the *same* PDF-drawing/math logic
as plain Node.js against pdf-lib (byte-identical output — see the commit
history for the `/tmp` throwaway harness used) and cross-checked visually
against the already-verified Python/ReportLab output. The Deno-specific
parts (`Deno.serve`, `npm:` specifiers, the Supabase Edge Function
request/response contract) follow Supabase's own documented patterns and
this repo's existing `admin-update-password` function, but haven't been
exercised against a live Supabase project by this tool — test the three
buttons against a real (ideally staging) project before relying on them.
