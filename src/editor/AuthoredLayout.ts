/**
 * src/editor/AuthoredLayout.ts
 * -----------------------------------------------------------------------------
 * The authored-layout snapshot: the exact transforms every building module's
 * layout table (StableLayout / SaloonLayout / BankLayout / SheriffLayout / …)
 * authored for the default map, captured at boot BEFORE a saved scene replaces
 * the registry.
 *
 * WHY THIS EXISTS (root-cause contract, not a workaround):
 *   The editor persists every transform mutation into localStorage. That is
 *   the feature — but any stray drag (or a save carried across builds) leaves
 *   a prop floating mid-air with no way back, because nothing remembered the
 *   authored pose. This class restores the SINGLE mutation funnel:
 *   SceneStateManager.updateObjectTransform — the same path the gizmo, the
 *   arrow keys and the numeric panel use — so a restore is indistinguishable
 *   from a hand edit (renderer sync, change log, autosave all fire).
 *
 * NOT a parallel registry:
 *   • it holds ONLY immutable transform snapshots keyed by uuid;
 *   • it never mutates anything itself — restores go through the manager;
 *   • names/metadata are deliberately NOT captured: a user rename ("my
 *     horse's stall") is a label worth keeping, a moved trough is not.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, Transform } from '../core/types.js';
import { SceneStateManager } from '../core/SceneStateManager.js';

const sameVec3 = (
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

const sameTransform = (a: Transform, b: Transform): boolean =>
  sameVec3(a.position, b.position) &&
  sameVec3(a.rotation, b.rotation) &&
  sameVec3(a.scale, b.scale);

export class AuthoredLayout {
  private readonly authored = new Map<string, Transform>();

  /** Replace the snapshot with the given definitions' transforms (cloned). */
  capture(defs: readonly Readonly<ObjectDefinition>[]): void {
    this.authored.clear();
    for (const def of defs) {
      const t = def.transform;
      this.authored.set(def.uuid, {
        position: { ...t.position },
        rotation: { ...t.rotation },
        scale: { ...t.scale },
      });
    }
  }

  get size(): number {
    return this.authored.size;
  }

  /** True when an authored transform exists for the uuid. */
  has(uuid: string): boolean {
    return this.authored.has(uuid);
  }

  /** Authored transform clone, or undefined for unknown uuids. */
  getTransform(uuid: string): Transform | undefined {
    const t = this.authored.get(uuid);
    if (!t) return undefined;
    return {
      position: { ...t.position },
      rotation: { ...t.rotation },
      scale: { ...t.scale },
    };
  }

  /** True when the definition's transform deviates from the authored one. */
  isModified(def: Readonly<ObjectDefinition>): boolean {
    const authored = this.authored.get(def.uuid);
    if (!authored) return false;
    return !sameTransform(def.transform, authored);
  }

  /**
   * Restore ONE object to its authored transform through the manager's
   * official mutation funnel. Returns false when the uuid has no authored
   * entry or the manager does not know the object.
   */
  restore(manager: SceneStateManager, uuid: string): boolean {
    const authored = this.authored.get(uuid);
    if (!authored) return false;
    if (!manager.getObject(uuid)) return false;
    manager.updateObjectTransform(uuid, {
      position: { ...authored.position },
      rotation: { ...authored.rotation },
      scale: { ...authored.scale },
    });
    return true;
  }

  /**
   * Restore EVERY deviating object. Objects already at their authored
   * transform are skipped (updateObjectTransform would dedupe them anyway,
   * but skipping keeps the returned count honest). Returns the number of
   * objects actually restored.
   */
  restoreAll(manager: SceneStateManager): number {
    let restored = 0;
    for (const [uuid, authored] of this.authored) {
      const current = manager.getObject(uuid);
      if (!current) continue;
      if (!sameTransform(current.transform, authored)) {
        manager.updateObjectTransform(uuid, {
          position: { ...authored.position },
          rotation: { ...authored.rotation },
          scale: { ...authored.scale },
        });
        restored += 1;
      }
    }
    return restored;
  }
}
