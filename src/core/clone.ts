/**
 * src/core/clone.ts
 * -----------------------------------------------------------------------------
 * Structured deep-clone and deep-freeze utilities used by SceneStateManager.
 *
 * We rely on structuredClone (built into Node 17+, modern browsers, and
 * V8-based runtimes) for correctness on nested plain objects. For runtimes
 * that lack it, a JSON-based fallback is provided.
 * -----------------------------------------------------------------------------
 */

export function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  // Fallback — fine for our JSON-shaped data (no functions, no Dates).
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Best-effort deep freeze. Protects against accidental external mutation
 * of the canonical registry data.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      deepFreeze(v);
    }
  }
  return value;
}
