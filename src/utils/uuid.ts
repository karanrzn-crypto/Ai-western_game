/**
 * src/utils/uuid.ts
 * -----------------------------------------------------------------------------
 * UUID v4 generator with cross-session persistence.
 *
 * The directive states: "The uuid must persist across sessions." This module
 * produces RFC 4122 v4 UUIDs using the native crypto API where available
 * (browser, Node 19+), falling back to a polyfill for older runtimes.
 * -----------------------------------------------------------------------------
 */

/**
 * Generate a v4 UUID.
 * Uses `globalThis.crypto.randomUUID()` when available (modern browsers &
 * Node ≥ 19). Falls back to a manual implementation backed by
 * `crypto.getRandomValues`.
 */
export function generateUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return polyfillUUIDv4();
}

/**
 * Manual v4 UUID using getRandomValues.
 * Handles older Node versions and edge runtimes that lack randomUUID().
 */
function polyfillUUIDv4(): string {
  const c = globalThis.crypto as Crypto | undefined;
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    // Math.random fallback (last resort — not cryptographically secure).
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC 4122 §4.4: set version (4) and variant (10xxxxxx).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
}

/**
 * Validate that a string is a well-formed v4 UUID.
 * Permissive — accepts both lowercase and uppercase hex.
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
