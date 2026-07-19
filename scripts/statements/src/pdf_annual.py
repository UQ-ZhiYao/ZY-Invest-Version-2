"""
Builds the Annual (Investment Account Statement) PDF for one investor over
one financial year.

Unlike the old Excel-based version, this isn't constrained to a fixed
Opening/Closing-only row count — a plain PDF table can grow to fit however
many transactions or distributions actually happened in the FY, so both the
Principal Transaction and Dividend Transaction tables itemise every event
instead of only showing a net summary.

Known gaps (not tracked in Supabase today, default to 0 / documented):
- Realized P&L: no ledger of realized gains on redemptions yet.
- "Adjustment": the original template used this as a manual plug with no
  formula behind it either — there's no source table for it, defaults to 0.
"""
from __future__ import annotations

import datetime as dt

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table, TableStyle

from compute import xirr
from pdf_common import (
    BODY_W_MM,
    FONT_SANS_BOLD,
    InvestorInfo,
    build_with_footer,
    col_widths,
    header_block,
    investor_block_with_account_type,
    notice_style,
    red_if_negative,
    rm,
    section_header,
    table_cell_style,
    table_header_style,
)


def build_annual_pdf(
    out_path,
    *,
    investor: InvestorInfo,
    fy_start: dt.date,
    fy_end: dt.date,
    opening_units: float,
    opening_cost: float,
    closing_units: float,
    closing_cost: float,
    latest_nav_per_unit: float,
    transactions_in_fy: list[dict],       # capital_injection rows, date-ascending
    distributions_in_fy: list[dict],      # distributions rows, date-ascending
    cashflows_for_irr: list[tuple[dt.date, float]],
    realized_pl: float = 0.0,
    adjustment: float = 0.0,
) -> None:
    period_text = f"{fy_start.strftime('%d/%m/%Y')} - {fy_end.strftime('%d/%m/%Y')}"

    flow = header_block(
        title="INVESTMENT  ACCOUNT  STATEMENT", investor=investor,
        statement_type="Annually", issued_date=dt.date.today(), period_text=period_text,
    )
    flow.append(section_header("Investor's Information"))
    flow.append(investor_block_with_account_type(investor))

    # --- Principal Transaction: itemised, not just Opening/Closing ---------
    header = ["Date", "Description", "Cashflow @ Price", "Avg. Cost (RM)", "Units Issued",
              "Units Balanced"]
    data = [[Paragraph(c, table_header_style) for c in header]]
    running_units, running_cost = opening_units, opening_cost
    data.append([Paragraph(c, table_cell_style) for c in (
        fy_start.strftime("%d - %m - %Y"), "Opening", "-",
        rm(running_cost / running_units, 4) if running_units > 0 else "-", "-",
        f"{running_units:,.4f}",
    )])
    for tx in transactions_in_fy:
        d = _parse_date(tx["date"])
        amt = float(tx["amount"])
        units = float(tx["units"])
        price = float(tx["nta"])
        signed_units = units if tx["type"] == "Subscription" else -units
        running_units += signed_units
        running_cost += amt if tx["type"] == "Subscription" else -amt
        data.append([Paragraph(str(c), table_cell_style) for c in (
            d.strftime("%d - %m - %Y"), tx["type"],
            f"{rm(amt)} @ {price:,.4f}",
            rm(running_cost / running_units, 4) if running_units > 0 else "-",
            red_if_negative(signed_units, 4) if signed_units < 0 else f"{signed_units:,.4f}",
            f"{running_units:,.4f}",
        )])
    data.append([Paragraph(c, table_cell_style) for c in (
        fy_end.strftime("%d - %m - %Y"), "Closing", "-",
        rm(closing_cost / closing_units, 4) if closing_units > 0 else "-", "-",
        f"{closing_units:,.4f}",
    )])
    t1 = Table(data, colWidths=col_widths(BODY_W_MM, [74, 70, 118, 86, 78, 78]), hAlign="LEFT")
    t1.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SANS_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(KeepTogether([section_header("Principal Transaction"), t1]))

    # --- Dividend Transaction: itemised ---------------------------------------
    header2 = ["Date", "Description", "DPS", "Holding Units", "Dividend Amount", "Balanced (RM)"]
    data2 = [[Paragraph(c, table_header_style) for c in header2]]
    data2.append([Paragraph(c, table_cell_style) for c in (
        fy_start.strftime("%d - %m - %Y"), "Opening", "", "", "", rm(0),
    )])
    running_div = 0.0
    for d in distributions_in_fy:
        pay_date = _parse_date(d["pay_date"] or d["ex_date"])
        dps = float(d["dps"])
        amount = round(closing_units * dps / 100.0, 2)
        running_div += amount
        data2.append([Paragraph(str(c), table_cell_style) for c in (
            pay_date.strftime("%d - %m - %Y"), f"{d.get('type') or ''} Dividend".strip(),
            f"{dps:,.4f}", f"{closing_units:,.4f}", rm(amount), rm(running_div),
        )])
    dividend_received = round(running_div, 2)
    data2.append([Paragraph(c, table_cell_style) for c in (
        fy_end.strftime("%d - %m - %Y"), "Closing", "", "", "", rm(dividend_received),
    )])
    t2 = Table(data2, colWidths=col_widths(BODY_W_MM, [76, 96, 60, 88, 96, 92]), hAlign="LEFT")
    t2.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SANS_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(KeepTogether([section_header("Dividend Transaction"), t2]))

    # --- Account Summary -------------------------------------------------------
    market_value = round(closing_units * latest_nav_per_unit, 2)
    cost_basis = round(closing_cost, 2)
    unrealized_pl = round(market_value - cost_basis, 2)
    total_pl = round(unrealized_pl + realized_pl + dividend_received + adjustment, 2)
    total_perf_pct = (total_pl / cost_basis * 100) if cost_basis else None
    irr = xirr(cashflows_for_irr)

    summary_rows = [
        ["Fields", "Holding Units", "Average Price", "Total Value (RM)"],
        ["( a )  Latest Fund Price", f"{closing_units:,.4f}", f"{latest_nav_per_unit:,.6f}",
         rm(market_value)],
        ["( b )  Subscription Cost", f"{closing_units:,.4f}",
         f"{abs(cost_basis / closing_units):,.6f}" if closing_units else "-",
         red_if_negative(-cost_basis, 2)],
    ]
    data3 = [[Paragraph(c, table_header_style if i == 0 else table_cell_style) for c in row]
             for i, row in enumerate(summary_rows)]
    t3 = Table(data3, colWidths=col_widths(BODY_W_MM, [174, 103, 103, 126]), hAlign="LEFT")
    t3.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SANS_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(KeepTogether([section_header("Account Summary"), t3]))
    flow.append(Spacer(1, 3 * mm))

    plain_rows = [
        ("( c )  Unrealized Profit & Loss:  ( a ) + ( b )", rm(unrealized_pl)),
        ("( d )  Realized Profit & Loss", rm(realized_pl)),
        ("( e )  Dividend Received", rm(dividend_received)),
        ("( f )  Adjustment", rm(adjustment)),
        ("Total Profit & Loss:  ( c ) + ( d ) + ( e ) + ( f )", rm(total_pl)),
        ("Total Performance %", f"{total_perf_pct:.2f} %" if total_perf_pct is not None else "-"),
        ("Annualized Performance* %", f"{irr * 100:.2f} %" if irr is not None else "-"),
    ]
    data4 = [[Paragraph(a, table_cell_style), Paragraph(b, table_cell_style)] for a, b in plain_rows]
    t4 = Table(data4, colWidths=col_widths(BODY_W_MM, [376, 130]), hAlign="LEFT")
    t4.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(t4)
    flow.append(Paragraph(
        "*Powered by Financial Formulation of Internal Rate of Return (IRR) &amp; "
        "Mathematical Algorithm Newton's method",
        table_cell_style,
    ))

    flow.append(Paragraph("IMPORTANT NOTICES", notice_style))
    build_with_footer(out_path, flow)


def _parse_date(v) -> dt.date:
    if isinstance(v, dt.date):
        return v
    return dt.datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
