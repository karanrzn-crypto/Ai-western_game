/**
 * tests/event-bus.test.ts
 * -----------------------------------------------------------------------------
 * Tests for the EventBus minimal typed emitter.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/EventBus.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';
import { SceneStateManager } from '../src/core/SceneStateManager.js';

test('on() returns an unsubscribe function', () => {
  const bus = new EventBus();
  let calls = 0;
  const off = bus.on('object:registered', () => { calls++; });
  assert.equal(typeof off, 'function');
  bus.emit('object:registered', { definition: undefined as never });
  assert.equal(calls, 1);
  off();
  bus.emit('object:registered', { definition: undefined as never });
  assert.equal(calls, 1);
});

test('off() removes a specific handler', () => {
  const bus = new EventBus();
  let a = 0, b = 0;
  const ha = () => { a++; };
  const hb = () => { b++; };
  bus.on('object:unregistered', ha);
  bus.on('object:unregistered', hb);
  bus.emit('object:unregistered', { uuid: 'x' });
  assert.equal(a, 1);
  assert.equal(b, 1);
  bus.off('object:unregistered', ha);
  bus.emit('object:unregistered', { uuid: 'x' });
  assert.equal(a, 1);
  assert.equal(b, 2);
});

test('handler errors are isolated — other handlers still run', () => {
  const bus = new EventBus();
  let calls = 0;
  bus.on('object:transform-updated', () => { throw new Error('boom'); });
  bus.on('object:transform-updated', () => { calls++; });
  bus.emit('object:transform-updated', {
    uuid: 'x',
    transform: undefined as never,
    previous: undefined as never,
  });
  assert.equal(calls, 1);
});

test('listenerCount reports subscriber count', () => {
  const bus = new EventBus();
  assert.equal(bus.listenerCount('scene:cleared'), 0);
  bus.on('scene:cleared', () => {});
  bus.on('scene:cleared', () => {});
  assert.equal(bus.listenerCount('scene:cleared'), 2);
});

test('SceneStateManager emits lifecycle events', () => {
  const bus = new EventBus();
  const manager = new SceneStateManager({
    renderer: new HeadlessRendererAdapter(),
    events: bus,
  });
  const events: string[] = [];
  bus.on('object:registered', () => events.push('registered'));
  bus.on('object:unregistered', () => events.push('unregistered'));
  bus.on('object:transform-updated', () => events.push('transformed'));
  bus.on('scene:cleared', () => events.push('cleared'));

  const def = manager.registerObject({ assetType: 'cube' });
  manager.updateObjectTransform(def.uuid, { position: { x: 5 } });
  manager.unregisterObject(def.uuid);
  manager.clear(); // empty clear → no event
  assert.deepEqual(events, ['registered', 'transformed', 'unregistered']);
});

test('handlers can unsubscribe during dispatch without skipping siblings', () => {
  const bus = new EventBus();
  const log: number[] = [];
  const off2 = bus.on('scene:loaded', () => { log.push(2); });
  bus.on('scene:loaded', () => {
    log.push(1);
    off2();
  });
  bus.emit('scene:loaded', { loaded: 0, skipped: 0 });
  // handler 1 ran first, unsubscribed handler 2, but the snapshot copy
  // already had handler 2 — so it still ran.
  assert.deepEqual(log.sort(), [1, 2]);
});
