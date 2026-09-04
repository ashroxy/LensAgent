"""
Groq Cloud VLM Engine connecting to Qwen2.5-VL-32B-Instruct via Groq API.
Privacy-preserving: only redacted screenshots and sanitized data are sent.
Implements token-bucket rate limiting (30 RPM / 1000 RPD).
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

logger = logging.getLogger("lensagent.vlm.groq")


class _RateBucket:
    """Per-account rate bucket tracking RPM (sliding minute) and RPD (sliding day)."""

    def __init__(self, rpm: int, rpd: int) -> None:
        self.rpm = rpm
        self.rpd = rpd
        self._minute_timestamps: deque[float] = deque()
        self._day_timestamps: deque[float] = deque()
        # When set (monotonic), this key is temporarily quarantined because Groq
        # reported 429/server-side exhaustion. We avoid it until the cooldown lapses.
        self._exhausted_until = 0.0

    def _prune(self, now: float, wall: float) -> None:
        while self._minute_timestamps and self._minute_timestamps[0] < now - 60:
            self._minute_timestamps.popleft()
        while self._day_timestamps and self._day_timestamps[0] < wall - 86400:
            self._day_timestamps.popleft()

    def can_accept(self, now: float, wall: float) -> bool:
        """Read-only: could this bucket claim a slot right now?"""
        self._prune(now, wall)
        if self._exhausted_until > now:
            return False
        if len(self._minute_timestamps) >= self.rpm:
            return False
        if len(self._day_timestamps) >= self.rpd:
            return False
        return True

    def claim(self, now: float, wall: float) -> bool:
        """Try to claim a slot. Returns True if a slot was available."""
        if not self.can_accept(now, wall):
            return False
        self._minute_timestamps.append(now)
        self._day_timestamps.append(wall)
        return True

    def used_rpm(self, now: float) -> int:
        self._prune(now, time.time())
        return len(self._minute_timestamps)

    def used_rpd(self, wall: float) -> int:
        return len(self._day_timestamps)

    def wait_seconds(self, now: float, wall: float) -> float:
        """Seconds until this bucket has a free slot (0 if ready)."""
        self._prune(now, wall)
        if self._exhausted_until > now:
            return max(0.0, self._exhausted_until - now)
        wait = 0.0
        if self._minute_timestamps and len(self._minute_timestamps) >= self.rpm:
            wait = max(wait, 60.0 - (now - self._minute_timestamps[0]) + 0.1)
        if len(self._day_timestamps) >= self.rpd:
            # Wait for the oldest day timestamp to age out; cap at 1 hour.
            wait = max(wait, min(3600.0, 86400.0 - (wall - self._day_timestamps[0]) + 0.1))
        return wait

    def quarantine(self, seconds: float, now: float) -> None:
        """Mark this key exhausted for `seconds` so it is avoided."""
        self._exhausted_until = max(self._exhausted_until, now + seconds)

    def rpm_remaining(self, now: float) -> int:
        while self._minute_timestamps and self._minute_timestamps[0] < now - 60:
            self._minute_timestamps.popleft()
        return max(0, self.rpm - len(self._minute_timestamps))

    def rpd_remaining(self, wall: float) -> int:
        while self._day_timestamps and self._day_timestamps[0] < wall - 86400:
            self._day_timestamps.popleft()
        return max(0, self.rpd - len(self._day_timestamps))


class _TokenBucketRateLimiter:
    """Per-key token-bucket rate limiter.

    Each Groq account key gets its own RPM/RPD bucket (they are separate free-tier
    accounts), so the pool's true throughput scales with the number of keys.
    `pick_and_acquire()` selects the least-loaded key that currently has capacity.
    """

    def __init__(self, keys: list[str], rpm: int = 30, rpd: int = 1000) -> None:
        self.rpm = rpm
        self.rpd = rpd
        self._lock = asyncio.Lock()
        # Deterministic per-key buckets; index maps onto the engine key pool.
        self._buckets: Dict[int, _RateBucket] = {
            i: _RateBucket(rpm, rpd) for i in range(len(keys))
        }

    async def pick_and_acquire(self) -> int:
        """Return the key index that should be used this request, waiting for a
        free slot across the whole pool if every key is momentarily exhausted."""
        while True:
            async with self._lock:
                now = time.monotonic()
                wall = time.time()
                # Phase 1: evaluate eligibility WITHOUT mutating any bucket.
                eligible = [
                    (i, b) for i, b in self._buckets.items() if b.can_accept(now, wall)
                ]
                if eligible:
                    # Least-loaded first: fewest RPM used, then fewest RPD used.
                    eligible.sort(key=lambda item: (item[1].used_rpm(now), item[1].used_rpd(wall)))
                    chosen, bucket = eligible[0]
                    bucket.claim(now, wall)  # claim ONLY on the chosen key
                    return chosen

                # No key has a slot: wait for the soonest available.
                wait = min((b.wait_seconds(now, wall) for b in self._buckets.values()), default=1.0)
            logger.info("All Groq keys rate-limited, waiting %.1fs...", wait)
            await asyncio.sleep(min(wait, 5.0))

    def quarantine(self, index: int, seconds: float) -> None:
        """Mark a dropped/exhausted key so it is skipped for `seconds`."""
        b = self._buckets.get(index)
        if b:
            b.quarantine(seconds, time.monotonic())

    @property
    def rpm_remaining(self) -> int:
        now = time.monotonic()
        return sum(b.rpm_remaining(now) for b in self._buckets.values())

    @property
    def rpd_remaining(self) -> int:
        wall = time.time()
        return sum(b.rpd_remaining(wall) for b in self._buckets.values())


class GroqEngine(BaseVLMEngine):
    """Client for Groq Cloud API hosting Qwen2.5-VL-32B-Instruct with vision support."""

    def __init__(self) -> None:
        self.api_url = settings.GROQ_API_URL
        self.api_model = settings.GROQ_MODEL
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL
        # Pool of keys for rotation. self.api_key stays the primary for compat,
        # but all requests use the currently-active key.
        self._keys = settings.groq_key_pool
        self._key_index = 0
        self._client: Optional[httpx.AsyncClient] = None
        self._limiter = _TokenBucketRateLimiter(
            keys=self._keys,
            rpm=settings.GROQ_RPM_LIMIT,
            rpd=settings.GROQ_RPD_LIMIT,
        )

    def _active_key(self) -> str:
        if not self._keys:
            return ""
        return self._keys[self._key_index % len(self._keys)]

    def _rotate_key(self) -> str:
        """Advance to the next key in the pool; returns the new active key."""
        if len(self._keys) <= 1:
            return self._active_key()
        self._key_index = (self._key_index + 1) % len(self._keys)
        new_key = self._active_key()
        logger.info("Rotated Groq API key -> key #%d of %d", self._key_index + 1, len(self._keys))
        if self._client:
            self._client.headers["Authorization"] = f"Bearer {new_key}"
        return new_key

    def _apply_active_key(self) -> None:
        """Ensure the HTTP client carries the currently-active key in its header."""
        active = self._active_key()
        if self._client and active:
            self._client.headers["Authorization"] = f"Bearer {active}"

    async def load(self) -> None:
        if not self._keys:
            logger.warning("No Groq API key configured - GroqEngine disabled")
            return

        logger.info(
            "Initializing GroqEngine (model=%s, endpoint=%s, keys=%d)",
            self.model, self.api_url, len(self._keys),
        )
        self._client = httpx.AsyncClient(
            base_url=self.api_url,
            headers={
                "Authorization": f"Bearer {self._active_key()}",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

        # Quick connectivity check
        try:
            resp = await self._client.get("/models")
            if resp.status_code == 200:
                logger.info("Groq API reachable, %d RPM remaining", self._limiter.rpm_remaining)
            elif resp.status_code == 401:
                logger.error("Groq API authentication failed - check GROQ_API_KEYS")
                self._rotate_key()
            else:
                logger.warning("Groq API health check returned %d", resp.status_code)
        except Exception as e:
            logger.error("Cannot reach Groq API at %s: %s", self.api_url, e)

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _optimize_image(self, image_data: str, mime_type: str = "image/jpeg") -> str:
        """Resize and compress screenshot for VLM context (Groq has 5MB limit)."""
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
        if not self._keys:
            return {
                "status": "blocked",
                "thought": "Groq API key not configured",
                "actions": [],
                "reason": "GROQ_API_KEYS not set in environment",
            }

        if not self._client or self._client.is_closed:
            await self.load()
        if not self._client:
            return {
                "status": "blocked",
                "thought": "Failed to initialize Groq client",
                "actions": [],
                "reason": "Groq client initialization failed",
            }

        self._apply_active_key()

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
            "max_tokens": settings.MAX_NEW_TOKENS,
            "temperature": settings.TEMPERATURE,
            "reasoning_effort": "none",
        }

        # Rate limit + pick the least-loaded key that currently has a free slot
        # (per-account quota). This rotates across accounts so the pool's
        # throughput scales with the number of keys instead of one shared bucket.
        start = time.perf_counter()
        key_index = await self._limiter.pick_and_acquire()
        self._key_index = key_index
        self._apply_active_key()

        # Try with JSON mode first; retry without it on json_validate_failed;
        # also retry on 429 (rate limit) / 401 (auth) by rotating to the next key.
        data = None
        output_text = ""
        max_attempts = 4 + max(1, len(self._keys) - 1) * 2  # allow a couple of tries per key
        for attempt in range(max_attempts):
            try:
                attempt_payload = dict(payload)
                if attempt == 0:
                    attempt_payload["response_format"] = {"type": "json_object"}
                self._apply_active_key()
                resp = await self._client.post("/chat/completions", json=attempt_payload)
                resp.raise_for_status()
                data = resp.json()
                break
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                body = e.response.text or ""

                # Rotate to the next key on rate-limit or auth failure, then retry.
                if status in (429, 401):
                    if status == 429:
                        # Quarantine the just-used key so we don't hammer its
                        # exhausted free-tier quota; reuse retry-after if given.
                        retry_after = e.response.headers.get("retry-after")
                        try:
                            cooldown = min(float(retry_after), 60.0) if retry_after else 15.0
                        except (TypeError, ValueError):
                            cooldown = 15.0
                        self._limiter.quarantine(self._key_index, cooldown)
                        logger.warning(
                            "Groq rate limited (429) on key #%d. Excluding it for %.0fs, retrying (attempt %d/%d)",
                            self._key_index + 1, cooldown, attempt + 1, max_attempts,
                        )
                    else:
                        # 401: the key is bad — permanently exclude it from the pool.
                        logger.warning(
                            "Groq auth failed (401) on key #%d. Removing it, retrying (attempt %d/%d)",
                            self._key_index + 1, attempt + 1, max_attempts,
                        )
                        try:
                            del self._keys[self._key_index]
                            del self._limiter._buckets[self._key_index]
                        except (IndexError, KeyError):
                            pass
                        if not self._keys:
                            return {
                                "status": "blocked",
                                "thought": "VLM server error",
                                "actions": [],
                                "reason": "All Groq API keys invalid",
                            }
                    # Rotate to the now-least-loaded remaining key and retry.
                    key_index = await self._limiter.pick_and_acquire()
                    self._key_index = key_index
                    self._apply_active_key()
                    continue

                if status == 400 and ("json_validate_failed" in body or "failed_generation" in body):
                    logger.warning("Groq JSON mode failed validation, retrying without response_format")
                    continue
                logger.error("Groq API HTTP %s: %s", status, body[:500])
                return {
                    "status": "blocked",
                    "thought": "VLM server error",
                    "actions": [],
                    "reason": f"Groq HTTP error: {status}",
                }
            except Exception as e:
                logger.error("Groq API connection error: %s", e)
                return {
                    "status": "blocked",
                    "thought": "Connection error",
                    "actions": [],
                    "reason": f"Groq connection error: {e}",
                }

        if data is None:
            logger.error("Groq request failed after %d attempts", max_attempts)
            return {
                "status": "blocked",
                "thought": "VLM server error",
                "actions": [],
                "reason": f"Groq rate limited after {max_attempts} attempts",
            }

        elapsed = time.perf_counter() - start
        choices = data.get("choices", [])
        if not choices:
            logger.warning("Empty Groq response")
            return {"status": "blocked", "thought": "", "actions": [], "reason": "Empty VLM response"}

        output_text = choices[0].get("message", {}).get("content", "").strip()
        usage = data.get("usage", {})

        logger.info(
            "Groq VLM Inference in %.2fs (prompt_tokens=%s, completion_tokens=%s, rpm_remaining=%d, rpd_remaining=%d)",
            elapsed,
            usage.get("prompt_tokens", "?"),
            usage.get("completion_tokens", "?"),
            self._limiter.rpm_remaining,
            self._limiter.rpd_remaining,
        )
        logger.debug("Groq VLM Raw Output:\n%s", output_text)

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
        obj_match = re.search(r"\{[\s\S]*\}", cleaned)
        arr_match = re.search(r"\[[\s\S]*\]", cleaned)

        if obj_match and (not arr_match or obj_match.start() <= arr_match.start()):
            json_str = obj_match.group(0)
        elif arr_match:
            json_str = arr_match.group(0)
        else:
            logger.warning("No JSON found in Groq output: %s", cleaned[:300])
            return {
                "status": "continue",
                "thought": cleaned[:200],
                "actions": [],
                "reason": "VLM output contained no JSON structure",
            }

        parsed: Any = None
        # Attempt 1: Direct parse
        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError:
            # Attempt 2: Strip trailing commas
            try:
                fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
                parsed = json.loads(fixed)
            except json.JSONDecodeError:
                # Attempt 3: Repair truncated JSON
                try:
                    repaired = self._repair_truncated_json(json_str)
                    parsed = json.loads(repaired)
                    logger.info("Repaired truncated Groq JSON")
                except Exception as e:
                    logger.warning("Failed to parse Groq JSON: %s (raw: %s)", e, json_str[:300])
                    return {
                        "status": "continue",
                        "thought": "Failed to parse JSON",
                        "actions": [],
                        "reason": f"Malformed JSON: {str(e)[:100]}",
                    }

        # Normalize list → dict
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

        # Normalize action items
        normalized: List[Dict[str, Any]] = []
        for i, act in enumerate(actions, start=1):
            if not isinstance(act, dict):
                continue
            item = dict(act)
            # Handle "action" → "type" alias
            if "type" not in item and "action" in item:
                item["type"] = item.pop("action")
            if "action_id" not in item:
                item["action_id"] = f"a{i}"
            # Normalize action type to uppercase
            if "type" in item:
                item["type"] = str(item["type"]).upper().strip()
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

        # Fix unbalanced quotes
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
