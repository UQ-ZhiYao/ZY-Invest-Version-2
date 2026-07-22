// Port of scripts/statements/src/compute.py — kept in sync by hand; if the
// math changes in one, mirror it in the other.

export interface CapitalInjectionRow {
  id: string;
  uid: string;
  date: string;
  type: "Subscription" | "Redemption";
  amount: number;
  nta: number;
  units: number;
  status: string;
  reference_id?: string;
}

export interface DistributionRow {
  id: string;
  fy: string;
  type: string;
  ex_date: string;
  pay_date: string | null;
  dps: number;
  units: number;
  status: string;
}

export function parseDate(v: unknown): Date {
  if (v instanceof Date) return v;
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

// capital_injection.amount/.units come back signed straight from the
// database — Redemption rows store both as negative. Every consumer here
// derives its own sign from `type` instead, so always normalize to a
// magnitude at the point of reading a raw value rather than trusting
// whatever sign happens to already be on the row.
export function magnitude(v: unknown): number {
  return Math.abs(Number(v) || 0);
}

// The investor's earliest Approved capital_injection date — null if they
// have none. Used to reject Dividend/Annual generation for a period that
// ended before the investor had any investment record yet (nothing
// meaningful to report on).
export function firstApprovedDate(capitalInjections: CapitalInjectionRow[]): Date | null {
  let earliest: Date | null = null;
  for (const r of capitalInjections) {
    if (r.status !== "Approved") continue;
    const d = parseDate(r.date);
    if (earliest === null || d < earliest) earliest = d;
  }
  return earliest;
}

export function netUnitsAsof(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string | null = null): number {
  let net = 0;
  for (const r of capitalInjections) {
    if (r.status !== "Approved") continue;
    if (uid !== null && r.uid !== uid) continue;
    const d = parseDate(r.date);
    if (d > asof) continue;
    const units = magnitude(r.units);
    net += r.type === "Subscription" ? units : -units;
  }
  return Math.max(0, net);
}

// uid === null means capitalInjections is already scoped to the right rows
// (e.g. a joint account's transactions, fetched under several different
// uid values) — same idiom as netUnitsAsof below.
function approvedSortedFor(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string | null): CapitalInjectionRow[] {
  return capitalInjections
    .filter((r) => r.status === "Approved" && (uid === null || r.uid === uid) && parseDate(r.date) <= asof)
    .slice()
    .sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
}

// AVCO (weighted-average cost): a Subscription adds its own amount to the
// cost pool, changing the average cost per unit. A Redemption does NOT
// change the average cost — it removes cost proportional to the average
// cost immediately before it (units redeemed × prior avg cost), not the
// redemption's own `amount` (that's cash proceeds at that day's NTA, a
// market-value figure, not a cost-basis one). Also tracks realized P&L:
// each Redemption's proceeds minus the cost basis it removed. Requires
// chronological order, which is why the caller must pass pre-sorted rows.
function avcoTrace(rows: CapitalInjectionRow[]): { units: number; cost: number; realizedPl: number } {
  let units = 0, cost = 0, realizedPl = 0;
  for (const r of rows) {
    const u = magnitude(r.units);
    if (r.type === "Subscription") {
      units += u;
      cost += magnitude(r.amount);
    } else {
      const avgCost = units > 0 ? cost / units : 0;
      realizedPl += magnitude(r.amount) - u * avgCost;
      units -= u;
      cost -= u * avgCost;
    }
  }
  return { units, cost, realizedPl };
}

export function netCostAsof(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string | null = null): number {
  return avcoTrace(approvedSortedFor(capitalInjections, asof, uid)).cost;
}

// Cumulative realized P&L (from every Redemption up to `asof`) — this is
// what "Realized Profit & Loss" means all-time: proceeds minus cost basis
// removed, summed across every redemption in the investor's history.
export function netRealizedPlAsof(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string | null = null): number {
  const realizedPl = avcoTrace(approvedSortedFor(capitalInjections, asof, uid)).realizedPl;
  return Math.round(realizedPl * 100) / 100;
}

// Newton's method XIRR, mirrors compute.py's xirr(). Returns null rather
// than a fabricated number if it fails to converge (e.g. all cashflows the
// same sign) — callers should render that as "-".
export function xirr(cashflows: [Date, number][], guess = 0.1): number | null {
  if (cashflows.length < 2) return null;
  const t0 = cashflows.reduce((min, [d]) => (d < min ? d : min), cashflows[0][0]);
  const yearsFrac = (d: Date) => daysBetween(t0, d) / 365.0;

  const npv = (rate: number) => cashflows.reduce((sum, [d, cf]) => sum + cf / Math.pow(1 + rate, yearsFrac(d)), 0);
  const dnpv = (rate: number) =>
    cashflows.reduce((sum, [d, cf]) => sum - (yearsFrac(d) * cf) / Math.pow(1 + rate, yearsFrac(d) + 1), 0);

  let rate = guess;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const fp = dnpv(rate);
    if (Math.abs(fp) < 1e-12) break;
    const newRate = rate - f / fp;
    if (Math.abs(newRate - rate) < 1e-8) return newRate;
    rate = newRate;
    if (rate <= -0.999) return null;
  }
  return rate;
}

// profiles has separate address/address2/postcode/city/state columns —
// no parsing of one combined string, each line maps to its own column(s).
export function addressFromProfile(
  profile: { address?: string; address2?: string; postcode?: string; city?: string; state?: string },
): { line1: string; line2: string; line3: string; line4: string } {
  return {
    line1: profile.address || "",
    line2: profile.address2 || "",
    line3: [profile.postcode, profile.city].filter(Boolean).join(" "),
    line4: profile.state || "",
  };
}

