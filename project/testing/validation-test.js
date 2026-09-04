/**
 * Validation Test for LensAgent Backend Compatibility Improvements
 * This test validates the specific improvements we made without requiring the full extension to run
 */

import fs from 'fs';
import path from 'path';

// Test 1: Validate vault manager getAvailableKeyNames fix
console.log('🧪 Testing Vault Manager getAvailableKeyNames fix...');

const vaultManagerCode = fs.readFileSync('../offscreen/vault_manager.js', 'utf8');

// Extract the getAvailableKeyNames method
const getAvailableKeyNamesMatch = vaultManagerCode.match(/getAvailableKeyNames\(\)[\s\S]*?return Array\.from\(keyNames\);/);

let vaultManagerFixPassed = false;
if (getAvailableKeyNamesMatch) {
  const methodCode = getAvailableKeyNamesMatch[0];
  console.log('📋 Found getAvailableKeyNames method:');
  console.log(methodCode);

  // Check if it correctly extracts category names (match[1]) not full aliases (match[0])
  if (methodCode.includes('keyNames.add(match[1]);')) {
    console.log('✅ PASS: Method correctly extracts category names (match[1])');
    vaultManagerFixPassed = true;
  } else if (methodCode.includes('keyNames.add(match[0]);')) {
    console.log('❌ FAIL: Method still returns full aliases (match[0])');
  } else {
    console.log('⚠️  WARNING: Could not determine extraction method from code inspection');
  }
} else {
  console.log('❌ FAIL: Could not find getAvailableKeyNames method in vault_manager.js');
}

// Test 2: Validate that we removed duplicate _getAllElementsDeep
console.log('\n🧪 Testing action-executor.js duplicate function removal...');

const actionExecutorCode = fs.readFileSync('../lib/action-executor.js', 'utf8');

// Count occurrences of _getAllElementsDeep
const matches = actionExecutorCode.match(/_getAllElementsDeep\(root\)/g);
const count = matches ? matches.length : 0;

console.log(`📊 Found ${count} occurrences of _getAllElementsDeep`);

let duplicateRemovalPassed = false;
if (count === 1) {
  console.log('✅ PASS: Only one _getAllElementsDeep function exists (duplicate removed)');
  duplicateRemovalPassed = true;
} else if (count > 1) {
  console.log(`❌ FAIL: Still ${count} occurrences - duplicates not fully removed`);
} else {
  console.log('❌ FAIL: No occurrences found - function may have been removed entirely');
}

// Test 3: Validate agent-loop.js backend compatibility
console.log('\n🧪 Testing agent-loop.js backend compatibility...');

const agentLoopCode = fs.readFileSync('../lib/agent-loop.js', 'utf8');

// Check for session management
const hasSessionId = agentLoopCode.includes('this.sessionId       = \`sess_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;');
const hasLastExecutionResults = agentLoopCode.includes('this._lastExecutionResults = [];');
const hasAvailableKeysCall = agentLoopCode.includes('available_keys: this.vault ? this.vault.getAvailableKeyNames() : []');
const hasExecutionResultsInPayload = agentLoopCode.includes('execution_results: this._lastExecutionResults');

const sessionChecks = [
  { name: 'Session ID generation', passed: hasSessionId },
  { name: 'Last execution results array', passed: hasLastExecutionResults },
  { name: 'Available keys call in payload', passed: hasAvailableKeysCall },
  { name: 'Execution results in payload', passed: hasExecutionResultsInPayload }
];

let passedSessionChecks = 0;
sessionChecks.forEach(check => {
  if (check.passed) {
    console.log(`✅ PASS: ${check.name}`);
    passedSessionChecks++;
  } else {
    console.log(`❌ FAIL: ${check.name}`);
  }
});

let sessionManagementPassed = false;
if (passedSessionChecks === sessionChecks.length) {
  console.log('✅ PASS: All session management checks passed');
  sessionManagementPassed = true;
} else {
  console.log(`❌ FAIL: ${sessionChecks.length - passedSessionChecks}/${sessionChecks.length} session management checks failed`);
}

// Test 4: Validate README updates
console.log('\n🧪 Testing README.md updates...');

const readmeCode = fs.readFileSync('../README.md', 'utf8');

// Check for correct endpoint
const hasCorrectEndpoint = readmeCode.includes('/api/v1/infer');
const hasOldEndpoint = readmeCode.includes('/api/v1/agent/act');

let readmeUpdatePassed = false;
if (hasCorrectEndpoint && !hasOldEndpoint) {
  console.log('✅ PASS: README correctly updated to /api/v1/infer endpoint');
  readmeUpdatePassed = true;
} else if (hasOldEndpoint && !hasCorrectEndpoint) {
  console.log('❌ FAIL: README still has old endpoint /api/v1/agent/act');
} else if (hasCorrectEndpoint && hasOldEndpoint) {
  console.log('⚠️  WARNING: README has both old and new endpoints');
} else {
  console.log('❌ FAIL: README does not contain expected endpoint references');
}

// Final Summary
console.log('\n' + '='.repeat(60));
console.log('📋 VALIDATION TEST SUMMARY');
console.log('='.repeat(60));

const tests = [
  { name: 'Vault Manager Fix', passed: vaultManagerFixPassed },
  { name: 'Duplicate Function Removal', passed: duplicateRemovalPassed },
  { name: 'Session Management', passed: sessionManagementPassed },
  { name: 'README Updates', passed: readmeUpdatePassed }
];

let passedTests = 0;
tests.forEach(test => {
  if (test.passed) {
    console.log(`✅ PASS: ${test.name}`);
    passedTests++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
  }
});

console.log('-'.repeat(60));
console.log(`🎯 Overall Result: ${passedTests}/${tests.length} test categories passed`);

if (passedTests === tests.length) {
  console.log('🎉 ALL VALIDATION TESTS PASSED - Backend compatibility improvements verified!');
  process.exit(0);
} else {
  console.log('⚠️  Some validation tests failed - please review the issues above');
  process.exit(1);
}