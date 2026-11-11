import * as THREE from 'three';
import type {
  AuthoredLayout,
  GameModeController,
  LocalSceneStorage,
  ObjectEditorController,
  PlayerController,
  SceneStateManager,
  ThreeRendererAdapter,
  PanelAxis,
  PanelValueGroup,
} from '../src/index.js';
import {
  TransformGizmo,
  TOWN_GROUND_SIZE,
  formatSelectedObjectInfo,
  formatPanelNumber,
  parsePanelNumber,
  buildPanelTransformPatch,
} from '../src/index.js';

export interface EditorUiDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rendererDomElement: HTMLCanvasElement;
  manager: SceneStateManager;
  adapter: ThreeRendererAdapter;
  editor: ObjectEditorController;
  gizmo: TransformGizmo;
  modes: GameModeController;
  playerController: PlayerController;
  /** Late-bound: the horse rig is created after this module. */
  isRiding: () => boolean;
  authoredLayout: AuthoredLayout;
  storage: LocalSceneStorage;
  showStatusMessage: (message: string) => void;
  resetObjectToAuthored: (uuid: string) => boolean;
  resetAllToAuthored: () => number;
}

export interface EditorUi {
  /** Shared editor raycaster (also used by the composition root if ever needed). */
  raycaster: THREE.Raycaster;
  refreshSelectionHelper(): void;
  updateEditorHud(): void;
  updateControlHint(): void;
  updateSelectionPanel(): void;
  updateSaveStatus(): void;
  isSelectionBoxVisible(): boolean;
  noteObjectChange(
    uuid: string,
    name: string,
    before: Readonly<{ position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }>,
    after: Readonly<{ position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }>,
  ): void;
}

/**
 * The whole EDITOR-facing UI surface in one module: pointer selection, the
 * selection helper box, the editor HUD rows, the control hint bar, the
 * numeric selection panel, the authored-layout reset buttons, the save
 * status line, the last-object-change log panel (with clipboard COPY) and
 * the gizmo mouse interaction (handle picking + distance arbitration +
 * drag). Gameplay-facing HUD (vitals, position, clock, perf counter) lives
 * in the composition root — this module is strictly the world-editor UX.
 */
export function createEditorUi({
  scene, camera, rendererDomElement, manager, adapter, editor, gizmo, modes,
  playerController, isRiding, authoredLayout, storage, showStatusMessage,
  resetObjectToAuthored, resetAllToAuthored,
}: EditorUiDeps): EditorUi {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xffd166);
  selectionBox.visible = false;
  scene.add(selectionBox);

  function refreshSelectionHelper(): void {
    const selectedUuid = editor.getSelectedUuid();
    if (!selectedUuid) { selectionBox.visible = false; return; }
    const mesh = scene.getObjectByProperty('uuid', selectedUuid);
    if (!mesh) { selectionBox.visible = false; return; }
    selectionBox.box.setFromObject(mesh);
    selectionBox.visible = true;
  }

  function findManagedUuid(object: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (manager.has(current.uuid)) return current.uuid;
      current = current.parent;
    }
    return null;
  }

  function updatePointerFromEvent(event: MouseEvent): void {
    const rect = rendererDomElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * THE one object-picking path (the editor's raycast → registry funnel):
   * candidates = every ACTIVE managed object (the renderer adapter's mirror of
   * the registry — nothing is filtered out here), raycast recursive so child
   * meshes resolve, then walk UP the parent chain to the managed root.
   * Returns the closest hit with its distance so the gizmo arbitration can
   * compare it against transparent handle proxies.
   */
  function firstManagedHit(): { uuid: string; distance: number } | null {
    const candidates = adapter.getActiveUUIDs()
      .map((uuid) => scene.getObjectByProperty('uuid', uuid))
      .filter((obj): obj is THREE.Object3D => Boolean(obj));
    const hit = raycaster.intersectObjects(candidates, true)[0];
    if (!hit) return null;
    const uuid = findManagedUuid(hit.object);
    if (!uuid) return null;
    return { uuid, distance: hit.distance };
  }

  function selectObjectFromPointer(event: MouseEvent): void {
    if (!modes.isEdit()) return;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const managed = firstManagedHit();
    editor.select(managed ? managed.uuid : null);
    refreshSelectionHelper();
    updateEditorHud();
  }

  function updateEditorHud(): void {
    const mode = document.getElementById('editor-mode');
    const selected = document.getElementById('editor-selection');
    const cameraLabel = document.getElementById('camera-mode');
    // The map row reads the SHARED world constant — the old hardcoded
    // "100 × 100" was a stale assumption from the previous, smaller map.
    const mapRow = document.getElementById('map-size');
    if (mapRow) mapRow.textContent = `${TOWN_GROUND_SIZE} × ${TOWN_GROUND_SIZE}`;
    if (mode) mode.textContent = modes.isEdit() ? 'EDIT MODE' : 'PLAY MODE';
    if (selected) {
      const selectedUuid = editor.getSelectedUuid();
      selected.textContent = selectedUuid ? manager.getObject(selectedUuid)?.metadata.name ?? selectedUuid : 'None';
    }
    if (cameraLabel) {
      // Edit owns the camera whenever it is open (it may sit anywhere a
      // Creative session left it) — reflect ownership, not the player's mode.
      cameraLabel.textContent = modes.isEdit()
        ? 'EDIT CAMERA'
        : modes.isCreative()
          ? 'CREATIVE FLIGHT'
          : isRiding()
            ? (playerController.getCameraMode() === 'third_person' ? 'RIDE · THIRD PERSON' : 'RIDE · FIRST PERSON')
            : playerController.getCameraMode() === 'third_person' ? 'THIRD PERSON' : 'FIRST PERSON';
    }
  }

  function updateControlHint(): void {
    const hint = document.getElementById('control-hint');
    if (!hint) return;
    if (modes.isEdit()) {
      hint.textContent = 'TAB play · drag gizmo axes/rings · type values in panel · arrows move · PageUp/Down height · Q/E R/F T/G rotate 15° (Shift 45°)';
      return;
    }
    if (isRiding()) {
      hint.textContent = 'W walk · W+Shift gallop · hold S brake · S at stop = reverse · A/D steer · RMB look · V camera · E dismount';
      return;
    }
    hint.textContent = 'WASD move · Hold RIGHT mouse = look · Shift sprint · Space jump · C/Ctrl crouch · E interact/mount · B come · N stay · V camera · F creative fly · H/J player debug · [ ] horse debug · R respawn · TAB edit';
  }

  // Editable numeric fields of the selection panel (Position/Rotation/Scale).
  const PANEL_INPUTS: Array<{ id: string; group: PanelValueGroup; axis: PanelAxis }> = [
    { id: 'sel-pos-x', group: 'position', axis: 'x' },
    { id: 'sel-pos-y', group: 'position', axis: 'y' },
    { id: 'sel-pos-z', group: 'position', axis: 'z' },
    { id: 'sel-rot-x', group: 'rotation', axis: 'x' },
    { id: 'sel-rot-y', group: 'rotation', axis: 'y' },
    { id: 'sel-rot-z', group: 'rotation', axis: 'z' },
    { id: 'sel-scl-x', group: 'scale', axis: 'x' },
    { id: 'sel-scl-y', group: 'scale', axis: 'y' },
    { id: 'sel-scl-z', group: 'scale', axis: 'z' },
  ];

  // --- Authored-layout reset buttons (selection panel actions row) ------------
  // «بازنشانی شیء» puts the SELECTED object back to the transform its layout
  // table authored; «بازگردانی همه» puts EVERY deviating object back. Both run
  // through resetObjectToAuthored / resetAllToAuthored — the official
  // updateObjectTransform funnel — so renderer sync, the change log and the
  // autosave behave exactly like a hand edit. Reset keeps user renames: only
  // transforms are restored, metadata never.
  const selResetButton = document.getElementById('sel-reset') as HTMLButtonElement | null;
  const selResetAllButton = document.getElementById('sel-reset-all') as HTMLButtonElement | null;

  function updateSelectionPanel(): void {
    const selectedUuid = editor.getSelectedUuid();
    const definition = selectedUuid ? manager.getObject(selectedUuid) : undefined;
    const info = formatSelectedObjectInfo(definition);
    const panel = document.getElementById('selection-panel');
    const name = document.getElementById('sel-name');
    const uuid = document.getElementById('sel-uuid');
    if (panel) panel.classList.toggle('no-selection', !definition);
    if (name) name.textContent = info.name;
    if (uuid) {
      // The UUID stays a debug-only annotation next to the human-readable name.
      uuid.textContent = definition ? `debug: ${info.uuid}` : 'No selection';
      uuid.title = definition ? `debug uuid: ${info.uuid}` : '';
    }
    for (const binding of PANEL_INPUTS) {
      const input = document.getElementById(binding.id) as HTMLInputElement | null;
      if (!input) continue;
      if (!definition) {
        input.value = '';
        input.disabled = true;
        continue;
      }
      input.disabled = false;
      // Never clobber the field the user is currently typing in; every other
      // field refreshes live from manager state (gizmo/keyboard/numeric edits
      // all land in the same place).
      if (document.activeElement === input) continue;
      input.value = formatPanelNumber(definition.transform[binding.group][binding.axis]);
    }
    // Reset actions: «بازنشانی شیء» applies only when the selection deviates
    // from its authored transform (and edit mode owns the mouse); «بازگردانی
    // همه» is armed whenever edit mode is active. Both refresh at HUD rate.
    if (selResetButton) {
      selResetButton.disabled = !modes.isEdit() || !definition
        || !authoredLayout.has(definition.uuid)
        || !authoredLayout.isModified(definition);
    }
    if (selResetAllButton) selResetAllButton.disabled = !modes.isEdit() || authoredLayout.size === 0;
  }

  function applyPanelInput(binding: { group: PanelValueGroup; axis: PanelAxis }, input: HTMLInputElement): void {
    const value = parsePanelNumber(input.value);
    if (value === null) return; // empty / partial draft — ignore, keep current value
    if (editor.setSelectedTransform(buildPanelTransformPatch(binding.group, binding.axis, value))) {
      refreshSelectionHelper();
      updateEditorHud();
    }
  }

  for (const binding of PANEL_INPUTS) {
    const input = document.getElementById(binding.id) as HTMLInputElement | null;
    if (!input) continue;
    // 'input' fires on typing AND on the spinner arrows, so edits apply
    // immediately through ObjectEditorController -> updateObjectTransform.
    input.addEventListener('input', () => applyPanelInput(binding, input));
  }

  let selResetFlashTimer = 0;
  function flashResetFeedback(button: HTMLButtonElement | null, label: string): void {
    if (!button) return;
    const original = button.dataset.originalLabel ?? button.textContent ?? label;
    button.dataset.originalLabel = original;
    button.textContent = 'انجام شد ✓';
    button.classList.add('done');
    window.clearTimeout(selResetFlashTimer);
    selResetFlashTimer = window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('done');
    }, 1400);
  }
  selResetButton?.addEventListener('click', () => {
    const uuid = editor.getSelectedUuid();
    if (!uuid || !modes.isEdit()) return;
    if (resetObjectToAuthored(uuid)) flashResetFeedback(selResetButton, 'بازنشانی شیء');
  });
  selResetAllButton?.addEventListener('click', () => {
    if (!modes.isEdit()) return;
    const restored = resetAllToAuthored();
    if (restored > 0) flashResetFeedback(selResetAllButton, 'بازگردانی همه');
    showStatusMessage(restored > 0
      ? `${restored} شیء به چیدمان اصلی بازگشت.`
      : 'همهٔ اشیاء از قبل سر جای اصلی خود هستند.');
  });

  function updateSaveStatus(): void {
    const saved = document.getElementById('save-status');
    if (!saved) return;
    saved.textContent = storage.hasSavedScene() ? `Saved ${new Date().toLocaleTimeString()}` : 'No saved scene';
  }

  // --- Last-object-change panel (TEST panel, bottom-right) --------------------
  // Populated by the updateObjectTransform wrapper. The panel shows ONLY what
  // is needed to reconstruct the object's exact state across the last
  // mutation: Name, UUID, the full Initial transform (before the mutation)
  // and the full Final transform (after it) — position, rotation and scale in
  // full, even when the patch touched just one group. No change/action line,
  // no timestamp. The COPY button places the panel's entire visible content
  // in the clipboard (same strings, same fixed 3-decimal precision), so the
  // text can be handed to another AI to reproduce the change 1:1.
  interface Vec3Like {
    x: number;
    y: number;
    z: number;
  }
  interface ObjectChangeRecord {
    name: string;
    uuid: string;
    before: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like };
    after: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like };
  }
  let lastObjectChange: ObjectChangeRecord | null = null;

  /** Fixed 3-decimal formatting — stable for display AND clipboard round-trips. */
  const vecText = (v: Vec3Like): string => `x=${v.x.toFixed(3)} y=${v.y.toFixed(3)} z=${v.z.toFixed(3)}`;
  const rotText = (v: Vec3Like): string => `x=${v.x.toFixed(3)}° y=${v.y.toFixed(3)}° z=${v.z.toFixed(3)}°`;

  const sameVec3 = (a: Vec3Like, b: Vec3Like): boolean =>
    a.x === b.x && a.y === b.y && a.z === b.z;
  const sameTransform = (
    a: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like },
    b: { position: Vec3Like; rotation: Vec3Like; scale: Vec3Like },
  ): boolean =>
    sameVec3(a.position, b.position) && sameVec3(a.rotation, b.rotation) && sameVec3(a.scale, b.scale);

  function noteObjectChange(
    uuid: string,
    name: string,
    before: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>,
    after: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>,
  ): void {
    // The wrapper hands us the manager's own snapshots, so `before` is the
    // transform BEFORE the mutation and `after` the one AFTER it. A deduped
    // no-op call (before === after) is not a mutation — keep the panel as-is.
    if (sameTransform(before, after)) return;
    // The record must survive the call — re-clone so later mutations of the
    // registry can never rewrite the panel's history.
    const cloneVec = (v: Vec3Like): Vec3Like => ({ x: v.x, y: v.y, z: v.z });
    const cloneState = (t: Readonly<{ position: Vec3Like; rotation: Vec3Like; scale: Vec3Like }>) => ({
      position: cloneVec(t.position),
      rotation: cloneVec(t.rotation),
      scale: cloneVec(t.scale),
    });
    lastObjectChange = {
      name,
      uuid,
      before: cloneState(before),
      after: cloneState(after),
    };
    updateObjectLogPanel();
  }

  /**
   * The panel's visible content, as plain text. This ONE formatter feeds both
   * the DOM rows and the clipboard, so what the user sees is byte-for-byte
   * what gets copied — nothing invisible is ever added, nothing visible is
   * ever left out.
   */
  function formatObjectLogText(record: ObjectChangeRecord): string {
    const block = (label: string, t: ObjectChangeRecord['before']): string[] => [
      `${label}:`,
      `Position: ${vecText(t.position)}`,
      `Rotation: ${rotText(t.rotation)}`,
      `Scale: ${vecText(t.scale)}`,
    ];
    return [
      `Name: ${record.name}`,
      `UUID: ${record.uuid}`,
      '',
      ...block('Initial', record.before),
      '',
      ...block('Final', record.after),
    ].join('\n');
  }

  function updateObjectLogPanel(): void {
    const record = lastObjectChange;
    const empty = document.getElementById('object-log-empty');
    const body = document.getElementById('object-log');
    if (!body || !record) return;
    if (empty) empty.hidden = true;
    body.hidden = false;
    const set = (id: string, text: string): void => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    set('objlog-name', record.name);
    set('objlog-uuid', record.uuid);
    set('objlog-ipos', vecText(record.before.position));
    set('objlog-irot', rotText(record.before.rotation));
    set('objlog-iscl', vecText(record.before.scale));
    set('objlog-fpos', vecText(record.after.position));
    set('objlog-frot', rotText(record.after.rotation));
    set('objlog-fscl', vecText(record.after.scale));
  }

  // COPY button: places the panel's ENTIRE visible content (Name, UUID, Initial
  // block, Final block) on the clipboard via the async Clipboard API, with a
  // textarea/execCommand fallback for non-secure contexts. Button text flashes
  // "COPIED ✓" so the click is confirmed without a console.
  const objLogCopyButton = document.getElementById('objlog-copy') as HTMLButtonElement | null;
  let objLogCopyResetTimer = 0;
  function flashCopyFeedback(): void {
    if (!objLogCopyButton) return;
    objLogCopyButton.textContent = 'COPIED ✓';
    objLogCopyButton.classList.add('copied');
    window.clearTimeout(objLogCopyResetTimer);
    objLogCopyResetTimer = window.setTimeout(() => {
      objLogCopyButton.textContent = 'COPY';
      objLogCopyButton.classList.remove('copied');
    }, 1400);
  }
  function copyObjectLogFallback(text: string): boolean {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
  objLogCopyButton?.addEventListener('click', () => {
    const record = lastObjectChange;
    if (!record || !objLogCopyButton) return;
    const text = formatObjectLogText(record);
    const done = (ok: boolean): void => {
      if (ok) flashCopyFeedback();
      else objLogCopyButton.textContent = 'COPY FAILED';
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => done(true))
        .catch(() => done(copyObjectLogFallback(text)));
    } else {
      done(copyObjectLogFallback(text));
    }
  });

  // --- Gizmo mouse interaction -------------------------------------------
  // Selection moved to pointerdown: gizmo handles are checked FIRST; if one is
  // hit the drag starts and object selection is skipped for this press, so the
  // gizmo can never select/move anything but its own target.
  //
  // DISTANCE ARBITRATION (user report: "clicking many objects does nothing"):
  // the handle hit proxies are transparent but still raycastable, so a click
  // whose ray passed through a proxy silently started a zero-effect drag
  // instead of selecting the object the user aimed at. Now a proxy only wins
  // when no managed object sits strictly IN FRONT of it — if the closest
  // managed hit is another (or the same) object closer than the proxy minus a
  // 2 cm epsilon, the press falls through to selection. Clicking the visible
  // arm itself (proxy at/above the nearest surface) still drags as before.
  rendererDomElement.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!modes.isEdit() || event.button !== 0) return;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    const handleHit = gizmo.pickHandleHit(raycaster.ray);
    if (handleHit) {
      const objHit = firstManagedHit();
      const attached = gizmo.getAttachedUuid();
      const blockedByObject = Boolean(
        objHit &&
        objHit.uuid !== attached && // clicks on the attached object's own surface keep dragging
        objHit.distance < handleHit.distance - 0.02,
      );
      if (!blockedByObject) {
        // preventDefault() suppresses the browser's focus-change default, so a
        // field left focused after typing would freeze mid-drag — blur it
        // explicitly so the panel keeps refreshing live while dragging.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        gizmo.beginDrag(handleHit.handle, raycaster.ray);
        event.preventDefault();
        return;
      }
    }
    selectObjectFromPointer(event);
  });

  window.addEventListener('pointermove', (event: PointerEvent) => {
    if (!gizmo.isDragging()) return;
    updatePointerFromEvent(event);
    raycaster.setFromCamera(pointer, camera);
    gizmo.updateDrag(raycaster.ray);
    refreshSelectionHelper();
  });

  window.addEventListener('pointerup', () => {
    if (gizmo.isDragging()) gizmo.endDrag();
  });

  return {
    raycaster,
    refreshSelectionHelper,
    updateEditorHud,
    updateControlHint,
    updateSelectionPanel,
    updateSaveStatus,
    isSelectionBoxVisible: () => selectionBox.visible,
    noteObjectChange,
  };
}
