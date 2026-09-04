"""
Unit tests for WorkflowManager completion and loop detection.
"""

from __future__ import annotations

import pytest

from app.schemas.browser_state import BrowserState, ElementState, PageMetadata, ScrollPosition, Viewport
from app.schemas.session import SessionData
from app.workflow.workflow_manager import WorkflowManager


def test_workflow_completion_detection():
    wm = WorkflowManager()
    session = SessionData(session_id="wf_1", task="Register")

    # State with submit success in title
    success_state = BrowserState(
        page=PageMetadata(title="Registration Complete - Thank You!", url="http://localhost/success"),
        elements=[],
    )

    completed, reason = wm.check_completion(session, success_state, "continue")
    assert completed is True
    assert "success" in reason.lower() or "thank you" in reason.lower() or "complete" in reason.lower()


def test_workflow_loop_detection():
    wm = WorkflowManager()
    session = SessionData(session_id="wf_2", task="Apply")
    session.last_browser_state_hash = "abc123hash"
    session.previous_browser_state_hash = "abc123hash"
    session.retry_count = 3  # Hit max retries

    assert wm.detect_loop(session) is True


def test_workflow_auto_scroll():
    wm = WorkflowManager()
    state = BrowserState(
        page=PageMetadata(viewport=Viewport(width=1000, height=500), scroll=ScrollPosition(x=0, y=0)),
        elements=[
            ElementState(element_id="e1", role="textbox", bbox=[50, 50, 200, 30], visible=True),
            ElementState(element_id="e2", role="textbox", bbox=[50, 700, 200, 30], visible=False),  # Offscreen
        ],
    )

    actions = [{"type": "TYPE", "target": "e1", "text": "value"}]
    with_scroll = wm.ensure_scroll_if_needed(actions, state)

    assert len(with_scroll) == 2
    assert with_scroll[1]["type"] == "SCROLL"
    assert with_scroll[1]["delta_y"] == 400
