import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTraceId,
  createInteractionTraceContext,
  runWithTraceContext,
  getTraceContext,
  getTraceId
} from '../../src/utils/traceContext.js';

// --- createTraceId ---

test('createTraceId generates a prefixed UUID-based ID', () => {
  const id = createTraceId();
  assert.ok(id.startsWith('trc_'));
  assert.ok(id.length > 10);
  assert.ok(!id.includes('-')); // dashes should be stripped
});

test('createTraceId accepts custom prefix', () => {
  const id = createTraceId('cmd');
  assert.ok(id.startsWith('cmd_'));
});

test('createTraceId generates unique IDs', () => {
  const ids = new Set(Array.from({ length: 100 }, () => createTraceId()));
  assert.equal(ids.size, 100);
});

// --- createInteractionTraceContext ---

test('createInteractionTraceContext creates context from interaction-like object', () => {
  const interaction = {
    id: '12345',
    type: 2,
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1' },
    isChatInputCommand: () => true,
    commandName: 'ping'
  };

  const ctx = createInteractionTraceContext(interaction);
  assert.ok(ctx.traceId.startsWith('trc_'));
  assert.equal(ctx.interactionId, '12345');
  assert.equal(ctx.guildId, 'guild-1');
  assert.equal(ctx.channelId, 'channel-1');
  assert.equal(ctx.userId, 'user-1');
  assert.equal(ctx.command, 'ping');
});

test('createInteractionTraceContext handles null interaction gracefully', () => {
  const ctx = createInteractionTraceContext(null);
  assert.ok(ctx.traceId);
  assert.equal(ctx.interactionId, null);
  assert.equal(ctx.guildId, null);
  assert.equal(ctx.command, null);
});

test('createInteractionTraceContext allows overrides', () => {
  const ctx = createInteractionTraceContext(null, { guildId: 'override-guild' });
  assert.equal(ctx.guildId, 'override-guild');
});

test('createInteractionTraceContext reads customId from button interactions', () => {
  const interaction = {
    id: '99',
    type: 3,
    guildId: null,
    channelId: null,
    user: null,
    isChatInputCommand: () => false,
    isButton: () => true,
    customId: 'ticket-close'
  };
  const ctx = createInteractionTraceContext(interaction);
  assert.equal(ctx.command, 'ticket-close');
});

// --- runWithTraceContext / getTraceContext / getTraceId ---

test('runWithTraceContext makes context available inside callback', async () => {
  const traceCtx = { traceId: 'trc_test123', guildId: 'g1' };
  
  await runWithTraceContext(traceCtx, () => {
    const retrieved = getTraceContext();
    assert.deepEqual(retrieved, traceCtx);
    assert.equal(getTraceId(), 'trc_test123');
  });
});

test('getTraceContext returns null outside of trace context', () => {
  assert.equal(getTraceContext(), null);
  assert.equal(getTraceId(), null);
});
