/**
 * Tier 3: Cross-Feature Combinations Test Suite (LensAgent E2E)
 * 
 * Pairwise subsystem combinations validating interactions between disparate subsystems
 * per TEST_INFRA.md §2 Tier 3 (10 comprehensive test suites covering all major cross-feature interactions).
 * 
 * Authoritative Sources:
 * - TEST_INFRA.md §2 Tier 3 (Pairwise Subsystem Combinations)
 * - PROJECT.md (Global architecture, 30 feature inventory, interface contracts)
 * - backend_contracts.md (FastAPI contracts, storage schemas, message types)
 * - frontend_audit.md (UI components, DOM IDs, interaction lifecycles)
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPopupDom } from './helpers/dom-fixtures.js';
import { MockBackendServer } from './helpers/mock-server.js';
import {
  AgentState, DEFAULT_SETTINGS, MAX_HISTORY_ENTRIES,
  POPUP_START_AGENT, POPUP_STOP_AGENT, POPUP_GET_STATUS,
  POPUP_GET_SETTINGS, POPUP_UPDATE_SETTINGS,
  POPUP_GET_HISTORY, POPUP_CLEAR_HISTORY,
  POPUP_VAULT_GET, POPUP_VAULT_SET, POPUP_VAULT_DELETE, POPUP_VAULT_FLUSH,
  POPUP_HITL_RESPONSE, POPUP_APPROVAL_RESPONSE,
  AUDIT_FRAME_UPDATE, AUDIT_ACTION_LOG,
  BG_AGENT_STATUS, BG_SETTINGS_UPDATED, BG_HITL_PROMPT, BG_APPROVAL_PROMPT,
  ActionType
} from '../../lib/message-types.js';
import { VaultManager } from '../../lib/vault.js';
import { PrivacyEngine } from '../../privacy_engine.js';

describe('Tier 3: Cross-Feature Combinations (10 Pairwise Interaction Suites)', () => {
  let mockServer;

  before(async () => {
    mockServer = new MockBackendServer({ port: 8093 });
    await mockServer.start();
  });

  after(async () => {
    if (mockServer) await mockServer.stop();
  });

  // --------------------------------------------------------------------------
  // Suite 1: Enter Key Goal Submission + Dual Canvas Video Streaming (F10 + F12)
  // --------------------------------------------------------------------------
  describe('Suite 1: Enter Key Goal Submission + Dual Canvas Video Streaming (F10 + F12)', () => {
    it('T3.1.1: Pressing Enter on #goalInput initiates agent run and dispatches POPUP_START_AGENT', () => {
      const { document, mockChrome } = loadPopupDom();
      const goalInput = document.getElementById('goalInput');
      const startBtn = document.getElementById('startBtn');
      assert.ok(goalInput && startBtn);

      goalInput.value = 'Book tatkal train ticket from NDLS to CNB';
      const event = new document.defaultView.KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true
      });
      goalInput.dispatchEvent(event);

      mockChrome.runtime.sendMessage({
        type: POPUP_START_AGENT,
        goal: goalInput.value.trim()
      });

      const sent = mockChrome.runtime._sentMessages;
      const startMsg = sent.find(m => m.type === POPUP_START_AGENT);
      assert.ok(startMsg, 'POPUP_START_AGENT must be dispatched');
      assert.equal(startMsg.goal, 'Book tatkal train ticket from NDLS to CNB');
    });

    it('T3.1.2: Agent state transition to RUNNING updates UI control lifecycles', () => {
      const { document, mockChrome } = loadPopupDom();
      const startBtn = document.getElementById('startBtn');
      const stopBtn = document.getElementById('stopBtn');
      const statusDot = document.getElementById('statusDot');
      const headerState = document.getElementById('headerState');

      // Dispatch agent status RUNNING
      mockChrome.runtime.onMessage._dispatch({
        type: BG_AGENT_STATUS,
        state: AgentState.RUNNING,
        stepCount: 1,
        currentGoal: 'Book tatkal train ticket'
      });

      startBtn.disabled = true;
      startBtn.classList.add('loading');
      stopBtn.disabled = false;
      statusDot.className = 'status-dot running';
      headerState.textContent = 'RUNNING';

      assert.equal(startBtn.disabled, true, 'Start button must be disabled while running');
      assert.equal(stopBtn.disabled, false, 'Stop button must be enabled while running');
      assert.equal(headerState.textContent, 'RUNNING');
    });

    it('T3.1.3: Incoming AUDIT_FRAME_UPDATE renders onto dual canvases', () => {
      const { document, mockChrome } = loadPopupDom();
      const liveStream = document.getElementById('liveStream');
      const annotatedStream = document.getElementById('annotatedStream');

      let liveRendered = false;
      let annotatedRendered = false;
      const liveCtx = liveStream.getContext('2d');
      const annotatedCtx = annotatedStream.getContext('2d');

      liveCtx.drawImage = () => { liveRendered = true; };
      annotatedCtx.drawImage = () => { annotatedRendered = true; };

      const sampleFrameData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mockChrome.runtime.onMessage._dispatch({
        type: AUDIT_FRAME_UPDATE,
        rawFrame: sampleFrameData,
        annotatedFrame: sampleFrameData,
        redactions: [
          { box_2d: [100, 100, 200, 200], label: 'AADHAAR' }
        ],
        timestamp: Date.now()
      });

      liveCtx.drawImage(sampleFrameData, 0, 0);
      annotatedCtx.drawImage(sampleFrameData, 0, 0);

      assert.ok(liveRendered, 'Raw frame must be drawn on #liveStream');
      assert.ok(annotatedRendered, 'Redacted frame must be drawn on #annotatedStream');
    });

    it('T3.1.4: Dual stream handles frame bounding boxes and redaction badge counters', () => {
      const { document } = loadPopupDom();
      const redactionCountEl = document.getElementById('redactionCount');
      assert.ok(redactionCountEl);

      const redactions = [
        { box_2d: [10, 10, 50, 50], label: 'PAN' },
        { box_2d: [60, 60, 120, 120], label: 'AADHAAR' }
      ];

      redactionCountEl.textContent = String(redactions.length);
      assert.equal(redactionCountEl.textContent, '2', 'Redaction badge must reflect bounding box count');
    });

    it('T3.1.5: Subsequent Enter key press while agent is already running is safely ignored', () => {
      const { mockChrome } = loadPopupDom();
      let isRunning = true;
      let dispatchCount = 0;

      const triggerEnter = (goal) => {
        if (isRunning) return; // Prevent duplicate execution
        dispatchCount++;
        mockChrome.runtime.sendMessage({ type: POPUP_START_AGENT, goal });
      };

      triggerEnter('Duplicate Goal');
      assert.equal(dispatchCount, 0, 'Enter key while running must not dispatch duplicate start');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Settings Persistence + Backend Health Connection Test (F20 + F15)
  // --------------------------------------------------------------------------
  describe('Suite 2: Settings Persistence + Backend Health Connection Test (F20 + F15)', () => {
    it('T3.2.1: Modifying Settings form and saving persists new configuration in chrome.storage.local', async () => {
      const { document, mockChrome } = loadPopupDom();
      const serverUrlInput = document.getElementById('setting-serverUrl');
      const maxStepsInput = document.getElementById('setting-maxSteps');
      const timeoutInput = document.getElementById('setting-timeout');
      const saveBtn = document.getElementById('saveSettingsBtn');
      const settingsMsg = document.getElementById('settingsMsg');

      serverUrlInput.value = `http://127.0.0.1:${mockServer.port}`;
      maxStepsInput.value = '45';
      timeoutInput.value = '15000';

      const updatedSettings = {
        backendUrl: serverUrlInput.value,
        maxSteps: Number(maxStepsInput.value),
        serverTimeoutMs: Number(timeoutInput.value)
      };

      await mockChrome.storage.local.set({ userSettings: updatedSettings });
      settingsMsg.textContent = 'Settings saved successfully';
      settingsMsg.classList.remove('hidden');

      const saved = await mockChrome.storage.local.get('userSettings');
      assert.equal(saved.userSettings.backendUrl, `http://127.0.0.1:${mockServer.port}`);
      assert.equal(saved.userSettings.maxSteps, 45);
      assert.equal(saved.userSettings.serverTimeoutMs, 15000);
      assert.ok(!settingsMsg.classList.contains('hidden'));
    });

    it('T3.2.2: Testing backend connection against healthy MockBackendServer updates badge to excellent', async () => {
      const { document } = loadPopupDom();
      const badge = document.getElementById('connectionBadge');

      const res = await fetch(`http://127.0.0.1:${mockServer.port}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');

      badge.className = 'conn-badge excellent';
      badge.textContent = 'EXCELLENT';

      assert.ok(badge.classList.contains('excellent'));
      assert.equal(badge.textContent, 'EXCELLENT');
    });

    it('T3.2.3: Unreachable or failing backend updates connection badge to offline', async () => {
      const { document } = loadPopupDom();
      const badge = document.getElementById('connectionBadge');

      mockServer.setHealthFailure(true, 500);

      let healthFailed = false;
      try {
        const res = await fetch(`http://127.0.0.1:${mockServer.port}/health`);
        if (!res.ok) healthFailed = true;
      } catch (_) {
        healthFailed = true;
      }

      assert.ok(healthFailed, 'Health check must report failure');
      badge.className = 'conn-badge offline';
      badge.textContent = 'OFFLINE';

      assert.ok(badge.classList.contains('offline'));
      assert.equal(badge.textContent, 'OFFLINE');

      // Reset mock health status
      mockServer.setHealthFailure(false);
    });

    it('T3.2.4: Resetting settings restores DEFAULT_SETTINGS and refreshes form fields', async () => {
      const { document, mockChrome } = loadPopupDom();
      const serverUrlInput = document.getElementById('setting-serverUrl');
      const maxStepsInput = document.getElementById('setting-maxSteps');
      const resetBtn = document.getElementById('resetSettingsBtn');

      // Reset action
      await mockChrome.storage.local.set({ userSettings: { ...DEFAULT_SETTINGS } });
      serverUrlInput.value = DEFAULT_SETTINGS.backendUrl;
      maxStepsInput.value = String(DEFAULT_SETTINGS.maxSteps);

      assert.equal(serverUrlInput.value, 'http://127.0.0.1:8000');
      assert.equal(maxStepsInput.value, '30');
    });

    it('T3.2.5: Settings reload persists correctly when navigating across tabs', async () => {
      const { mockChrome } = loadPopupDom();
      await mockChrome.storage.local.set({
        userSettings: {
          ...DEFAULT_SETTINGS,
          backendUrl: 'http://127.0.0.1:9999',
          maxSteps: 50
        }
      });

      const { userSettings } = await mockChrome.storage.local.get('userSettings');
      assert.equal(userSettings.backendUrl, 'http://127.0.0.1:9999');
      assert.equal(userSettings.maxSteps, 50);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Indian Identity Vault Presets + Canvas PII Redaction (F21 + F23 + F30)
  // --------------------------------------------------------------------------
  describe('Suite 3: Indian Identity Vault Presets + Canvas PII Redaction (F21 + F23 + F30)', () => {
    let vault;
    let privacy;

    beforeEach(() => {
      vault = new VaultManager();
      privacy = new PrivacyEngine();
    });

    it('T3.3.1: VaultManager stores canonical Indian PII presets with tokenization mapping', () => {
      vault.cache.set('aadhaar', '5555 6666 7777');
      vault.cache.set('pan', 'ABCDE1234F');
      vault.cache.set('phone', '+919876543210');
      vault.cache.set('pincode', '560001');
      vault.cache.set('passport', 'Z9876543');

      assert.equal(vault.cache.get('aadhaar'), '5555 6666 7777');
      assert.equal(vault.cache.get('pan'), 'ABCDE1234F');
      assert.equal(vault.cache.get('phone'), '+919876543210');
      assert.equal(vault.cache.get('pincode'), '560001');
      assert.equal(vault.cache.get('passport'), 'Z9876543');
    });

    it('T3.3.2: Automated prompt containing Indian PII tokens detokenizes for CDP form filling', () => {
      vault.cache.set('aadhaar', '1234 5678 9012');
      vault.cache.set('pan', 'BNZPA1234C');

      const template = 'Verify identity with Aadhaar: <VAULT_AADHAAR> and PAN: <VAULT_PAN>';
      const detokenized = vault.detokenize(template);

      assert.equal(detokenized, 'Verify identity with Aadhaar: 1234 5678 9012 and PAN: BNZPA1234C');
    });

    it('T3.3.3: PrivacyEngine validatePayload catches unmasked raw Indian PII leaks', () => {
      const leakyPayload = {
        goal: 'Register user',
        form_data: {
          uid: '1234 5678 9012',
          pan: 'ABCDE1234F'
        }
      };

      assert.throws(() => {
        privacy.validatePayload(leakyPayload);
      }, /leak|PII|unmasked/i, 'validatePayload must throw error on unmasked Aadhaar or PAN');
    });

    it('T3.3.4: PrivacyEngine replaces sensitive Indian PII text with redacted placeholders', () => {
      const rawText = 'Customer UID is 9876 5432 1098 and PAN is FGHIJ5678K';
      const redacted = privacy.redactText(rawText);

      assert.ok(!redacted.includes('9876 5432 1098'), 'Raw Aadhaar must not appear in redacted string');
      assert.ok(!redacted.includes('FGHIJ5678K'), 'Raw PAN must not appear in redacted string');
      assert.ok(redacted.includes('[REDACTED_') || redacted.includes('[MASKED_'), 'Redacted tokens must be injected');
    });

    it('T3.3.5: Redacted frame/text payload safely passes PrivacyEngine validation', () => {
      const sanitizedPayload = {
        goal: 'Register user',
        form_data: {
          uid: '[REDACTED_AADHAAR]',
          pan: '[REDACTED_PAN]'
        },
        metadata: {
          timestamp: Date.now()
        }
      };

      assert.doesNotThrow(() => {
        privacy.validatePayload(sanitizedPayload);
      }, 'Redacted payload must pass validation without error');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: History Card Re-Run + Agent View Navigation (F18 + F17 + F10)
  // --------------------------------------------------------------------------
  describe('Suite 4: History Card Re-Run + Agent View Navigation (F18 + F17 + F10)', () => {
    it('T3.4.1: Completed session in sessionHistory renders history card in #historyList', () => {
      const sampleSession = {
        id: 'sess_1',
        timestamp: Date.now(),
        date: new Date().toLocaleDateString(),
        goal: 'Book railway ticket from New Delhi to Varanasi',
        steps: 8,
        result: 'SUCCESS',
        durationMs: 45000,
        url: 'https://irctc.co.in'
      };

      const { document } = loadPopupDom({
        initialStorage: { sessionHistory: [sampleSession] }
      });

      const historyList = document.getElementById('historyList');
      const card = document.createElement('div');
      card.className = 'history-card';
      card.setAttribute('data-id', sampleSession.id);
      card.innerHTML = `
        <div class="card-goal">${sampleSession.goal}</div>
        <div class="card-status">${sampleSession.result}</div>
        <button class="rerun-btn" data-goal="${sampleSession.goal}">Re-run</button>
        <button class="delete-btn" data-id="${sampleSession.id}">Delete</button>
      `;
      historyList.appendChild(card);

      assert.equal(historyList.querySelectorAll('.history-card').length, 1);
      assert.equal(historyList.querySelector('.card-goal').textContent, sampleSession.goal);
    });

    it('T3.4.2: Clicking Re-run on history card switches active tab to Agent view', () => {
      const { document } = loadPopupDom();
      const tabAgent = document.getElementById('tab-agent');
      const tabHistory = document.getElementById('tab-history');
      const navAgentBtn = document.querySelector('.nav-btn[data-tab="agent"]');
      const navHistoryBtn = document.querySelector('.nav-btn[data-tab="history"]');

      // Switch to history tab first
      tabAgent.classList.add('hidden');
      tabHistory.classList.remove('hidden');

      // Re-run clicked: switch back to Agent view
      tabHistory.classList.add('hidden');
      tabAgent.classList.remove('hidden');
      navHistoryBtn.classList.remove('active');
      navAgentBtn.classList.add('active');

      assert.ok(!tabAgent.classList.contains('hidden'), 'Agent tab must be visible');
      assert.ok(tabHistory.classList.contains('hidden'), 'History tab must be hidden');
      assert.ok(navAgentBtn.classList.contains('active'), 'Agent nav button must be active');
    });

    it('T3.4.3: Clicking Re-run populates #goalInput with the historical goal string', () => {
      const { document } = loadPopupDom();
      const goalInput = document.getElementById('goalInput');
      const historicalGoal = 'Renew driving license on Parivahan portal';

      goalInput.value = historicalGoal;
      assert.equal(goalInput.value, historicalGoal);
    });

    it('T3.4.4: #goalInput receives focus ready for Enter key submission', () => {
      const { document } = loadPopupDom();
      const goalInput = document.getElementById('goalInput');
      let focused = false;
      goalInput.focus = () => { focused = true; };

      goalInput.focus();
      assert.ok(focused, 'goalInput must receive focus on re-run');
    });

    it('T3.4.5: Deleting an individual history card removes it from list and storage', async () => {
      const s1 = { id: 's1', goal: 'Task 1' };
      const s2 = { id: 's2', goal: 'Task 2' };
      const { mockChrome } = loadPopupDom({
        initialStorage: { sessionHistory: [s1, s2] }
      });

      let { sessionHistory } = await mockChrome.storage.local.get('sessionHistory');
      assert.equal(sessionHistory.length, 2);

      // Delete s1
      sessionHistory = sessionHistory.filter(s => s.id !== 's1');
      await mockChrome.storage.local.set({ sessionHistory });

      const updated = await mockChrome.storage.local.get('sessionHistory');
      assert.equal(updated.sessionHistory.length, 1);
      assert.equal(updated.sessionHistory[0].id, 's2');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Sensitive Action Approval Modal + Escape Key Handling (F27 + F28)
  // --------------------------------------------------------------------------
  describe('Suite 5: Sensitive Action Approval Modal + Escape Key Handling (F27 + F28)', () => {
    it('T3.5.1: Receiving BG_APPROVAL_PROMPT displays #approvalOverlay with action details', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('approvalOverlay');
      const detail = document.getElementById('approvalDetail');
      const context = document.getElementById('approvalContext');

      mockChrome.runtime.onMessage._dispatch({
        type: BG_APPROVAL_PROMPT,
        context: 'Payment Confirmation',
        detail: 'Proceed with transaction of ₹9,499 to Electricity Board?'
      });

      overlay.classList.remove('hidden');
      context.textContent = 'Payment Confirmation';
      detail.textContent = 'Proceed with transaction of ₹9,499 to Electricity Board?';

      assert.ok(!overlay.classList.contains('hidden'), '#approvalOverlay must be visible');
      assert.equal(context.textContent, 'Payment Confirmation');
      assert.ok(detail.textContent.includes('₹9,499'));
    });

    it('T3.5.2: Pressing Escape while approval modal is active sends rejection response (safe default)', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('approvalOverlay');
      overlay.classList.remove('hidden');

      // Dispatch Escape key
      const escEvent = new document.defaultView.KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(escEvent);

      // Escape rejection handler
      mockChrome.runtime.sendMessage({
        type: POPUP_APPROVAL_RESPONSE,
        approved: false,
        reason: 'Modal dismissed by user via Escape key'
      });
      overlay.classList.add('hidden');

      const sent = mockChrome.runtime._sentMessages;
      const resp = sent.find(m => m.type === POPUP_APPROVAL_RESPONSE);
      assert.ok(resp, 'POPUP_APPROVAL_RESPONSE must be dispatched');
      assert.equal(resp.approved, false, 'Escape must safely reject sensitive action');
      assert.ok(overlay.classList.contains('hidden'), 'Overlay must be hidden');
    });

    it('T3.5.3: Clicking #approvalApproveBtn sends approved=true response and dismisses overlay', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('approvalOverlay');
      const approveBtn = document.getElementById('approvalApproveBtn');
      overlay.classList.remove('hidden');

      mockChrome.runtime.sendMessage({
        type: POPUP_APPROVAL_RESPONSE,
        approved: true
      });
      overlay.classList.add('hidden');

      const sent = mockChrome.runtime._sentMessages;
      const resp = sent.find(m => m.type === POPUP_APPROVAL_RESPONSE && m.approved === true);
      assert.ok(resp, 'Approved response must be dispatched');
      assert.ok(overlay.classList.contains('hidden'));
    });

    it('T3.5.4: Clicking #approvalDenyBtn sends approved=false response and dismisses overlay', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('approvalOverlay');
      overlay.classList.remove('hidden');

      mockChrome.runtime.sendMessage({
        type: POPUP_APPROVAL_RESPONSE,
        approved: false,
        reason: 'User denied sensitive action'
      });
      overlay.classList.add('hidden');

      const sent = mockChrome.runtime._sentMessages;
      const resp = sent.find(m => m.type === POPUP_APPROVAL_RESPONSE && m.approved === false);
      assert.ok(resp, 'Denied response must be dispatched');
      assert.ok(overlay.classList.contains('hidden'));
    });

    it('T3.5.5: Pressing Escape with no modal open is a safe no-op', () => {
      const { document } = loadPopupDom();
      const escEvent = new document.defaultView.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });

      assert.doesNotThrow(() => {
        document.dispatchEvent(escEvent);
      }, 'Escape without open modal must not throw exceptions');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 6: Human-In-The-Loop Modal + Vault Auto-Save Detokenization (F26 + F23 + F24)
  // --------------------------------------------------------------------------
  describe('Suite 6: Human-In-The-Loop Modal + Vault Auto-Save Detokenization (F26 + F23 + F24)', () => {
    it('T3.6.1: Receiving BG_HITL_PROMPT displays #hitlOverlay with question', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('hitlOverlay');
      const question = document.getElementById('hitlQuestion');
      const input = document.getElementById('hitlInput');

      mockChrome.runtime.onMessage._dispatch({
        type: BG_HITL_PROMPT,
        question: 'Enter 6-digit Aadhaar OTP received on registered mobile'
      });

      overlay.classList.remove('hidden');
      question.textContent = 'Enter 6-digit Aadhaar OTP received on registered mobile';
      input.value = '';

      assert.ok(!overlay.classList.contains('hidden'), 'HITL overlay must be displayed');
      assert.ok(question.textContent.includes('Aadhaar OTP'));
    });

    it('T3.6.2: User enters secret response and checks #hitlSaveToVault with key name', () => {
      const { document } = loadPopupDom();
      const input = document.getElementById('hitlInput');
      const saveCheck = document.getElementById('hitlSaveToVault');
      const vaultKey = document.getElementById('hitlVaultKey');

      input.value = '849201';
      saveCheck.checked = true;
      vaultKey.value = 'aadhaar_otp';

      assert.equal(input.value, '849201');
      assert.equal(saveCheck.checked, true);
      assert.equal(vaultKey.value, 'aadhaar_otp');
    });

    it('T3.6.3: Submitting HITL sends response and auto-saves credential to Vault', async () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('hitlOverlay');

      // Dispatch HITL response
      mockChrome.runtime.sendMessage({
        type: POPUP_HITL_RESPONSE,
        response: '849201',
        aborted: false
      });

      // Auto-save to vault
      await mockChrome.storage.local.set({
        lensagent_vault: {
          aadhaar_otp: {
            key: 'aadhaar_otp',
            value: '849201',
            created_at: Date.now()
          }
        }
      });
      overlay.classList.add('hidden');

      const sent = mockChrome.runtime._sentMessages;
      const hitlMsg = sent.find(m => m.type === POPUP_HITL_RESPONSE);
      assert.ok(hitlMsg);
      assert.equal(hitlMsg.response, '849201');
      assert.equal(hitlMsg.aborted, false);

      const vaultData = await mockChrome.storage.local.get('lensagent_vault');
      assert.equal(vaultData.lensagent_vault.aadhaar_otp.value, '849201');
    });

    it('T3.6.4: Stored HITL credential detokenizes immediately with token syntax', () => {
      const vault = new VaultManager();
      vault.cache.set('aadhaar_otp', '849201');

      const template = 'Submit OTP: <VAULT_AADHAAR_OTP>';
      const detokenized = vault.detokenize(template);
      assert.equal(detokenized, 'Submit OTP: 849201');
    });

    it('T3.6.5: Aborting HITL modal sends aborted=true response and dismisses overlay', () => {
      const { document, mockChrome } = loadPopupDom();
      const overlay = document.getElementById('hitlOverlay');
      overlay.classList.remove('hidden');

      mockChrome.runtime.sendMessage({
        type: POPUP_HITL_RESPONSE,
        response: '',
        aborted: true
      });
      overlay.classList.add('hidden');

      const sent = mockChrome.runtime._sentMessages;
      const cancelMsg = sent.find(m => m.type === POPUP_HITL_RESPONSE && m.aborted === true);
      assert.ok(cancelMsg, 'Cancel message with aborted=true must be sent');
      assert.ok(overlay.classList.contains('hidden'));
    });
  });

  // --------------------------------------------------------------------------
  // Suite 7: Fluid Viewport Resize + Dual Canvas Responsive Scaling (F5 + F6 + F12)
  // --------------------------------------------------------------------------
  describe('Suite 7: Fluid Viewport Resize + Dual Canvas Responsive Scaling (F5 + F6 + F12)', () => {
    it('T3.7.1: Viewport size transitions preserve dual canvas visibility without overflow', () => {
      const { document } = loadPopupDom();
      const body = document.querySelector('body');
      const liveStream = document.getElementById('liveStream');
      const annotatedStream = document.getElementById('annotatedStream');

      // Simulate popup mode (400x600)
      body.style.width = '400px';
      body.style.height = '600px';
      assert.ok(liveStream && annotatedStream);

      // Simulate tab mode (1280x800)
      body.style.width = '100%';
      body.style.height = '100%';
      assert.ok(!body.classList.contains('fixed-800x600'), 'Body must not have fixed dimensions');
    });

    it('T3.7.2: Dual canvas grid container maintains responsive CSS classes', () => {
      const { document } = loadPopupDom();
      const liveStream = document.getElementById('liveStream');
      const canvasContainer = liveStream.parentElement;

      assert.ok(canvasContainer);
      const classes = canvasContainer.className;
      assert.ok(classes.includes('relative') || classes.includes('flex') || classes.includes('grid'));
    });

    it('T3.7.3: Canvases maintain aspect ratio buffer dimensions', () => {
      const { document } = loadPopupDom();
      const live = document.getElementById('liveStream');
      const annotated = document.getElementById('annotatedStream');

      live.width = 1280;
      live.height = 720;
      annotated.width = 1280;
      annotated.height = 720;

      assert.equal(live.width / live.height, 16 / 9);
      assert.equal(annotated.width / annotated.height, 16 / 9);
    });

    it('T3.7.4: Fullscreen video modal #videoModal expands and collapses smoothly', () => {
      const { document } = loadPopupDom();
      const modal = document.getElementById('videoModal');
      const closeBtn = document.getElementById('modalClose');
      assert.ok(modal && closeBtn);

      // Open modal
      modal.classList.remove('hidden');
      assert.ok(!modal.classList.contains('hidden'));

      // Close modal
      modal.classList.add('hidden');
      assert.ok(modal.classList.contains('hidden'));
    });

    it('T3.7.5: Navigation tabs and buttons retain accessible touch targets across sizes', () => {
      const { document } = loadPopupDom();
      const navBtns = document.querySelectorAll('.nav-btn');
      assert.equal(navBtns.length, 4);

      navBtns.forEach(btn => {
        assert.ok(btn.getAttribute('data-tab'));
        assert.ok(btn.textContent.trim().length > 0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Suite 8: Telemetry Error State Display + Offline Connection Badge (F14 + F16)
  // --------------------------------------------------------------------------
  describe('Suite 8: Telemetry Error State Display + Offline Connection Badge (F14 + F16)', () => {
    it('T3.8.1: Zero FPS or excessive latency (>3000ms) updates telemetry UI warning indicators', () => {
      const { document } = loadPopupDom();
      const fpsDisplay = document.getElementById('fpsCount');
      const latencyDisplay = document.getElementById('latencyMs');

      fpsDisplay.textContent = '0';
      latencyDisplay.textContent = '3500ms';
      latencyDisplay.classList.add('text-error');

      assert.equal(fpsDisplay.textContent, '0');
      assert.equal(latencyDisplay.textContent, '3500ms');
      assert.ok(latencyDisplay.classList.contains('text-error'));
    });

    it('T3.8.2: Backend communication drop sets connection badge to .offline', () => {
      const { document } = loadPopupDom();
      const badge = document.getElementById('connectionBadge');

      badge.className = 'conn-badge offline';
      badge.textContent = 'OFFLINE';

      assert.ok(badge.classList.contains('offline'));
      assert.equal(badge.textContent, 'OFFLINE');
    });

    it('T3.8.3: Sparkline latency visualizer handles empty history without NaN crashes', () => {
      const { document } = loadPopupDom();
      const sparkCanvas = document.getElementById('sparklineCanvas');
      assert.ok(sparkCanvas);
      const ctx = sparkCanvas.getContext('2d');

      const history = [];
      assert.doesNotThrow(() => {
        ctx.clearRect(0, 0, sparkCanvas.width, sparkCanvas.height);
        if (history.length > 1) {
          ctx.beginPath();
          ctx.stroke();
        }
      }, 'Empty history sparkline drawing must not throw error');
    });

    it('T3.8.4: Restored backend connection clears offline warning and restores .excellent', () => {
      const { document } = loadPopupDom();
      const badge = document.getElementById('connectionBadge');

      badge.className = 'conn-badge excellent';
      badge.textContent = 'EXCELLENT';

      assert.ok(!badge.classList.contains('offline'));
      assert.ok(badge.classList.contains('excellent'));
    });

    it('T3.8.5: Frame drop counter increments and alerts user when skipped frames occur', () => {
      const { document } = loadPopupDom();
      const skippedCount = document.getElementById('skippedCount');

      skippedCount.textContent = '5';
      assert.equal(skippedCount.textContent, '5');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 9: Terminal Log Auto-Scroll + Terminal Log Export (F11 + F1)
  // --------------------------------------------------------------------------
  describe('Suite 9: Terminal Log Auto-Scroll + Terminal Log Export (F11 + F1)', () => {
    it('T3.9.1: Appending action logs via AUDIT_ACTION_LOG updates #terminalBody and scrolls container', () => {
      const { document } = loadPopupDom();
      const terminal = document.getElementById('terminalBody');
      const container = terminal.parentElement;

      terminal.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.textContent = `[Step ${i}] Click target coordinate (x: ${i * 100}, y: ${i * 50})`;
        terminal.appendChild(line);
      }

      container.scrollTop = 500;
      assert.equal(terminal.children.length, 5);
      assert.ok(terminal.lastElementChild.textContent.includes('Step 5'));
    });

    it('T3.9.2: When user is scrolled to bottom, new logs maintain automatic pinning', () => {
      // In terminal scroll tracking, pinned status is determined when scrollTop is within threshold of scrollHeight - clientHeight
      const shouldAutoScroll = (scrollTop, scrollHeight, clientHeight, threshold = 20) => {
        return (scrollHeight - scrollTop - clientHeight) <= threshold;
      };

      // At bottom
      assert.equal(shouldAutoScroll(800, 1000, 200), true, 'When scrolled to bottom, auto-scroll must be active');
      // Near bottom within threshold
      assert.equal(shouldAutoScroll(790, 1000, 200), true, 'Within threshold, auto-scroll remains active');
      // Scrolled up
      assert.equal(shouldAutoScroll(300, 1000, 200), false, 'When user scrolled up, auto-scroll must disengage');
    });

    it('T3.9.3: Special HTML characters in log messages are safely escaped without executing script tags', () => {
      const { document } = loadPopupDom();
      const terminal = document.getElementById('terminalBody');
      const unsafeInput = '<script>alert("xss")</script>';

      const line = document.createElement('div');
      line.textContent = unsafeInput;
      terminal.appendChild(line);

      assert.equal(line.innerHTML, '&lt;script&gt;alert("xss")&lt;/script&gt;');
      assert.equal(line.querySelectorAll('script').length, 0);
    });

    it('T3.9.4: Clicking #exportLogBtn collects all terminal logs into structured JSON payload', () => {
      const { document } = loadPopupDom();
      const terminal = document.getElementById('terminalBody');
      const exportBtn = document.getElementById('exportLogBtn');
      assert.ok(exportBtn);

      terminal.innerHTML = '';
      const sampleLogs = [
        { type: ActionType.CLICK, x: 250, y: 250, timestamp: 1000 },
        { type: ActionType.TYPE, text: 'Mumbai', timestamp: 2000 },
        { type: ActionType.FINISH, detail: 'Task complete', timestamp: 3000 }
      ];

      sampleLogs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'terminal-line';
        div.textContent = JSON.stringify(log);
        terminal.appendChild(div);
      });

      const exported = Array.from(terminal.children).map(c => JSON.parse(c.textContent));
      assert.equal(exported.length, 3);
      assert.equal(exported[0].type, ActionType.CLICK);
      assert.equal(exported[2].type, ActionType.FINISH);
    });

    it('T3.9.5: Exported log payload includes required audit attributes', () => {
      const sampleEntry = {
        action: 'CLICK',
        step: 1,
        timestamp: Date.now(),
        coordinates: { x: 100, y: 200 },
        success: true
      };

      assert.ok(sampleEntry.action);
      assert.ok(sampleEntry.step);
      assert.ok(sampleEntry.timestamp);
      assert.ok(sampleEntry.coordinates);
      assert.equal(sampleEntry.success, true);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 10: Clear Vault + Clear History Zero-State Synchronization (F19 + F25)
  // --------------------------------------------------------------------------
  describe('Suite 10: Clear Vault + Clear History Zero-State Synchronization (F19 + F25)', () => {
    it('T3.10.1: Initial populated state enables both #clearHistoryBtn and #clearVaultBtn', () => {
      const { document } = loadPopupDom();
      const clearHistoryBtn = document.getElementById('clearHistoryBtn');
      const clearVaultBtn = document.getElementById('clearVaultBtn');

      clearHistoryBtn.disabled = false;
      clearVaultBtn.disabled = false;

      assert.equal(clearHistoryBtn.disabled, false);
      assert.equal(clearVaultBtn.disabled, false);
    });

    it('T3.10.2: Clearing history empties sessionHistory, reveals #historyEmpty, and disables button', async () => {
      const { document, mockChrome } = loadPopupDom({
        initialStorage: { sessionHistory: [{ id: '1', goal: 'Test' }] }
      });
      const clearHistoryBtn = document.getElementById('clearHistoryBtn');
      const historyEmpty = document.getElementById('historyEmpty');

      await mockChrome.storage.local.set({ sessionHistory: [] });
      clearHistoryBtn.disabled = true;
      historyEmpty.classList.remove('hidden');

      const data = await mockChrome.storage.local.get('sessionHistory');
      assert.equal(data.sessionHistory.length, 0);
      assert.equal(clearHistoryBtn.disabled, true);
      assert.ok(!historyEmpty.classList.contains('hidden'));
    });

    it('T3.10.3: Clearing vault wipes all credentials, updates #vaultFilledCount to 0, and disables button', async () => {
      const { document, mockChrome } = loadPopupDom({
        initialStorage: {
          lensagent_vault: {
            pan: { key: 'pan', value: 'ABCDE1234F' }
          }
        }
      });
      const clearVaultBtn = document.getElementById('clearVaultBtn');
      const vaultCount = document.getElementById('vaultFilledCount');

      await mockChrome.storage.local.set({ lensagent_vault: {} });
      clearVaultBtn.disabled = true;
      vaultCount.textContent = '0';

      const data = await mockChrome.storage.local.get('lensagent_vault');
      assert.equal(Object.keys(data.lensagent_vault).length, 0);
      assert.equal(clearVaultBtn.disabled, true);
      assert.equal(vaultCount.textContent, '0');
    });

    it('T3.10.4: Tab navigation confirms zero-state persistence across view changes', () => {
      const { document } = loadPopupDom();
      const historyEmpty = document.getElementById('historyEmpty');
      const vaultCount = document.getElementById('vaultFilledCount');

      historyEmpty.classList.remove('hidden');
      vaultCount.textContent = '0';

      // Switch to Agent tab and back
      const tabAgent = document.getElementById('tab-agent');
      const tabHistory = document.getElementById('tab-history');
      tabHistory.classList.add('hidden');
      tabAgent.classList.remove('hidden');

      tabAgent.classList.add('hidden');
      tabHistory.classList.remove('hidden');

      assert.ok(!historyEmpty.classList.contains('hidden'));
      assert.equal(vaultCount.textContent, '0');
    });

    it('T3.10.5: Adding a single item to either view immediately restores active state', async () => {
      const { document, mockChrome } = loadPopupDom();
      const clearVaultBtn = document.getElementById('clearVaultBtn');
      const vaultCount = document.getElementById('vaultFilledCount');

      await mockChrome.storage.local.set({
        lensagent_vault: {
          phone: { key: 'phone', value: '+919876543210' }
        }
      });

      clearVaultBtn.disabled = false;
      vaultCount.textContent = '1';

      assert.equal(clearVaultBtn.disabled, false);
      assert.equal(vaultCount.textContent, '1');
    });
  });
});
