/**
 * GameModeController — the SINGLE owner of "who owns the camera right now".
 *
 * The game has three modes and exactly one camera. This state machine makes
 * camera ownership EXPLICIT instead of scattered `if (creative && !edit)`
 * conditionals, and it fixes the Creative→Edit→Play regression:
 *
 *   ┌──────────┬──────────────────────────────┬────────────────────────────┐
 *   │ Mode     │ Camera owner                 │ Camera behaviour           │
 *   ├──────────┼──────────────────────────────┼────────────────────────────┤
 *   │ play     │ gameplay rig (TP/FP/ride)    │ follows the player         │
 *   │ creative │ CreativeFlightController     │ free fly, frozen player    │
 *   │ edit     │ NOBODY (parked)              │ frozen exactly in place    │
 *   └──────────┴──────────────────────────────┴────────────────────────────┘
 *
 * TRANSITION CONTRACT:
 *
 *   • enterEdit() records WHERE the edit session started (editOrigin). The
 *     camera is parked — it never snaps, glides or re-derives. Whatever a
 *     creative session (or gameplay) left on screen stays on screen.
 *   • exitEdit() returns to the mode the session CAME FROM:
 *       – play-origin     → delegate.onPlayCameraReconnect('edit-exit'):
 *                           the gameplay rig re-snaps behind the player (the
 *                           long-standing Play→Edit→Play behaviour, kept).
 *       – creative-origin → delegate.onCreativeCameraAttach('edit-resume'):
 *                           the fly session RESUMES its saved yaw/pitch/pose
 *                           with zero jump cut. The camera only ever returns
 *                           to the player when the USER presses F themselves.
 *   • toggleCreative() is the explicit F path: play→creative attaches the
 *     fly camera from the current gameplay pose; creative→play reconnects
 *     the gameplay rig (the user's own "back to the play camera" action).
 *
 * The controller holds NO game references — every side effect goes through
 * the delegate, so the machine stays pure and fully unit-testable (see
 * tests/game-mode-controller.test.ts for the ownership matrix).
 */

/** The three top-level game modes. */
export type GameMode = 'play' | 'creative' | 'edit';

/** Where the CURRENT edit session was entered from (play | creative). */
export type EditOrigin = Exclude<GameMode, 'edit'>;

/** Who is allowed to move the camera in the current mode. */
export type CameraOwner = 'gameplay' | 'creative-flight' | 'edit';

/** Why the creative fly camera (re)attached — decides begin() vs resume(). */
export type CreativeAttachSource = 'play-toggle' | 'edit-resume';

/** Why the gameplay camera reconnected — decides status messages. */
export type PlayReturnSource = 'creative-exit' | 'edit-exit';

export interface GameModeDelegate {
  /** Gameplay rig takes the camera back: third person re-snaps behind the
   *  player, first person re-derives the eye. */
  onPlayCameraReconnect(source: PlayReturnSource): void;
  /** Creative fly takes the camera: 'play-toggle' derives the look direction
   *  from the player (begin), 'edit-resume' continues the saved session. */
  onCreativeCameraAttach(source: CreativeAttachSource): void;
  /** Edit parked the camera — it must not move until ownership changes. */
  onEditEnter(from: EditOrigin): void;
  /** Fires after EVERY completed transition (HUD/hint mirror lives here). */
  onModeChanged(mode: GameMode, previous: GameMode): void;
}

export interface GameModeOptions {
  delegate: GameModeDelegate;
}

export class GameModeController {
  private mode: GameMode = 'play';
  private editOrigin: EditOrigin = 'play';
  private readonly delegate: GameModeDelegate;

  constructor(options: GameModeOptions) {
    this.delegate = options.delegate;
  }

  getMode(): GameMode {
    return this.mode;
  }

  /** The one and only camera owner for the current mode. */
  getCameraOwner(): CameraOwner {
    switch (this.mode) {
      case 'creative':
        return 'creative-flight';
      case 'edit':
        return 'edit';
      default:
        return 'gameplay';
    }
  }

  isPlay(): boolean {
    return this.mode === 'play';
  }

  isCreative(): boolean {
    return this.mode === 'creative';
  }

  isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** Origin of the CURRENT (or most recent) edit session. */
  getEditOrigin(): EditOrigin {
    return this.editOrigin;
  }

  /**
   * Park the camera and open the editor. From play OR creative; a no-op when
   * already editing. The camera NEVER moves here — it is handed to "nobody".
   */
  enterEdit(): boolean {
    if (this.mode === 'edit') return false;
    const previous = this.mode;
    this.editOrigin = previous;
    this.mode = 'edit';
    this.delegate.onEditEnter(previous);
    this.delegate.onModeChanged(this.mode, previous);
    return true;
  }

  /**
   * Close the editor and hand the camera back to the mode the session came
   * from (see the transition contract in the header). No-op when not editing.
   */
  exitEdit(): boolean {
    if (this.mode !== 'edit') return false;
    const previous = this.mode;
    const origin = this.editOrigin;
    if (origin === 'creative') {
      this.mode = 'creative';
      this.delegate.onCreativeCameraAttach('edit-resume');
    } else {
      this.mode = 'play';
      this.delegate.onPlayCameraReconnect('edit-exit');
    }
    this.delegate.onModeChanged(this.mode, previous);
    return true;
  }

  /**
   * The explicit F key: play↔creative. Never fires from edit mode (the game
   * wiring drops input edges there) — guarded here as well for safety.
   */
  toggleCreative(): boolean {
    if (this.mode === 'edit') return false;
    const previous = this.mode;
    if (this.mode === 'creative') {
      this.mode = 'play';
      this.delegate.onPlayCameraReconnect('creative-exit');
    } else {
      this.mode = 'creative';
      this.delegate.onCreativeCameraAttach('play-toggle');
    }
    this.delegate.onModeChanged(this.mode, previous);
    return true;
  }
}
