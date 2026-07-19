"""
Builds the Subscription/Redemption statement PDF directly (no Excel/LibreOffice
involved) for one `capital_injection` row. There's no separate Redemption
layout — a Redemption transaction reuses this exact structure with the sign
flipped and the title/column headers relabelled, matching how the admin
console already treats Subscription/Redemption as one table with a `type`
column (assets/js/principal-admin.js).
"""
from __future__ import annotations

import datetime as dt

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, Table, TableStyle

from pdf_common import (
    BODY_W_MM,
    FONT_SANS_BOLD,
    InvestorInfo,
    build_with_footer,
    col_widths,
    header_block,
    investor_block_with_account_type,
    important_notices,
    red_if_negative,
    rm,
    section_header,
    table_cell_style,
    table_header_style,
)


def build_subscription_pdf(out_path, *, tx: dict, investor: InvestorInfo,
                            opening_units: float, opening_cost: float,
                            issued_date: dt.date) -> None:
    tx_type = tx["type"]  # 'Subscription' or 'Redemption'
    is_redemption = tx_type == "Redemption"
    tx_date = _parse_date(tx["date"])
    amount = float(tx["amount"])
    price = float(tx["nta"])
    units = float(tx["units"])

    signed_units = -units if is_redemption else units
    signed_amount = -amount if is_redemption else amount
    closing_units = opening_units + signed_units
    closing_cost = opening_cost + signed_amount

    flow = header_block(
        title=f"FUND  {tx_type.upper()}  STATEMENT", investor=investor,
        statement_type=f"{tx_type} Statement", issued_date=dt.date.today(),
        period_text=tx_date.strftime("%d/%m/%Y"),
    )
    flow.append(section_header("Investor's Information"))
    flow.append(investor_block_with_account_type(investor))
    flow.append(section_header("Principal Transaction"))

    header = ["Date", "Description", "Investment Value", f"{tx_type} Price",
              "Unit Balanced", "Average Cost"]
    rows = [
        [tx_date.strftime("%d - %m - %Y"), "Opening", rm(opening_cost), "-",
         f"{opening_units:,.4f}", rm(opening_cost / opening_units, 4) if opening_units > 0 else "-"],
        [tx_date.strftime("%d - %m - %Y"), f"Fund {tx_type}", rm(amount), rm(price, 4),
         red_if_negative(signed_units, 4), "-"],
        [tx_date.strftime("%d - %m - %Y"), "Closing", rm(closing_cost), "-",
         f"{closing_units:,.4f}", rm(closing_cost / closing_units, 4) if closing_units > 0 else "-"],
    ]
    data = [[Paragraph(c, table_header_style) for c in header]]
    for r in rows:
        data.append([Paragraph(str(c), table_cell_style) for c in r])
    t = Table(data, colWidths=col_widths(BODY_W_MM, [78, 86, 90, 82, 90, 78]), hAlign="LEFT")
    style = [
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SANS_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 0), (5, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    t.setStyle(TableStyle(style))
    flow.append(t)

    flow.extend(important_notices())
    build_with_footer(out_path, flow)


def _parse_date(v) -> dt.date:
    if isinstance(v, dt.date):
        return v
    return dt.datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
