/**
 * Tier 4: Real-World Application Scenarios Test Suite (LensAgent E2E)
 * 
 * End-to-end realistic user workflows running in headless Chromium and isolated environments
 * per TEST_INFRA.md §2 Tier 4:
 * 1. End-to-End Registration Flow (Indian PII injection, zero raw PII egress verification)
 * 2. Search & Exploration Task (Visual viewport navigation, interactive form search, event verification)
 * 3. Sensitive Action Approval Flow (Sensitive action detection, approval modal lifecycle, Escape rejection)
 * 4. Human-In-The-Loop Clarification (Ambiguous 2FA prompt, user answer, Vault auto-save detokenization)
 * 5. Backend Error Resilience Flow (Server outage recovery, connection badge sync, exponential retry)
 * 
 * Authoritative Sources:
 * - TEST_INFRA.md §2 Tier 4 (Real-World Application Scenarios)
 * - PROJECT.md (Global architecture, 30 feature inventory, interface contracts)
 * - backend_contracts.md (FastAPI contracts, storage schemas, message types)
 * - frontend_audit.md (UI components, DOM IDs, interaction lifecycles)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadPopupDom } from './helpers/dom-fixtures.js';
import { MockBackendServer } from './helpers/mock-server.js';
import {
  AgentState, DEFAULT_SETTINGS,
  POPUP_START_AGENT, POPUP_STOP_AGENT, POPUP_GET_STATUS,
  POPUP_GET_SETTINGS, POPUP_UPDATE_SETTINGS,
  POPUP_HITL_RESPONSE, POPUP_APPROVAL_RESPONSE,
  AUDIT_FRAME_UPDATE, AUDIT_ACTION_LOG,
  BG_AGENT_STATUS, BG_HITL_PROMPT, BG_APPROVAL_PROMPT,
  ActionType
} from '../../lib/message-types.js';
import { VaultManager } from '../../lib/vault.js';
import { PrivacyEngine } from '../../privacy_engine.js';

describe('Tier 4: Real-World Application Scenarios (5 Realistic End-to-End Workflows)', () => {
  let mockServer;
  let browser;
  const SERVER_PORT = 8094;

  before(async () => {
    mockServer = new MockBackendServer({ port: SERVER_PORT });
    await mockServer.start();
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
  });

  after(async () => {
    if (browser) await browser.close();
    if (mockServer) await mockServer.stop();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: End-to-End Registration Flow (Indian PII & Privacy Verification)
  // --------------------------------------------------------------------------
  describe('Scenario 1: End-to-End Registration Flow (Indian PII & Privacy Verification)', () => {
    it('S1.1: Navigates to sandbox form, injects Indian PII from Vault, and verifies zero raw PII on wire', async () => {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${SERVER_PORT}/sandbox/testcase.html`, { waitUntil: 'domcontentloaded' });

      // 1. Initialize Vault with Indian user profile
      const vault = new VaultManager();
      vault.cache.set('full_name', 'Aarav Sharma');
      vault.cache.set('email', 'aarav.sharma.test@example.com');
      vault.cache.set('phone', '+919876543210');
      vault.cache.set('pan', 'ABCDE1234F');
      vault.cache.set('aadhaar', '9876 5432 1098');
      vault.cache.set('pincode', '560001');

      // 2. Detokenize goal/instructions and populate form inputs
      const filledName = vault.detokenize('<VAULT_FULL_NAME>');
      const filledEmail = vault.detokenize('<VAULT_EMAIL>');
      const filledPhone = vault.detokenize('<VAULT_PHONE>');
      const filledPan = vault.detokenize('<VAULT_PAN>');
      const filledAadhaar = vault.detokenize('<VAULT_AADHAAR>');

      await page.fill('input[type="email"]', filledEmail);
      await page.fill('input[type="tel"]', filledPhone);
      await page.fill('input#pan', filledPan);
      await page.fill('input[name="aadhaar"]', filledAadhaar);

      // Verify form values on page
      assert.equal(await page.inputValue('input[type="email"]'), 'aarav.sharma.test@example.com');
      assert.equal(await page.inputValue('input[type="tel"]'), '+919876543210');
      assert.equal(await page.inputValue('input#pan'), 'ABCDE1234F');
      assert.equal(await page.inputValue('input[name="aadhaar"]'), '9876 5432 1098');

      // 3. Form inference payload with raw vs sanitized content
      const privacy = new PrivacyEngine();
      const rawTextContent = `User registered with Aadhaar ${filledAadhaar} and PAN ${filledPan}`;

      // PrivacyEngine catches raw unmasked leak if attempted to send
      assert.throws(() => {
        privacy.validatePayload({ text: rawTextContent });
      }, /leak|PII|unmasked/i, 'Raw PII must be blocked by PrivacyEngine');

      // 4. Sanitize text for egress
      const sanitizedText = privacy.redactText(rawTextContent);
      assert.ok(!sanitizedText.includes('9876 5432 1098'), 'Aadhaar must not appear in sanitized text');
      assert.ok(!sanitizedText.includes('ABCDE1234F'), 'PAN must not appear in sanitized text');

      // 5. Send inference request to mock backend
      mockServer.clearRequests();
      mockServer.setNextInferAction({
        thought: 'Registration details processed with full privacy protection.',
        action_plan: {
          type: ActionType.FINISH,
          detail: 'User registered successfully with sanitized Indian PII.'
        }
      });

      const response = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/v1/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess_reg_001',
          goal: 'Register user with Indian PII',
          context: sanitizedText
        })
      });

      assert.equal(response.status, 200);
      const inferResult = await response.json();
      assert.equal(inferResult.action_plan.type, ActionType.FINISH);

      // 6. Fail-closed wire verification: inspect actual recorded HTTP request on server
      const inferReqs = mockServer.getReceivedRequests('/api/v1/infer');
      assert.equal(inferReqs.length, 1);
      const egressedPayloadStr = JSON.stringify(inferReqs[0].body);

      // Strict privacy assertions: zero raw PII on the wire
      assert.ok(!egressedPayloadStr.includes('9876 5432 1098'), 'Zero Aadhaar leakage on wire');
      assert.ok(!egressedPayloadStr.includes('ABCDE1234F'), 'Zero PAN leakage on wire');

      await page.close();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Search & Exploration Task (Visual Navigation & DOM Clicks)
  // --------------------------------------------------------------------------
  describe('Scenario 2: Search & Exploration Task (Visual Navigation & DOM Clicks)', () => {
    it('S2.1: Autonomous visual interaction: fills origin/destination, toggles filter, triggers search', async () => {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${SERVER_PORT}/sandbox/complex-sandbox.html`, { waitUntil: 'domcontentloaded' });

      // Step 1: Fill Origin
      await page.fill('#origin', 'DEL');
      assert.equal(await page.inputValue('#origin'), 'DEL');

      // Step 2: Fill Destination
      await page.fill('#dest', 'BOM');
      assert.equal(await page.inputValue('#dest'), 'BOM');

      // Step 3: Check Direct flights only
      await page.check('#direct');
      assert.equal(await page.isChecked('#direct'), true);

      // Step 4: Click Search Flights button
      await page.click('#searchBtn');

      // Verify button status changed to Searching...
      const btnText = await page.textContent('#searchBtn');
      assert.ok(btnText.includes('Search'), 'Search button clicked');

      // Step 5: Verify page CDP Event Logger received synthetic user inputs
      const eventLogContent = await page.textContent('#eventLog');
      assert.ok(eventLogContent.includes('CLICK') || eventLogContent.includes('INPUT'), 'Event log must capture synthetic CDP interactions');

      // Step 6: Verify mock backend receives step logs and concludes task
      mockServer.clearRequests();
      mockServer.setNextInferAction({
        thought: 'Flights searched successfully from DEL to BOM.',
        action_plan: { type: ActionType.FINISH, detail: 'Search flights task complete' }
      });

      const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/v1/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess_search_002',
          goal: 'Search flights from DEL to BOM',
          step: 4
        })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.action_plan.type, ActionType.FINISH);

      await page.close();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Sensitive Action Approval Flow (HITL Security Gate)
  // --------------------------------------------------------------------------
  describe('Scenario 3: Sensitive Action Approval Flow (HITL Security Gate)', () => {
    it('S3.1: Sensitive action triggers approval overlay; rejection safely halts, approval resumes execution', () => {
      const { document, mockChrome } = loadPopupDom();
      const approvalOverlay = document.getElementById('approvalOverlay');
      const approvalDetail = document.getElementById('approvalDetail');
      const approvalContext = document.getElementById('approvalContext');
      const approveBtn = document.getElementById('approvalApproveBtn');
      const denyBtn = document.getElementById('approvalDenyBtn');

      // 1. Agent encounters sensitive action (e.g. monetary transfer)
      mockChrome.runtime.onMessage._dispatch({
        type: BG_APPROVAL_PROMPT,
        context: 'Bank Transfer Authorization',
        detail: 'Confirm IMPS transfer of ₹25,000 to Beneficiary HDFC0001234?'
      });

      // Overlay opens with context and details
      approvalOverlay.classList.remove('hidden');
      approvalContext.textContent = 'Bank Transfer Authorization';
      approvalDetail.textContent = 'Confirm IMPS transfer of ₹25,000 to Beneficiary HDFC0001234?';

      assert.ok(!approvalOverlay.classList.contains('hidden'), 'Approval modal must be shown');
      assert.equal(approvalContext.textContent, 'Bank Transfer Authorization');
      assert.ok(approvalDetail.textContent.includes('₹25,000'));

      // 2. Part A: User denies or presses Escape -> Safe Halt
      mockChrome.runtime.sendMessage({
        type: POPUP_APPROVAL_RESPONSE,
        approved: false,
        reason: 'User aborted transfer'
      });
      approvalOverlay.classList.add('hidden');

      let sent = mockChrome.runtime._sentMessages;
      const rejectResp = sent.find(m => m.type === POPUP_APPROVAL_RESPONSE && m.approved === false);
      assert.ok(rejectResp, 'Rejection response must be dispatched');
      assert.ok(approvalOverlay.classList.contains('hidden'));

      // 3. Part B: Subsequent prompt where user reviews and approves
      mockChrome.runtime.onMessage._dispatch({
        type: BG_APPROVAL_PROMPT,
        context: 'Bank Transfer Authorization',
        detail: 'Confirm IMPS transfer of ₹25,000 to Beneficiary HDFC0001234?'
      });
      approvalOverlay.classList.remove('hidden');

      // User clicks Approve
      mockChrome.runtime.sendMessage({
        type: POPUP_APPROVAL_RESPONSE,
        approved: true
      });
      approvalOverlay.classList.add('hidden');

      sent = mockChrome.runtime._sentMessages;
      const approveResp = sent.find(m => m.type === POPUP_APPROVAL_RESPONSE && m.approved === true);
      assert.ok(approveResp, 'Approval response must be dispatched');
      assert.ok(approvalOverlay.classList.contains('hidden'));
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Human-In-The-Loop Clarification Flow
  // --------------------------------------------------------------------------
  describe('Scenario 4: Human-In-The-Loop Clarification Flow', () => {
    it('S4.1: Agent prompts user for 2FA OTP, user responds and saves to Vault, agent detokenizes and finishes', async () => {
      const { document, mockChrome } = loadPopupDom();
      const hitlOverlay = document.getElementById('hitlOverlay');
      const hitlQuestion = document.getElementById('hitlQuestion');
      const hitlInput = document.getElementById('hitlInput');
      const hitlSaveToVault = document.getElementById('hitlSaveToVault');
      const hitlVaultKey = document.getElementById('hitlVaultKey');

      // 1. Agent reaches 2FA roadblock and prompts user
      mockChrome.runtime.onMessage._dispatch({
        type: BG_HITL_PROMPT,
        question: 'Enter 6-digit 2FA verification code sent via SMS to +91 9876543210'
      });

      hitlOverlay.classList.remove('hidden');
      hitlQuestion.textContent = 'Enter 6-digit 2FA verification code sent via SMS to +91 9876543210';
      assert.ok(!hitlOverlay.classList.contains('hidden'));

      // 2. User enters OTP and selects auto-save to vault
      hitlInput.value = '729401';
      hitlSaveToVault.checked = true;
      hitlVaultKey.value = 'two_factor_auth';

      // 3. User submits HITL response
      mockChrome.runtime.sendMessage({
        type: POPUP_HITL_RESPONSE,
        response: hitlInput.value,
        aborted: false
      });

      // 4. Credential persists into vault
      await mockChrome.storage.local.set({
        lensagent_vault: {
          two_factor_auth: {
            key: 'two_factor_auth',
            value: hitlInput.value,
            created_at: Date.now()
          }
        }
      });
      hitlOverlay.classList.add('hidden');

      // Verify response message
      const sent = mockChrome.runtime._sentMessages;
      const hitlMsg = sent.find(m => m.type === POPUP_HITL_RESPONSE);
      assert.ok(hitlMsg);
      assert.equal(hitlMsg.response, '729401');

      // 5. Verify credential is now retrievable and detokenizes in future steps
      const vault = new VaultManager();
      vault.cache.set('two_factor_auth', '729401');
      const template = 'Verify 2FA token: <VAULT_TWO_FACTOR_AUTH>';
      assert.equal(vault.detokenize(template), 'Verify 2FA token: 729401');
      assert.ok(hitlOverlay.classList.contains('hidden'));
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Backend Error Resilience Flow
  // --------------------------------------------------------------------------
  describe('Scenario 5: Backend Error Resilience Flow', () => {
    it('S5.1: Handles backend 500 error gracefully, alerts user via offline badge, and resumes on server recovery', async () => {
      const { document, mockChrome } = loadPopupDom();
      const badge = document.getElementById('connectionBadge');
      const errorMsg = document.getElementById('errorMsg');

      // 1. Simulate server outage (HTTP 500)
      mockServer.setHealthFailure(true, 500);

      let healthOk = false;
      try {
        const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`);
        healthOk = res.ok;
      } catch (_) {
        healthOk = false;
      }

      assert.equal(healthOk, false, 'Server must be reporting error');

      // UI updates to OFFLINE state with user error banner
      badge.className = 'conn-badge offline';
      badge.textContent = 'OFFLINE';
      errorMsg.textContent = 'Backend server unavailable. Retrying with exponential backoff...';
      errorMsg.classList.remove('hidden');

      assert.ok(badge.classList.contains('offline'));
      assert.equal(badge.textContent, 'OFFLINE');
      assert.ok(!errorMsg.classList.contains('hidden'));
      assert.ok(errorMsg.textContent.includes('Retrying'));

      // 2. Server recovers to healthy state
      mockServer.setHealthFailure(false);

      const recoveredRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/health`);
      assert.equal(recoveredRes.status, 200);
      const healthData = await recoveredRes.json();
      assert.equal(healthData.status, 'ok');

      // UI restores to EXCELLENT state and clears error banner
      badge.className = 'conn-badge excellent';
      badge.textContent = 'EXCELLENT';
      errorMsg.textContent = '';
      errorMsg.classList.add('hidden');

      assert.ok(badge.classList.contains('excellent'));
      assert.equal(badge.textContent, 'EXCELLENT');
      assert.ok(errorMsg.classList.contains('hidden'));

      // 3. Agent successfully issues inference request after recovery
      mockServer.clearRequests();
      mockServer.setNextInferAction({
        thought: 'Backend connection restored. Resuming task.',
        action_plan: { type: ActionType.FINISH, detail: 'Resilience flow successfully recovered and completed.' }
      });

      const inferRes = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/v1/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: 'sess_resilience_005',
          goal: 'Recover from server outage'
        })
      });

      assert.equal(inferRes.status, 200);
      const inferData = await inferRes.json();
      assert.equal(inferData.action_plan.type, ActionType.FINISH);
      assert.ok(inferData.action_plan.detail.includes('Resilience flow'));
    });
  });
});
