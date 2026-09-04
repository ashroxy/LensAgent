"""
LlamaCpp Engine connecting to local llama-server running Qwen2.5-VL-7B on CUDA.
"""

from __future__ import annotations

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

logger = logging.getLogger("lensagent.vlm")


class LlamaCppEngine(BaseVLMEngine):
    """Client for local llama-server hosting Qwen2.5-VL-7B with CUDA acceleration."""

    def __init__(self) -> None:
        self.base_url = settings.LLAMACPP_URL
        self._loaded = False
        self._client: Optional[httpx.AsyncClient] = None

    async def load(self) -> None:
        logger.info("Connecting to llama-server at %s ...", self.base_url)
        start = time.perf_counter()

        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=120.0)

        try:
            resp = await self._client.get("/health")
            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    "llama-server ready on CUDA (%.2fs, status: %s)",
                    time.perf_counter() - start,
                    data.get("status", "ok"),
                )
                self._loaded = True
            elif resp.status_code == 503:
                logger.warning("llama-server is still loading model weights...")
                self._loaded = True
            else:
                logger.warning("llama-server health check status code: %d", resp.status_code)
                self._loaded = True
        except Exception as e:
            logger.error("Could not connect to llama-server at %s: %s", self.base_url, e)
            logger.warning(
                "Ensure llama-server is started with:\n"
                "llama-server -m %s --mmproj %s -ngl 99 --port 8081",
                settings.MODEL_PATH,
                settings.MMPROJ_PATH,
            )
            # Allow server to start even if llama-server isn't up yet
            self._loaded = False

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def optimize_image(self, image_data: str, mime_type: str = "image/jpeg") -> str:
        """Sanitizes, resizes, and encodes screenshot image for VLM context."""
        try:
            raw_bytes = base64.b64decode(image_data)
            if len(raw_bytes) > settings.MAX_SCREENSHOT_BYTES:
                logger.warning("Image exceeds max size (%d bytes), compressing", len(raw_bytes))

            image = Image.open(io.BytesIO(raw_bytes))
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Constrain dimensions for faster vision token encoding
            max_w, max_h = settings.MAX_IMAGE_WIDTH, settings.MAX_IMAGE_HEIGHT
            if image.width > max_w or image.height > max_h:
                image.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            image.save(buf, format="PNG", optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
        except Exception as e:
            logger.error("Image processing error: %s", e)
            return image_data

    async def infer(self, image_b64: Optional[str], prompt: str) -> Dict[str, Any]:
        """Sends multi-modal request to llama-server and extracts structured action plan."""
        if not self._client or self._client.is_closed:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=120.0)

        content: List[Dict[str, Any]] = []

        if image_b64:
            try:
                optimized_b64 = self.optimize_image(image_b64)
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{optimized_b64}"},
                })
            except Exception as e:
                logger.warning("Skipping invalid image in prompt: %s", e)

        content.append({"type": "text", "text": prompt})

        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are an expert browser automation agent for LensAgent. "
                        "Analyze the webpage screenshot, accessibility tree, and DOM elements. "
                        "Return ONLY a valid JSON object matching the requested schema. "
                        "Do NOT output markdown blocks or conversational text."
                    ),
                },
                {"role": "user", "content": content},
            ],
            "max_tokens": settings.MAX_NEW_TOKENS,
            "temperature": settings.TEMPERATURE,
        }

        start = time.perf_counter()
        try:
            resp = await self._client.post("/v1/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            logger.error("llama-server HTTP %s: %s", e.response.status_code, e.response.text[:300])
            return {
                "status": "blocked",
                "thought": "VLM server error",
                "actions": [],
                "reason": f"llama-server HTTP error: {e.response.status_code}",
            }
        except Exception as e:
            logger.error("llama-server connection error: %s", e)
            return {
                "status": "blocked",
                "thought": "Connection error",
                "actions": [],
                "reason": f"llama-server connection error: {e}",
            }

        elapsed = time.perf_counter() - start
        choices = data.get("choices", [])
        if not choices:
            logger.warning("No choices returned in VLM response")
            return {"status": "blocked", "thought": "", "actions": [], "reason": "Empty VLM response"}

        output_text = choices[0].get("message", {}).get("content", "").strip()
        timings = data.get("timings", {})
        prompt_tokens = timings.get("prompt_tokens", 0)
        completion_tokens = timings.get("predicted_tokens", 0)

        logger.info(
            "VLM Inference in %.2fs (prompt: %d tokens, completion: %d tokens, ~%.1f tok/s)",
            elapsed,
            prompt_tokens,
            completion_tokens,
            (completion_tokens / elapsed) if elapsed > 0 else 0,
        )
        logger.debug("VLM Raw Output:\n%s", output_text)

        return self._parse_vlm_output(output_text)

    def _parse_vlm_output(self, text: str) -> Dict[str, Any]:
        """Robust parser that extracts and cleans JSON from model output."""
        cleaned = text.strip()

        # Remove markdown code blocks if present
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        # Find outer JSON boundaries
        json_str = ""
        # Check if output is a JSON object
        obj_match = re.search(r"\{[\s\S]*\}", cleaned)
        arr_match = re.search(r"\[[\s\S]*\]", cleaned)

        if obj_match and (not arr_match or obj_match.start() <= arr_match.start()):
            json_str = obj_match.group(0)
        elif arr_match:
            json_str = arr_match.group(0)
        else:
            # Try to grab from first '{' or '[' to end of string
            start_idx = -1
            for i, c in enumerate(cleaned):
                if c in ("{", "["):
                    start_idx = i
                    break
            if start_idx != -1:
                json_str = cleaned[start_idx:]
            else:
                logger.warning("No JSON structure found in output: %s", cleaned[:200])
                return {
                    "status": "continue",
                    "thought": cleaned[:200],
                    "actions": [],
                    "reason": "VLM output contained no JSON structure",
                }

        parsed: Any = None
        # Attempt 1: Direct JSON parse
        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError:
            # Attempt 2: Strip trailing commas
            try:
                fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
                parsed = json.loads(fixed)
            except json.JSONDecodeError:
                # Attempt 3: Repair truncated brackets/quotes
                try:
                    repaired = self._repair_truncated_json(json_str)
                    parsed = json.loads(repaired)
                    logger.info("Successfully repaired truncated VLM JSON")
                except Exception as e:
                    logger.warning("Failed to parse VLM JSON: %s (Raw: %s)", e, json_str[:200])
                    return {
                        "status": "continue",
                        "thought": "Failed to parse JSON",
                        "actions": [],
                        "reason": f"Malformed JSON: {str(e)[:100]}",
                    }

        # Normalize if parsed is list of actions
        if isinstance(parsed, list):
            parsed = {
                "thought": "Executing action plan",
                "status": "continue",
                "actions": parsed,
                "reason": "Action batch",
            }

        if not isinstance(parsed, dict):
            return {"status": "continue", "thought": "", "actions": [], "reason": "Invalid JSON type"}

        # Ensure required keys exist
        thought = parsed.get("thought") or parsed.get("reason") or ""
        status = parsed.get("status", "continue")
        actions = parsed.get("actions", [])

        # Check if actions was stored under alternative keys (e.g. action_plan)
        if not actions and "action_plan" in parsed:
            ap = parsed["action_plan"]
            actions = ap if isinstance(ap, list) else [ap]

        # Normalize action items
        normalized_actions: List[Dict[str, Any]] = []
        for i, act in enumerate(actions, start=1):
            if not isinstance(act, dict):
                continue
            item = dict(act)
            if "type" not in item and "action" in item:
                item["type"] = item.pop("action")
            if "action_id" not in item:
                item["action_id"] = f"a{i}"
            normalized_actions.append(item)

        return {
            "thought": str(thought),
            "status": str(status).lower(),
            "actions": normalized_actions,
            "reason": parsed.get("reason", ""),
            "checkpoint": parsed.get("checkpoint", True),
        }

    def _repair_truncated_json(self, text: str) -> str:
        """Repairs unbalanced quotes, braces, and brackets in truncated streaming JSON."""
        fixed = text.rstrip()
        if fixed.endswith(","):
            fixed = fixed[:-1]

        # Fix unbalanced double quotes
        open_quotes = fixed.count('"') - fixed.count('\\"')
        if open_quotes % 2 == 1:
            fixed += '"'

        # Remove trailing comma inside quotes fix
        fixed = re.sub(r",\s*$", "", fixed)

        # Balance braces and brackets iteratively
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
