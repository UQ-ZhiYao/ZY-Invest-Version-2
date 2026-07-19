"""
Turns a filled-in workbook (one sheet already populated with plain values —
see fill_common.py's docstring for why they're values, not formulas) into a
single PDF containing just that sheet.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from openpyxl import Workbook

from soffice_util import run_soffice


def isolate_sheet_as_pdf(workbook: Workbook, sheet_name: str, out_pdf_path: Path) -> Path:
    """Strips every sheet except `sheet_name` from `workbook` (so the PDF
    export doesn't include the Control/Data/Investor Data internals), saves
    to a temp file, converts via headless LibreOffice, and copies the
    resulting PDF to `out_pdf_path`.
    """
    for name in list(workbook.sheetnames):
        if name != sheet_name:
            del workbook[name]
    workbook.defined_names.clear()  # leftover names may point at the sheets we just removed

    with tempfile.TemporaryDirectory(prefix="zy_stmt_") as tmp_dir:
        tmp = Path(tmp_dir)
        xlsx_path = tmp / "statement.xlsx"
        workbook.save(xlsx_path)

        result = run_soffice(
            ["--headless", "--convert-to", "pdf", "--outdir", str(tmp), str(xlsx_path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        produced = tmp / "statement.pdf"
        if result.returncode != 0 or not produced.exists():
            raise RuntimeError(
                "LibreOffice conversion failed "
                f"(exit {result.returncode}): {result.stderr or result.stdout}"
            )

        out_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(produced, out_pdf_path)

    return out_pdf_path
