"""
Action schemas matching LensAgent's ActionExecutor and VLM structured actions.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    CLICK = "CLICK"
    DOUBLE_CLICK = "DOUBLE_CLICK"
    TYPE = "TYPE"
    SCROLL = "SCROLL"
    PRESS_KEY = "PRESS_KEY"
    HOVER = "HOVER"
    DRAG = "DRAG"
    SELECT = "SELECT"
    WAIT = "WAIT"
    NAVIGATE = "NAVIGATE"
    BACK = "BACK"
    TERMINATE = "TERMINATE"
    FINISH = "FINISH"
    ASK_USER = "ASK_USER"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    VAULT_FILL = "VAULT_FILL"


class Action(BaseModel):
    """A structured action to be executed in the browser."""

    action_id: str = Field(default="", description="Unique identifier for the action in the batch")
    type: str = Field(description="Action type (TYPE, CLICK, SCROLL, FINISH, SELECT, etc.)")
    target: Optional[str] = Field(default=None, description="Target element ID if applicable")
    x: Optional[float] = Field(default=None, description="Target X coordinate in pixels")
    y: Optional[float] = Field(default=None, description="Target Y coordinate in pixels")
    text: Optional[str] = Field(default=None, description="Text to type (or <VAULT_*> token)")
    key: Optional[str] = Field(default=None, description="Vault key name or keyboard key name")
    value: Optional[str] = Field(default=None, description="Direct text value or token value")
    delta_y: Optional[float] = Field(default=None, description="Vertical scroll delta in pixels (e.g. 400)")
    delta_x: Optional[float] = Field(default=None, description="Horizontal scroll delta in pixels")
    direction: Optional[str] = Field(default=None, description="Scroll direction (down, up, right, left)")
    optionText: Optional[str] = Field(default=None, description="Option text for select dropdown")
    press_enter: Optional[bool] = Field(default=False, description="Whether to press Enter after typing")
    question: Optional[str] = Field(default=None, description="Question for ASK_USER action")
    vaultKey: Optional[str] = Field(default=None, description="Suggested vault key for ASK_USER action")
    duration_ms: Optional[int] = Field(default=None, description="Wait duration in milliseconds")


class ActionResult(BaseModel):
    """Result of executing an action on the client."""

    action_id: Optional[str] = None
    success: bool = True
    action: str = ""
    detail: str = ""
    retries: int = 0
    status: Optional[str] = None
