"""
Browser state models conforming to LensAgent's Tri-Stream extraction.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class Viewport(BaseModel):
    """Browser viewport dimensions."""
    model_config = ConfigDict(extra="ignore")

    width: Optional[float] = Field(default=1280.0, description="Viewport width in pixels")
    height: Optional[float] = Field(default=720.0, description="Viewport height in pixels")


class ScrollPosition(BaseModel):
    """Current scroll position."""
    model_config = ConfigDict(extra="ignore")

    x: Optional[float] = Field(default=0.0, description="Horizontal scroll position")
    y: Optional[float] = Field(default=0.0, description="Vertical scroll position")


class PageMetadata(BaseModel):
    """Page-level metadata."""
    model_config = ConfigDict(extra="ignore")

    title: Optional[str] = Field(default="", description="Sanitized page title")
    url: Optional[str] = Field(default="", description="Sanitized full page URL")
    viewport: Optional[Viewport] = Field(default_factory=Viewport, description="Viewport dimensions")
    scroll: Optional[ScrollPosition] = Field(default_factory=ScrollPosition, description="Scroll position")


class ElementState(BaseModel):
    """A single interactable or visible element on the page."""
    model_config = ConfigDict(extra="ignore")

    element_id: Optional[str] = Field(default="", description="Unique element identifier (DOM id or generated id)")
    role: Optional[str] = Field(default="generic", description="ARIA role (textbox, button, checkbox, combobox, link, etc.)")
    type: Optional[str] = Field(default=None, description="Input type (text, email, tel, password, checkbox, etc.)")
    tag: Optional[str] = Field(default=None, description="HTML tag name (input, button, select, textarea, etc.)")
    text: Optional[str] = Field(default=None, description="Sanitized visible text content")
    label: Optional[str] = Field(default=None, description="Sanitized label or aria-label text")
    placeholder: Optional[str] = Field(default=None, description="Sanitized placeholder text")
    value: Optional[str] = Field(default="", description="Current value or semantic placeholder")
    bbox: Optional[List[Any]] = Field(default_factory=list, description="Bounding box [x, y, width, height] in CSS pixels")
    visible: Optional[bool] = Field(default=True, description="Whether element is in the visible viewport")
    enabled: Optional[bool] = Field(default=True, description="Whether element is interactable / not disabled")
    checked: Optional[bool] = Field(default=None, description="Checkbox or radio state")
    selected: Optional[bool] = Field(default=None, description="Select option state")
    focused: Optional[bool] = Field(default=False, description="Whether element currently has focus")


class BrowserState(BaseModel):
    """Complete normalized browser state from the extension."""
    model_config = ConfigDict(extra="ignore")

    page: Optional[PageMetadata] = Field(default_factory=PageMetadata, description="Page metadata")
    elements: Optional[List[ElementState]] = Field(
        default_factory=list,
        description="List of detected/interactable elements on the page",
    )
    checklist: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Client-side DOM validated form checklist",
    )
