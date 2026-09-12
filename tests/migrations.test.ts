/**
 * tests/migrations.test.ts
 * -----------------------------------------------------------------------------
 * Tests for the SceneMigrations registry + PersistenceManager migration
 * integration per directive §5 ("Persistence and JSON versioning").
 * -----------------------------------------------------------------------------
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MigrationRegistry } from '../src/migrations/SceneMigrations.js';
import { SceneStateManager } from '../src/core/SceneStateManager.js';
import { PersistenceManager, SceneLoadError } from '../src/core/PersistenceManager.js';
import { HeadlessRendererAdapter } from '../src/engine/HeadlessRendererAdapter.js';
import { configure, resetConfig, getConfig } from '../src/config/GameConfig.js';

function setup() {
  const renderer = new HeadlessRendererAdapter();
  const manager = new SceneStateManager({ renderer });
  const persistence = new PersistenceManager();
  return { manager, persistence };
}

test('MigrationRegistry walks a chain from v1 to v3', () => {
  const reg = new MigrationRegistry(3);
  reg.register(1, 2, (data) => ({ ...(data as object), version: 2, _v2: true }));
  reg.register(2, 3, (data) => ({ ...(data as object), version: 3, _v3: true }));
  const out = reg.migrate<{ version: number; _v2?: boolean; _v3?: boolean }>({ version: 1 });
  assert.equal(out.version, 3);
  assert.equal(out._v2, true);
  assert.equal(out._v3, true);
});

test('MigrationRegistry rejects unknown intermediate versions', () => {
  const reg = new MigrationRegistry(3);
  reg.register(2, 3, (data) => ({ ...(data as object), version: 3 }));
  assert.throws(() => reg.migrate({ version: 1 }), /no migration registered from version 1/);
});

test('MigrationRegistry rejects data newer than latest (downgrade unsupported)', () => {
  const reg = new MigrationRegistry(2);
  assert.throws(
    () => reg.migrate({ version: 5 }),
    /newer than latest/,
  );
});

test('MigrationRegistry requires each step to stamp the new version', () => {
  const reg = new MigrationRegistry(2);
  // Forgot to bump version — should throw.
  reg.register(1, 2, (data) => ({ ...(data as object) })); // still version: 1
  assert.throws(() => reg.migrate({ version: 1 }), /did not stamp version=2/);
});

test('PersistenceManager rejects unknown version when no migrations are registered', () => {
  const { manager, persistence } = setup();
  // No migrations are registered by default for v1, so a v99 file fails.
  assert.throws(() =>
    persistence.loadSceneFromJSON({
      version: 99,
      exportedAt: '2024-01-01T00:00:00.000Z',
      objects: [],
    }, manager),
  );
});

test('PersistenceManager runs migration when version differs from current', () => {
  // Use a fresh MigrationRegistry with latest=2 and a v1→v2 migration.
  // We bump the global config schemaVersion to 2 so the persistence layer
  // treats v2 as "current".
  const originalVersion = getConfig().schemaVersion;
  try {
    configure({ schemaVersion: 2 });
    const reg = new MigrationRegistry(2);
    reg.register(1, 2, (data) => ({
      ...(data as object),
      version: 2,
      // Simulate a schema change: rename 'assetType' was the same in v1 & v2,
      // but the migration could transform fields here. We add a marker.
      _migratedFromV1: true,
    }));
    const persistence = new PersistenceManager({ migrations: reg });
    const manager = new SceneStateManager({ renderer: new HeadlessRendererAdapter() });
    const v1Data = {
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      objects: [
        {
          uuid: '00000000-0000-4000-a000-0000000000bb',
          assetType: 'cube',
          transform: {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
          },
          metadata: { name: 'Migrated Cube' },
        },
      ],
    };
    const summary = persistence.loadSceneFromJSON(v1Data, manager);
    assert.equal(summary.loaded, 1);
    assert.equal(summary.schemaVersion, 2);
    assert.equal(manager.has('00000000-0000-4000-a000-0000000000bb'), true);
  } finally {
    resetConfig();
    assert.equal(getConfig().schemaVersion, originalVersion);
  }
});

test('atomic load throws SceneLoadError and leaves manager untouched', () => {
  const { manager, persistence } = setup();
  // Pre-populate to verify the registry is NOT touched on atomic failure.
  manager.registerObject({
    uuid: '00000000-0000-4000-a000-0000000000aa',
    assetType: 'cube',
    metadata: { name: 'Existing' },
  });
  const before = manager.getSnapshot();
  assert.equal(before.objectCount, 1);
  const badScene = {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: 'not-a-uuid',
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'Bad' },
      },
    ],
  };
  assert.throws(() => persistence.loadSceneFromJSON(badScene, manager), (err) => {
    assert.ok(err instanceof SceneLoadError);
    assert.equal((err as SceneLoadError).skipped.length, 1);
    return true;
  });
  // Manager state preserved.
  const after = manager.getSnapshot();
  assert.equal(after.objectCount, 1);
  assert.equal(manager.has('00000000-0000-4000-a000-0000000000aa'), true);
});

test('lenient load skips malformed entries but loads valid ones', () => {
  const { manager, persistence } = setup();
  const mixedScene = {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: '00000000-0000-4000-a000-0000000000c1',
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'OK' },
      },
      {
        uuid: 'nope',
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'Bad' },
      },
    ],
  };
  const summary = persistence.loadSceneFromJSON(mixedScene, manager, { mode: 'lenient' });
  assert.equal(summary.loaded, 1);
  assert.equal(summary.skipped.length, 1);
  assert.equal(manager.getObjectCount(), 1);
});

test('atomic load detects duplicate uuids within a scene file', () => {
  const { manager, persistence } = setup();
  const dupScene = {
    version: 1,
    exportedAt: '2024-01-01T00:00:00.000Z',
    objects: [
      {
        uuid: '00000000-0000-4000-a000-0000000000d1',
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'A' },
      },
      {
        uuid: '00000000-0000-4000-a000-0000000000d1', // same
        assetType: 'cube',
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
        metadata: { name: 'B' },
      },
    ],
  };
  assert.throws(() => persistence.loadSceneFromJSON(dupScene, manager), SceneLoadError);
  assert.equal(manager.getObjectCount(), 0, 'atomic mode must not partially load');
});

test('malformed envelope is rejected with a clear error', () => {
  const { manager, persistence } = setup();
  assert.throws(() => persistence.loadSceneFromJSON('not an object', manager), /is not an object/);
  assert.throws(
    () => persistence.loadSceneFromJSON({ objects: [] }, manager),
    /version must be a finite number/,
  );
  assert.throws(
    () => persistence.loadSceneFromJSON({ version: 1, objects: 'oops', exportedAt: 'x' }, manager),
    /objects must be an array/,
  );
});
