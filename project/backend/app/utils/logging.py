"""
Structured logging setup and request telemetry.
"""

from __future__ import annotations

import logging
import sys
from typing import Optional


def setup_logging(log_level: str = "INFO") -> logging.Logger:
    level = getattr(logging, log_level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # Avoid duplicate handlers if re-initialized
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)

    logger = logging.getLogger("lensagent.backend")
    logger.setLevel(level)
    return logger


def log_step(
    logger: logging.Logger,
    session_id: str,
    step_index: int,
    action_count: int,
    phase: str,
    latency_ms: float,
    status: str,
) -> None:
    logger.info(
        "Session %s [Step %d] Phase=%s Actions=%d Status=%s Latency=%.1fms",
        session_id,
        step_index,
        phase,
        action_count,
        status,
        latency_ms,
    )
