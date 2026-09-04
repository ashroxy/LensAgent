"""
Unit tests for MemorySessionStore and SessionManager.
"""

from __future__ import annotations

import pytest

from app.schemas.session import SessionData
from app.session.session_manager import SessionManager
from app.storage.memory_store import MemorySessionStore


@pytest.mark.asyncio
async def test_memory_store_crud():
    store = MemorySessionStore()

    session = SessionData(session_id="s1", task="Test Task")
    await store.create(session)

    fetched = await store.get("s1")
    assert fetched is not None
    assert fetched.session_id == "s1"
    assert fetched.task == "Test Task"

    # Update
    fetched.phase = "submit"
    await store.update(fetched)

    updated = await store.get("s1")
    assert updated is not None
    assert updated.phase == "submit"

    # Delete
    deleted = await store.delete("s1")
    assert deleted is True

    assert await store.get("s1") is None


@pytest.mark.asyncio
async def test_session_manager_tracking():
    store = MemorySessionStore()
    manager = SessionManager(store)

    session = await manager.get_or_create("s2", "Form Automation")
    assert session.session_id == "s2"

    # Record action results
    execution_results = [
        {"action": "TYPE", "detail": "Typed <VAULT_FULL_NAME>", "success": True},
        {"action": "CLICK", "detail": "Clicked terms", "success": True},
    ]
    await manager.record_execution_results(session, execution_results)

    # Record field history
    actions = [
        {"type": "TYPE", "target": "input_name", "key": "<VAULT_FULL_NAME>"},
        {"type": "TYPE", "target": "input_email", "key": "<VAULT_EMAIL>"},
    ]
    await manager.update_field_history(session, actions)

    reloaded = await manager.get("s2")
    assert reloaded is not None
    assert len(reloaded.completed_actions) == 2
    assert "input_name" in reloaded.field_fill_history
    assert reloaded.field_fill_history["input_name"]["key"] == "<VAULT_FULL_NAME>"
