import type { Vec3 } from '../core/types.js';
import { SceneStateManager } from '../core/SceneStateManager.js';

export type EditorMoveCommand = 'left' | 'right' | 'forward' | 'backward' | 'up' | 'down';

export interface ObjectEditorControllerOptions {
  normalStep?: number;
  fastStep?: number;
  onObjectModified?: (uuid: string) => void;
}

export class ObjectEditorController {
  private readonly manager: SceneStateManager;
  private readonly normalStep: number;
  private readonly fastStep: number;
  private readonly onObjectModified?: (uuid: string) => void;
  private editMode = false;
  private selectedUuid: string | null = null;

  constructor(manager: SceneStateManager, options: ObjectEditorControllerOptions = {}) {
    this.manager = manager;
    this.normalStep = options.normalStep ?? 0.25;
    this.fastStep = options.fastStep ?? 1;
    this.onObjectModified = options.onObjectModified;
  }

  isEditMode(): boolean { return this.editMode; }
  setEditMode(enabled: boolean): void { this.editMode = enabled; if (!enabled) this.selectedUuid = null; }
  toggleEditMode(): boolean { this.setEditMode(!this.editMode); return this.editMode; }

  select(uuid: string | null): string | null {
    if (!uuid) { this.selectedUuid = null; return this.selectedUuid; }
    const current = this.manager.getObject(uuid);
    this.selectedUuid = current && current.metadata.editable !== false ? uuid : null;
    return this.selectedUuid;
  }

  getSelectedUuid(): string | null { return this.selectedUuid; }

  moveSelected(command: EditorMoveCommand, fast = false): boolean {
    const step = fast ? this.fastStep : this.normalStep;
    switch (command) {
      case 'left': return this.moveSelectedBy({ x: -step, y: 0, z: 0 });
      case 'right': return this.moveSelectedBy({ x: step, y: 0, z: 0 });
      case 'forward': return this.moveSelectedBy({ x: 0, y: 0, z: -step });
      case 'backward': return this.moveSelectedBy({ x: 0, y: 0, z: step });
      case 'up': return this.moveSelectedBy({ x: 0, y: step, z: 0 });
      case 'down': return this.moveSelectedBy({ x: 0, y: -step, z: 0 });
      default: return false;
    }
  }

  moveSelectedBy(delta: Vec3): boolean {
    if (!this.editMode || !this.selectedUuid) return false;
    const current = this.manager.getObject(this.selectedUuid);
    if (!current || current.metadata.editable === false) return false;
    this.manager.updateObjectTransform(this.selectedUuid, { position: {
      x: current.transform.position.x + delta.x,
      y: current.transform.position.y + delta.y,
      z: current.transform.position.z + delta.z,
    }});
    this.onObjectModified?.(this.selectedUuid);
    return true;
  }
}
