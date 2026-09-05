/**
 * Isolated DOM Fixtures & Mock Chrome MV3 Environment
 * Uses JSDOM and actual popup/popup.html to enable rigorous, fast, deterministic testing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

export function createMockChrome(initialStorage = {}) {
  const localStore = {
    userSettings: {
      backendUrl: "http://127.0.0.1:8000",
      maxSteps: 30,
      captureQuality: 75,
      captureMaxWidth: 1280,
      captureMaxHeight: 720,
      humanizeInputs: true,
      stabilizeDelayMs: 250,
      serverTimeoutMs: 10000,
      enableDeltaFrames: true,
      enableAuditStream: true,
      interKeyDelayBase: 30,
      interKeyJitter: 40,
    },
    sessionHistory: [],
    lensagent_vault: {},
    ...initialStorage
  };

  const sessionStore = {
    agentState: "IDLE",
    currentGoal: "",
    stepCount: 0,
    perfMetrics: {},
    actionLogs: []
  };

  const messageListeners = [];
  const sentMessages = [];

  return {
    storage: {
      local: {
        get: (keys, cb) => {
          let res = {};
          if (typeof keys === 'string') {
            res[keys] = localStore[keys];
          } else if (Array.isArray(keys)) {
            keys.forEach(k => { res[k] = localStore[k]; });
          } else if (keys === null || keys === undefined) {
            res = { ...localStore };
          } else if (typeof keys === 'object') {
            for (const [k, defVal] of Object.entries(keys)) {
              res[k] = localStore[k] !== undefined ? localStore[k] : defVal;
            }
          }
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (items, cb) => {
          Object.assign(localStore, items);
          if (cb) cb();
          return Promise.resolve();
        },
        clear: (cb) => {
          for (const k of Object.keys(localStore)) delete localStore[k];
          if (cb) cb();
          return Promise.resolve();
        },
        remove: (keys, cb) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          arr.forEach(k => delete localStore[k]);
          if (cb) cb();
          return Promise.resolve();
        },
        _store: localStore
      },
      session: {
        get: (keys, cb) => {
          let res = {};
          if (typeof keys === 'string') {
            res[keys] = sessionStore[keys];
          } else if (Array.isArray(keys)) {
            keys.forEach(k => { res[k] = sessionStore[k]; });
          } else {
            res = { ...sessionStore };
          }
          if (cb) cb(res);
          return Promise.resolve(res);
        },
        set: (items, cb) => {
          Object.assign(sessionStore, items);
          if (cb) cb();
          return Promise.resolve();
        },
        _store: sessionStore
      }
    },
    runtime: {
      sendMessage: (msg, responseCallback) => {
        sentMessages.push(msg);
        let resp = { status: "OK" };
        if (msg.type === "POPUP_START_AGENT" || msg.action === "POPUP_START_AGENT") {
          resp = { status: "STARTED", tabId: 101, dpr: 1 };
        } else if (msg.type === "POPUP_STOP_AGENT" || msg.action === "POPUP_STOP_AGENT") {
          resp = { status: "STOPPED" };
        } else if (msg.type === "POPUP_GET_STATUS" || msg.action === "POPUP_GET_STATUS") {
          resp = { status: "OK", state: "IDLE", stepCount: 0, maxSteps: 30, avgLatency: 0 };
        } else if (msg.type === "POPUP_GET_SETTINGS" || msg.action === "POPUP_GET_SETTINGS") {
          resp = localStore.userSettings;
        } else if (msg.type === "POPUP_GET_HISTORY" || msg.action === "POPUP_GET_HISTORY") {
          resp = localStore.sessionHistory;
        } else if (msg.type === "POPUP_VAULT_GET" || msg.action === "POPUP_VAULT_GET") {
          resp = localStore.lensagent_vault;
        }
        if (responseCallback) responseCallback(resp);
        return Promise.resolve(resp);
      },
      onMessage: {
        addListener: (listener) => {
          messageListeners.push(listener);
        },
        removeListener: (listener) => {
          const idx = messageListeners.indexOf(listener);
          if (idx !== -1) messageListeners.splice(idx, 1);
        },
        _dispatch: (message, sender = {}) => {
          messageListeners.forEach(l => l(message, sender, () => {}));
        }
      },
      getURL: (pathStr) => `chrome-extension://mock-lens-agent/${pathStr}`,
      lastError: null,
      _sentMessages: sentMessages
    },
    tabs: {
      query: (queryInfo, cb) => {
        const tabs = [{ id: 101, url: "https://example.com", title: "Example Page" }];
        if (cb) cb(tabs);
        return Promise.resolve(tabs);
      },
      create: (props, cb) => {
        if (cb) cb({ id: 102, ...props });
        return Promise.resolve({ id: 102, ...props });
      }
    }
  };
}

export function loadPopupDom(options = {}) {
  const htmlPath = path.resolve('popup', 'popup.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  const mockChrome = createMockChrome(options.initialStorage);

  const dom = new JSDOM(htmlContent, {
    url: "chrome-extension://mock-lens-agent/popup/popup.html",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });

  const { window } = dom;
  window.chrome = mockChrome;

  // Add canvas 2d mock if not supported
  window.HTMLCanvasElement.prototype.getContext = function (contextType) {
    return {
      canvas: this,
      clearRect: () => {},
      fillRect: () => {},
      drawImage: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      fillText: () => {},
      measureText: () => ({ width: 10 }),
      setTransform: () => {},
      save: () => {},
      restore: () => {},
      strokeRect: () => {},
      lineWidth: 1,
      strokeStyle: "#000",
      fillStyle: "#000"
    };
  };

  return {
    dom,
    window,
    document: window.document,
    mockChrome,
    htmlContent
  };
}
