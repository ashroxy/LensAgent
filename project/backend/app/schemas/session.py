"""
Session data schema for state tracking across multi-turn form automation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SessionData(BaseModel):
    """Complete session state managed across multi-step execution."""

    session_id: str = Field(description="Unique session identifier")
    task: str = Field(default="", description="The user's goal or prompt")
    status: str = Field(default="RUNNING", description="Session lifecycle state (RUNNING, COMPLETED, BLOCKED, ERROR)")
    phase: str = Field(default="fill", description="Current execution phase (analyze, fill, submit, verify, done)")
    step_index: int = Field(default=0, description="Current turn / cycle count")
    retry_count: int = Field(default=0, description="Consecutive retry count for stuck-state handling")
    summary: str = Field(default="", description="Rolling reasoning summary for VLM context")

    # Action tracking
    completed_actions: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="History of all executed actions and their results across turns",
    )
    pending_actions: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Planned actions remaining to be executed",
    )
    last_action_batch: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Actions emitted in the most recent turn",
    )

    # Element fill tracking: element_id -> { "key": "<VAULT_KEY>", "value": "..." }
    field_fill_history: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Map of element_id to vault key or value filled",
    )

    # State delta tracking
    last_browser_state_hash: Optional[str] = Field(default=None, description="Hash of the latest browser state")
    previous_browser_state_hash: Optional[str] = Field(default=None, description="Hash of the prior browser state")

    # Timestamps
    created_at: str = Field(default_factory=_utc_now_iso, description="Session creation timestamp")
    updated_at: str = Field(default_factory=_utc_now_iso, description="Session last updated timestamp")

    def touch_updated(self) -> None:
        self.updated_at = _utc_now_iso()
