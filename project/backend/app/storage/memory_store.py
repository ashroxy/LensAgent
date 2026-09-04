"""
Thread-safe in-memory session store.
"""

from __future__ import annotations

import asyncio
from typing import Dict, List, Optional

from app.schemas.session import SessionData
from app.storage.base import BaseSessionStore


class MemorySessionStore(BaseSessionStore):
    """Fast, in-memory implementation of BaseSessionStore."""

    def __init__(self, ttl_seconds: int = 3600) -> None:
        self._store: Dict[str, SessionData] = {}
        self._lock = asyncio.Lock()
        self._ttl_seconds = ttl_seconds

    async def get(self, session_id: str) -> Optional[SessionData]:
        async with self._lock:
            session = self._store.get(session_id)
            if session is None:
                return None
            return session.model_copy(deep=True)

    async def create(self, session: SessionData) -> None:
        async with self._lock:
            self._store[session.session_id] = session.model_copy(deep=True)

    async def update(self, session: SessionData) -> None:
        async with self._lock:
            session.touch_updated()
            self._store[session.session_id] = session.model_copy(deep=True)

    async def delete(self, session_id: str) -> bool:
        async with self._lock:
            if session_id in self._store:
                del self._store[session_id]
                return True
            return False

    async def list_all(self) -> List[SessionData]:
        async with self._lock:
            return [s.model_copy(deep=True) for s in self._store.values()]

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()
