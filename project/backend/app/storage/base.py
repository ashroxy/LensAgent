"""
Abstract Base Session Store Interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional

from app.schemas.session import SessionData


class BaseSessionStore(ABC):
    """Abstract interface for session storage backends."""

    @abstractmethod
    async def get(self, session_id: str) -> Optional[SessionData]:
        """Retrieve session by ID."""
        pass

    @abstractmethod
    async def create(self, session: SessionData) -> None:
        """Create a new session record."""
        pass

    @abstractmethod
    async def update(self, session: SessionData) -> None:
        """Update existing session record."""
        pass

    @abstractmethod
    async def delete(self, session_id: str) -> bool:
        """Delete session and associated data."""
        pass

    @abstractmethod
    async def list_all(self) -> List[SessionData]:
        """List all active sessions."""
        pass
