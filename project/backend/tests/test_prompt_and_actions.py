"""
Unit tests for PromptBuilder, ActionFormatter, and ActionValidator.
"""

from __future__ import annotations

import pytest

from app.actions.action_formatter import ActionFormatter
from app.prompts.prompt_builder import PromptBuilder
from app.schemas.browser_state import BrowserState
from app.validation.action_validator import ActionValidator


def test_prompt_builder(sample_browser_state: BrowserState):
    builder = PromptBuilder()
    prompt = builder.build(
        task="Fill out internship application",
        browser_state=sample_browser_state,
        available_keys=["<VAULT_FULL_NAME>", "<VAULT_EMAIL>", "<VAULT_PHONE>"],
        field_fill_history={"input_name": {"type": "TYPE", "key": "<VAULT_FULL_NAME>"}},
        phase="fill",
    )

    assert "TASK: Fill out internship application" in prompt
    assert "<VAULT_FULL_NAME>" in prompt
    assert "<VAULT_EMAIL>" in prompt
    assert "input_name" in prompt
    assert "input_phone" in prompt
    assert "OFFSCREEN ELEMENTS" in prompt


def test_action_formatter(sample_browser_state: BrowserState):
    formatter = ActionFormatter()
    raw_actions = [
        {"type": "fill", "target": "input_name", "key": "vault_full_name"},
        {"type": "click", "target": "chk_terms"},
        {"type": "scroll", "direction": "down", "delta_y": 400},
        {"type": "done"},
    ]

    formatted = formatter.format_actions(
        raw_actions=raw_actions,
        browser_state=sample_browser_state,
        available_keys=["<VAULT_FULL_NAME>"],
    )

    assert len(formatted) == 4
    # TYPE action
    assert formatted[0]["type"] == "TYPE"
    assert formatted[0]["target"] == "input_name"
    assert formatted[0]["x"] == 250
    assert formatted[0]["y"] == 170
    assert formatted[0]["text"] == "<VAULT_FULL_NAME>"

    # CLICK action
    assert formatted[1]["type"] == "CLICK"
    assert formatted[1]["target"] == "chk_terms"
    assert formatted[1]["x"] == 110
    assert formatted[1]["y"] == 930

    # SCROLL action
    assert formatted[2]["type"] == "SCROLL"
    assert formatted[2]["delta_y"] == 400

    # FINISH action
    assert formatted[3]["type"] == "FINISH"


def test_action_validator(sample_browser_state: BrowserState):
    validator = ActionValidator()
    actions = [
        {"action_id": "a1", "type": "TYPE", "target": "name", "text": "Valid Text"},  # fuzzy match 'name' -> 'input_name'
        {"action_id": "a2", "type": "TYPE", "target": "input_email", "text": "javascript:alert(1)"},  # dangerous pattern
        {"action_id": "a3", "type": "UNKNOWN_ACTION", "target": "input_name"},  # invalid type
    ]

    valid_actions, errors = validator.validate(
        actions=actions,
        browser_state=sample_browser_state,
    )

    assert len(valid_actions) == 1
    assert valid_actions[0]["target"] == "input_name"
    assert len(errors) == 2
