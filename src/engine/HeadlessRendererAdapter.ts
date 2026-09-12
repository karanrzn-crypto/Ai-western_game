/**
 * src/engine/HeadlessRendererAdapter.ts
 * -----------------------------------------------------------------------------
 * IRendererAdapter with NO 3D engine behind it.
 *
 * Useful for:
 *   - Unit tests of SceneStateManager that should not depend on WebGL.
 *   - Server-side / Node builds that need to run the registry headlessly.
 *   - Logging/auditing: tracks every change in an in-memory array.
 * -----------------------------------------------------------------------------
 */

import type { IRendererAdapter, RendererChange } from './IRendererAdapter.js';

export interface HeadlessChangeRecord {
  /** Monotonic sequence number for ordering. */
  seq: number;
  change: RendererChange;
  at: string; // ISO timestamp
}

export class HeadlessRendererAdapter implements IRendererAdapter {
  private readonly activeUUIDs = new Set<string>();
  private readonly log: HeadlessChangeRecord[] = [];
  private seq = 0;

  syncObject(change: RendererChange): void {
    switch (change.kind) {
      case 'add':
        this.activeUUIDs.add(change.definition.uuid);
        break;
      case 'remove':
        this.activeUUIDs.delete(change.uuid);
        break;
      case 'transform':
        // no-op — uuid remains active
        break;
      case 'metadata':
        // no-op
        break;
    }
    this.log.push({ seq: this.seq++, change, at: new Date().toISOString() });
  }

  getActiveObjectCount(): number {
    return this.activeUUIDs.size;
  }

  getActiveUUIDs(): readonly string[] {
    return [...this.activeUUIDs];
  }

  /** Full audit log — useful for assertion-based tests. */
  getChangeLog(): readonly HeadlessChangeRecord[] {
    return this.log;
  }

  /** Clear the audit log (does not touch the active uuid set). */
  clearLog(): void {
    this.log.length = 0;
  }
}
