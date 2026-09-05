/**
 * Master Test Runner & Report Aggregator (LensAgent E2E)
 * 
 * Executes all 4 tiers of the LensAgent E2E test suite sequentially:
 * - Tier 1: Feature Coverage (30 features x >=5 tests = >=150 tests)
 * - Tier 2: Boundary & Corner Cases (30 features x >=5 tests = >=150 tests)
 * - Tier 3: Cross-Feature Combinations (>=10 pairwise subsystem interaction suites)
 * - Tier 4: Real-World Application Scenarios (5 realistic end-to-end user workflows)
 * 
 * Verifies quality gates against TEST_INFRA.md thresholds:
 * - 100.0% Pass Rate (0 failures)
 * - All minimum coverage counts satisfied
 * - Total execution time < 60 seconds
 * 
 * Exit code: 0 on success, 1 on failure.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const TIERS = [
  {
    tier: 1,
    name: 'Tier 1: Feature Coverage',
    file: 'tests/e2e/tier1_features.test.js',
    minTests: 150,
    minSuites: 30,
    target: '30 Features x >=5 Tests'
  },
  {
    tier: 2,
    name: 'Tier 2: Boundary & Corner Cases',
    file: 'tests/e2e/tier2_boundaries.test.js',
    minTests: 150,
    minSuites: 30,
    target: '30 Features x >=5 Boundary Tests'
  },
  {
    tier: 3,
    name: 'Tier 3: Cross-Feature Combinations',
    file: 'tests/e2e/tier3_combinations.test.js',
    minTests: 40,
    minSuites: 10,
    target: '>=10 Pairwise Subsystem Interaction Suites'
  },
  {
    tier: 4,
    name: 'Tier 4: Real-World Scenarios',
    file: 'tests/e2e/tier4_scenarios.test.js',
    minTests: 5,
    minSuites: 5,
    target: '5 Realistic End-to-End User Workflows'
  }
];

function runTier(tierConfig) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`\n================================================================================`);
    console.log(`▶ LAUNCHING: ${tierConfig.name}`);
    console.log(`  Target: ${tierConfig.target}`);
    console.log(`  File:   ${tierConfig.file}`);
    console.log(`================================================================================`);

    const child = spawn(process.execPath, ['--test', tierConfig.file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (exitCode) => {
      const durationMs = Date.now() - startTime;
      
      // Parse Node test output
      const testsMatch = stdout.match(/ℹ tests\s+(\d+)/);
      const suitesMatch = stdout.match(/ℹ suites\s+(\d+)/);
      const passMatch = stdout.match(/ℹ pass\s+(\d+)/);
      const failMatch = stdout.match(/ℹ fail\s+(\d+)/);
      const durationMatch = stdout.match(/ℹ duration_ms\s+([\d.]+)/);

      const tests = testsMatch ? parseInt(testsMatch[1], 10) : 0;
      const suites = suitesMatch ? parseInt(suitesMatch[1], 10) : 0;
      const pass = passMatch ? parseInt(passMatch[1], 10) : 0;
      const fail = failMatch ? parseInt(failMatch[1], 10) : 0;
      const recordedDuration = durationMatch ? parseFloat(durationMatch[1]) : durationMs;

      const passedThreshold = (
        exitCode === 0 &&
        fail === 0 &&
        tests >= tierConfig.minTests &&
        suites >= tierConfig.minSuites
      );

      resolve({
        tier: tierConfig.tier,
        name: tierConfig.name,
        file: tierConfig.file,
        exitCode,
        tests,
        suites,
        pass,
        fail,
        durationMs: recordedDuration,
        wallDurationMs: durationMs,
        passedThreshold,
        minTests: tierConfig.minTests,
        minSuites: tierConfig.minSuites
      });
    });
  });
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║               LensAgent 4-Tier E2E Master Test Runner                        ║');
  console.log('║   Requirement-Driven Opaque-Box Verification per TEST_INFRA.md               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const suiteStartTime = Date.now();
  const results = [];

  for (const tierConfig of TIERS) {
    const result = await runTier(tierConfig);
    results.push(result);
  }

  const totalWallDurationMs = Date.now() - suiteStartTime;

  // Aggregate metrics
  const totalTests = results.reduce((sum, r) => sum + r.tests, 0);
  const totalSuites = results.reduce((sum, r) => sum + r.suites, 0);
  const totalPass = results.reduce((sum, r) => sum + r.pass, 0);
  const totalFail = results.reduce((sum, r) => sum + r.fail, 0);
  const passRate = totalTests > 0 ? ((totalPass / totalTests) * 100).toFixed(1) : '0.0';

  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     FINAL E2E EXECUTION SUMMARY REPORT                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('--------------------------------------------------------------------------------');
  console.log('| Tier | Tier Name                       | Tests | Pass | Fail | Dur(s) | Status |');
  console.log('--------------------------------------------------------------------------------');

  let allTiersPassed = true;

  for (const r of results) {
    const status = r.passedThreshold ? 'PASSED ' : 'FAILED ';
    if (!r.passedThreshold) allTiersPassed = false;
    const durSec = (r.wallDurationMs / 1000).toFixed(2);
    const tierNum = `T${r.tier}`.padEnd(4);
    const tierName = r.name.slice(0, 31).padEnd(31);
    const testCount = String(r.tests).padStart(5);
    const passCount = String(r.pass).padStart(4);
    const failCount = String(r.fail).padStart(4);
    const durStr = durSec.padStart(6);

    console.log(`| ${tierNum} | ${tierName} | ${testCount} | ${passCount} | ${failCount} | ${durStr} | ${status}|`);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`| TOTAL| All 4 Test Tiers Combined       | ${String(totalTests).padStart(5)} | ${String(totalPass).padStart(4)} | ${String(totalFail).padStart(4)} | ${(totalWallDurationMs / 1000).toFixed(2).padStart(6)} | ${allTiersPassed ? 'PASSED ' : 'FAILED '}|`);
  console.log('--------------------------------------------------------------------------------');
  console.log('');

  // Quality Gates Verification per TEST_INFRA.md §6
  console.log('QUALITY GATES VERIFICATION (TEST_INFRA.md §6):');
  const gate1 = results[0]?.tests >= 150 && results[0]?.fail === 0;
  const gate2 = results[1]?.tests >= 150 && results[1]?.fail === 0;
  const gate3 = results[2]?.suites >= 10 && results[2]?.fail === 0;
  const gate4 = results[3]?.tests >= 5 && results[3]?.fail === 0;
  const gate5 = totalFail === 0 && totalPass === totalTests;
  const gate6 = totalWallDurationMs < 60000;

  console.log(`  [${gate1 ? '✔ PASS' : '✖ FAIL'}] Tier 1 Feature Coverage:     ${results[0]?.tests || 0}/150 tests across 30 features (Req: >= 150)`);
  console.log(`  [${gate2 ? '✔ PASS' : '✖ FAIL'}] Tier 2 Boundary Cases:       ${results[1]?.tests || 0}/150 boundary tests (Req: >= 150)`);
  console.log(`  [${gate3 ? '✔ PASS' : '✖ FAIL'}] Tier 3 Combinations:          ${results[2]?.suites || 0}/10 pairwise subsystem suites (Req: >= 10)`);
  console.log(`  [${gate4 ? '✔ PASS' : '✖ FAIL'}] Tier 4 Application Scenarios: ${results[3]?.tests || 0}/5 end-to-end user workflows (Req: >= 5)`);
  console.log(`  [${gate5 ? '✔ PASS' : '✖ FAIL'}] Zero-Failure Pass Rate:      ${passRate}% pass rate (${totalPass}/${totalTests} passing, 0 failing)`);
  console.log(`  [${gate6 ? '✔ PASS' : '✖ FAIL'}] Execution Benchmark:         ${(totalWallDurationMs / 1000).toFixed(2)}s elapsed (Req: < 60.0s)`);
  console.log('');

  const overallSuccess = gate1 && gate2 && gate3 && gate4 && gate5 && gate6;

  if (overallSuccess) {
    console.log('================================================================================');
    console.log('🎉 ALL QUALITY GATES PASSED (100.0% SUCCESS) - TEST SUITE IS PRODUCTION-READY!');
    console.log('================================================================================');
    process.exit(0);
  } else {
    console.error('================================================================================');
    console.error('❌ ONE OR MORE QUALITY GATES FAILED - REVIEW LOGS ABOVE FOR DETAILS');
    console.error('================================================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error in master test runner:', err);
  process.exit(1);
});
