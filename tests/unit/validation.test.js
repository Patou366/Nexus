import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateString,
  validateNumber,
  validateDiscordId,
  validateCustomId,
  validateRequiredProps,
  validateUrl,
  validateRange,
  validateEnum
} from '../../src/utils/validation.js';

// --- validateString ---

test('validateString returns valid string unchanged', () => {
  assert.equal(validateString('hello'), 'hello');
});

test('validateString returns null for non-string', () => {
  assert.equal(validateString(42), null);
  assert.equal(validateString(null), null);
  assert.equal(validateString(undefined), null);
});

test('validateString returns null for empty string', () => {
  assert.equal(validateString(''), null);
});

test('validateString truncates strings exceeding maxLength', () => {
  assert.equal(validateString('abcdef', 'test', 3), 'abc');
});

// --- validateNumber ---

test('validateNumber returns valid non-negative number', () => {
  assert.equal(validateNumber(42), 42);
  assert.equal(validateNumber(0), 0);
});

test('validateNumber returns null for non-number types', () => {
  assert.equal(validateNumber('42'), null);
  assert.equal(validateNumber(null), null);
  assert.equal(validateNumber(NaN), null);
});

test('validateNumber returns null for negative numbers', () => {
  assert.equal(validateNumber(-1), null);
});

// --- validateDiscordId ---

test('validateDiscordId accepts valid 18-20 digit IDs', () => {
  assert.equal(validateDiscordId('123456789012345678'), '123456789012345678');
  assert.equal(validateDiscordId('12345678901234567890'), '12345678901234567890');
});

test('validateDiscordId rejects too-short IDs', () => {
  assert.equal(validateDiscordId('12345'), null);
});

test('validateDiscordId rejects non-numeric IDs', () => {
  assert.equal(validateDiscordId('abcdefghijklmnopqr'), null);
});

test('validateDiscordId rejects non-string input', () => {
  assert.equal(validateDiscordId(123456789012345678), null);
  assert.equal(validateDiscordId(null), null);
});

// --- validateCustomId ---

test('validateCustomId accepts valid alphanumeric IDs', () => {
  assert.equal(validateCustomId('my-button_123'), 'my-button_123');
});

test('validateCustomId rejects empty string', () => {
  assert.equal(validateCustomId(''), null);
});

test('validateCustomId rejects IDs exceeding 100 chars', () => {
  assert.equal(validateCustomId('a'.repeat(101)), null);
});

test('validateCustomId rejects IDs with invalid characters', () => {
  assert.equal(validateCustomId('has spaces'), null);
  assert.equal(validateCustomId('has.dots'), null);
  assert.equal(validateCustomId('has@special'), null);
});

test('validateCustomId rejects non-string input', () => {
  assert.equal(validateCustomId(null), null);
  assert.equal(validateCustomId(42), null);
});

// --- validateRequiredProps ---

test('validateRequiredProps returns true when all props present', () => {
  assert.equal(validateRequiredProps({ a: 1, b: 2, c: 3 }, ['a', 'b']), true);
});

test('validateRequiredProps returns false when props missing', () => {
  assert.equal(validateRequiredProps({ a: 1 }, ['a', 'b']), false);
});

test('validateRequiredProps returns false for non-object input', () => {
  assert.equal(validateRequiredProps(null, ['a']), false);
  assert.equal(validateRequiredProps('string', ['a']), false);
  assert.equal(validateRequiredProps(undefined, ['a']), false);
});

// --- validateUrl ---

test('validateUrl accepts valid URLs', () => {
  assert.equal(validateUrl('https://example.com'), 'https://example.com');
  assert.equal(validateUrl('http://localhost:3000/path'), 'http://localhost:3000/path');
});

test('validateUrl rejects invalid URLs', () => {
  assert.equal(validateUrl('not-a-url'), null);
  assert.equal(validateUrl(''), null);
});

test('validateUrl rejects non-string input', () => {
  assert.equal(validateUrl(null), null);
  assert.equal(validateUrl(42), null);
});

// --- validateRange ---

test('validateRange returns value when within range', () => {
  assert.equal(validateRange(5, 1, 10), 5);
  assert.equal(validateRange(1, 1, 10), 1);
  assert.equal(validateRange(10, 1, 10), 10);
});

test('validateRange returns null when outside range', () => {
  assert.equal(validateRange(0, 1, 10), null);
  assert.equal(validateRange(11, 1, 10), null);
});

test('validateRange returns null for non-number', () => {
  assert.equal(validateRange('5', 1, 10), null);
  assert.equal(validateRange(NaN, 1, 10), null);
});

// --- validateEnum ---

test('validateEnum returns value when in allowed list', () => {
  assert.equal(validateEnum('a', ['a', 'b', 'c']), 'a');
});

test('validateEnum returns null when not in allowed list', () => {
  assert.equal(validateEnum('d', ['a', 'b', 'c']), null);
});
