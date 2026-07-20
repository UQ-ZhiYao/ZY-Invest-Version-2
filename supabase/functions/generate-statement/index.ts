// Supabase Edge Function: generate-statement
//
// Called from the admin console (see assets/js/statements-admin.js) to
// generate a Subscription/Redemption/Dividend/Annual statement PDF on
// demand, upload it to the `statements` Storage bucket, and record it in
// the `statements` table. Mirrors the logic in scripts/statements/ (the
// standalone Python/ReportLab CLI) — that tool still works for offline/
// batch generation, this function is the same math and layout wired up to
// a button instead of a terminal.
//
// Deploy:  supabase functions deploy generate-statement
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, which Supabase
// injects into every Edge Function automatically — nothing extra to set.
import { createClient } from "npm:@supabase/supabase-js@2";

import { buildAnnualPdf } from "./lib/build_annual.ts";
import { buildDividendPdf } from "./lib/build_dividend.ts";
import { buildSubscriptionPdf } from "./lib/build_subscription.ts";
import {
  addressFromProfile,
  magnitude,
  netCostAsof,
  netUnitsAsof,
  parseDate,
} from "./lib/compute.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_SETTLEMENT_TYPE = "Banking";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Personal Account: just the investor's own name. Joint Account: every
// holder under that joint_account_id, so the letter is addressed to all
// of them — the postal address itself still comes from this one profile.
async function registeredNameFor(sb: ReturnType<typeof createClient>, profile: Record<string, any>): Promise<string> {
  if (!profile.joint_account_id) return profile.full_name || "-";
  const { data } = await sb
    .from("profiles")
    .select("full_name")
    .eq("joint_account_id", profile.joint_account_id)
    .order("full_name", { ascending: true });
  const names = (data || []).map((r: any) => r.full_name).filter(Boolean);
  return names.length ? names.join(" & ") : (profile.full_name || "-");
}

async function investorInfo(sb: ReturnType<typeof createClient>, profile: Record<string, any>) {
  const addr = addressFromProfile(profile);
  return {
    accountType: profile.joint_account_id ? "Joint Account" : "Personal Account",
    accountId: String(profile.id || "").slice(0, 8),
    registeredName: await registeredNameFor(sb, profile),
    settlementType: DEFAULT_SETTLEMENT_TYPE,
    phone: profile.phone || "-",
    email: profile.email || "-",
    bankName: profile.bank_name || "-",
    bankAccountNo: profile.bank_account_no || "-",
    addressLine1: addr.line1,
    addressLine2: addr.line2,
    addressLine3: addr.line3,
    addressLine4: addr.line4,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify the caller is a signed-in admin before touching any data — this
  // function runs with the service role key (bypasses RLS) specifically so
  // it can read every investor's records, so the admin check below is the
  // only thing standing between "any authenticated user" and "everyone's
  // financial data."
  const authHeader = req.headers.get("Authorization") || "";
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: callerProfile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (callerProfile?.role !== "admin") return json({ error: "Forbidden — admin only" }, 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    switch (body.type) {
      case "Subscription":
      case "Redemption":
        return await handleSubscriptionOrRedemption(sb, body);
      case "Dividend":
        return await handleDividend(sb, body);
      case "Annual":
        return await handleAnnual(sb, body);
      default:
        return json({ error: "type must be one of Subscription, Redemption, Dividend, Annual" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function storeStatement(
  sb: ReturnType<typeof createClient>,
  {
    pdfBytes,
    investorId,
    statementType,
    periodLabel,
    transactionId,
    fyId,
    fileName,
  }: {
    pdfBytes: Uint8Array;
    investorId: string;
    statementType: string;
    periodLabel: string;
    transactionId?: string | null;
    fyId?: string | null;
    fileName: string;
  },
) {
  const storagePath = `${investorId}/${statementType.toLowerCase()}/${fileName}`;
  const { error: upErr } = await sb.storage
    .from("statements")
    .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: row, error: insErr } = await sb
    .from("statements")
    .insert({
      investor_id: investorId,
      type: statementType,
      period_label: periodLabel,
      transaction_id: transactionId ?? null,
      fy_id: fyId ?? null,
      storage_path: storagePath,
      file_name: fileName,
    })
    .select()
    .single();
  if (insErr) throw new Error(`statements insert failed: ${insErr.message}`);
  return row;
}

async function handleSubscriptionOrRedemption(sb: ReturnType<typeof createClient>, body: Record<string, any>) {
  const { txId } = body;
  if (!txId) return json({ error: "txId is required" }, 400);

  const { data: tx, error } = await sb.from("capital_injection").select("*").eq("id", txId).single();
  if (error || !tx) return json({ error: `No capital_injection row with id=${txId}` }, 404);

  const { data: profile } = await sb.from("profiles").select("*").eq("id", tx.uid).single();
  if (!profile) return json({ error: `No profile found for uid=${tx.uid}` }, 404);

  const { data: allCis } = await sb.from("capital_injection").select("*").eq("uid", tx.uid);
  const txDate = parseDate(tx.date);
  const prior = (allCis || []).filter((r: any) => r.id !== tx.id);
  const openingUnits = netUnitsAsof(prior, txDate);
  const openingCost = netCostAsof(prior, txDate, tx.uid);

  const investor = await investorInfo(sb, profile);

  const pdfBytes = await buildSubscriptionPdf({ tx, investor, openingUnits, openingCost });
  const fileName = `${tx.type}_${tx.reference_id || tx.id}.pdf`;

  const row = await storeStatement(sb, {
    pdfBytes, investorId: tx.uid, statementType: tx.type,
    periodLabel: txDate.toISOString().slice(0, 10).split("-").reverse().join("/"),
    transactionId: tx.id, fileName,
  });
  return json(row);
}

async function handleDividend(sb: ReturnType<typeof createClient>, body: Record<string, any>) {
  const { investorId, fyId } = body;
  if (!investorId || !fyId) return json({ error: "investorId and fyId are required" }, 400);

  const { data: profile } = await sb.from("profiles").select("*").eq("id", investorId).single();
  if (!profile) return json({ error: `No profile found for id=${investorId}` }, 404);
  const { data: fy } = await sb.from("fy_settings").select("*").eq("id", fyId).single();
  if (!fy) return json({ error: `No fy_settings row with id=${fyId}` }, 404);

  const { data: dists } = await sb.from("distributions").select("*").eq("fy", fy.label).order("ex_date");
  if (!dists || !dists.length) return json({ error: `No distributions found for FY '${fy.label}'` }, 404);

  const { data: allCis } = await sb.from("capital_injection").select("*").eq("uid", investorId);
  const fyEnd = parseDate(fy.end_date);
  const holdingUnits = netUnitsAsof(allCis || [], fyEnd, investorId);

  const investor = await investorInfo(sb, profile);

  const pdfBytes = await buildDividendPdf({ distributions: dists, investor, holdingUnits, periodText: fy.label });
  const fileName = `Dividend_${(profile.full_name || "investor").replace(/\s+/g, "_")}_${fy.label}.pdf`;

  const row = await storeStatement(sb, {
    pdfBytes, investorId, statementType: "Dividend", periodLabel: fy.label, fyId: fy.id, fileName,
  });
  return json(row);
}

async function handleAnnual(sb: ReturnType<typeof createClient>, body: Record<string, any>) {
  const { investorId, fyId, realizedPl = 0, adjustment = 0 } = body;
  if (!investorId || !fyId) return json({ error: "investorId and fyId are required" }, 400);

  const { data: profile } = await sb.from("profiles").select("*").eq("id", investorId).single();
  if (!profile) return json({ error: `No profile found for id=${investorId}` }, 404);
  const { data: fy } = await sb.from("fy_settings").select("*").eq("id", fyId).single();
  if (!fy) return json({ error: `No fy_settings row with id=${fyId}` }, 404);

  const fyStart = parseDate(fy.start_date);
  const fyEnd = parseDate(fy.end_date);
  const dayBeforeFy = new Date(fyStart.getTime() - 86400000);

  const { data: allCisRaw } = await sb.from("capital_injection").select("*").eq("uid", investorId).order("date");
  const allCis = allCisRaw || [];
  const openingUnits = netUnitsAsof(allCis, dayBeforeFy, investorId);
  const openingCost = netCostAsof(allCis, dayBeforeFy, investorId);
  const closingUnits = netUnitsAsof(allCis, fyEnd, investorId);
  const closingCost = netCostAsof(allCis, fyEnd, investorId);
  const transactionsInFy = allCis.filter(
    (r: any) => r.status === "Approved" && r.uid === investorId &&
      parseDate(r.date) >= fyStart && parseDate(r.date) <= fyEnd,
  );

  const { data: distsRaw } = await sb.from("distributions").select("*").eq("fy", fy.label).order("ex_date");
  const dists = distsRaw || [];
  const distributionsInFy = dists.filter((d: any) => {
    const p = parseDate(d.pay_date || d.ex_date);
    return p >= fyStart && p <= fyEnd;
  });

  const { data: ntaRow } = await sb
    .from("nta_daily").select("date,nta").lte("date", fyEnd.toISOString().slice(0, 10))
    .order("date", { ascending: false }).limit(1).maybeSingle();
  const latestNav = ntaRow ? Number(ntaRow.nta) : 1.0;

  const cashflows: [Date, number][] = [];
  for (const r of allCis) {
    if (r.status !== "Approved" || r.uid !== investorId) continue;
    const d = parseDate(r.date);
    if (d > fyEnd) continue;
    // capital_injection stores amount signed (Redemption rows are
    // negative) — normalize to a magnitude, the sign here comes from type.
    const amt = magnitude(r.amount);
    cashflows.push([d, r.type === "Subscription" ? -amt : amt]);
  }
  for (const d of distributionsInFy) {
    const payDate = parseDate(d.pay_date || d.ex_date);
    const exDate = parseDate(d.ex_date);
    const unitsAtEx = netUnitsAsof(allCis, exDate, investorId);
    cashflows.push([payDate, (unitsAtEx * Number(d.dps)) / 100]);
  }
  cashflows.push([fyEnd, closingUnits * latestNav]);

  const investor = await investorInfo(sb, profile);

  const pdfBytes = await buildAnnualPdf({
    investor, fyStart, fyEnd, openingUnits, openingCost, closingUnits, closingCost,
    latestNavPerUnit: latestNav, transactionsInFy, distributionsInFy, cashflowsForIrr: cashflows,
    realizedPl, adjustment,
  });
  const fileName = `Annual_${(profile.full_name || "investor").replace(/\s+/g, "_")}_${fy.label}.pdf`;

  const row = await storeStatement(sb, {
    pdfBytes, investorId, statementType: "Annual", periodLabel: fy.label, fyId: fy.id, fileName,
  });
  return json(row);
}
