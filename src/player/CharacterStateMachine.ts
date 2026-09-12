/**
 * CharacterStateMachine — the single source of truth for the main character's
 * high-level state (Idle / Walk / Run / Sprint / Jump / Fall / Crouch / Dead /
 * Interacting). Transitions are evaluated from a plain context each tick so
 * the rules stay declarative, predictable, and testable; the animator and HUD
 * consume the resulting state.
 */

export type CharacterState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'crouch'
  | 'dead'
  | 'interacting';

export interface CharacterStateContext {
  /** Player is alive? `dead` overrides everything. */
  dead: boolean;
  grounded: boolean;
  /** Vertical velocity (m/s) — separates jump from fall while airborne. */
  verticalVelocity: number;
  /** Horizontal speed (m/s). */
  speed: number;
  /** Crouch is currently engaged (grounded only). */
  crouching: boolean;
  /** Sprint input accepted by the stamina system. */
  sprinting: boolean;
  /** An interaction is being performed (grounded, not moving). */
  interacting: boolean;
}

export interface CharacterStateThresholds {
  /** Speeds at/below this read as walk; above as run. */
  walkMax?: number;
  /** Speeds at/above this (with sprint input) read as sprint. */
  sprintMin?: number;
  /** Airborne below this vertical speed keeps the jump label. */
  jumpVerticalMin?: number;
}

const DEFAULT_THRESHOLDS: Required<CharacterStateThresholds> = {
  walkMax: 1.8,
  sprintMin: 8.5,
  jumpVerticalMin: 0.3,
};

export interface CharacterStateChangeEvent {
  from: CharacterState;
  to: CharacterState;
  /** Seconds the previous state was held. */
  duration: number;
}

export class CharacterStateMachine {
  private state: CharacterState = 'idle';
  private stateSeconds = 0;
  private crouchMoving = false;
  private readonly thresholds: Required<CharacterStateThresholds>;
  private readonly listeners: Array<(event: CharacterStateChangeEvent) => void> = [];

  constructor(thresholds: CharacterStateThresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  get current(): CharacterState { return this.state; }
  get secondsInState(): number { return this.stateSeconds; }

  isMoving(): boolean {
    return this.state === 'walk' || this.state === 'run' || this.state === 'sprint'
      || this.state === 'jump' || this.state === 'fall'
      || (this.state === 'crouch' && this.crouchMoving);
  }

  on(listener: (event: CharacterStateChangeEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  /** Force a state (respawn/death flows); bypasses rules but emits the event. */
  force(next: CharacterState): void {
    this.transitionTo(next);
  }

  /**
   * Evaluate the context and transition if needed. Transition rules, in
   * priority order:
   *   dead > interacting > airborne (jump/fall) > grounded ground-movement.
   * Dead is terminal — only force() (respawn) may leave it.
   */
  evaluate(context: CharacterStateContext): CharacterState {
    if (this.state === 'dead') return this.state; // terminal until force() (respawn)
    if (context.dead) {
      this.transitionTo('dead');
      return this.state;
    }
    if (context.interacting && context.grounded && context.speed < 0.2) {
      this.transitionTo('interacting');
      return this.state;
    }
    if (!context.grounded) {
      this.transitionTo(context.verticalVelocity > this.thresholds.jumpVerticalMin ? 'jump' : 'fall');
      return this.state;
    }
    if (context.crouching) {
      this.crouchMoving = context.speed > 0.2;
      this.transitionTo('crouch');
      return this.state;
    }
    if (context.speed < 0.2) {
      this.transitionTo('idle');
      return this.state;
    }
    if (context.sprinting && context.speed >= this.thresholds.sprintMin) {
      this.transitionTo('sprint');
      return this.state;
    }
    this.transitionTo(context.speed <= this.thresholds.walkMax ? 'walk' : 'run');
    return this.state;
  }

  private transitionTo(next: CharacterState): void {
    if (this.state === next) return;
    const event: CharacterStateChangeEvent = { from: this.state, to: next, duration: this.stateSeconds };
    this.state = next;
    this.stateSeconds = 0;
    for (const listener of this.listeners) listener(event);
  }

  /** Advance the in-state clock (call once per frame with the frame delta). */
  tick(deltaSeconds: number): void {
    this.stateSeconds += Math.max(0, deltaSeconds);
  }
}
