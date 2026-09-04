"""
Pytest fixtures and configuration.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.actions.action_formatter import ActionFormatter
from app.api.routes import init_dependencies
from app.main import app
from app.prompts.prompt_builder import PromptBuilder
from app.schemas.browser_state import BrowserState, ElementState, PageMetadata, ScrollPosition, Viewport
from app.session.session_manager import SessionManager
from app.storage.memory_store import MemorySessionStore
from app.validation.action_validator import ActionValidator
from app.vlm.base import BaseVLMEngine
from app.workflow.workflow_manager import WorkflowManager


class MockVLMEngine(BaseVLMEngine):
    """Mock VLM engine returning predetermined action plans for unit testing."""

    def __init__(self, response_override: Optional[Dict[str, Any]] = None) -> None:
        self.response_override = response_override

    async def load(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def infer(self, image_b64: Optional[str], prompt: str) -> Dict[str, Any]:
        if self.response_override:
            return self.response_override

        return {
            "thought": "Fill visible form fields and scroll if needed",
            "status": "continue",
            "actions": [
                {"type": "TYPE", "target": "input_name", "key": "<VAULT_FULL_NAME>"},
                {"type": "TYPE", "target": "input_email", "key": "<VAULT_EMAIL>"},
            ],
            "reason": "Filling initial fields",
        }


@pytest.fixture
def sample_browser_state() -> BrowserState:
    return BrowserState(
        page=PageMetadata(
            title="Job Application Form",
            url="http://localhost:3000/apply",
            viewport=Viewport(width=1280, height=720),
            scroll=ScrollPosition(x=0, y=0),
        ),
        elements=[
            ElementState(
                element_id="input_name",
                role="textbox",
                type="text",
                tag="input",
                label="Full Name",
                placeholder="Enter your legal full name",
                value="",
                bbox=[100, 150, 300, 40],
                visible=True,
                enabled=True,
            ),
            ElementState(
                element_id="input_email",
                role="textbox",
                type="email",
                tag="input",
                label="Email Address",
                placeholder="you@example.com",
                value="",
                bbox=[100, 220, 300, 40],
                visible=True,
                enabled=True,
            ),
            ElementState(
                element_id="input_phone",
                role="textbox",
                type="tel",
                tag="input",
                label="Phone Number",
                placeholder="+1 555 000 0000",
                value="",
                bbox=[100, 850, 300, 40],  # Offscreen (> 720)
                visible=False,
                enabled=True,
            ),
            ElementState(
                element_id="chk_terms",
                role="checkbox",
                tag="input",
                label="I agree to terms and conditions",
                value="",
                checked=False,
                bbox=[100, 920, 20, 20],  # Offscreen
                visible=False,
                enabled=True,
            ),
            ElementState(
                element_id="btn_submit",
                role="button",
                tag="button",
                text="Submit Application",
                bbox=[100, 970, 150, 45],  # Offscreen
                visible=False,
                enabled=True,
            ),
        ],
    )


@pytest_asyncio.fixture
async def async_client(sample_browser_state: BrowserState) -> AsyncClient:
    store = MemorySessionStore()
    session_manager = SessionManager(store)
    workflow_manager = WorkflowManager()
    prompt_builder = PromptBuilder()
    action_formatter = ActionFormatter()
    action_validator = ActionValidator()
    vlm_engine = MockVLMEngine()

    init_dependencies(
        session_manager=session_manager,
        workflow_manager=workflow_manager,
        prompt_builder=prompt_builder,
        action_formatter=action_formatter,
        action_validator=action_validator,
        vlm_engine=vlm_engine,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
