import test from 'node:test';
import assert from 'node:assert/strict';

import { Mutex } from '../../src/utils/mutex.js';

test('Mutex.runExclusive executes task and returns result', async () => {
  const result = await Mutex.runExclusive('test-basic', async () => 42);
  assert.equal(result, 42);
});

test('Mutex.runExclusive serializes concurrent tasks on same key', async () => {
  const order = [];

  const task1 = Mutex.runExclusive('test-serial', async () => {
    await new Promise(r => setTimeout(r, 30));
    order.push(1);
    return 'first';
  });

  const task2 = Mutex.runExclusive('test-serial', async () => {
    order.push(2);
    return 'second';
  });

  const [r1, r2] = await Promise.all([task1, task2]);
  assert.equal(r1, 'first');
  assert.equal(r2, 'second');
  assert.deepEqual(order, [1, 2]);
});

test('Mutex.runExclusive allows parallel tasks on different keys', async () => {
  const order = [];

  const task1 = Mutex.runExclusive('key-a', async () => {
    await new Promise(r => setTimeout(r, 20));
    order.push('a');
  });

  const task2 = Mutex.runExclusive('key-b', async () => {
    order.push('b');
  });

  await Promise.all([task1, task2]);
  // 'b' should complete before 'a' since they run in parallel and 'a' has a delay
  assert.equal(order[0], 'b');
  assert.equal(order[1], 'a');
});

test('Mutex.runExclusive propagates task errors', async () => {
  await assert.rejects(
    () => Mutex.runExclusive('test-error', async () => {
      throw new Error('task failed');
    }),
    { message: 'task failed' }
  );
});

test('Mutex.runExclusive continues after previous task error', async () => {
  // First task throws
  try {
    await Mutex.runExclusive('test-recover', async () => {
      throw new Error('first fails');
    });
  } catch {
    // expected
  }

  // Second task on same key should still run
  const result = await Mutex.runExclusive('test-recover', async () => 'recovered');
  assert.equal(result, 'recovered');
});
