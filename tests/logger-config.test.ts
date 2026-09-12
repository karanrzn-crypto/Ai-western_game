/**
 * tests/logger-config.test.ts
 * -----------------------------------------------------------------------------
 * Tests for the Logger and GameConfig modules.
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Logger, LogLevel } from '../src/utils/Logger.js';
import { getConfig, configure, resetConfig } from '../src/config/GameConfig.js';

test('Logger emits only at-or-below its configured level', () => {
  const received: string[] = [];
  const sink = (entry: { level: string; message: string }) => {
    received.push(`${entry.level}:${entry.message}`);
  };
  const log = new Logger('test', 'warn', sink);
  log.debug('d');   // skipped
  log.info('i');    // skipped
  log.warn('w');    // emitted
  log.error('e');   // emitted
  assert.deepEqual(received, ['warn:w', 'error:e']);
});

test('Logger setLevel changes the threshold at runtime', () => {
  const received: string[] = [];
  const log = new Logger('test', 'silent', (e) => received.push(e.message));
  log.info('a'); // skipped
  log.setLevel('info');
  log.info('b'); // emitted
  assert.deepEqual(received, ['b']);
});

test('Logger.child() inherits the sink and level but prefixes scope', () => {
  const received: string[] = [];
  const log = new Logger('app', 'info', (e) => received.push(`${e.scope}:${e.message}`));
  const child = log.child('scene');
  child.info('hello');
  assert.deepEqual(received, ['app:scene:hello']);
});

test('GameConfig defaults are sensible', () => {
  resetConfig();
  const c = getConfig();
  assert.equal(c.schemaVersion, 1);
  assert.equal(c.scene.maxObjects, 10_000);
  assert.equal(c.debug, false);
  assert.equal(c.logging.level, 'info');
});

test('configure() shallow-merges at one level deep', () => {
  resetConfig();
  configure({ scene: { maxObjects: 5 } });
  const c = getConfig();
  assert.equal(c.scene.maxObjects, 5);
  // Other top-level keys untouched.
  assert.equal(c.schemaVersion, 1);
  assert.equal(c.debug, false);
});

test('configure() replaces primitives wholesale', () => {
  resetConfig();
  configure({ debug: true, schemaVersion: 2 });
  const c = getConfig();
  assert.equal(c.debug, true);
  assert.equal(c.schemaVersion, 2);
});

test('resetConfig() restores defaults', () => {
  configure({ debug: true, scene: { maxObjects: 1 } });
  resetConfig();
  const c = getConfig();
  assert.equal(c.debug, false);
  assert.equal(c.scene.maxObjects, 10_000);
});

// LogLevel is just a type — confirm the union compiles as expected.
test('LogLevel type union includes the expected levels', () => {
  const levels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];
  assert.equal(levels.length, 5);
});
