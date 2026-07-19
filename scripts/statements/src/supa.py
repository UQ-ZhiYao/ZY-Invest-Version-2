"""
Minimal Supabase REST client used by the statement generator.

We talk to PostgREST (`/rest/v1/...`) and Storage (`/storage/v1/...`) directly
over HTTPS instead of pulling in the full `supabase-py` SDK — this script only
ever needs a handful of read/insert/upload calls, and a thin wrapper keeps the
dependency list to just `requests`.

Auth: SUPABASE_SERVICE_ROLE_KEY is required (not the anon key). This tool runs
as a trusted backend job — it must bypass Row Level Security to read every
investor's data and write into the `statements` table, which is exactly what
the service role key is for. Never ship this key to the browser/static site.
"""
from __future__ import annotations

import os
from typing import Any

import requests


class SupabaseError(RuntimeError):
    pass


class Supabase:
    def __init__(self, url: str | None = None, service_key: str | None = None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.key = service_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not self.key:
            raise SupabaseError(
                "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env vars or .env) — "
                "see scripts/statements/.env.example."
            )
        self._headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    # ---- Postgres tables (PostgREST) ---------------------------------

    def select(self, table: str, params: dict[str, Any] | None = None) -> list[dict]:
        """GET /rest/v1/{table}?...  e.g. params={'id': 'eq.<uuid>', 'select': '*'}"""
        r = requests.get(
            f"{self.url}/rest/v1/{table}", headers=self._headers, params=params or {}, timeout=30
        )
        if not r.ok:
            raise SupabaseError(f"select {table} failed: {r.status_code} {r.text}")
        return r.json()

    def select_one(self, table: str, params: dict[str, Any]) -> dict | None:
        rows = self.select(table, params)
        return rows[0] if rows else None

    def insert(self, table: str, payload: dict[str, Any]) -> dict:
        headers = {**self._headers, "Prefer": "return=representation"}
        r = requests.post(f"{self.url}/rest/v1/{table}", headers=headers, json=payload, timeout=30)
        if not r.ok:
            raise SupabaseError(f"insert {table} failed: {r.status_code} {r.text}")
        rows = r.json()
        return rows[0] if isinstance(rows, list) else rows

    # ---- Storage -------------------------------------------------------

    def upload(self, bucket: str, path: str, data: bytes, content_type: str = "application/pdf") -> str:
        """Uploads (upsert) a file, returns the storage object path (bucket-relative)."""
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        r = requests.post(
            f"{self.url}/storage/v1/object/{bucket}/{path}", headers=headers, data=data, timeout=60
        )
        if not r.ok:
            raise SupabaseError(f"upload to {bucket}/{path} failed: {r.status_code} {r.text}")
        return path
