/**
 * GameModeController — the camera-ownership state machine.
 *
 * Regression coverage for the Creative→Edit camera bug and the ownership
 * matrix required by the camera-revision spec:
 *
 *   • Play     → Edit → Play      — gameplay rig reconnects (unchanged path).
 *   • Creative → Edit → Play      — the camera NEVER snaps to the player on
 *                                   the edit exit; it resumes the fly session
 *                                   and only returns via the explicit F.
 *   • Creative → Edit → Creative  — the fly session resumes its saved
 *                                   yaw/pitch/pose with zero jump cut.
 *
 * Every scenario asserts the delegate hooks (the wiring's contract) AND the
 * derived camera owner, so each path's ownership is explicit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { GameModeController } from '../src/index.js';
import type { CameraOwner, CreativeAttachSource, EditOrigin, GameMode, PlayReturnSource } from '../src/index.js';

interface LogEntry {
  kind: 'play' | 'creative' | 'edit' | 'changed';
  source?: PlayReturnSource | CreativeAttachSource;
  from?: EditOrigin;
  mode?: GameMode;
  previous?: GameMode;
}

function makeHarness() {
  const log: LogEntry[] = [];
  const modes = new GameModeController({
    delegate: {
      onPlayCameraReconnect: (source) => log.push({ kind: 'play', source }),
      onCreativeCameraAttach: (source) => log.push({ kind: 'creative', source }),
      onEditEnter: (from) => log.push({ kind: 'edit', from }),
      onModeChanged: (mode, previous) => log.push({ kind: 'changed', mode, previous }),
    },
  });
  return { modes, log };
}

function owners(modes: GameModeController): CameraOwner {
  return modes.getCameraOwner();
}

test('MODES: boots in play mode owned by the gameplay camera', () => {
  const { modes } = makeHarness();
  assert.equal(modes.getMode(), 'play');
  assert.equal(owners(modes), 'gameplay');
  assert.equal(modes.isPlay(), true);
});

test('MODES: Play → Edit → Play — the normal path still reconnects the gameplay camera', () => {
  const { modes, log } = makeHarness();

  assert.equal(modes.enterEdit(), true);
  assert.equal(modes.getMode(), 'edit');
  assert.equal(owners(modes), 'edit', 'edit owns (parks) the camera');
  assert.deepEqual(log, [
    { kind: 'edit', from: 'play' },
    { kind: 'changed', mode: 'edit', previous: 'play' },
  ]);

  assert.equal(modes.exitEdit(), true);
  assert.equal(modes.getMode(), 'play');
  assert.equal(owners(modes), 'gameplay', 'back to the gameplay rig — snap behind the player');
  // The wiring MUST reconnect the gameplay camera on this path (Play→Edit→Play).
  assert.deepEqual(log.slice(2), [
    { kind: 'play', source: 'edit-exit' },
    { kind: 'changed', mode: 'play', previous: 'edit' },
  ]);
});

test('MODES: Creative → Edit → exit does NOT reconnect the gameplay camera (the bug)', () => {
  const { modes, log } = makeHarness();

  assert.equal(modes.toggleCreative(), true);
  assert.equal(modes.isCreative(), true);
  assert.equal(owners(modes), 'creative-flight');
  assert.deepEqual(log[0], { kind: 'creative', source: 'play-toggle' },
    'entering creative from play attaches the fly camera');

  assert.equal(modes.enterEdit(), true);
  assert.equal(modes.getEditOrigin(), 'creative', 'the edit session remembers its origin');
  assert.equal(owners(modes), 'edit');

  // THE FIX: exiting edit goes back to CREATIVE — no play-camera reconnect.
  assert.equal(modes.exitEdit(), true);
  assert.equal(modes.isCreative(), true);
  assert.equal(owners(modes), 'creative-flight');
  assert.equal(log.some((entry) => entry.kind === 'play'),
    false, 'no gameplay reconnect anywhere in Creative→Edit→exit');
  assert.deepEqual(log.at(-2), { kind: 'creative', source: 'edit-resume' },
    'the fly session RESUMES (saved yaw/pitch), it never re-derives from the player');
});

test('MODES: Creative → Edit → Play — the camera returns to the player only via explicit F', () => {
  const { modes, log } = makeHarness();

  modes.toggleCreative();
  modes.enterEdit();
  modes.exitEdit(); // → creative (resumed), camera still NOT on the player
  assert.equal(modes.isCreative(), true);

  // The user's own action — F — is the ONLY path that returns the camera.
  assert.equal(modes.toggleCreative(), true);
  assert.equal(modes.isPlay(), true);
  assert.equal(owners(modes), 'gameplay');
  const playEntries = log.filter((entry) => entry.kind === 'play');
  assert.deepEqual(playEntries, [{ kind: 'play', source: 'creative-exit' }],
    'exactly one reconnect, and only after the user pressed F');
});

test('MODES: Creative → Edit → Creative — resume carries the session, not a fresh begin', () => {
  const { modes, log } = makeHarness();

  modes.toggleCreative();
  modes.enterEdit();
  assert.equal(modes.exitEdit(), true);
  assert.equal(modes.isCreative(), true);
  assert.deepEqual(log.filter((entry) => entry.kind === 'creative'), [
    { kind: 'creative', source: 'play-toggle' },
    { kind: 'creative', source: 'edit-resume' },
  ]);
});

test('MODES: F inside edit mode is rejected — no creative leak from the editor', () => {
  const { modes, log } = makeHarness();
  modes.enterEdit();
  assert.equal(modes.toggleCreative(), false, 'toggleCreative is a no-op while editing');
  assert.equal(modes.getMode(), 'edit');
  assert.equal(log.filter((entry) => entry.kind === 'changed').length, 1,
    'no extra transition fired');
});

test('MODES: enterEdit while editing / exitEdit while playing are no-ops', () => {
  const { modes, log } = makeHarness();
  assert.equal(modes.exitEdit(), false);
  assert.equal(modes.enterEdit(), true);
  assert.equal(modes.enterEdit(), false);
  assert.equal(modes.getEditOrigin(), 'play');
  assert.equal(modes.exitEdit(), true);
  // Exactly: edit-enter, changed, play-reconnect, changed.
  assert.equal(log.length, 4);
});

test('MODES: edit-origin flips back to play for play-origin sessions', () => {
  const { modes } = makeHarness();
  modes.enterEdit();
  modes.exitEdit();
  assert.equal(modes.getEditOrigin(), 'play', 'origin is preserved after the session closed');
  // A fresh Creative→Edit session records its own origin.
  modes.toggleCreative();
  modes.enterEdit();
  assert.equal(modes.getEditOrigin(), 'creative');
  modes.exitEdit();
  assert.equal(modes.isCreative(), true);
});
