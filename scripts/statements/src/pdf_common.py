"""
Shared ReportLab building blocks for the three statement PDFs.

Fonts/colors/borders below were read directly off the source template
(templates/ZYInvest_Statement_Templates.xlsx) with openpyxl — Times New Roman
for the investor name/address block and statement title, a plain sans-serif
for everything else (the template used "Aptos Narrow", a Windows-only font;
Helvetica is ReportLab's built-in equivalent and needs no font embedding),
thin black borders, no fills. Kept here so all three statements stay visually
consistent without duplicating the constants three times.

Layout is A4 portrait with the ZY-Invest logo top-left (assets/img/logo.png)
and every table/grid sized to exactly fill the page body width via
`col_widths()` — mirrors the TypeScript port in
supabase/functions/generate-statement/lib/common.ts, which the two
implementations need to stay in sync with by hand if either changes.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Flowable, Image, Paragraph, SimpleDocTemplate, Table, TableStyle

PAGE_SIZE = A4
MARGIN = 16 * mm
BODY_W_MM = PAGE_SIZE[0] / mm - 2 * (MARGIN / mm)

# One consistent body font size for every table (transactional tables, the
# investor info grid) and the header's meta info list — headings
# (title/section headers) are exempt, they're deliberately larger.
CONTENT_SIZE = 9.5
# Vertical gap between one table/section and the next — "1 line" of space.
SECTION_GAP_MM = 5.6  # ~16pt, matches the TypeScript port's SECTION_GAP

LOGO_PATH = Path(__file__).resolve().parents[3] / "assets" / "img" / "logo.png"

FONT_SERIF = "Times-Roman"
FONT_SERIF_BOLD = "Times-Bold"
FONT_SANS = "Helvetica"
FONT_SANS_BOLD = "Helvetica-Bold"

RED = colors.HexColor("#C00000")
BORDER = colors.black

title_style = ParagraphStyle("title", fontName=FONT_SERIF_BOLD, fontSize=12.5, leading=15,
                             alignment=1)  # centered over the meta column
name_style = ParagraphStyle("name", fontName=FONT_SERIF, fontSize=11, leading=15)
section_style = ParagraphStyle("section", fontName=FONT_SANS, fontSize=12.5, leading=16,
                                spaceBefore=10, spaceAfter=6)
notice_style = ParagraphStyle("notice", fontName=FONT_SANS_BOLD, fontSize=11, leading=14,
                               spaceBefore=14)
notice_item_style = ParagraphStyle("notice_item", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13,
                                    leftIndent=32 * mm, firstLineIndent=-32 * mm, spaceAfter=4)
meta_label_style = ParagraphStyle("meta_label", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
meta_value_style = ParagraphStyle("meta_value", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
cell_label_style = ParagraphStyle("cell_label", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
cell_value_style = ParagraphStyle("cell_value", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
table_header_style = ParagraphStyle("table_header", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
table_cell_style = ParagraphStyle("table_cell", fontName=FONT_SANS, fontSize=CONTENT_SIZE, leading=13)
footer_style = ParagraphStyle("footer", fontName=FONT_SANS, fontSize=8.5, leading=11)


def col_widths(total_mm: float, weights: list[float]) -> list[float]:
    """Splits `total_mm` into widths proportional to `weights`, forced to sum
    to exactly `total_mm` (remainder folded into the last column), returned
    already multiplied by `mm` so the result can be passed straight to a
    Table's colWidths= — every table this feeds is therefore exactly as wide
    as the page body, never more, never less."""
    s = sum(weights)
    widths = [round(total_mm * w / s, 2) for w in weights]
    used = sum(widths)
    widths[-1] = round(widths[-1] + (total_mm - used), 2)
    return [w * mm for w in widths]


def red_if_negative(value: float, decimals: int) -> str:
    """Matches the template's `[Red](#,##0.0000)` style negative formatting."""
    fmt = f"{{:,.{decimals}f}}"
    if value < 0:
        return f'<font color="#{RED.hexval()[2:]}">({fmt.format(abs(value))})</font>'
    return fmt.format(value)


def rm(value, decimals: int = 2, dash_if_none: bool = True) -> str:
    if value is None or value == "-":
        return "-" if dash_if_none else ""
    return f"RM {value:,.{decimals}f}"


@dataclass
class InvestorInfo:
    account_type: str
    account_id: str
    registered_name: str
    settlement_type: str
    phone: str
    bank_name: str
    email: str
    bank_account_no: str
    nominee_or_joint_label: str
    nominee_or_joint_value: str
    total_days_held_text: str
    address_line1: str
    address_line2: str
    address_line3: str


def days_held_text(issued: dt.date, asof: dt.date) -> str:
    return f"{(asof - issued).days:,}  days"


FUND_EMAIL = "nzy.invest@gmail.com"
FUND_PHONE = "(+60)11 - 1121 8085"


def header_block(*, title: str, investor: InvestorInfo, statement_type: str,
                  issued_date: dt.date, period_text: str) -> list:
    """Small logo top-left with the title centered over the right column on
    the same row; below that, investor name/address on the left and a
    single-column statement meta list (Page No., Issued Date, Statement
    Type, Statement Period, Email, Telephone) on the right."""
    left_w, right_w = col_widths(BODY_W_MM, [270, 235])

    logo_w = 15.0  # mm
    logo_h = logo_w
    if LOGO_PATH.exists():
        img_w, img_h = ImageReader(str(LOGO_PATH)).getSize()
        logo_h = logo_w * img_h / img_w
        logo = Image(str(LOGO_PATH), width=logo_w * mm, height=logo_h * mm)
    else:
        logo = Paragraph("", name_style)

    title_para = Paragraph(title, title_style)
    top_row = Table([[logo, title_para]], colWidths=[left_w, right_w])
    top_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "LEFT"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    name_block = [Paragraph(investor.registered_name.upper(), name_style)]
    for line in (investor.address_line1, investor.address_line2, investor.address_line3):
        if line:
            name_block.append(Paragraph(line, name_style))

    meta_label_w, meta_value_w = col_widths(right_w / mm, [95, 140])
    meta_rows = [
        ("Page No.", ":  1 of 1"),
        ("Issued Date", f":  {dt.date.today().strftime('%d-%m-%Y')}"),
        ("Statement Type", f":  {statement_type}"),
        ("Statement Period", f":  {period_text}"),
        ("Email Address", f":  {FUND_EMAIL}"),
        ("Telephone No.", f":  {FUND_PHONE}"),
    ]
    meta_table = Table(
        [[Paragraph(label, meta_label_style), Paragraph(value, meta_value_style)]
         for label, value in meta_rows],
        colWidths=[meta_label_w, meta_value_w], hAlign="LEFT",
    )
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    bottom_row = Table([[name_block, meta_table]], colWidths=[left_w, right_w])
    bottom_row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [top_row, bottom_row]


NOTICE_ITEMS = [
    ("Confidentiality", "This statement contains personal data and is intended solely for the "
     "recipient. Please do not share this document with any third parties."),
    ("Discrepancies", 'Please review all figures carefully. Any discrepancies or "untally" figures '
     "must be reported to us immediately; failure to do so may result in the recipient bearing any "
     "associated losses."),
    ("Digital Statements", "Effective 1st January 2026, all future portfolio statements will be "
     "provided exclusively via App ZY-Invest."),
]


class _BottomAnchorSpacer(Flowable):
    """Consumes exactly enough of the remaining frame height to push
    whatever follows down to the bottom of the current page — or, if the
    remaining space is too small to fit `content_height`, consumes more
    than what's left so ReportLab bumps the whole thing onto a fresh page,
    where there's room. Used to keep Important Notices always anchored to
    the bottom of the last page instead of trailing directly after the
    last table."""

    def __init__(self, content_height: float):
        super().__init__()
        self.content_height = content_height
        self.width = 0
        self.height = 0

    def wrap(self, availWidth, availHeight):
        if availHeight >= self.content_height:
            self.height = availHeight - self.content_height
        else:
            self.height = availHeight + 1  # force a page break
        return (0, self.height)

    def draw(self):
        pass


def _flowable_height(flowable, width: float) -> float:
    _, h = flowable.wrap(width, 100000)
    return h


def _estimate_notices_height() -> float:
    total = notice_style.spaceBefore + _flowable_height(
        Paragraph("IMPORTANT NOTICES", notice_style), BODY_W_MM * mm,
    )
    for i, (label, text) in enumerate(NOTICE_ITEMS, start=1):
        p = Paragraph(f"{i}.  <b>{label}:</b> {text}", notice_item_style)
        total += _flowable_height(p, BODY_W_MM * mm) + notice_item_style.spaceAfter
    return total


def important_notices() -> list:
    """"IMPORTANT NOTICES" heading + the numbered notice list, hanging-indented
    so wrapped continuation lines align under the body text, always anchored
    to the bottom of whichever page ends up being the last page."""
    flow: list = [_BottomAnchorSpacer(_estimate_notices_height()),
                  Paragraph("IMPORTANT NOTICES", notice_style)]
    for i, (label, text) in enumerate(NOTICE_ITEMS, start=1):
        flow.append(Paragraph(f"{i}.  <b>{label}:</b> {text}", notice_item_style))
    return flow


def investor_block_with_account_type(investor: InvestorInfo) -> Table:
    """Subscription & Annual layout — has Account Type / Account ID row."""
    rows = [
        ("Account Type", investor.account_type, "Account ID", investor.account_id),
        ("Registered Name", investor.registered_name, "Settlement Type", investor.settlement_type),
        ("Phone No.", investor.phone, "Bank Name", investor.bank_name),
        ("Email Address", investor.email, "Bank Account No.", investor.bank_account_no),
        (investor.nominee_or_joint_label, investor.nominee_or_joint_value,
         "Total Days Held", investor.total_days_held_text),
    ]
    return _label_value_grid(rows)


def investor_block_name_first(investor: InvestorInfo) -> Table:
    """Dividend layout — starts at Registered Name, no Account Type/ID row."""
    rows = [
        ("Investor's Name", investor.registered_name, "Settlement Type", investor.settlement_type),
        ("Phone Number", investor.phone, "Bank Name", investor.bank_name),
        ("Email Address", investor.email, "Bank Account No.", investor.bank_account_no),
    ]
    return _label_value_grid(rows)


def _label_value_grid(rows: list[tuple[str, str, str, str]]) -> Table:
    data = [
        [Paragraph(a, cell_label_style), Paragraph(str(b), cell_value_style),
         Paragraph(c, cell_label_style), Paragraph(str(d), cell_value_style)]
        for a, b, c, d in rows
    ]
    t = Table(data, colWidths=col_widths(BODY_W_MM, [130, 210, 130, 210]), hAlign="LEFT")
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def section_header(text: str) -> Paragraph:
    return Paragraph(text, section_style)


def draw_footer(canvas, doc) -> None:
    """Drawn as a fixed element on every page (see build_with_footer below)
    instead of a flowable — a flowable footer either overflows onto its own
    near-blank extra page on short statements, or has to fight the content
    for space; a page-anchored footer is simpler and always sits at the
    bottom margin regardless of how much content precedes it."""
    canvas.saveState()
    canvas.setFont(FONT_SANS, 8.5)
    y = MARGIN - 4 * mm
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, y + 5 * mm, PAGE_SIZE[0] - MARGIN, y + 5 * mm)
    canvas.drawString(MARGIN, y, "Head Office: None")
    canvas.drawRightString(
        PAGE_SIZE[0] - MARGIN, y,
        f"Line: {FUND_PHONE}      Email: {FUND_EMAIL}      Website: -",
    )
    canvas.restoreState()


def build_with_footer(out_path, flow: list) -> None:
    doc = SimpleDocTemplate(str(out_path), pagesize=PAGE_SIZE, topMargin=MARGIN,
                             bottomMargin=MARGIN + 8 * mm, leftMargin=MARGIN, rightMargin=MARGIN)
    doc.build(flow, onFirstPage=draw_footer, onLaterPages=draw_footer)
