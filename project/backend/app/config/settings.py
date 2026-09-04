"""
Application configuration and settings.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import FrozenSet

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(_BASE_DIR / ".env")


class Settings(BaseSettings):
    # Server settings
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    DEBUG_TIMINGS: bool = os.getenv("DEBUG_TIMINGS", "true").lower() == "true"

    # VLM Backend Selection: "groq" (cloud), "hf" (Hugging Face router),
    # "openrouter" (OpenRouter), "llamacpp" (local), or "auto"/"routed"
    VLM_BACKEND: str = os.getenv("VLM_BACKEND", "groq")

    # OpenRouter API (OpenAI-compatible, credit/billed). Reliable primary when funded.
    OPENROUTER_API_URL: str = os.getenv("OPENROUTER_API_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "qwen/qwen3.8-27b")
    OPENROUTER_MAX_TOKENS: int = int(os.getenv("OPENROUTER_MAX_TOKENS", "4096"))
    # Set to "false" to disable Qwen3 thinking (reasoning_len 0, faster, content emitted
    # directly without the reasoning-token budget being consumed).
    OPENROUTER_REASONING: str = os.getenv("OPENROUTER_REASONING", "false")

    # Groq Cloud API (Qwen3.6-27B multimodal)
    GROQ_API_URL: str = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    # Comma-separated list of additional Groq API keys for rotation.
    # Each key gets its own free-tier rate quota (RPM/RPD/TPM), so rotating on
    # 429/401 spreads load and maximizes uptime.
    GROQ_API_KEYS: str = os.getenv("GROQ_API_KEYS", "")
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "qwen/qwen3.6-27b")
    GROQ_RPM_LIMIT: int = int(os.getenv("GROQ_RPM_LIMIT", "28"))  # Stay under 30 RPM
    GROQ_RPD_LIMIT: int = int(os.getenv("GROQ_RPD_LIMIT", "950"))  # Stay under 1000 RPD

    @property
    def groq_key_pool(self) -> list[str]:
        """All Groq keys available for rotation (deduplicated, whitespace trimmed)."""
        keys: list[str] = []
        for raw in ([self.GROQ_API_KEY] + [k for k in self.GROQ_API_KEYS.split(",") if k.strip()]):
            k = (raw or "").strip()
            if k and k not in keys:
                keys.append(k)
        return keys

    # Hugging Face Inference Providers router (OpenAI-compatible).
    # A single HF_TOKEN routes to Groq/Together/Fireworks/etc. with provider
    # pass-through pricing; used as a cloud fallback when Groq free-tier is exhausted.
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    HF_API_URL: str = os.getenv("HF_API_URL", "https://router.huggingface.co/v1")
    HF_MODEL: str = os.getenv("HF_MODEL", "Qwen/Qwen3-VL-30B-A3B-Instruct")
    HF_RPM_LIMIT: int = int(os.getenv("HF_RPM_LIMIT", "28"))
    # Qwen3 thinking models spend a large completion budget on "reasoning" before
    # emitting the JSON `content`. The shared MAX_NEW_TOKENS (1024) is too small and
    # truncates content to empty. Use a larger ceiling so reasoning completes and the
    # JSON is emitted.
    HF_MAX_TOKENS: int = int(os.getenv("HF_MAX_TOKENS", "4096"))

    # Llama Server (Qwen2.5-VL-7B fallback)
    LLAMACPP_URL: str = os.getenv("LLAMACPP_URL", "http://127.0.0.1:8081")
    MODEL_PATH: str = os.getenv(
        "MODEL_PATH", r"C:\Users\shinc\Qwen2.5-VL-7B\Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf"
    )
    MMPROJ_PATH: str = os.getenv(
        "MMPROJ_PATH", r"C:\Users\shinc\Qwen2.5-VL-7B\mmproj-Qwen2.5-VL-7B-Instruct-Q8_0.gguf"
    )
    LLAMA_SERVER_BIN: str = os.getenv(
        "LLAMA_SERVER_BIN",
        r"C:\Users\shinc\Downloads\llama-b10709-bin-win-cuda-13.3-x64\llama-server.exe",
    )

    # VLM Inference settings
    MAX_NEW_TOKENS: int = int(os.getenv("MAX_NEW_TOKENS", "1024"))
    TEMPERATURE: float = float(os.getenv("TEMPERATURE", "0.05"))
    MAX_IMAGE_WIDTH: int = int(os.getenv("MAX_IMAGE_WIDTH", "720"))
    MAX_IMAGE_HEIGHT: int = int(os.getenv("MAX_IMAGE_HEIGHT", "720"))
    MAX_SCREENSHOT_BYTES: int = 15 * 1024 * 1024

    # Session and Storage settings
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "memory")  # 'memory' or 'supabase'
    SESSION_TTL_SECONDS: int = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))

    # Supabase Settings (for optional persistence)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # Standard Actions supported by LensAgent
    SUPPORTED_ACTION_TYPES: FrozenSet[str] = frozenset({
        "TYPE",
        "CLICK",
        "DOUBLE_CLICK",
        "SCROLL",
        "PRESS_KEY",
        "HOVER",
        "DRAG",
        "SELECT",
        "WAIT",
        "NAVIGATE",
        "BACK",
        "TERMINATE",
        "FINISH",
        "ASK_USER",
        "REQUIRE_APPROVAL",
        "VAULT_FILL",
        # Lowercase aliases from VLM
        "fill",
        "click",
        "scroll",
        "check",
        "uncheck",
        "select",
        "wait",
        "press_key",
        "finish",
        "done",
        "ask_user",
    })

    PAGE_TERMINATING_ACTIONS: FrozenSet[str] = frozenset({
        "CLICK",
        "click",
        "NAVIGATE",
        "navigate",
        "SCROLL",
        "scroll",
    })

    model_config = {"case_sensitive": True, "extra": "ignore"}


settings = Settings()
