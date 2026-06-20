import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ErrorCodes,
  getErrorMetadata,
  getDefaultErrorCodeByType,
  resolveErrorCode
} from '../../src/utils/errorRegistry.js';

// --- getErrorMetadata ---

test('getErrorMetadata returns metadata for known error code', () => {
  const meta = getErrorMetadata(ErrorCodes.DATABASE_ERROR);
  assert.equal(meta.severity, 'high');
  assert.equal(meta.retryable, true);
  assert.ok(meta.remediation.length > 0);
});

test('getErrorMetadata returns UNKNOWN_ERROR metadata for unknown code', () => {
  const meta = getErrorMetadata('NONEXISTENT_CODE');
  assert.equal(meta.severity, 'high');
  assert.equal(meta.retryable, false);
});

test('getErrorMetadata returns UNKNOWN_ERROR metadata for null/undefined', () => {
  const meta1 = getErrorMetadata(null);
  assert.equal(meta1.severity, 'high');
  const meta2 = getErrorMetadata(undefined);
  assert.equal(meta2.severity, 'high');
});

test('getErrorMetadata normalizes case', () => {
  const meta = getErrorMetadata('database_error');
  assert.equal(meta.severity, 'high');
  assert.equal(meta.retryable, true);
});

// --- getDefaultErrorCodeByType ---

test('getDefaultErrorCodeByType maps known types correctly', () => {
  assert.equal(getDefaultErrorCodeByType('validation'), ErrorCodes.VALIDATION_FAILED);
  assert.equal(getDefaultErrorCodeByType('permission'), ErrorCodes.PERMISSION_DENIED);
  assert.equal(getDefaultErrorCodeByType('database'), ErrorCodes.DATABASE_ERROR);
});

test('getDefaultErrorCodeByType returns UNKNOWN_ERROR for unknown type', () => {
  assert.equal(getDefaultErrorCodeByType('nonexistent'), ErrorCodes.UNKNOWN_ERROR);
  assert.equal(getDefaultErrorCodeByType(), ErrorCodes.UNKNOWN_ERROR);
});

// --- resolveErrorCode ---

test('resolveErrorCode prioritizes context.errorCode', () => {
  const code = resolveErrorCode({
    error: { code: 'SOME_CODE', context: { errorCode: 'nested' } },
    errorType: 'validation',
    context: { errorCode: 'context_code' }
  });
  assert.equal(code, 'CONTEXT_CODE');
});

test('resolveErrorCode falls back to error.context.errorCode', () => {
  const code = resolveErrorCode({
    error: { code: 'SOME_CODE', context: { errorCode: 'nested_code' } },
    errorType: 'validation',
    context: {}
  });
  assert.equal(code, 'NESTED_CODE');
});

test('resolveErrorCode falls back to error.code', () => {
  const code = resolveErrorCode({
    error: { code: 'error_code' },
    errorType: 'validation',
    context: {}
  });
  assert.equal(code, 'ERROR_CODE');
});

test('resolveErrorCode falls back to type-based default', () => {
  const code = resolveErrorCode({
    error: {},
    errorType: 'database',
    context: {}
  });
  assert.equal(code, ErrorCodes.DATABASE_ERROR);
});

test('resolveErrorCode returns UNKNOWN_ERROR when no info available', () => {
  const code = resolveErrorCode();
  assert.equal(code, ErrorCodes.UNKNOWN_ERROR);
});
