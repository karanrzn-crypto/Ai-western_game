/**
 * InteractionSystem — generic foundation for interacting with world objects
 * (doors, NPCs, chests, items...). Objects implement the tiny `Interactable`
 * surface; the system handles detection (range + optional facing preference),
 * prompt reporting, and dispatch. No per-object system needed later.
 */
import type { Vec3 } from '../core/types.js';

export interface Interactable {
  /** Stable identifier (usually the managed object uuid). */
  uuid: string;
  /** HUD prompt text, e.g. "Inspect crate". */
  label: string;
  /** World position provider (kept as a function so objects can move). */
  getPosition(): Vec3;
  /** Interaction radius; defaults to the system default. */
  range?: number;
  /** Optional gate (openable only when unlocked, alive, ...). */
  canInteract?(): boolean;
  /** Invoked by tryInteract(). */
  onInteract(): void;
}

export interface InteractionSystemOptions {
  defaultRange?: number;
  /** How strongly facing the candidate matters, 0 = pure distance. */
  facingWeight?: number;
  /** Fired whenever the current best candidate changes (HUD prompt). */
  onPromptChange?: (interactable: Interactable | null) => void;
}

export class InteractionSystem {
  private readonly interactables = new Map<string, Interactable>();
  private readonly defaultRange: number;
  private readonly facingWeight: number;
  private readonly onPromptChange?: (interactable: Interactable | null) => void;
  private current: Interactable | null = null;
  /** The label text the HUD last rendered for `current`. Doors expose a LIVE
   * label getter (Open ↔ Close flips the instant E is pressed) — the prompt
   * must re-render when the TEXT changes even though the candidate object
   * itself stayed the same, or the HUD would advertise a stale action. */
  private renderedLabel: string | null = null;

  constructor(options: InteractionSystemOptions = {}) {
    this.defaultRange = Math.max(0.1, options.defaultRange ?? 2.6);
    this.facingWeight = Math.max(0, options.facingWeight ?? 0.5);
    this.onPromptChange = options.onPromptChange;
  }

  register(interactable: Interactable): void {
    this.interactables.set(interactable.uuid, interactable);
  }

  unregister(uuid: string): void {
    if (this.interactables.delete(uuid) && this.current?.uuid === uuid) this.setCurrent(null);
  }

  clear(): void {
    this.interactables.clear();
    this.setCurrent(null);
  }

  get size(): number { return this.interactables.size; }

  /**
   * Re-evaluate the best candidate. `facing` is the player's forward direction
   * (normalized, horizontal) — candidates the player looks at are preferred by
   * `facingWeight`; pass null to rank by distance only.
   */
  update(playerPosition: Vec3, facing?: Vec3 | null): Interactable | null {
    let best: Interactable | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const interactable of this.interactables.values()) {
      if (interactable.canInteract && !interactable.canInteract()) continue;
      const position = interactable.getPosition();
      const dx = position.x - playerPosition.x;
      const dy = position.y - playerPosition.y;
      const dz = position.z - playerPosition.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distance > (interactable.range ?? this.defaultRange)) continue;
      let score = distance;
      if (facing && distance > 1e-4) {
        const dot = (dx * facing.x + dy * facing.y + dz * facing.z) / distance;
        score -= dot * this.facingWeight;
      }
      if (score < bestScore) {
        bestScore = score;
        best = interactable;
      }
    }
    this.setCurrent(best);
    return this.current;
  }

  /** Run the current candidate's interaction; returns false when nothing is in range. */
  tryInteract(): boolean {
    if (!this.current) return false;
    if (this.current.canInteract && !this.current.canInteract()) return false;
    this.current.onInteract();
    return true;
  }

  getCurrent(): Readonly<Interactable> | null {
    return this.current;
  }

  private setCurrent(next: Interactable | null): void {
    const nextLabel = next ? next.label : null;
    // Same candidate AND unchanged label → nothing to re-render. A changed
    // label on the SAME candidate (door toggled in place) must re-render.
    if (this.current === next && this.renderedLabel === nextLabel) return;
    this.current = next;
    this.renderedLabel = nextLabel;
    this.onPromptChange?.(next);
  }
}
