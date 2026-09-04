"""
Browser state hashing for state comparison and infinite loop detection.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def hash_browser_state(state_dict: Dict[str, Any]) -> str:
    """Computes a deterministic hash of interactive elements and page URL."""
    try:
        page = state_dict.get("page", {})
        elements = state_dict.get("elements", [])

        # Key components for state comparison: URL, title, scroll y, and element values
        state_repr = {
            "url": page.get("url", ""),
            "title": page.get("title", ""),
            "scroll_y": page.get("scroll", {}).get("y", 0),
            "elements": [
                {
                    "id": e.get("element_id", ""),
                    "val": e.get("value", ""),
                    "chk": e.get("checked"),
                    "vis": e.get("visible", True),
                }
                for e in elements
                if e.get("role") in ("textbox", "checkbox", "combobox", "button")
            ],
        }

        canonical_json = json.dumps(state_repr, sort_keys=True)
        return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()[:16]
    except Exception:
        return ""
