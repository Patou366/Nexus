import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration } from '../../src/utils/helpers.js';

test('formatDuration returns "0s" for negative values', () => {
  assert.equal(formatDuration(-1), '0s');
  assert.equal(formatDuration(-1000), '0s');
});

test('formatDuration returns "0s" for zero', () => {
  assert.equal(formatDuration(0), '0s');
});

test('formatDuration formats seconds only', () => {
  assert.equal(formatDuration(5000), '5s');
  assert.equal(formatDuration(59000), '59s');
});

test('formatDuration formats minutes and seconds', () => {
  assert.equal(formatDuration(90000), '1m 30s');
  assert.equal(formatDuration(60000), '1m');
});

test('formatDuration formats hours, minutes, and seconds', () => {
  assert.equal(formatDuration(3661000), '1h 1m 1s');
  assert.equal(formatDuration(3600000), '1h');
});

test('formatDuration formats days', () => {
  assert.equal(formatDuration(86400000), '1d');
  assert.equal(formatDuration(90061000), '1d 1h 1m 1s');
});

test('formatDuration handles sub-second values', () => {
  assert.equal(formatDuration(500), '0s');
  assert.equal(formatDuration(999), '0s');
});
