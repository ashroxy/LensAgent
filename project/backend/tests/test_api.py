"""
Unit tests for API endpoints.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.schemas.browser_state import BrowserState


@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["gpu_accelerated"] is True


@pytest.mark.asyncio
async def test_session_lifecycle(async_client: AsyncClient):
    sess_id = "test_sess_001"
    # Create session
    create_resp = await async_client.post(
        "/api/v1/session",
        json={"session_id": sess_id, "task": "Fill registration form"},
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["session_id"] == sess_id

    # Get session
    get_resp = await async_client.get(f"/api/v1/session/{sess_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["task"] == "Fill registration form"
    assert get_resp.json()["status"] == "RUNNING"

    # Delete session
    del_resp = await async_client.delete(f"/api/v1/session/{sess_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"

    # Get deleted session should 404
    get_after_del = await async_client.get(f"/api/v1/session/{sess_id}")
    assert get_after_del.status_code == 404


@pytest.mark.asyncio
async def test_infer_endpoint(
    async_client: AsyncClient, sample_browser_state: BrowserState
):
    payload = {
        "session_id": "test_infer_sess",
        "task": "Complete the application form",
        "browser_state": sample_browser_state.model_dump(),
        "screenshot": {
            "mime_type": "image/jpeg",
            "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        },
        "available_keys": ["<VAULT_FULL_NAME>", "<VAULT_EMAIL>", "<VAULT_PHONE>"],
        "execution_results": [],
    }

    resp = await async_client.post("/api/v1/infer", json=payload)
    assert resp.status_code == 200
    data = resp.json()

    assert data["session_id"] == "test_infer_sess"
    assert data["status"] in ("continue", "done")
    assert len(data["actions"]) >= 2

    # Verify formatted action properties (coordinates and tokens)
    type_actions = [a for a in data["actions"] if a["type"] == "TYPE"]
    assert len(type_actions) >= 2

    name_action = next(a for a in type_actions if a["target"] == "input_name")
    assert name_action["x"] == 250  # 100 + 300/2
    assert name_action["y"] == 170  # 150 + 40/2
    assert name_action["text"] == "<VAULT_FULL_NAME>"

    # Verify that SCROLL action was auto-injected because offscreen fields exist
    has_scroll = any(a["type"] == "SCROLL" for a in data["actions"])
    assert has_scroll is True
