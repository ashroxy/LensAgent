"""
Supabase / PostgreSQL Session Store.

SQL Schema for Supabase:
```sql
CREATE TABLE IF NOT EXISTS browser_sessions (
    session_id TEXT PRIMARY KEY,
    task TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'RUNNING',
    phase TEXT NOT NULL DEFAULT 'fill',
    step_index INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    completed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    pending_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_action_batch JSONB NOT NULL DEFAULT '[]'::jsonb,
    field_fill_history JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_browser_state_hash TEXT,
    previous_browser_state_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
"""

from __future__ import annotations

import logging
from typing import List, Optional

import httpx

from app.schemas.session import SessionData
from app.storage.base import BaseSessionStore

logger = logging.getLogger("lensagent.storage.supabase")


class SupabaseSessionStore(BaseSessionStore):
    """Supabase REST API implementation of BaseSessionStore."""

    def __init__(self, supabase_url: str, supabase_key: str) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.supabase_key = supabase_key
        self._headers = {
            "apikey": self.supabase_key,
            "Authorization": f"Bearer {self.supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=f"{self.supabase_url}/rest/v1",
                headers=self._headers,
                timeout=15.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def get(self, session_id: str) -> Optional[SessionData]:
        client = await self._get_client()
        try:
            resp = await client.get(
                "/browser_sessions",
                params={"session_id": f"eq.{session_id}", "select": "*"},
            )
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                return None
            return SessionData.model_validate(rows[0])
        except Exception as e:
            logger.error("Supabase get error for session %s: %s", session_id, e)
            return None

    async def create(self, session: SessionData) -> None:
        client = await self._get_client()
        payload = session.model_dump()
        try:
            resp = await client.post("/browser_sessions", json=payload)
            resp.raise_for_status()
        except Exception as e:
            logger.error("Supabase create error for session %s: %s", session.session_id, e)
            raise

    async def update(self, session: SessionData) -> None:
        client = await self._get_client()
        session.touch_updated()
        payload = session.model_dump()
        try:
            resp = await client.patch(
                "/browser_sessions",
                params={"session_id": f"eq.{session.session_id}"},
                json=payload,
            )
            resp.raise_for_status()
        except Exception as e:
            logger.error("Supabase update error for session %s: %s", session.session_id, e)
            raise

    async def delete(self, session_id: str) -> bool:
        client = await self._get_client()
        try:
            resp = await client.delete(
                "/browser_sessions",
                params={"session_id": f"eq.{session_id}"},
            )
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error("Supabase delete error for session %s: %s", session_id, e)
            return False

    async def list_all(self) -> List[SessionData]:
        client = await self._get_client()
        try:
            resp = await client.get(
                "/browser_sessions",
                params={"select": "*", "order": "updated_at.desc", "limit": "50"},
            )
            resp.raise_for_status()
            rows = resp.json()
            return [SessionData.model_validate(r) for r in rows]
        except Exception as e:
            logger.error("Supabase list_all error: %s", e)
            return []
