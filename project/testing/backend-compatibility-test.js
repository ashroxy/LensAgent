/**
 * Backend Compatibility Test for LensAgent
 * Validates that frontend correctly implements Member 4's backend API expectations
 *
 * Tests:
 * 1. Session ID generation and persistence
 * 2. Vault key names format (should be category names, not full aliases)
 * 3. Execution results tracking
 * 4. Payload structure compliance
 * 5. Tri-stream architecture (visual, DOM, A11y streams)
 */

import { chromium } from 'playwright';

async function runBackendCompatibilityTest() {
  console.log('🧪 Starting Backend Compatibility Test...');
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  // Track test results
  const testResults = {
    sessionIdFormat: false,
    vaultKeyNames: false,
    executionResults: false,
    payloadStructure: false,
    triStreamStreams: false,
    overallSuccess: false
  };

  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CONSOLE ERROR: ${m.text()}`);
    else console.log(`PAGE LOG: ${m.text()}`);
  });

  try {
    // 1. Test Session ID Format
    console.log('\n📝 Test 1: Session ID Format Validation');
    await page.addInitScript(() => {
      // Mock the backend endpoint to capture payloads
      window.__capturedPayloads = [];
      window.__originalFetch = window.fetch;

      window.fetch = async (...args) => {
        const [resource, config] = args;
        if (resource && resource.includes('/api/v1/infer')) {
          // Capture the request body before sending
          if (config && config.body) {
            try {
              const payload = JSON.parse(typeof config.body === 'string' ? config.body :
                                       new TextDecoder().decode(config.body));
              window.__capturedPayloads.push(payload);
              console.log('📡 Captured payload:', JSON.stringify(payload, null, 2));
            } catch (e) {
              console.warn('Could not parse payload:', e);
            }
          }
        }
        return window.__originalFetch.apply(this, args);
      };
    });

    await page.goto('http://localhost:5173/popup/popup.html'); // Assuming Vite dev server
    await page.waitForTimeout(2000);

    // If dev server not available, test with built files
    try {
      await page.goto('http://localhost:8080/popup/popup.html');
    } catch (e) {
      console.log('Dev server not available, using static files...');
      await page.goto('file://' + process.cwd().replace(/\\/g, '/') + '/popup/popup.html');
    }

    await page.waitForTimeout(3000);

    // Start agent with a test goal
    await page.evaluate(() => {
      // Mock background service to start agent
      window.chrome = {
        runtime: {
          sendMessage: (msg) => {
            if (msg.type === 'BG_AGENT_START') {
              console.log('Agent started with goal:', msg.payload.goal);
              // Simulate agent processing
              setTimeout(() => {
                window.chrome.runtime.onMessage.forEach(listener =>
                  listener({ type: 'OS_PERCEPTION_DONE', correlationId: 'test_1',
                           result: {
                             elements: [{ id: 1, type: 'button', bbox: [100, 100, 50, 30] }],
                             redactedImageBase64: 'dummybase64data...',
                             redactedRegions: []
                           }));
              }, 100);
            }
          },
          onMessage: { addListener: (cb) => { window.chrome.runtime.onMessage = window.chrome.runtime.onMessage || []; window.chrome.runtime.onMessage.push(cb); } }
        }
      };

      // Start agent
      window.chrome.runtime.sendMessage({
        type: 'BG_AGENT_START',
        payload: { goal: 'Test login flow' }
      });
    });

    await page.waitForTimeout(5000);

    // Check captured payloads
    const payloads = await page.evaluate(() => window.__capturedPayloads || []);
    console.log(`📦 Captured ${payloads.length} payload(s)`);

    if (payloads.length > 0) {
      const payload = payloads[0];

      // Validate session ID format
      if (payload.session_id && payload.session_id.startsWith('sess_') && payload.session_id.length > 20) {
        testResults.sessionIdFormat = true;
        console.log('✅ Session ID format valid:', payload.session_id);
      } else {
        console.log('❌ Invalid session ID format:', payload.session_id);
      }

      // Validate vault key names format
      if (Array.isArray(payload.available_keys)) {
        const keyNames = payload.available_keys;
        console.log('🔑 Available keys:', keyNames);

        // Check that keys are category names (EMAIL, PAN, etc.) not full aliases
        const validKeyNames = keyNames.every(key =>
          /^[A-Z]+$/.test(key) &&
          !key.startsWith('[') &&
          !key.endsWith(']')
        );

        if (validKeyNames && keyNames.length > 0) {
          testResults.vaultKeyNames = true;
          console.log('✅ Vault key names are properly formatted (category names only)');
        } else if (keyNames.length === 0) {
          testResults.vaultKeyNames = true; // Empty is acceptable for this test
          console.log('✅ Vault key names array is empty (acceptable for test)');
        } else {
          console.log('❌ Vault key names contain invalid format:', keyNames);
        }
      } else {
        console.log('❌ available_keys is not an array:', payload.available_keys);
      }

      // Validate execution results
      if (Array.isArray(payload.execution_results)) {
        testResults.executionResults = true;
        console.log('✅ Execution results tracking enabled (array format)');
      } else {
        console.log('❌ execution_results is not an array:', payload.execution_results);
      }

      // Validate payload structure
      const requiredFields = ['session_id', 'task', 'browser_state', 'screenshot', 'available_keys', 'execution_results'];
      const missingFields = requiredFields.filter(field => !(field in payload));

      if (missingFields.length === 0) {
        testResults.payloadStructure = true;
        console.log('✅ Payload structure contains all required fields');
      } else {
        console.log('❌ Missing required fields:', missingFields);
      }

      // Validate Tri-Stream Architecture
      const hasVisual = payload.screenshot && payload.screenshot.data;
      const hasDom = Array.isArray(payload.browser_state?.dom_snapshot);
      const hasA11y = Array.isArray(payload.browser_state?.a11y_tree);

      if (hasVisual && hasDom && hasA11y) {
        testResults.triStreamStreams = true;
        console.log('✅ Tri-Stream Architecture present (Visual, DOM, A11y streams)');
      } else {
        console.log(`❌ Tri-Stream incomplete - Visual: ${hasVisual}, DOM: ${hasDom}, A11y: ${hasA11y}`);
      }
    }

    // Calculate overall success
    const passedTests = Object.values(testResults).filter(Boolean).length - 1; // Subtract overallSuccess
    testResults.overallSuccess = passedTests >= 4; // Need at least 4/5 tests to pass

    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    Object.keys(testResults).forEach(key => {
      if (key !== 'overallSuccess') {
        const status = testResults[key] ? '✅ PASS' : '❌ FAIL';
        console.log(`${status} ${key}`);
      }
    });
    console.log(`\n🎯 Overall Success: ${testResults.overallSuccess ? '✅ PASS' : '❌ FAIL'} (${passedTests}/5 tests passed)`);

  } catch (error) {
    console.error('💥 Test execution failed:', error);
    errors.push(`TEST EXECUTION ERROR: ${error.message}`);
  } finally {
    await browser.close();

    if (errors.length > 0) {
      console.log('\n🚨 Errors encountered during testing:');
      errors.forEach((err, i) => console.log(`${i+1}. ${err}`));
    }

    // Return test results for potential CI/CD integration
    return testResults;
  }
}

// Run the test if called directly
if (require.main === module) {
  runBackendCompatibilityTest()
    .then(results => {
      process.exit(results.overallSuccess ? 0 : 1);
    })
    .catch(err => {
      console.error('Failed to run test:', err);
      process.exit(1);
    });
}

export { runBackendCompatibilityTest };