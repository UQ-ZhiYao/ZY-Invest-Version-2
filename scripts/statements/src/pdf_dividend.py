"""
Builds the Dividend statement PDF for one investor over one or more
`distributions` rows (typically an Interim + Final pair within the same FY).

Known gap: EPS / DPR (Earnings Per Share / Dividend Payout Ratio) are columns
in the original template but nothing in Supabase tracks per-instrument EPS
today — they render as "-" rather than a fabricated number.
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
    investor_block_name_first,
    notice_style,
    rm,
    section_header,
    table_cell_style,
    table_header_style,
)


def build_dividend_pdf(out_path, *, distributions: list[dict], investor: InvestorInfo,
                        holding_units: float, period_text: str) -> None:
    if not distributions:
        raise ValueError("at least one distribution row is required")

    flow = header_block(
        title="DIVIDEND  PAYMENT  STATEMENT", investor=investor,
        statement_type="Dividend Statement", issued_date=dt.date.today(),
        period_text=period_text,
    )
    flow.append(section_header("Investor's Information"))
    flow.append(investor_block_name_first(investor))
    flow.append(section_header("Dividend Details"))

    header = ["Date", "Description", "Holding Units", "EPS", "DPR", "DPS", "Dividend Amount"]
    data = [[Paragraph(c, table_header_style) for c in header]]
    total_dps = 0.0
    total_amount = 0.0
    for d in distributions:
        dps = float(d["dps"])
        amount = round(holding_units * dps / 100.0, 2)
        total_dps += dps
        total_amount += amount
        pay_date = _parse_date(d["pay_date"] or d["ex_date"])
        row = [pay_date.strftime("%d - %m - %Y"), f"{d.get('type') or ''} Dividend".strip(),
               f"{holding_units:,.4f}", "-", "-", f"{dps:,.4f}", rm(amount)]
        data.append([Paragraph(str(c), table_cell_style) for c in row])

    total_row = ["Total", "", "", "", "", f"{total_dps:,.4f}", rm(total_amount)]
    data.append([Paragraph(str(c), table_cell_style) for c in total_row])

    t = Table(data, colWidths=col_widths(BODY_W_MM, [76, 106, 80, 49, 49, 61, 84]),
              hAlign="LEFT")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -2), 0.6, colors.black),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.black),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.black),
        ("SPAN", (0, -1), (4, -1)),
        ("ALIGN", (0, -1), (0, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SANS_BOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(t)
    flow.append(Paragraph(
        "Notes: EPS: Earning Per Share ; DPR: Dividend Payout Ratio ; DPS: Dividend Per Share",
        table_cell_style,
    ))

    flow.append(Paragraph("IMPORTANT NOTICES", notice_style))
    build_with_footer(out_path, flow)


def _parse_date(v) -> dt.date:
    if isinstance(v, dt.date):
        return v
    return dt.datetime.strptime(str(v)[:10], "%Y-%m-%d").date()
