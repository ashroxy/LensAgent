"""
Routed VLM Engine: Groq primary, Hugging Face router fallback.

Normal (non-rate-limited) calls hit Groq, which returns crisp JSON quickly without
the reasoning-token bloat of the HF Qwen3 model. When Groq exhausts its free-tier
quota (429 -> blocked after retries) or fails at the infrastructure level, the
HF router is used as a fallback so the agent keeps working. No task/hardcoded
prompt selection is done here; routing is purely by availability/health.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.vlm.base import BaseVLMEngine
from app.vlm.groq_engine import GroqEngine
from app.vlm.hf_engine import HFEngine

logger = logging.getLogger("lensagent.vlm.routed")


class RoutedEngine(BaseVLMEngine):
    """Delegates to GroqEngine first, then HFEngine on Groq failure."""

    def __init__(self) -> None:
        self._groq = GroqEngine()
        self._hf = HFEngine()

    async def load(self) -> None:
        await self._groq.load()
        # HF only needed as a fallback; initialize lazily/quietly.
        try:
            await self._hf.load()
        except Exception as e:  # pragma: no cover - defensive
            logger.warning("HF fallback initialize warning: %s", e)

    async def close(self) -> None:
        await self._groq.close()
        await self._hf.close()

    @staticmethod
    def _is_infra_blocked(result: Dict[str, Any]) -> bool:
        """True when the finished result indicates the backend failed at the
        infrastructure level (rate limit, auth, connectivity), so a fallback should
        be attempted. Legitimate action outputs are never status 'blocked'."""
        if result.get("status") != "blocked":
            return False
        reason = str(result.get("reason", ""))
        return bool(reason) and reason != "Empty VLM response"

    async def infer(self, image_b64: Optional[str], prompt: str) -> Dict[str, Any]:
        groq_result = await self._groq.infer(image_b64, prompt)

        if not self._is_infra_blocked(groq_result):
            return groq_result

        logger.warning(
            "Groq blocked (%s); falling back to Hugging Face router",
            groq_result.get("reason"),
        )
        hf_result = await self._hf.infer(image_b64, prompt)
        if hf_result.get("status") == "blocked":
            # Last resort: report the original Groq reason (more actionable).
            return groq_result
        return hf_result