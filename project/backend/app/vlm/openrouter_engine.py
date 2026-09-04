"""
OpenRouter VLM Engine (OpenAI-compatible).

Connects to the OpenRouter API (https://openrouter.ai/api/v1) with a single
OPENROUTER_API_KEY hosting Qwen vision models (default: qwen/qwen3.8-27b).
Uses the same multimodal chat-completions contract as Groq/HF, sharing the JSON
parsing + alias-normalization structure. Qwen3 thinking is disabled via
`reasoning: {"enabled": false}` so content is emitted directly without spending
the completion budget in a `reasoning` field. Billed per-token against the
account's OpenRouter credit balance.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import httpx
from PIL import Image

from app.config.settings import settings
from app.vlm.base import BaseVLMEngine

logger = logging.getLogger("lensagent.vlm.openrouter")


class OpenRouterEngine(BaseVLMEngine):
    """Client for the OpenRouter API (OpenAI-compatible)."""

    def __init__(self) -> None:
        self.api_url = settings.OPENROUTER_API_URL
        self.model = settings.OPENROUTER_MODEL
        self.api_key = settings.OPENROUTER_API_KEY
        self._client: Optional[httpx.AsyncClient] = None

    async def load(self) -> None:
        if not self.api_key:
            logger.warning("No OPENROUTER_API_KEY configured - OpenRouterEngine disabled")
            return

        logger.info(
            "Initializing OpenRouterEngine (model=%s, endpoint=%s)",
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

        # Connectivity check
        try:
            resp = await self._client.get("/models")
            if resp.status_code == 200:
                logger.info("OpenRouter reachable")
            elif resp.status_code == 401:
                logger.error("OpenRouter authentication failed - check OPENROUTER_API_KEY")
            else:
                logger.warning("OpenRouter health check returned %d", resp.status_code)
        except Exception as e:
            logger.error("Cannot reach OpenRouter at %s: %s", self.api_url, e)

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
                "thought": "OPENROUTER_API_KEY not configured",
                "actions": [],
                "reason": "OPENROUTER_API_KEY not set in environment",
            }

        if not self._client or self._client.is_closed:
            await self.load()
        if not self._client:
            return {
                "status": "blocked",
                "thought": "Failed to initialize OpenRouter client",
                "actions": [],
                "reason": "OpenRouter client initialization failed",
            }

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

        payload: Dict[str, Any] = {
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
            "max_tokens": settings.OPENROUTER_MAX_TOKENS,
            "temperature": settings.TEMPERATURE,
        }

        # Qwen3 thinking models route a large completion budget into a `reasoning`
        # field, which truncates the JSON `content`. Disable reasoning so content is
        # emitted directly (and faster). OpenRouter supports reasoning.enabled.
        reasoning_enabled = settings.OPENROUTER_REASONING.lower() == "true"
        payload["reasoning"] = {"enabled": reasoning_enabled}

        start = time.perf_counter()
        data = None
        output_text = ""
        for attempt in range(3):
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
                if status in (429, 402):
                    if status == 429:
                        retry_after = e.response.headers.get("retry-after")
                        try:
                            wait = min(float(retry_after), 60.0) if retry_after else 15.0
                        except (TypeError, ValueError):
                            wait = 15.0
                        logger.warning("OpenRouter rate limited (429), backing off %.0fs (attempt %d/3)",
                                       wait, attempt + 1)
                        await asyncio.sleep(wait)
                        continue
                    logger.error("OpenRouter billing/insufficient credits (402)")
                    return {
                        "status": "blocked",
                        "thought": "VLM server error",
                        "actions": [],
                        "reason": "OpenRouter HTTP error: 402 insufficient credits",
                    }
                if status == 401:
                    logger.error("OpenRouter auth failed (401) - check OPENROUTER_API_KEY")
                    return {
                        "status": "blocked",
                        "thought": "VLM server error",
                        "actions": [],
                        "reason": "OpenRouter authentication failed",
                    }
                if status == 400 and ("json_validate_failed" in body or "failed_generation" in body):
                    logger.warning("OpenRouter JSON mode failed validation, retrying without response_format")
                    continue
                logger.error("OpenRouter HTTP %s: %s", status, body[:500])
                return {
                    "status": "blocked",
                    "thought": "VLM server error",
                    "actions": [],
                    "reason": f"OpenRouter HTTP error: {status}",
                }
            except Exception as e:
                logger.error("OpenRouter connection error: %s", e)
                return {
                    "status": "blocked",
                    "thought": "Connection error",
                    "actions": [],
                    "reason": f"OpenRouter connection error: {e}",
                }

        if data is None:
            logger.error("OpenRouter request failed after 3 attempts")
            return {
                "status": "blocked",
                "thought": "VLM server error",
                "actions": [],
                "reason": "OpenRouter rate limited after 3 attempts",
            }

        elapsed = time.perf_counter() - start
        choices = data.get("choices", [])
        if not choices:
            logger.warning("Empty OpenRouter response")
            return {"status": "blocked", "thought": "", "actions": [], "reason": "Empty VLM response"}

        message = choices[0].get("message", {}) or {}
        output_text = (message.get("content") or "").strip()
        if not output_text:
            reasoning = (message.get("reasoning") or "").strip()
            if reasoning:
                logger.debug("OpenRouter empty content; attempting salvage from reasoning (%d chars)", len(reasoning))
                output_text = reasoning
        usage = data.get("usage", {})

        logger.info(
            "OpenRouter VLM Inference in %.2fs (prompt_tokens=%s, completion_tokens=%s)",
            elapsed,
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
        )
        logger.debug("OpenRouter VLM Raw Output:\n%s", output_text)

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
            logger.warning("No JSON found in OpenRouter output: %s", cleaned[:300])
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
                    logger.info("Repaired truncated JSON")
                except Exception as e:
                    logger.warning("Failed to parse JSON: %s (raw: %s)", e, json_str[:300])
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
            if not item.get("target") and not item.get("element_id"):
                item["target"] = item.get("elementId")
            if not item.get("question") and item.get("message"):
                item["question"] = item.get("message")
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