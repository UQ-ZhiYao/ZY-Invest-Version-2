"""
Pure calculation helpers — no network calls, easy to unit test.

These mirror the logic already used client-side (see assets/js/principal-admin.js
and assets/js/distributions-admin.js) so the generated statements match what the
admin console shows, just computed once more server-side for the PDF.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass


def net_units_asof(capital_injections: list[dict], asof: dt.date, uid: str | None = None) -> float:
    """Net approved units for one investor (or the whole fund if uid is None)
    as at `asof` (inclusive) — Subscriptions add, Redemptions subtract.
    Mirrors distributions-admin.js:computeFundUnits().
    """
    net = 0.0
    for r in capital_injections:
        if r.get("status") != "Approved":
            continue
        if uid is not None and r.get("uid") != uid:
            continue
        d = _parse_date(r["date"])
        if d > asof:
            continue
        units = float(r.get("units") or 0)
        net += units if r.get("type") == "Subscription" else -units
    return max(0.0, net)


def net_cost_asof(capital_injections: list[dict], asof: dt.date, uid: str) -> float:
    """Net cost basis (sum of subscription amounts minus redemption amounts) for
    one investor as at `asof` (inclusive)."""
    net = 0.0
    for r in capital_injections:
        if r.get("status") != "Approved" or r.get("uid") != uid:
            continue
        d = _parse_date(r["date"])
        if d > asof:
            continue
        amt = float(r.get("amount") or 0)
        net += amt if r.get("type") == "Subscription" else -amt
    return net


def account_id(account_type: str, issued_date: dt.date) -> str:
    """Reproduces the template's InvProfile[Account ID] calculated column:
    LEFT(AccountType,1) & "A00" & YY & MM & DD of the issued date."""
    prefix = (account_type or "D")[:1].upper()
    return f"{prefix}A00{issued_date.strftime('%y%m%d')}"


def xirr(cashflows: list[tuple[dt.date, float]], guess: float = 0.1) -> float | None:
    """Annualized IRR for dated cashflows via Newton's method (the template's
    "Annualized Performance*" footnote references this same method). Returns
    None if it fails to converge (e.g. all cashflows same sign) — callers
    should render that as "-" rather than a fabricated number.
    """
    if len(cashflows) < 2:
        return None
    t0 = min(d for d, _ in cashflows)

    def npv(rate: float) -> float:
        return sum(cf / (1 + rate) ** ((d - t0).days / 365.0) for d, cf in cashflows)

    def dnpv(rate: float) -> float:
        return sum(
            -((d - t0).days / 365.0) * cf / (1 + rate) ** ((d - t0).days / 365.0 + 1)
            for d, cf in cashflows
        )

    rate = guess
    for _ in range(100):
        f = npv(rate)
        fp = dnpv(rate)
        if abs(fp) < 1e-12:
            break
        new_rate = rate - f / fp
        if abs(new_rate - rate) < 1e-8:
            return new_rate
        rate = new_rate
        if rate <= -0.999:
            return None
    return rate


def _parse_date(v) -> dt.date:
    if isinstance(v, dt.date):
        return v
    return dt.datetime.strptime(str(v)[:10], "%Y-%m-%d").date()


@dataclass
class InvestorAddress:
    line1: str
    line2: str
    line3: str

    @classmethod
    def from_profile(cls, p: dict) -> "InvestorAddress":
        # `profiles` stores one free-text address field (no Taman/Postcode split
        # like the template's InvProfile table) — split on commas, best-effort.
        parts = [s.strip() for s in (p.get("address") or "").split(",") if s.strip()]
        parts += ["", "", ""]
        return cls(parts[0], parts[1], parts[2])
