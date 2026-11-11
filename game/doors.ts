import * as THREE from 'three';
import type { InteractionSystem, SceneStateManager } from '../src/index.js';
import {
  BANK_OBJECT_IDS,
  BANK_DOOR_SPEC,
  setBankFrontDoorOpen,
  setBankVaultDoorOpen,
  setSecureGateOpen,
  BANK_SITE,
  SHERIFF_OBJECT_IDS,
  setJailCellDoorOpen,
  setSheriffFrontDoorOpen,
  SHERIFF_SITE,
  STABLE_OBJECT_IDS,
  STABLE_DOOR_SPECS,
  setStableGateOpen,
  setStableLeafDoorOpen,
  STABLE_SITE,
  GUNSHOP_DOOR_SPEC,
  setGunShopFrontDoorOpen,
  GUNSHOP_SITE,
  setSaloonDoorsOpen,
  SALOON_DOOR_SPEC,
  SALOON_SITE,
} from '../src/index.js';
import type { DoorHarnessState, Swing } from './testHooks.js';

export interface DoorSystemDeps {
  scene: THREE.Scene;
  manager: SceneStateManager;
  interactions: InteractionSystem;
  showStatusMessage: (message: string) => void;
}

export interface DoorSystem {
  /** Advance every door swing and sync each collider to the visible pose. */
  update(delta: number): void;
  /** Force every door's collider metadata back to its CLOSED pose after a
   *  save load (the factories rebuild visuals closed; a save taken mid-open
   *  must never leave a closed-looking door walkable). */
  rearmClosedAfterLoad(): void;
  /** Read-only state the verify harnesses probe (game/testHooks.ts). */
  harness: DoorHarnessState;
}

/**
 * Every E-openable door in the game, in one module. Each family follows the
 * SAME contract (the "house door contract"):
 *   • spawns CLOSED with its collider armed (exact closed-leaf payload where
 *     the building module provides one),
 *   • E flips the swing TARGET; the pose is RE-DERIVED from the interpolator
 *     value every frame (pure pose setters — repeated toggles never
 *     accumulate transform error; pressing E mid-swing just flips the target),
 *   • the collider releases past half-open and re-arms past half-closed via
 *     manager.updateObjectMetadata — the metadata invalidation IS the walk
 *     switch, so collision can never disagree with what the player sees.
 */
export function createDoorSystem({ scene, manager, interactions, showStatusMessage }: DoorSystemDeps): DoorSystem {
  // --- The bank's barred iron gate -------------------------------------------
  // The gate spawns CLOSED across the manager doorway. E swings both leaves
  // toward the lobby (~0.9 s).
  const gateUuid = BANK_OBJECT_IDS.secureGate;
  const gateSwing: Swing = { value: 0, target: 0, speed: 1 / 0.9 };
  interactions.register({
    uuid: gateUuid,
    get label() {
      return gateSwing.target > 0.5 ? 'Close the iron gate' : 'Open the iron gate';
    },
    range: 2.2,
    getPosition: () => manager.getObject(gateUuid)?.transform.position
      ?? { x: BANK_SITE.x, y: 0, z: BANK_SITE.z },
    canInteract: () => Boolean(manager.getObject(gateUuid)),
    onInteract: () => {
      gateSwing.target = gateSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(gateSwing.target > 0.5 ? 'The iron gate swings open.' : 'The iron gate clangs shut.');
    },
  });

  // --- The bank's big vault door (the vault's ONLY entrance) ------------------
  // E swings the disc outward into the office (~0.9 s, same feel as the gate).
  const vaultDoorUuid = BANK_OBJECT_IDS.vaultDoor;
  const vaultSwing: Swing = { value: 0, target: 0, speed: 1 / 0.9 };
  interactions.register({
    uuid: vaultDoorUuid,
    get label() {
      return vaultSwing.target > 0.5 ? 'Close the vault door' : 'Open the vault door';
    },
    range: 2.2,
    getPosition: () => manager.getObject(vaultDoorUuid)?.transform.position
      ?? { x: BANK_SITE.x, y: 0, z: BANK_SITE.z },
    canInteract: () => Boolean(manager.getObject(vaultDoorUuid)),
    onInteract: () => {
      vaultSwing.target = vaultSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(vaultSwing.target > 0.5 ? 'The vault door swings open.' : 'The vault door grinds shut.');
    },
  });

  // --- The jail's two cell doors ----------------------------------------------
  // Both spawn CLOSED in the bars line. E swings the barred leaf INWARD into
  // the cell (~0.8 s — a lighter, clankier feel than the big vault door). The
  // 1.1 m corridor lies west of the bars, so the inward swing never blocks it.
  const cellDoorSpecs = [
    { uuid: SHERIFF_OBJECT_IDS.cellDoorA, open: 'Open cell one', close: 'Close cell one' },
    { uuid: SHERIFF_OBJECT_IDS.cellDoorB, open: 'Open cell two', close: 'Close cell two' },
  ] as const;
  const cellSwings = new Map<string, Swing>();
  for (const spec of cellDoorSpecs) {
    cellSwings.set(spec.uuid, { value: 0, target: 0, speed: 1 / 0.8 });
    interactions.register({
      uuid: spec.uuid,
      get label() {
        const swing = cellSwings.get(spec.uuid)!;
        return swing.target > 0.5 ? spec.close : spec.open;
      },
      range: 2.0,
      getPosition: () => manager.getObject(spec.uuid)?.transform.position
        ?? { x: SHERIFF_SITE.x, y: 0, z: SHERIFF_SITE.z },
      canInteract: () => Boolean(manager.getObject(spec.uuid)),
      onInteract: () => {
        const swing = cellSwings.get(spec.uuid)!;
        swing.target = swing.target > 0.5 ? 0 : 1;
        showStatusMessage(swing.target > 0.5 ? 'The cell door clanks open.' : 'The cell door slams shut.');
      },
    });
  }

  // --- The sheriff office FRONT door ------------------------------------------
  // Spawns CLOSED across the south doorway. E swings the leaf INWARD around
  // its real hinge pivot (~0.9 s — a heavier public door than the cell gates).
  const frontDoorUuid = SHERIFF_OBJECT_IDS.frontDoor;
  const frontSwing: Swing = { value: 0, target: 0, speed: 1 / 0.9 };
  interactions.register({
    uuid: frontDoorUuid,
    get label() {
      return frontSwing.target > 0.5 ? 'Close the office door' : 'Open the office door';
    },
    range: 2.0,
    getPosition: () => manager.getObject(frontDoorUuid)?.transform.position
      ?? { x: SHERIFF_SITE.x, y: 0, z: SHERIFF_SITE.z },
    canInteract: () => Boolean(manager.getObject(frontDoorUuid)),
    onInteract: () => {
      frontSwing.target = frontSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(frontSwing.target > 0.5 ? 'The office door creaks open.' : 'The office door swings shut.');
    },
  });

  // --- The stable's 10 doors (ALL genuinely openable, E) ----------------------
  // The big double gate + 6 stall doors + tack/feed room doors + the staff
  // door. Gate is heavier: 1.1 s vs 0.8 s for the leaf doors.
  const stableSwings = new Map<string, Swing>();
  for (const spec of STABLE_DOOR_SPECS) {
    const duration = spec.style === 'gate' ? 1.1 : 0.8;
    stableSwings.set(spec.uuid, { value: 0, target: 0, speed: 1 / duration });
    interactions.register({
      uuid: spec.uuid,
      get label() {
        const swing = stableSwings.get(spec.uuid);
        return swing && swing.target > 0.5 ? spec.labelClose : spec.labelOpen;
      },
      range: spec.range,
      getPosition: () => {
        const def = manager.getObject(spec.uuid);
        return def
          ? { x: def.transform.position.x, y: def.transform.position.y, z: def.transform.position.z }
          : { x: STABLE_SITE.x, y: 0, z: STABLE_SITE.z };
      },
      canInteract: () => Boolean(manager.getObject(spec.uuid)),
      onInteract: () => {
        const swing = stableSwings.get(spec.uuid);
        if (!swing) return;
        swing.target = swing.target > 0.5 ? 0 : 1;
        showStatusMessage(swing.target > 0.5 ? spec.labelOpen + '.' : spec.labelClose + '.');
      },
    });
  }

  // --- The GUN SHOP front door -------------------------------------------------
  const gunShopDoorUuid = GUNSHOP_DOOR_SPEC.uuid;
  const gunShopDoorSwing: Swing = { value: 0, target: 0, speed: 1 / 0.9 };
  interactions.register({
    uuid: gunShopDoorUuid,
    get label() {
      return gunShopDoorSwing.target > 0.5 ? GUNSHOP_DOOR_SPEC.labelClose : GUNSHOP_DOOR_SPEC.labelOpen;
    },
    range: GUNSHOP_DOOR_SPEC.range,
    getPosition: () => manager.getObject(gunShopDoorUuid)?.transform.position
      ?? { x: GUNSHOP_SITE.x, y: 0, z: GUNSHOP_SITE.z },
    canInteract: () => Boolean(manager.getObject(gunShopDoorUuid)),
    onInteract: () => {
      gunShopDoorSwing.target = gunShopDoorSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(gunShopDoorSwing.target > 0.5
        ? `${GUNSHOP_DOOR_SPEC.labelOpen}.`
        : `${GUNSHOP_DOOR_SPEC.labelClose}.`);
    },
  });

  // --- The BANK front door ------------------------------------------------------
  // The entrance-door revision: real openable walnut double leaves (the old
  // ones hung OPEN flat against the facade and read as wall boards). The EXACT
  // closed-leaf collider arms at spawn (BANK_DOOR_SPEC.closedCollider —
  // collider == visual); fully released while open.
  const bankDoorUuid = BANK_DOOR_SPEC.uuid;
  const bankDoorSwing: Swing = { value: 0, target: 0, speed: 1 / 1.1 };
  interactions.register({
    uuid: bankDoorUuid,
    get label() {
      return bankDoorSwing.target > 0.5 ? BANK_DOOR_SPEC.labelClose : BANK_DOOR_SPEC.labelOpen;
    },
    range: BANK_DOOR_SPEC.range,
    getPosition: () => manager.getObject(bankDoorUuid)?.transform.position
      ?? { x: BANK_SITE.x, y: 0, z: BANK_SITE.z },
    canInteract: () => Boolean(manager.getObject(bankDoorUuid)),
    onInteract: () => {
      bankDoorSwing.target = bankDoorSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(bankDoorSwing.target > 0.5
        ? `${BANK_DOOR_SPEC.labelClose}.`
        : `${BANK_DOOR_SPEC.labelOpen}.`);
    },
  });

  // --- The SALOON entrance doors ------------------------------------------------
  // The swinging half-doors are FULL HEIGHT and closed-by-default (the old
  // waist-high leaves vanished against the 2.3 m opening). Same contract; the
  // collider releases fully while open — the walk-through returns.
  const saloonDoorUuid = SALOON_DOOR_SPEC.uuid;
  const saloonDoorSwing: Swing = { value: 0, target: 0, speed: 1 / 0.9 };
  interactions.register({
    uuid: saloonDoorUuid,
    get label() {
      return saloonDoorSwing.target > 0.5 ? SALOON_DOOR_SPEC.labelClose : SALOON_DOOR_SPEC.labelOpen;
    },
    range: SALOON_DOOR_SPEC.range,
    getPosition: () => manager.getObject(saloonDoorUuid)?.transform.position
      ?? { x: SALOON_SITE.x, y: 0, z: SALOON_SITE.z },
    canInteract: () => Boolean(manager.getObject(saloonDoorUuid)),
    onInteract: () => {
      saloonDoorSwing.target = saloonDoorSwing.target > 0.5 ? 0 : 1;
      showStatusMessage(saloonDoorSwing.target > 0.5
        ? `${SALOON_DOOR_SPEC.labelClose}.`
        : `${SALOON_DOOR_SPEC.labelOpen}.`);
    },
  });

  /** Generic swing advance: interpolate `swing` toward its target, derive the
   *  pose from the value, and sync the door's collider metadata. The simple
   *  boolean-arm variant (collider = !opened) used by most families. */
  function advanceSwing(
    entry: { uuid: string; swing: Swing },
    delta: number,
    setPose: (root: THREE.Object3D, value: number) => void,
  ): void {
    const { uuid, swing } = entry;
    if (swing.value === swing.target) return;
    const dir = Math.sign(swing.target - swing.value);
    swing.value = THREE.MathUtils.clamp(swing.value + dir * swing.speed * delta, 0, 1);
    const root = scene.getObjectByProperty('uuid', uuid);
    if (root) setPose(root, swing.value);
    const opened = swing.value > 0.5;
    const def = manager.getObject(uuid);
    if (def && Boolean(def.metadata.collider) === opened) {
      manager.updateObjectMetadata(uuid, { collider: !opened });
    }
  }

  /** The exact-collider variant (bank + saloon entrance doors): the metadata
   *  swaps between the closed leaf payload and `false`, compared by value so
   *  a stale identical payload never rewrites. */
  function advanceExactColliderSwing(
    entry: { uuid: string; swing: Swing },
    delta: number,
    setPose: (root: THREE.Object3D, value: number) => void,
    closedCollider: unknown,
  ): void {
    const { uuid, swing } = entry;
    if (swing.value === swing.target) return;
    const dir = Math.sign(swing.target - swing.value);
    swing.value = THREE.MathUtils.clamp(swing.value + dir * swing.speed * delta, 0, 1);
    const root = scene.getObjectByProperty('uuid', uuid);
    if (root) setPose(root, swing.value);
    const opened = swing.value > 0.5;
    const def = manager.getObject(uuid);
    const stale = JSON.stringify(def?.metadata.collider) !== JSON.stringify(opened ? false : closedCollider);
    if (def && stale) {
      manager.updateObjectMetadata(uuid, { collider: opened ? false : closedCollider });
    }
  }

  return {
    update(delta: number): void {
      advanceSwing({ uuid: gateUuid, swing: gateSwing }, delta, (root, v) => setSecureGateOpen(root, v));
      advanceSwing({ uuid: vaultDoorUuid, swing: vaultSwing }, delta, (root, v) => setBankVaultDoorOpen(root, v));
      for (const spec of cellDoorSpecs) {
        advanceSwing({ uuid: spec.uuid, swing: cellSwings.get(spec.uuid)! }, delta, (root, v) => setJailCellDoorOpen(root, v));
      }
      advanceSwing({ uuid: frontDoorUuid, swing: frontSwing }, delta, (root, v) => setSheriffFrontDoorOpen(root, v));
      for (const [uuid, swing] of stableSwings) {
        advanceSwing(
          { uuid, swing },
          delta,
          (root, v) => (uuid === STABLE_OBJECT_IDS.gate ? setStableGateOpen(root, v) : setStableLeafDoorOpen(root, v)),
        );
      }
      advanceSwing({ uuid: gunShopDoorUuid, swing: gunShopDoorSwing }, delta, (root, v) => setGunShopFrontDoorOpen(root, v));
      advanceExactColliderSwing({ uuid: bankDoorUuid, swing: bankDoorSwing }, delta, (root, v) => setBankFrontDoorOpen(root, v), BANK_DOOR_SPEC.closedCollider);
      advanceExactColliderSwing({ uuid: saloonDoorUuid, swing: saloonDoorSwing }, delta, (root, v) => setSaloonDoorsOpen(root, v), SALOON_DOOR_SPEC.closedCollider);
    },

    rearmClosedAfterLoad(): void {
      // The gate and vault door VISUALS are rebuilt closed by the factories
      // every boot; force the saved metadata to match (a save taken mid-open
      // would otherwise leave the bars/disc walkable while looking shut).
      const gateDef = manager.getObject(gateUuid);
      if (gateDef && gateDef.metadata.collider !== true) {
        manager.updateObjectMetadata(gateUuid, { collider: true });
      }
      const vaultDef = manager.getObject(vaultDoorUuid);
      if (vaultDef && vaultDef.metadata.collider !== true) {
        manager.updateObjectMetadata(vaultDoorUuid, { collider: true });
      }
      // Cell doors likewise rebuild closed every boot.
      for (const spec of cellDoorSpecs) {
        const def = manager.getObject(spec.uuid);
        if (def && def.metadata.collider !== true) {
          manager.updateObjectMetadata(spec.uuid, { collider: true });
        }
      }
      // The bank + saloon entrance doors likewise rebuild CLOSED every boot
      // (the factories build the t=0 pose); force the saved metadata back onto
      // the exact closed-leaf collider so a save taken mid-open can never
      // leave a closed-looking door walkable.
      for (const doorSpec of [BANK_DOOR_SPEC, SALOON_DOOR_SPEC]) {
        const def = manager.getObject(doorSpec.uuid);
        if (def && JSON.stringify(def.metadata.collider) !== JSON.stringify(doorSpec.closedCollider)) {
          manager.updateObjectMetadata(doorSpec.uuid, { collider: doorSpec.closedCollider });
        }
      }
    },

    harness: {
      gate: { uuid: gateUuid, swing: gateSwing },
      vault: { uuid: vaultDoorUuid, swing: vaultSwing },
      sheriffFront: { uuid: frontDoorUuid, swing: frontSwing },
      gunshop: { uuid: gunShopDoorUuid, swing: gunShopDoorSwing },
      bank: { uuid: bankDoorUuid, swing: bankDoorSwing },
      saloon: { uuid: saloonDoorUuid, swing: saloonDoorSwing },
      cells: cellSwings,
      stables: stableSwings,
    },
  };
}
