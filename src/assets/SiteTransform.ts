/**
 * src/assets/SiteTransform.ts
 * -----------------------------------------------------------------------------
 * EXACT world-yaw rotation of a whole building's map definitions.
 *
 * WHY IT EXISTS
 * The town redesign (2026-09) gives every building a site + a facing yaw:
 * the saloon faces east onto the main street, the bank/sheriff/stable face
 * north onto the square/stable road, while every building MODULE keeps its
 * building-local layout (+Z = entrance, the town-wide convention) and its
 * existing tests untouched. build*MapObjects(originX, originZ) only
 * TRANSLATES, so the facing yaw is applied here — once, at map-assembly
 * time, to every def the module emits.
 *
 * WHY IT IS EXACT (the geometry-audit standard)
 * A rigid rotation of the whole building must rotate BOTH every def's
 * position (around the site origin) AND every def's orientation. Doing the
 * orientation in Euler space ("just add 90° to rotation.y") is WRONG for any
 * def that also carries a pitch/roll (roof slabs): Three.js applies Euler
 * XYZ as R = Rx·Ry·Rz, so (pitch, yaw+90, 0) rotates in the wrong order.
 * The correct composition is a WORLD-frame pre-multiply:
 *
 *     q' = q_yaw ⊗ q_def
 *     p' = R(yaw) · (p − origin) + origin
 *
 * which is exactly what a single Object3D parent-rotation would do. The
 * result is converted back to Euler degrees with RotationMath's exact
 * Three.js-'XYZ' replica (quaternionToEulerDegrees), so the renderer adapter
 * (rotation.set(degToRad …), default XYZ order) reproduces the orientation
 * bit-for-bit. RotationMath is itself cross-checked against THREE.Quaternion
 * by tests/rotation-math style suites, so no drift can creep in here.
 *
 * COLLIDER NOTE
 * CollisionWorld derives each collider from the def transform (unit box ×
 * scale, yaw-conservative AABB). All buildings sit at exact multiples of
 * 90° (0 / ±90 / 180), where the yaw-conservative AABB equals the true box —
 * so a rotated wall still collides EXACTLY like it looks, and the collider
 * never grows a gap against the visual model.
 * -----------------------------------------------------------------------------
 */

import type { ObjectDefinition, Vec3 } from '../core/types.js';
import {
  axisAngleQuaternion,
  eulerDegreesToQuaternion,
  quaternionMultiply,
  quaternionToEulerDegrees,
} from '../core/RotationMath.js';

const DEG2RAD = Math.PI / 180;

/** Rotate one Vec3 around the world Y axis by yawDeg (counter-clockwise seen
 *  from above, matching THREE's rotation.y sign convention). */
export function rotateVec3AroundY(v: Vec3, yawDeg: number): Vec3 {
  const a = yawDeg * DEG2RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: v.x * cos + v.z * sin,
    y: v.y,
    z: -v.x * sin + v.z * cos,
  };
}

/**
 * Rotate a whole building's defs to face `yawDeg` (degrees, world Y).
 *
 * @param defs          the building-local defs emitted by build*MapObjects
 * @param originX/Z     the SITE the defs were built at (their rotation center)
 * @param yawDeg        world yaw to apply (0 keeps the building facing +Z/south)
 * @returns NEW def objects (inputs are never mutated) with every position
 *          rotated around the site origin and every orientation pre-multiplied
 *          by the world yaw quaternion.
 */
export function rotateSiteDefs(
  defs: readonly ObjectDefinition[],
  originX: number,
  originZ: number,
  yawDeg: number,
): ObjectDefinition[] {
  if (((yawDeg % 360) + 360) % 360 === 0) {
    // Zero yaw: return shallow copies untouched — the common fast path and
    // the exact identity (no float round-trip through quaternions).
    return defs.map((d) => d);
  }
  const yawQuat = axisAngleQuaternion('y', yawDeg * DEG2RAD);
  return defs.map((def) => {
    const local: Vec3 = {
      x: def.transform.position.x - originX,
      y: def.transform.position.y,
      z: def.transform.position.z - originZ,
    };
    const rotated = rotateVec3AroundY(local, yawDeg);
    const defQuat = eulerDegreesToQuaternion(def.transform.rotation);
    const worldQuat = quaternionMultiply(yawQuat, defQuat);
    return {
      ...def,
      transform: {
        position: {
          x: originX + rotated.x,
          y: def.transform.position.y,
          z: originZ + rotated.z,
        },
        rotation: quaternionToEulerDegrees(worldQuat),
        scale: { ...def.transform.scale },
      },
    };
  });
}
