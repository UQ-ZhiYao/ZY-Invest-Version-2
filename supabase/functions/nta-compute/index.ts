// ================================================================
// Supabase Edge Function: nta-compute
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY') || '';

const MTM_PRODUCTS = new Set(['Securities', 'REIT Trusts']);
const MAX_STALE_PRICE_DAYS = 10;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function addDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function todayUTC(): string { return new Date().toISOString().slice(0, 10); }
function daysBetween(a: string, b: string): number {
  return Math.max(1, (new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}
function round2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
function round6(n: number): number { return parseFloat(n.toFixed(6)); }
function daysBetweenRaw(a: string, b: string): number {
  return Math.floor((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86400000);
}

// â”€â”€ Entry point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let forceFrom: string | null = null;
  try { const b = await req.json(); forceFrom = b.force_from || null; } catch { /* ok */ }
  try {
    const result = await computeNTA(sb, forceFrom);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err: any) {
    console.error('Fatal:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
});

// â”€â”€ Fetch all prices for a set of codes over a date range â”€â”€â”€â”€â”€â”€
// Called ONCE before the daily loop â€” bulk fetch, fills priceCache.
// Uses the existing fetch-prices Edge Function (already in allowlist).
async function fetchAllPrices(
  codes: string[],
  startDate: string,
  endDate: string,
  priceCache: Record<string, Record<string, number>>
): Promise<void> {
  if (!codes.length) return;

  // We call Yahoo v8 chart for each code individually.
  // The fetch-prices function only returns latest price, so we call Yahoo directly.
  // Supabase Edge Functions CAN reach query1/query2 yahoo â€” the 403 was from local machine.
  const from = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000) - 86400 * 5;
  const to   = Math.floor(new Date(endDate   + 'T23:59:59Z').getTime() / 1000);

  for (const rawCode of codes) {
    const code = normaliseCode(rawCode);
    priceCache[code] = priceCache[code] || {};
    for (const yahooCode of yahooCandidates(code)) {
      try {
        const loaded = await fetchYahooPrices(yahooCode, code, from, to, priceCache);
        if (loaded > 0) {
          console.log('fetchAllPrices ' + code + ': resolved as ' + yahooCode + ', loaded ' + loaded + ' days');
          break;
        }
      } catch (e: any) {
        console.warn('fetchAllPrices ' + code + ' via ' + yahooCode + ': ' + e.message);
      }
    }

    if (!Object.keys(priceCache[code]).length) {
      console.warn('fetchAllPrices ' + code + ': no historical prices loaded. Check Yahoo symbol/suffix.');
    }
  }
}

function normaliseCode(code: string): string {
  return String(code || '').trim().toUpperCase();
}

function yahooCandidates(code: string): string[] {
  if (!code) return [];
  if (code.includes('.')) return [code];
  if (/^\d{4,5}$/.test(code)) return [code + '.KL'];
  return [code, code + '.KL'];
}

async function fetchYahooPrices(
  yahooCode: string,
  cacheCode: string,
  from: number,
  to: number,
  priceCache: Record<string, Record<string, number>>
): Promise<number> {
  const path = '/v8/finance/chart/' + encodeURIComponent(yahooCode) +
               '?period1=' + from + '&period2=' + to + '&interval=1d&events=history';
  let lastStatus = 0;

  for (const host of ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']) {
    const res = await fetch('https://' + host + path, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    });
    lastStatus = res.status;
    if (!res.ok) continue;

    const before = Object.keys(priceCache[cacheCode] || {}).length;
    parsePriceResponse(await res.json(), cacheCode, priceCache);
    const after = Object.keys(priceCache[cacheCode] || {}).length;
    if (after > before) return after;
  }

  throw new Error('Yahoo HTTP ' + lastStatus);
}

function parsePriceResponse(json: any, code: string, priceCache: Record<string, Record<string, number>>) {
  const chart = json?.chart?.result?.[0];
  if (!chart) {
    const err = json?.chart?.error;
    if (err) console.warn('Yahoo chart error for ' + code + ': ' + JSON.stringify(err));
    return;
  }
  const timestamps: number[] = chart.timestamp || [];
  const closes: number[]     = chart.indicators?.adjclose?.[0]?.adjclose ||
                               chart.indicators?.quote?.[0]?.close || [];
  if (!priceCache[code]) priceCache[code] = {};
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null && closes[i] > 0) {
      const d = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      priceCache[code][d] = closes[i];
    }
  }
}

// Get price for code on date â€” backward-looking
function getPrice(code: string, date: string, priceCache: Record<string, Record<string, number>>): { price: number; priceDate: string } | null {
  const map = priceCache[normaliseCode(code)];
  if (!map) return null;
  if (map[date]) return { price: map[date], priceDate: date };
  // Backward: find most recent date <= target
  const dates = Object.keys(map).filter(d => d <= date).sort();
  if (!dates.length) return null;
  const priceDate = dates[dates.length - 1];
  if (daysBetweenRaw(priceDate, date) > MAX_STALE_PRICE_DAYS) return null;
  return { price: map[priceDate], priceDate };
}

// â”€â”€ Main compute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function computeNTA(sb: any, forceFrom: string | null) {
  const todayStr = todayUTC();

  // 1. Start date
  let startDate: string;
  if (forceFrom) {
    startDate = forceFrom;
  } else {
    const { data: last } = await sb.from('nta_daily').select('date').order('date', { ascending: false }).limit(1).single();
    if (!last) return { computed: 0, message: 'No base row. Backfill first.' };
    startDate = addDay(last.date);
  }
  if (startDate > todayStr) return { computed: 0, message: 'Already up to date' };

  // 2. Base row
  const { data: baseRow } = await sb.from('nta_daily').select('*').lt('date', startDate).order('date', { ascending: false }).limit(1).single();
  if (!baseRow) return { computed: 0, message: 'No base row found before ' + startDate };

  // 3. Rebuild positions via AVCO up to baseRow.date
  type Pos = { units: number; total_cost: number; product: string; code: string | null };
  const positions: Record<string, Pos> = {};
  const { data: allTrades } = await sb.from('transaction_trading')
    .select('trade_date, action, instrument_name, units, cashflow, product, code')
    .lte('trade_date', baseRow.date).order('trade_date', { ascending: true });
  // Sort: same-day Buy before Sell (critical for intraday roundtrips)
  const sortedAllTrades = (allTrades || []).slice().sort((a: any, b: any) => {
    if (a.trade_date < b.trade_date) return -1;
    if (a.trade_date > b.trade_date) return  1;
    return (a.action === 'Buy' ? 0 : 1) - (b.action === 'Buy' ? 0 : 1);
  });
  for (const t of sortedAllTrades) applyTrade(positions, t);

  console.log('Positions rebuilt for ' + Object.keys(positions).filter(k => positions[k].units > 0.0001).length + ' instruments');

  // 4. Load all input tables
  const [
    { data: rangedTrades }, { data: allCI },    { data: allOthers },
    { data: allRem },       { data: allDivs },  { data: allDists },
    { data: feeScheds },
  ] = await Promise.all([
    sb.from('transaction_trading').select('trade_date, action, instrument_name, units, cashflow, product, code').gte('trade_date', startDate).lte('trade_date', todayStr).order('trade_date', { ascending: true }),
    sb.from('capital_injection').select('date, amount, units, status').eq('status', 'Approved').order('date', { ascending: true }),
    sb.from('transaction_others').select('date, amount'),
    sb.from('remuneration').select('date, amount, status').eq('status', 'Paid'),
    sb.from('dividend').select('ex_date, pay_date, amount'),
    sb.from('distributions').select('pay_date, amount, units, dps, status').eq('status', 'Paid'),
    sb.from('fee_schedule').select('type, rate, hurdle_rate, valid_from, valid_to').order('valid_from', { ascending: true }),
  ]);

  // 5. Pre-fetch prices only for MTM instruments that can affect this run:
  // held at the base date, or traded from startDate onward.
  const mtmCodes = [...new Set(
    Object.values(positions)
      .filter(p => p.units > 0.0001 && MTM_PRODUCTS.has(p.product) && p.code)
      .map(p => normaliseCode(p.code!))
  )];
  // Also pick up codes from ranged trades
  for (const t of (rangedTrades || [])) {
    const code = t.code ? normaliseCode(t.code) : '';
    if (MTM_PRODUCTS.has(t.product) && code && !mtmCodes.includes(code)) {
      mtmCodes.push(code);
    }
  }
  console.log('Fetching prices for ' + mtmCodes.length + ' active/ranged MTM instruments: ' + mtmCodes.join(', '));
  const priceCache: Record<string, Record<string, number>> = {};
  await fetchAllPrices(mtmCodes, startDate, todayStr, priceCache);
  const missingPriceCodes = mtmCodes.filter(code => !Object.keys(priceCache[code] || {}).length);
  if (missingPriceCodes.length) {
    throw new Error('No Yahoo historical prices loaded for: ' + missingPriceCodes.join(', ') + '. For Bursa Malaysia, transaction_trading.code should be the numeric Bursa code, e.g. 7153, 1023, 5347. The function will append .KL automatically.');
  }

  // 6. Index cashflow data by date
  const tradesByDate = groupBy(rangedTrades || [], 'trade_date');
  const ciByDate     = groupBy(allCI || [], 'date');
  const othersByDate = sumByDate(allOthers || [], 'date', 'amount');
  const remByDate    = sumByDate(allRem || [], 'date', 'amount');
  const divExByDate  = sumByDate(allDivs || [], 'ex_date', 'amount');
  const divPayByDate = sumByDate(allDivs || [], 'pay_date', 'amount');
  const distByDate   = buildDistByDate(allDists || []);

  const inceptionDate = (allCI && allCI.length > 0) ? allCI[0].date : startDate;

  // 7. Carry-forward state
  let cash            = Number(baseRow.cash);
  let receivables     = Number(baseRow.receivables);
  let management_fees = Number(baseRow.management_fees);
  let capital         = Number(baseRow.capital);
  let total_units     = Number(baseRow.total_units);
  let prev_nta        = Number(baseRow.nta) || 1.0;

  const rows: any[] = [];
  const holdingRows: any[] = [];   // nta_holdings check table
  let computed = 0, errors = 0;
  let current = startDate;

  while (current <= todayStr) {
    try {
      // a. Trades (Buys first)
      const dayTrades = (tradesByDate[current] || []).sort((a: any, b: any) =>
        (a.action === 'Buy' ? 0 : 1) - (b.action === 'Buy' ? 0 : 1));
      for (const t of dayTrades) {
        applyTrade(positions, t);
        cash += Number(t.cashflow);
      }

      // b. Capital injections
      for (const ci of (ciByDate[current] || [])) {
        cash        += Number(ci.amount);
        capital     += Number(ci.amount);
        total_units += Number(ci.units);
      }

      // c. Others
      cash += othersByDate[current] || 0;

      // d. Distributions paid
      cash -= distByDate[current] || 0;

      // e. Remuneration paid
      const feeW = remByDate[current] || 0;
      cash            -= feeW;
      management_fees  = Math.max(0, management_fees - feeW);

      // f. Dividend ex-date â†’ receivables
      receivables += divExByDate[current] || 0;

      // g. Dividend pay-date â†’ cash
      const divPaid = divPayByDate[current] || 0;
      cash        += divPaid;
      receivables  = Math.max(0, receivables - divPaid);

      // h. MV(t) = Î£ MV(i,t) = Î£ P(i,t) Ã— U(i,t)
      let securities   = 0;
      let other_assets = 0;

      for (const [instr, pos] of Object.entries(positions)) {
        if (pos.units < 0.0001) continue;  // fully sold â†’ MV = 0

        if (MTM_PRODUCTS.has(pos.product)) {
          // P(i,t) from Yahoo (backward-looking on non-trading days)
          const priceInfo = pos.code ? getPrice(pos.code, current, priceCache) : null;
          if (!priceInfo) {
            throw new Error('Missing market price for ' + instr + ' code=' + (pos.code || 'NULL') + ' on ' + current);
          }
          const mv = round2(pos.units * priceInfo.price);
          securities += mv;
          holdingRows.push({
            date: current, instrument_name: instr, product: pos.product,
            is_mtm: true, units: round6(pos.units),
            price: round6(priceInfo.price), price_date: priceInfo.priceDate,
            market_value: mv,
          });
        } else {
          // At cost: P(i,t) = VWAP, MV = total_cost
          const vwap = pos.units > 0 ? pos.total_cost / pos.units : 0;
          other_assets += pos.total_cost;
          holdingRows.push({
            date: current, instrument_name: instr, product: pos.product,
            is_mtm: false, units: round6(pos.units),
            price: round6(vwap), price_date: null,
            market_value: round2(pos.total_cost),
          });
        }
      }

      // i. Fee accrual
      const gross_assets = securities + other_assets + receivables + cash;
      const gross_nta    = total_units > 0 ? gross_assets / total_units : prev_nta;
      const sched        = getFeeSched(feeScheds || [], current);

      let base_fee = 0, perf_fee = 0;
      if (sched.base) {
        base_fee = gross_assets * (Number(sched.base.rate) / 100) / 365;
      }
      if (sched.perf && gross_nta > 0) {
        try {
          const daysEl     = daysBetween(inceptionDate, current);
          const annualised = Math.pow(gross_nta, 365 / daysEl) - 1;
          const hurdle     = Number(sched.perf.hurdle_rate || 0) / 100;
          if (annualised > hurdle) {
            perf_fee = total_units * (annualised - hurdle) * (Number(sched.perf.rate) / 100) / 365;
          }
        } catch { /* skip */ }
      }
      management_fees = Math.max(0, management_fees + base_fee + perf_fee);

      // j. Balance sheet
      const total_equity = round2(securities + other_assets + receivables + cash - management_fees);
      const nta          = total_units > 0 ? round6(total_equity / total_units) : round6(prev_nta);

      rows.push({
        date: current,
        securities:      round2(securities),
        other_assets:    round2(other_assets),
        receivables:     round2(receivables),
        cash:            round2(cash),
        management_fees: round2(management_fees),
        total_equity,
        total_units:     round6(total_units),
        nta,
        is_locked: false,
        source: 'system',
      });

      prev_nta = nta > 0 ? nta : prev_nta;
      computed++;

    } catch (err: any) {
      console.error('Error on ' + current + ': ' + err.message);
      errors++;
    }
    current = addDay(current);
  }

  // 8. Upsert nta_daily in chunks of 100 (locked rows rejected by RLS)
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await sb.from('nta_daily').upsert(rows.slice(i, i + 100), { onConflict: 'date' });
    if (error) console.error('Upsert nta_daily error:', error.message);
  }

  // 8b. Upsert nta_holdings (per-instrument check table) in chunks of 200
  // Delete existing unlocked holding rows for the date range first, then insert fresh
  if (holdingRows.length > 0) {
    const { error: delErr } = await sb.from('nta_holdings')
      .delete()
      .gte('date', startDate)
      .lte('date', todayStr);
    if (delErr) console.error('Delete nta_holdings error:', delErr.message);

    for (let i = 0; i < holdingRows.length; i += 200) {
      const { error } = await sb.from('nta_holdings')
        .upsert(holdingRows.slice(i, i + 200), { onConflict: 'date,instrument_name' });
      if (error) console.error('Upsert nta_holdings error:', error.message);
    }
    console.log('nta_holdings: wrote ' + holdingRows.length + ' rows for ' + computed + ' days');
  }

  // 9. Update fund_overview
  if (rows.length > 0) {
    const latest = rows[rows.length - 1];
    await sb.from('fund_overview').update({ current_nta: latest.nta, aum: latest.total_equity, last_nta_date: latest.date }).eq('id', 1);
  }

  return { computed, errors, from: startDate, to: todayStr, message: 'Computed ' + computed + ' days (' + startDate + ' to ' + todayStr + ')' };
}

// â”€â”€ AVCO trade application â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function applyTrade(positions: Record<string, any>, t: any) {
  const name  = t.instrument_name;
  const units = Math.abs(Number(t.units));
  if (!positions[name]) {
    positions[name] = { units: 0, total_cost: 0, product: t.product || 'Securities', code: t.code || null };
  }
  const pos = positions[name];
  if (t.product) pos.product = t.product;
  if (t.code)    pos.code    = t.code;
  if (t.action === 'Buy') {
    pos.total_cost += Math.abs(Number(t.cashflow));
    pos.units      += units;
  } else {
    // Always apply sell — Buy-before-Sell sort guarantees buy is processed first
    // Use Math.min to never go negative, clamp residual to 0
    const avg      = pos.units > 0 ? pos.total_cost / pos.units : 0;
    const sold     = Math.min(units, pos.units);
    pos.units      = Math.max(0, pos.units - sold);
    pos.total_cost = pos.units > 0.0001 ? round2(avg * pos.units) : 0;
  }
}

// â”€â”€ Fee schedule lookup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getFeeSched(schedules: any[], date: string) {
  let base: any = null, perf: any = null;
  for (const s of schedules) {
    const from = s.valid_from || '';
    const to   = s.valid_to   || '9999-12-31';
    if (date >= from && date <= to) {
      if (s.type === 'base')        base = s;
      if (s.type === 'performance') perf = s;
    }
  }
  return { base, perf };
}

// â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function groupBy(arr: any[], key: string): Record<string, any[]> {
  const out: Record<string, any[]> = {};
  for (const r of arr) { const k = r[key]; if (k) (out[k] ||= []).push(r); }
  return out;
}
function sumByDate(arr: any[], dateKey: string, valKey: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of arr) { const k = r[dateKey]; if (k) out[k] = (out[k] || 0) + Number(r[valKey] || 0); }
  return out;
}
function buildDistByDate(arr: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of arr) {
    if (!r.pay_date) continue;
    const gross = r.amount != null ? Number(r.amount) : (Number(r.dps) / 100) * Number(r.units);
    out[r.pay_date] = (out[r.pay_date] || 0) + gross;
  }
  return out;
}
