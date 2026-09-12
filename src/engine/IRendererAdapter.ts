/**
 * src/engine/IRendererAdapter.ts
 * -----------------------------------------------------------------------------
 * Renderer-agnostic interface that the SceneStateManager talks to.
 *
 * The directive requires that "the engine must re-render or update the
 * mesh position only when [updateObjectTransform] is called." To keep the
 * registry decoupled from any specific engine (Three.js, Babylon, Unity,
 * a headless test renderer), all engine interactions go through this
 * interface. The SceneStateManager calls `syncObject(change)` whenever
 * the registry mutates.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, ObjectMetadata, Transform } from '../core/types.js';

/**
 * A change notification that SceneStateManager dispatches to the renderer.
 * Exactly one variant is set per call. The renderer decides whether to
 * create / update / delete a mesh accordingly.
 */
export type RendererChange =
  | { kind: 'add'; definition: ObjectDefinition }
  | { kind: 'remove'; uuid: string }
  | { kind: 'transform'; uuid: string; transform: Transform }
  | { kind: 'metadata'; uuid: string; metadata: ObjectMetadata };

/**
 * The interface every renderer adapter must implement.
 */
export interface IRendererAdapter {
  /**
   * Apply a registry change to the live 3D scene. Called synchronously
   * from SceneStateManager; should never throw on missing objects
   * (treat as a no-op) — but MUST surface logic errors via console.
   */
  syncObject(change: RendererChange): void;

  /** Total number of currently-rendered objects. */
  getActiveObjectCount(): number;

  /** Optional: tear down GPU resources, webGL contexts, etc. */
  dispose?(): void;
}
