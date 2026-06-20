import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertAllowlistedIdentifier,
  quoteIdentifier
} from '../../src/utils/sqlIdentifiers.js';

// --- assertAllowlistedIdentifier ---

test('assertAllowlistedIdentifier returns identifier when valid and in allowlist', () => {
  const allowlist = new Set(['users', 'guilds', 'settings']);
  assert.equal(assertAllowlistedIdentifier('users', allowlist), 'users');
  assert.equal(assertAllowlistedIdentifier('guilds', allowlist), 'guilds');
});

test('assertAllowlistedIdentifier throws for non-string input', () => {
  const allowlist = new Set(['users']);
  assert.throws(
    () => assertAllowlistedIdentifier(null, allowlist),
    /must be a non-empty string/
  );
  assert.throws(
    () => assertAllowlistedIdentifier(123, allowlist),
    /must be a non-empty string/
  );
});

test('assertAllowlistedIdentifier throws for empty string', () => {
  const allowlist = new Set(['users']);
  assert.throws(
    () => assertAllowlistedIdentifier('', allowlist),
    /must be a non-empty string/
  );
  assert.throws(
    () => assertAllowlistedIdentifier('   ', allowlist),
    /must be a non-empty string/
  );
});

test('assertAllowlistedIdentifier throws for unsafe characters', () => {
  const allowlist = new Set(['users']);
  assert.throws(
    () => assertAllowlistedIdentifier('users; DROP TABLE', allowlist),
    /contains unsafe characters/
  );
  assert.throws(
    () => assertAllowlistedIdentifier('Users', allowlist),
    /contains unsafe characters/
  );
  assert.throws(
    () => assertAllowlistedIdentifier('user-name', allowlist),
    /contains unsafe characters/
  );
});

test('assertAllowlistedIdentifier throws for identifier not in allowlist', () => {
  const allowlist = new Set(['users', 'guilds']);
  assert.throws(
    () => assertAllowlistedIdentifier('secrets', allowlist),
    /not in the allowlist/
  );
});

test('assertAllowlistedIdentifier accepts underscore-prefixed identifiers', () => {
  const allowlist = new Set(['_internal']);
  assert.equal(assertAllowlistedIdentifier('_internal', allowlist), '_internal');
});

// --- quoteIdentifier ---

test('quoteIdentifier wraps identifier in double quotes', () => {
  assert.equal(quoteIdentifier('users'), '"users"');
  assert.equal(quoteIdentifier('guild_config'), '"guild_config"');
});
