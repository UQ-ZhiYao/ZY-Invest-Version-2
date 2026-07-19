"""
Uploads a generated PDF to Supabase Storage and records it in the
`statements` table (see ../sql/001_statements_table.sql) so the admin
console / investor documents pages can list and re-download it later.
"""
from __future__ import annotations

from pathlib import Path

from supa import Supabase

BUCKET = "statements"


def store_statement(
    sb: Supabase,
    *,
    pdf_path: Path,
    investor_id: str,
    statement_type: str,  # 'Subscription' | 'Redemption' | 'Dividend' | 'Annual'
    period_label: str,
    transaction_id: str | None = None,
    fy_id: str | None = None,
) -> dict:
    storage_path = f"{investor_id}/{statement_type.lower()}/{pdf_path.name}"
    sb.upload(BUCKET, storage_path, pdf_path.read_bytes())

    row = sb.insert(
        "statements",
        {
            "investor_id": investor_id,
            "type": statement_type,
            "period_label": period_label,
            "transaction_id": transaction_id,
            "fy_id": fy_id,
            "storage_path": storage_path,
            "file_name": pdf_path.name,
        },
    )
    return row
