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

export function netUnitsAsof(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string | null = null): number {
  let net = 0;
  for (const r of capitalInjections) {
    if (r.status !== "Approved") continue;
    if (uid !== null && r.uid !== uid) continue;
    const d = parseDate(r.date);
    if (d > asof) continue;
    const units = Number(r.units || 0);
    net += r.type === "Subscription" ? units : -units;
  }
  return Math.max(0, net);
}

export function netCostAsof(capitalInjections: CapitalInjectionRow[], asof: Date, uid: string): number {
  let net = 0;
  for (const r of capitalInjections) {
    if (r.status !== "Approved" || r.uid !== uid) continue;
    const d = parseDate(r.date);
    if (d > asof) continue;
    const amt = Number(r.amount || 0);
    net += r.type === "Subscription" ? amt : -amt;
  }
  return net;
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

