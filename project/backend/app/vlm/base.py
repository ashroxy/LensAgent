"""
Abstract Base VLM Engine.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class BaseVLMEngine(ABC):
    @abstractmethod
    async def load(self) -> None:
        """Initialize or verify connection to VLM backend."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Clean up connections."""
        pass

    @abstractmethod
    async def infer(self, image_b64: Optional[str], prompt: str) -> Dict[str, Any]:
        """Perform vision-language inference and return parsed JSON structure."""
        pass
