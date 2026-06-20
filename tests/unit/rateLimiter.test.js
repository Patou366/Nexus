import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkRateLimit,
  getRateLimitStatus,
  clearRateLimit,
  clearAllRateLimits
} from '../../src/utils/rateLimiter.js';

test('checkRateLimit allows requests within limit', async () => {
  clearAllRateLimits();
  const key = 'test-allow';
  assert.equal(await checkRateLimit(key, 3, 60000), true);
  assert.equal(await checkRateLimit(key, 3, 60000), true);
  assert.equal(await checkRateLimit(key, 3, 60000), true);
});

test('checkRateLimit blocks after exceeding limit', async () => {
  clearAllRateLimits();
  const key = 'test-block';
  await checkRateLimit(key, 2, 60000);
  await checkRateLimit(key, 2, 60000);
  assert.equal(await checkRateLimit(key, 2, 60000), false);
});

test('checkRateLimit resets after window expires', async () => {
  clearAllRateLimits();
  const key = 'test-expire';
  await checkRateLimit(key, 1, 1); // 1ms window
  // Wait for window to expire
  await new Promise(r => setTimeout(r, 10));
  assert.equal(await checkRateLimit(key, 1, 1), true);
});

test('getRateLimitStatus returns correct status for unknown key', () => {
  clearAllRateLimits();
  const status = getRateLimitStatus('unknown-key');
  assert.equal(status.limited, false);
});

test('getRateLimitStatus returns attempt count after usage', async () => {
  clearAllRateLimits();
  const key = 'test-status';
  await checkRateLimit(key, 5, 60000);
  await checkRateLimit(key, 5, 60000);
  const status = getRateLimitStatus(key, 60000);
  assert.equal(status.attempts, 2);
  assert.equal(status.limited, true);
  assert.ok(status.remaining > 0);
});

test('clearRateLimit removes a specific key', async () => {
  clearAllRateLimits();
  const key = 'test-clear';
  await checkRateLimit(key, 1, 60000);
  clearRateLimit(key);
  // Should be allowed again after clearing
  assert.equal(await checkRateLimit(key, 1, 60000), true);
});

test('clearAllRateLimits removes all keys', async () => {
  await checkRateLimit('key1', 1, 60000);
  await checkRateLimit('key2', 1, 60000);
  clearAllRateLimits();
  assert.equal(await checkRateLimit('key1', 1, 60000), true);
  assert.equal(await checkRateLimit('key2', 1, 60000), true);
});
