/**
 * MouseLookController — the single authority for "when does the mouse rotate
 * the camera". The game's contract:
 *
 *   - The camera rotates ONLY while the RIGHT mouse button is held (drag).
 *   - Releasing the right button stops the camera immediately.
 *   - Left/middle buttons never rotate the camera.
 *   - Pointer lock has NO influence: rotation is driven purely by
 *     right-button + drag, so a locked pointer without the right button
 *     held must not turn the camera either.
 *
 * The class is deliberately DOM-free: the demo feeds it pointer events
 * (button + client coordinates) and consumes the accumulated pixel delta
 * once per frame. That keeps the gating rules unit-testable headless.
 */

/** Only the right mouse button may drive the camera. */
export const MOUSE_LOOK_BUTTON = 2;

export interface MouseLookDelta {
  x: number;
  y: number;
}

export class MouseLookController {
  private dragging = false;
  private pendingX = 0;
  private pendingY = 0;
  private lastClientX = 0;
  private lastClientY = 0;
  private hasLastClient = false;

  /** True while the right button drag is live (camera may rotate). */
  get isDragging(): boolean {
    return this.dragging;
  }

  /**
   * Start a look drag. Returns true only for a fresh RIGHT-button press;
   * left/middle presses are ignored by design, and an already-running drag
   * is never restarted (a second press event cannot double-attach).
   */
  beginDrag(button: number, clientX = 0, clientY = 0): boolean {
    if (button !== MOUSE_LOOK_BUTTON || this.dragging) return false;
    this.dragging = true;
    this.pendingX = 0;
    this.pendingY = 0;
    this.lastClientX = clientX;
    this.lastClientY = clientY;
    this.hasLastClient = true;
    return true;
  }

  /**
   * Feed a pointer move. Accumulates the pixel delta ONLY while the right
   * button drag is live; without it, mouse movement is intentionally inert.
   */
  updateMove(clientX: number, clientY: number): void {
    if (!this.dragging || !this.hasLastClient) {
      // Keep the reference fresh even while inactive so the first frame of a
      // new drag never emits a jump from a stale coordinate.
      this.lastClientX = clientX;
      this.lastClientY = clientY;
      this.hasLastClient = true;
      return;
    }
    this.pendingX += clientX - this.lastClientX;
    this.pendingY += clientY - this.lastClientY;
    this.lastClientX = clientX;
    this.lastClientY = clientY;
  }

  /**
   * End the drag. Passing the button that went up keeps non-right releases
   * (e.g. a left click during the drag) from stopping the camera; passing
   * no button force-ends (element lost pointer capture, etc.).
   *
   * Deltas dragged while the button was held are KEPT and apply on the next
   * consume — a quick flick released inside the same frame must not lose
   * its rotation. New accumulation stops immediately (camera frozen).
   */
  endDrag(button?: number): boolean {
    if (!this.dragging) return false;
    if (button !== undefined && button !== MOUSE_LOOK_BUTTON) return false;
    this.dragging = false;
    this.hasLastClient = false;
    return true;
  }

  /** Drop everything (window blur, mode switch) — no stray delta survives. */
  cancel(): void {
    this.dragging = false;
    this.pendingX = 0;
    this.pendingY = 0;
    this.hasLastClient = false;
  }

  /**
   * Take the accumulated pixel delta since the last call (per frame).
   * Returns the final leftover once after the drag has ended, then zeros —
   * so releasing the button freezes the camera after that last consume.
   */
  consumeLookDelta(): MouseLookDelta {
    const delta = { x: this.pendingX, y: this.pendingY };
    this.pendingX = 0;
    this.pendingY = 0;
    return delta;
  }
}
