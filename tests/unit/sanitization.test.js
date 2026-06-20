import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeMarkdown,
  sanitizeInput,
  sanitizeMention,
  escapeHtml
} from '../../src/utils/sanitization.js';

// --- sanitizeMarkdown ---

test('sanitizeMarkdown escapes all markdown special characters', () => {
  const input = '*bold* _italic_ `code` [link](url) ||spoiler|| ~strike~';
  const result = sanitizeMarkdown(input);
  assert.equal(result.includes('\\*'), true);
  assert.equal(result.includes('\\_'), true);
  assert.equal(result.includes('\\`'), true);
  assert.equal(result.includes('\\['), true);
  assert.equal(result.includes('\\]'), true);
  assert.equal(result.includes('\\|'), true);
  assert.equal(result.includes('\\~'), true);
  // No unescaped markdown chars remain
  assert.ok(!result.match(/(?<!\\)\*/));
});

test('sanitizeMarkdown returns empty string for non-string input', () => {
  assert.equal(sanitizeMarkdown(null), '');
  assert.equal(sanitizeMarkdown(undefined), '');
  assert.equal(sanitizeMarkdown(42), '');
  assert.equal(sanitizeMarkdown({}), '');
});

test('sanitizeMarkdown returns same string when no special chars', () => {
  assert.equal(sanitizeMarkdown('hello world'), 'hello world');
});

// --- sanitizeInput ---

test('sanitizeInput trims whitespace', () => {
  assert.equal(sanitizeInput('  hello  '), 'hello');
});

test('sanitizeInput strips control characters', () => {
  assert.equal(sanitizeInput('hello\x00world'), 'helloworld');
  assert.equal(sanitizeInput('line\x1Fend'), 'lineend');
  assert.equal(sanitizeInput('del\x7Fchar'), 'delchar');
});

test('sanitizeInput enforces maxLength', () => {
  assert.equal(sanitizeInput('abcdefghij', 5), 'abcde');
});

test('sanitizeInput returns empty string for non-string input', () => {
  assert.equal(sanitizeInput(null), '');
  assert.equal(sanitizeInput(123), '');
  assert.equal(sanitizeInput(undefined), '');
});

test('sanitizeInput uses default maxLength of 2000', () => {
  const longStr = 'a'.repeat(3000);
  const result = sanitizeInput(longStr);
  assert.equal(result.length, 2000);
});

// --- sanitizeMention ---

test('sanitizeMention returns null for mention strings containing > (not in strip set)', () => {
  // The regex [<@!&#] does not strip >, so full Discord mentions yield null
  assert.equal(sanitizeMention('<@123456789012345678>'), null);
  assert.equal(sanitizeMention('<@!123456789012345678>'), null);
  assert.equal(sanitizeMention('<@&123456789012345678>'), null);
  assert.equal(sanitizeMention('<#123456789012345678>'), null);
});

test('sanitizeMention extracts ID when only recognized wrapper chars present', () => {
  // Without the closing >, the function can extract the ID
  assert.equal(sanitizeMention('<@123456789012345678'), '123456789012345678');
  assert.equal(sanitizeMention('@123456789012345678'), '123456789012345678');
});

test('sanitizeMention returns null for non-numeric content', () => {
  assert.equal(sanitizeMention('<@abc>'), null);
  assert.equal(sanitizeMention('not_a_mention'), null);
});

test('sanitizeMention returns the ID for plain numeric string', () => {
  assert.equal(sanitizeMention('123456789012345678'), '123456789012345678');
});

// --- escapeHtml ---

test('escapeHtml escapes all HTML special characters', () => {
  const input = '<script>alert("xss") & \'injection\'</script>';
  const result = escapeHtml(input);
  assert.ok(result.includes('&lt;'));
  assert.ok(result.includes('&gt;'));
  assert.ok(result.includes('&quot;'));
  assert.ok(result.includes('&amp;'));
  assert.ok(result.includes('&#039;'));
  assert.ok(!result.includes('<script>'));
});

test('escapeHtml returns empty string for non-string input', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '');
});

test('escapeHtml returns same string when no special chars', () => {
  assert.equal(escapeHtml('hello world'), 'hello world');
});
