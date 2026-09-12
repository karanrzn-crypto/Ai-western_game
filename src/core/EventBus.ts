/**
 * src/core/EventBus.ts
 * -----------------------------------------------------------------------------
 * Tiny typed event bus.
 *
 * Used by SceneStateManager to broadcast lifecycle changes (object:registered,
 * scene:loaded, etc.) so future systems (UI, audio, gameplay, debug overlay)
 * can react WITHOUT directly depending on the manager.
 *
 * Design rules:
 *  - Synchronous dispatch. No queue, no async. Handlers run inline during
 *    `emit()`. This keeps ordering predictable.
 *  - Handlers receive a typed payload object (not raw args) so new fields
 *    can be added without breaking existing subscribers.
 *  - Errors in one handler do NOT prevent other handlers from running, and
 *    do NOT propagate back to the emitter. They are reported through the
 *    logger.
 *  - `on()` returns an unsubscribe function — the smallest ergonomic API.
 *  - No wildcards, no namespaces. Add them only when there's a concrete
 *    need.
 * -----------------------------------------------------------------------------
 */

import { logger } from '../utils/Logger.js';

export interface SceneEvents {
  'object:registered': { definition: Readonly<import('./types.js').ObjectDefinition> };
  'object:unregistered': { uuid: string };
  'object:transform-updated': {
    uuid: string;
    transform: import('./types.js').Transform;
    previous: import('./types.js').Transform;
  };
  'object:metadata-updated': {
    uuid: string;
    metadata: import('./types.js').ObjectMetadata;
  };
  'scene:cleared': { count: number };
  'scene:loaded': { loaded: number; skipped: number };
  'scene:exported': { count: number };
}

export type EventName = keyof SceneEvents;
export type Handler<K extends EventName> = (payload: SceneEvents[K]) => void;

export class EventBus {
  private readonly handlers = new Map<EventName, Set<Handler<EventName>>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends EventName>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<EventName>);
    return () => this.off(event, handler);
  }

  /** Unsubscribe. No-op if the handler wasn't registered. */
  off<K extends EventName>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<EventName>);
  }

  /** Dispatch an event to all subscribers. Handler errors are isolated. */
  emit<K extends EventName>(event: K, payload: SceneEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return;
    // Copy to a snapshot so handlers can unsubscribe during dispatch.
    const snapshot = [...set];
    for (const handler of snapshot) {
      try {
        (handler as Handler<K>)(payload);
      } catch (err) {
        logger.error('event handler threw', {
          event,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /** Remove all subscribers. Mostly useful in tests. */
  clear(): void {
    this.handlers.clear();
  }

  /** Number of subscribers for an event — handy in tests. */
  listenerCount(event: EventName): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
