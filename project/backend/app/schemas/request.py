"""
API Request and Response schemas for LensAgent communication.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.action import Action
from app.schemas.browser_state import BrowserState


class ScreenshotData(BaseModel):
    """Sanitized screenshot from the browser extension."""
    model_config = ConfigDict(extra="ignore")

    mime_type: Optional[str] = Field(default="image/jpeg", description="Image MIME type (image/jpeg or image/png)")
    data: Optional[str] = Field(default="", description="Base64-encoded redacted image data")


class ValidationFeedbackItem(BaseModel):
    """Client-side validation result for a single executed action."""
    model_config = ConfigDict(extra="ignore")

    element_id: Optional[str] = Field(default="", description="Element ID that was targeted")
    action_id: Optional[str] = Field(default=None, description="Action ID from the batch")
    filled: bool = Field(default=False, description="Whether the field was actually filled after execution")
    actual_value: Optional[str] = Field(default="", description="The actual value read back from the element")
    expected_value: Optional[str] = Field(default="", description="The value we tried to set")
    error: Optional[str] = Field(default=None, description="Error message if execution failed")

    @field_validator("element_id", mode="before")
    @classmethod
    def _coerce_element_id(cls, v):
        return v if isinstance(v, str) else "unknown"


class InferRequest(BaseModel):
    """Request payload sent from LensAgent agent-loop."""
    model_config = ConfigDict(extra="ignore")

    session_id: Optional[str] = Field(default="default_session", description="Unique session identifier")
    task: Optional[str] = Field(default="", description="User's task/goal description")
    browser_state: Optional[BrowserState] = Field(
        default_factory=BrowserState,
        description="Normalized browser state with page metadata and elements",
    )
    screenshot: Optional[ScreenshotData] = Field(
        default_factory=ScreenshotData,
        description="Redacted screenshot produced by client privacy engine",
    )
    execution_results: Optional[List[Any]] = Field(
        default_factory=list,
        description="Execution results from the previous action batch",
    )
    validation_feedback: Optional[List[ValidationFeedbackItem]] = Field(
        default_factory=list,
        description="Client-side validation of whether fields were actually filled after execution",
    )
    available_keys: Optional[List[str]] = Field(
        default_factory=list,
        description="Available client vault keys (e.g. ['<VAULT_FULL_NAME>', '<VAULT_EMAIL>'])",
    )


class InferResponse(BaseModel):
    """Response payload returned to LensAgent agent-loop."""

    session_id: str = Field(description="Session identifier")
    status: str = Field(
        default="continue",
        description="Action status: 'continue', 'done', 'blocked', or 'error'",
    )
    thought: str = Field(
        default="",
        description="VLM chain-of-thought reasoning for chosen actions",
    )
    actions: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Ordered list of structured actions for the browser to execute",
    )
    checkpoint: bool = Field(
        default=True,
        description="Whether the client should capture a new frame after executing",
    )
    reason: str = Field(
        default="",
        description="Summary explanation or termination reason",
    )
    timings: Optional[Dict[str, float]] = Field(
        default=None,
        description="Timing breakdown in milliseconds (when DEBUG_TIMINGS=true)",
    )


class SessionCreateRequest(BaseModel):
    """Request to create or resume a session."""

    session_id: str = Field(description="Unique session identifier")
    task: str = Field(default="", description="User's task/goal description")


class SessionCreateResponse(BaseModel):
    """Response after creating a session."""

    session_id: str = Field(description="Session identifier")
    status: str = Field(description="Session status (e.g. 'RUNNING')")
    created_at: str = Field(description="ISO timestamp of creation")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(default="ok", description="Server health status")
    vlm_status: str = Field(default="ok", description="VLM engine status")
    gpu_accelerated: bool = Field(default=True, description="Whether GPU/CUDA is enabled")
    version: str = Field(default="1.1.0", description="Backend API version")
