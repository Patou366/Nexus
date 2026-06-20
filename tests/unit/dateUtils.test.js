import test from 'node:test';
import assert from 'node:assert/strict';

import { getMonthName } from '../../src/utils/dateUtils.js';

test('getMonthName returns correct month abbreviation for valid months', () => {
  assert.equal(getMonthName(1), 'Jan');
  assert.equal(getMonthName(6), 'Jun');
  assert.equal(getMonthName(12), 'Dec');
});

test('getMonthName returns "Invalid Month" for out-of-range values', () => {
  assert.equal(getMonthName(0), 'Invalid Month');
  assert.equal(getMonthName(13), 'Invalid Month');
  assert.equal(getMonthName(-1), 'Invalid Month');
});

test('getMonthName returns "Invalid Month" for non-integer input', () => {
  assert.equal(getMonthName(undefined), 'Invalid Month');
  assert.equal(getMonthName(null), 'Invalid Month');
});
