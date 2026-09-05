import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrivacyEngine } from '../../privacy_engine.js';

describe('PrivacyEngine - Indian PII & Redaction Suite', () => {
  it('defines all required Indian and Global PII patterns', () => {
    const requiredPatterns = [
      'AADHAAR',
      'PAN',
      'CREDIT_CARD',
      'PHONE',
      'EMAIL',
      'UPI_ID',
      'PASSPORT',
      'DRIVING_LICENSE',
      'VOTER_ID',
      'PIN_CODE'
    ];

    for (const key of requiredPatterns) {
      assert.ok(PrivacyEngine.PII_PATTERNS[key], `Missing pattern: ${key}`);
      assert.ok(PrivacyEngine.PII_PATTERNS[key] instanceof RegExp, `${key} must be a RegExp`);
    }
  });

  it('correctly matches Indian PII patterns', () => {
    const { UPI_ID, PASSPORT, DRIVING_LICENSE, VOTER_ID, PIN_CODE } = PrivacyEngine.PII_PATTERNS;

    // UPI_ID
    assert.ok(UPI_ID.test('alice@okaxis'), 'Standard UPI ID should match');
    assert.ok(UPI_ID.test('merchant_123.pay@PAYTM'), 'Case-insensitive UPI ID should match');

    // PASSPORT (1 letter, 1 non-zero digit, 7 digits = 8 digits total)
    assert.ok(PASSPORT.test('A12345678'), 'Valid Passport format should match');

    // DRIVING_LICENSE (DL0420110012345 or DL-1420110012345)
    assert.ok(DRIVING_LICENSE.test('DL0420110012345'), 'DL format 1 should match');
    assert.ok(DRIVING_LICENSE.test('MH-1220110012345'), 'DL format 2 (with hyphen) should match');

    // VOTER_ID (3 letters + 7 digits)
    assert.ok(VOTER_ID.test('ABC1234567'), 'Standard EPIC Voter ID should match');
    assert.ok(VOTER_ID.test('XYZ9876543'), 'Standard EPIC Voter ID should match');

    // PIN_CODE (6 digits, first digit 1-9)
    assert.ok(PIN_CODE.test('560001'), 'Bangalore PIN code should match');
    assert.ok(PIN_CODE.test('110001'), 'Delhi PIN code should match');
    assert.ok(!PIN_CODE.test('012345'), 'PIN code starting with 0 must not match');
    assert.ok(!PIN_CODE.test('12345'), '5-digit number must not match PIN code');
  });

  it('provides exact placeholder jargon for all PII categories', () => {
    assert.equal(PrivacyEngine.getPlaceholderText('UPI_ID'), '[REDACTED_UPI_ID]');
    assert.equal(PrivacyEngine.getPlaceholderText('PASSPORT'), '[REDACTED_PASSPORT_****]');
    assert.equal(PrivacyEngine.getPlaceholderText('DRIVING_LICENSE'), '[REDACTED_DL_****]');
    assert.equal(PrivacyEngine.getPlaceholderText('VOTER_ID'), '[REDACTED_VOTER_ID]');
    assert.equal(PrivacyEngine.getPlaceholderText('PIN_CODE'), '[REDACTED_PIN_CODE]');
    assert.equal(PrivacyEngine.getPlaceholderText('AADHAAR'), '[REDACTED_AADHAAR_****]');
    assert.equal(PrivacyEngine.getPlaceholderText('PAN'), '[REDACTED_PAN_****]');
    assert.equal(PrivacyEngine.getPlaceholderText('CREDIT_CARD'), '[REDACTED_CARD_****]');
    assert.equal(PrivacyEngine.getPlaceholderText('EMAIL'), '[REDACTED_EMAIL@DOMAIN]');
    assert.equal(PrivacyEngine.getPlaceholderText('PHONE'), '[REDACTED_PHONE_+91]');
  });

  it('redactText replaces all Indian PII in text with placeholders', () => {
    const engine = new PrivacyEngine();
    const rawText = 'Pay user via upi alice@okaxis. DL is DL0420110012345. Passport: A12345678. Voter: ABC1234567. PIN: 560001.';
    const redacted = engine.redactText(rawText);

    assert.ok(redacted.includes('[REDACTED_UPI_ID]'), 'UPI must be redacted');
    assert.ok(redacted.includes('[REDACTED_DL_****]'), 'DL must be redacted');
    assert.ok(redacted.includes('[REDACTED_PASSPORT_****]'), 'Passport must be redacted');
    assert.ok(redacted.includes('[REDACTED_VOTER_ID]'), 'Voter ID must be redacted');
    assert.ok(redacted.includes('[REDACTED_PIN_CODE]'), 'PIN code must be redacted');
    assert.ok(!redacted.includes('alice@okaxis'), 'Raw UPI must not be present');
    assert.ok(!redacted.includes('DL0420110012345'), 'Raw DL must not be present');
    assert.ok(!redacted.includes('A12345678'), 'Raw Passport must not be present');
    assert.ok(!redacted.includes('ABC1234567'), 'Raw Voter ID must not be present');
    assert.ok(!redacted.includes('560001'), 'Raw PIN must not be present');
  });

  it('redactText does not re-redact already redacted text', () => {
    const engine = new PrivacyEngine();
    const safeText = 'Transaction: [REDACTED_UPI_ID] at postal code [REDACTED_PIN_CODE]';
    const result = engine.redactText(safeText);
    assert.equal(result, safeText);
  });

  it('scanValue detects unmasked PII across structured objects and numbers', () => {
    const engine = new PrivacyEngine();
    const payload = {
      user: {
        payment: { upi: 'bob@okhdfcbank' },
        documents: [
          { type: 'passport', number: 'P12345678' },
          { type: 'voter', id: 'DEF7654321' }
        ]
      },
      address: {
        pincode: 110001
      },
      sessionId: 'sess_123456' // Must be ignored
    };

    const violations = engine.scanValue(payload);
    assert.ok(violations.length >= 4, `Expected at least 4 violations, got ${violations.length}`);

    const categories = violations.map(v => v.category);
    assert.ok(categories.includes('UPI_ID'));
    assert.ok(categories.includes('PASSPORT'));
    assert.ok(categories.includes('VOTER_ID'));
    assert.ok(categories.includes('PIN_CODE'));
  });

  it('validatePayload allows safe/redacted payloads and blocks leaked PII', () => {
    const engine = new PrivacyEngine();

    const safePayload = {
      status: 'SUCCESS',
      account: '[REDACTED_UPI_ID]',
      postal: '[REDACTED_PIN_CODE]',
      doc: '[REDACTED_PASSPORT_****]'
    };

    assert.equal(engine.validatePayload(safePayload), true);

    const leakyPayload = {
      action: 'transfer',
      upi_id: 'alice@okaxis'
    };

    assert.throws(
      () => engine.validatePayload(leakyPayload),
      /\[PrivacyEngine\] SECURITY ALERT: Blocked outgoing payload/
    );
  });
});
