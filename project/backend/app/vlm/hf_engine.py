"""
Hugging Face Inference Providers router VLM Engine (OpenAI-compatible).

Connects to the HF router endpoint (https://router.huggingface.co/v1) with a single
HF_TOKEN, hosting Qwen vision models (default: Qwen/Qwen3.8-27B). Uses the same
multimodal chat-completions contract as Groq, so parsing is shared in structure.
Rate limiting is a simple async RPM budget to stay under the shared provider quota.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
import time
from collections import deque
from typing import Any, Dict, List, Optional

import httpx
from PIL import Image

from app.config.settings import settings
from app.vlm.base import BaseVLMEngine

logger = logging.getLogger("lensagent.vlm.hf")


class _HFBudget:
    """Sliding-window RPM budget for the single shared HF token."""

    def __init__(self, rpm: int) -> None:
        self.rpm = rpm
        self._timestamps: deque[float] = deque()

    async def acquire(self) -> None:
        while True:
            now = time.monotonic()
            while self._timestamps and self._timestamps[0] < now - 60:
                self._timestamps.popleft()
            if len(self._timestamps) < self.rpm:
                self._timestamps.append(now)
                return
            wait = 60.0 - (now - self._timestamps[0]) + 0.1
            logger.info("HF router within RPM budget, waiting %.1fs...", wait)
            await asyncio.sleep(min(wait, 5.0))

    @property
    def rpm_remaining(self) -> int:
        now = time.monotonic()
        while self._timestamps and self._timestamps[0] < now - 60:
            self._timestamps.popleft()
        return max(0, self.rpm - len(self._timestamps))


class HFEngine(BaseVLMEngine):
    """Client for the Hugging Face Inference Providers router (OpenAI-compatible)."""

    def __init__(self) -> None:
        self.api_url = settings.HF_API_URL
        self.model = settings.HF_MODEL
        self.api_key = settings.HF_TOKEN
        self._client: Optional[httpx.AsyncClient] = None
        self._budget = _HFBudget(max(1, settings.HF_RPM_LIMIT))

    async def load(self) -> None:
        if not self.api_key:
            logger.warning("No HF_TOKEN configured - HFEngine disabled")
            return

        logger.info(
            "Initializing HFEngine (model=%s, endpoint=%s)",
            self.model, self.api_url,
        )
        self._client = httpx.AsyncClient(
            base_url=self.api_url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

        # Connectivity check via the OpenAI-compatible model list endpoint.
        try:
            resp = await self._client.get("/models")
            if resp.status_code == 200:
                logger.info("HF router reachable, %d RPM remaining", self._budget.rpm_remaining)
            elif resp.status_code == 401:
                logger.error("HF router authentication failed - check HF_TOKEN")
            else:
                logger.warning("HF router health check returned %d", resp.status_code)
        except Exception as e:
            logger.error("Cannot reach HF router at %s: %s", self.api_url, e)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _optimize_image(self, image_data: str, mime_type: str = "image/jpeg") -> str:
        """Resize and compress screenshot for VLM context."""
        try:
            raw_bytes = base64.b64decode(image_data)
            image = Image.open(io.BytesIO(raw_bytes))

            if image.mode != "RGB":
                image = image.convert("RGB")

            max_w, max_h = settings.MAX_IMAGE_WIDTH, settings.MAX_IMAGE_HEIGHT
            if image.width > max_w or image.height > max_h:
                image.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            image.save(buf, format="JPEG", quality=80, optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            logger.error("Image optimization error: %s", e)
            return image_data

    async def infer(self, image_b64: Optional[str], prompt: str) -> Dict[str, Any]:
        if not self.api_key:
            return {
                "status": "blocked",
                "thought": "HF_TOKEN not configured",
                "actions": [],
                "reason": "HF_TOKEN not set in environment",
            }

        if not self._client or self._client.is_closed:
            await self.load()
        if not self._client:
            return {
                "status": "blocked",
                "thought": "Failed to initialize HF client",
                "actions": [],
                "reason": "HF client initialization failed",
            }

        # Build multimodal content
        content: List[Dict[str, Any]] = []

        if image_b64:
            try:
                optimized_b64 = self._optimize_image(image_b64)
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{optimized_b64}"},
                })
            except Exception as e:
                logger.warning("Skipping invalid image: %s", e)

        content.append({"type": "text", "text": prompt})

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are LensAgent, an expert browser automation agent. "
                        "Analyze the redacted webpage screenshot and the element tree provided. "
                        "Your task is to fill out forms accurately using ONLY the vault tokens provided.\n\n"
                        "CRITICAL RULES:\n"
                        "1. Return ONLY a single valid JSON object. No markdown, no backticks, no commentary.\n"
                        "2. Use ONLY element IDs that appear in the VISIBLE UNFILLED FORM ELEMENTS list.\n"
                        "3. Use ONLY vault tokens from the AVAILABLE CLIENT VAULT KEYS list.\n"
                        "4. If no vault key matches a field, use ASK_USER action.\n"
                        "5. Never output FINISH until ALL visible and offscreen elements are handled.\n"
                        "6. If all visible elements are filled but offscreen remain, output SCROLL down.\n"
                    ),
                },
                {"role": "user", "content": content},
            ],
            "max_tokens": settings.HF_MAX_TOKENS,
            "temperature": settings.TEMPERATURE,
        }

        # Enforce our local RPM budget before sending.
        await self._budget.acquire()

        start = time.perf_counter()
        data = None
        output_text = ""
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                attempt_payload = dict(payload)
                if attempt == 0:
                    attempt_payload["response_format"] = {"type": "json_object"}
                resp = await self._client.post("/chat/completions", json=attempt_payload)
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                body = e.response.text or ""

                if status == 429:
                    wait = 15.0
                    retry_after = e.response.headers.get("retry-after")
                    try:
                        if retry_after and retry_after.strip().isdigit():
                            wait = float(retry_after)
                    except (TypeError, ValueError):
                        pass
                    logger.warning("HF router rate limited (429), backing off %.0fs (attempt %d/%d)",
                                   wait, attempt + 1, max_attempts)
                    await asyncio.sleep(min(wait, 60.0))
                    continue

                if status == 401:
                    logger.error("HF router auth failed (401) - check HF_TOKEN")
                    return {
                        "status": "blocked",
                        "thought": "VLM server error",
                        "actions": [],
                        "reason": "HF router authentication failed",
                    }

                if status == 400 and ("json_validate_failed" in body or "failed_generation" in body):
                    logger.warning("HF JSON mode failed validation, retrying without response_format")
                    continue

                logger.error("HF router HTTP %s: %s", status, body[:500])
                return {
                    "status": "blocked",
                    "thought": "VLM server error",
                    "actions": [],
                    "reason": f"HF router HTTP error: {status}",
                }
            except Exception as e:
                logger.error("HF router connection error: %s", e)
                return {
                    "status": "blocked",
                    "thought": "Connection error",
                    "actions": [],
                    "reason": f"HF router connection error: {e}",
                }

        if data is None:
            logger.error("HF request failed after %d attempts", max_attempts)
            return {
                "status": "blocked",
                "thought": "VLM server error",
                "actions": [],
                "reason": f"HF router rate limited after {max_attempts} attempts",
            }

        elapsed = time.perf_counter() - start
        choices = data.get("choices", [])
        if not choices:
            logger.warning("Empty HF response")
            return {"status": "blocked", "thought": "", "actions": [], "reason": "Empty VLM response"}

        message = choices[0].get("message", {}) or {}
        output_text = (message.get("content") or "").strip()
        # Qwen3 thinking models put their JSON in `content` only after a (possibly
        # long) `reasoning` field. If content came back empty — e.g. the reasoning
        # still dominated the completion budget — fall back to extracting JSON from
        # the reasoning text itself rather than reporting "No JSON found".
        if not output_text:
            reasoning = (message.get("reasoning") or "").strip()
            if reasoning:
                logger.debug("HF empty content; attempting salvage from reasoning (%d chars)", len(reasoning))
                output_text = reasoning
        usage = data.get("usage", {})

        logger.info(
            "HF VLM Inference in %.2fs (prompt_tokens=%s, completion_tokens=%s, rpm_remaining=%d)",
            elapsed,
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
            self._budget.rpm_remaining,
        )
        logger.debug("HF VLM Raw Output:\n%s", output_text)

        return self._parse_vlm_output(output_text)

    def _parse_vlm_output(self, text: str) -> Dict[str, Any]:
        """Robust parser that extracts and cleans JSON from model output."""
        cleaned = text.strip()

        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        json_str = ""
        obj_match = re.search(r"\{[\s\S]*\}", cleaned)
        arr_match = re.search(r"\[[\s\S]*\]", cleaned)

        if obj_match and (not arr_match or obj_match.start() <= arr_match.start()):
            json_str = obj_match.group(0)
        elif arr_match:
            json_str = arr_match.group(0)
        else:
            logger.warning("No JSON found in HF output: %s", cleaned[:300])
            return {
                "status": "continue",
                "thought": cleaned[:200],
                "actions": [],
                "reason": "VLM output contained no JSON structure",
            }

        parsed: Any = None
        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError:
            try:
                fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
                parsed = json.loads(fixed)
            except json.JSONDecodeError:
                try:
                    repaired = self._repair_truncated_json(json_str)
                    parsed = json.loads(repaired)
                    logger.info("Repaired truncated HF JSON")
                except Exception as e:
                    logger.warning("Failed to parse HF JSON: %s (raw: %s)", e, json_str[:300])
                    return {
                        "status": "continue",
                        "thought": "Failed to parse JSON",
                        "actions": [],
                        "reason": f"Malformed JSON: {str(e)[:100]}",
                    }

        if isinstance(parsed, list):
            parsed = {
                "thought": "Executing action plan",
                "status": "continue",
                "actions": parsed,
                "reason": "Action batch",
            }

        if not isinstance(parsed, dict):
            return {"status": "continue", "thought": "", "actions": [], "reason": "Invalid JSON type"}

        thought = parsed.get("thought") or parsed.get("reasoning") or parsed.get("reason") or ""
        status = parsed.get("status", "continue")
        actions = parsed.get("actions") or parsed.get("action_plan") or parsed.get("plan") or []

        if isinstance(actions, dict):
            actions = [actions]

        normalized: List[Dict[str, Any]] = []
        for i, act in enumerate(actions, start=1):
            if not isinstance(act, dict):
                continue
            item = dict(act)
            if "type" not in item and "action" in item:
                item["type"] = item.pop("action")
            if "action_id" not in item:
                item["action_id"] = f"a{i}"
            if "type" in item:
                item["type"] = str(item["type"]).upper().strip()
            # Normalize the model's camelCase target alias (elementId) down to the
            # canonical key the formatter/validator expects. value/key are already
            # handled downstream as value aliases, so leave them intact.
            if not item.get("target") and not item.get("element_id"):
                item["target"] = item.get("elementId")
            # ASK_USER question alias: some models output "message" instead of "question".
            if not item.get("question") and item.get("message"):
                item["question"] = item.get("message")
            # SCROLL amount/delta aliases.
            if item.get("type") == "SCROLL" and "delta_y" not in item and "amount" in item:
                item["delta_y"] = item.get("amount")
            normalized.append(item)

        return {
            "thought": str(thought),
            "status": str(status).lower(),
            "actions": normalized,
            "reason": parsed.get("reason", ""),
            "checkpoint": parsed.get("checkpoint", True),
        }

    def _repair_truncated_json(self, text: str) -> str:
        """Repairs unbalanced quotes, braces, and brackets in truncated streaming JSON."""
        fixed = text.rstrip()
        if fixed.endswith(","):
            fixed = fixed[:-1]

        open_quotes = fixed.count('"') - fixed.count('\\"')
        if open_quotes % 2 == 1:
            fixed += '"'

        fixed = re.sub(r",\s*$", "", fixed)

        for _ in range(10):
            try:
                json.loads(fixed)
                return fixed
            except json.JSONDecodeError:
                pass

            close_arr = fixed.count("[") - fixed.count("]")
            close_obj = fixed.count("{") - fixed.count("}")
            total = close_arr + close_obj
            if total <= 0:
                break
            if close_arr > 0 and (close_arr >= close_obj or close_obj == 0):
                fixed += "]"
            elif close_obj > 0:
                fixed += "}"
            else:
                break

        return fixed