/**
 * InputBindings — remappable action-map layer between raw keyboard codes and
 * game actions. The controller and demo never hard-code key codes; adding
 * rebinding UI later only needs to call bind()/unbind().
 */

export type GameAction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'interact'
  | 'cameraToggle'
  | 'creativeToggle'
  | 'respawn'
  | 'debugDamage'
  | 'debugHeal';

export type InputSnapshot = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
};

export const DEFAULT_KEY_BINDINGS: Readonly<Record<GameAction, readonly string[]>> = {
  forward: ['KeyW'],
  backward: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
  interact: ['KeyE'],
  cameraToggle: ['KeyV'],
  // Development-mode fly camera toggle. F is free in play mode (in EDIT mode
  // the InputBindings are disabled entirely and F belongs to the editor's
  // rotate shortcut), so there is no binding conflict.
  creativeToggle: ['KeyF'],
  respawn: ['KeyR'],
  // Debug hooks for exercising Health/Death without combat (Part 2).
  debugDamage: ['KeyH'],
  debugHeal: ['KeyJ'],
};

interface KeyEventLike {
  code: string;
  repeat?: boolean;
  preventDefault?: () => void;
}
interface EventTargetLike {
  addEventListener(type: 'keydown', listener: (event: KeyEventLike) => void): void;
  addEventListener(type: 'keyup', listener: (event: KeyEventLike) => void): void;
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyEventLike) => void): void;
  removeEventListener(type: 'keyup', listener: (event: KeyEventLike) => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
}

/** Keyboard → action map with edge (just-pressed) detection and enable flag. */
export class InputBindings {
  private readonly codesByAction = new Map<GameAction, Set<string>>();
  private readonly downCodes = new Set<string>();
  private readonly pressedActions = new Set<GameAction>();
  private enabled = true;
  private readonly target?: EventTargetLike;

  constructor(target?: EventTargetLike) {
    for (const action of Object.keys(DEFAULT_KEY_BINDINGS) as GameAction[]) {
      this.codesByAction.set(action, new Set(DEFAULT_KEY_BINDINGS[action]));
    }
    this.target = target;
  }

  /** Attach keyboard listeners; returns a detach function. */
  attach(): () => void {
    const target = this.target;
    if (!target) return () => undefined;
    const onKeyDown = (event: KeyEventLike): void => {
      if (!this.enabled) return;
      const action = this.actionOf(event.code);
      if (!action) return;
      if (!event.repeat) this.pressedActions.add(action);
      this.downCodes.add(event.code);
      // Bound play keys must not trigger browser defaults (Space scroll,
      // Ctrl+key combos) while the game owns them.
      if (typeof event.preventDefault === 'function') event.preventDefault();
    };
    const onKeyUp = (event: KeyEventLike): void => { this.downCodes.delete(event.code); };
    const onBlur = (): void => { this.downCodes.clear(); };
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.downCodes.clear();
      this.pressedActions.clear();
    }
  }

  isEnabled(): boolean { return this.enabled; }

  bind(action: GameAction, code: string): void {
    this.codesByAction.get(action)?.add(code);
  }

  unbind(action: GameAction, code: string): void {
    this.codesByAction.get(action)?.delete(code);
  }

  getBindings(action: GameAction): string[] {
    return [...(this.codesByAction.get(action) ?? [])];
  }

  actionOf(code: string): GameAction | null {
    for (const [action, codes] of this.codesByAction) if (codes.has(code)) return action;
    return null;
  }

  isDown(action: GameAction): boolean {
    const codes = this.codesByAction.get(action);
    if (!codes) return false;
    for (const code of codes) if (this.downCodes.has(code)) return true;
    return false;
  }

  /** True exactly once per physical key press; consume to act on edges. */
  consumePressed(action: GameAction): boolean {
    if (!this.pressedActions.has(action)) return false;
    this.pressedActions.delete(action);
    return true;
  }

  clearFrameEdges(): void {
    this.pressedActions.clear();
  }

  /** Aggregated WASD + sprint snapshot for PlayerController.setInput. */
  getMoveInput(): InputSnapshot {
    return {
      forward: this.isDown('forward'),
      backward: this.isDown('backward'),
      left: this.isDown('left'),
      right: this.isDown('right'),
      sprint: this.isDown('sprint'),
    };
  }
}
