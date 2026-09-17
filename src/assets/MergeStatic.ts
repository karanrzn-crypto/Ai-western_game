/**
 * src/assets/MergeStatic.ts
 * -----------------------------------------------------------------------------
 * Static-geometry merge pass — the draw-call budget for weak laptops.
 *
 * MEASURED ROOT CAUSE (probe-perf / perf-deep, headless + user report):
 * the town rendered ~1731 draw calls for only ~33k triangles. Nearly every
 * decorative part (board, slat, nail, strap) was its own THREE.Mesh with its
 * own BufferGeometry (2825 unique geometries), so the frame cost was DOMINATED
 * by per-draw CPU/driver overhead — not pixels, not materials (those were
 * already shared caches of 291), not lights (lamp policy fixed previously).
 * The fix is the third leg of the perf contract: merge the STATIC geometry of
 * each managed object into one mesh per (material × mount) bucket, so a def
 * with 200 parts renders in a handful of calls.
 *
 * CONTRACT (why merging is safe for every existing system):
 *   • SELECTION — the Object Editor selects a MANAGED OBJECT (def uuid), not
 *     a leaf mesh: raycast hits a child mesh and walks up to the def root.
 *     Merged meshes stay children of their mount below that root, so the
 *     parent walk is unchanged.
 *   • DOORS / POSE APIs — runtime code rotates GROUPS by name
 *     ('front-door-hinge', 'door-hinge', 'gate-leaf-*-hinge',
 *     'bank-vault-door-hinge', 'jail-cell-door-hinge',
 *     'secure-gate-leaf-*'). Groups are never removed or renamed, and every
 *     runtime-rotated node carries `userData.dynamic = true`. A subtree
 *     buckets to its NEAREST dynamic ancestor, so merging can never bake
 *     geometry across a rotating pivot — a hinge's parts merge only with
 *     each other, and they rotate exactly as before.
 *   • TRANSFORM OWNERSHIP — the registry transform lives on the def ROOT
 *     (applied by ThreeRendererAdapter); merging bakes only LOCAL static
 *     transforms into geometry, so editor move/rotate/scale of the def still
 *     works bit-for-bit.
 *   • DISPOSAL — the adapter disposes geometries only; a merged mesh owns
 *     ONE new geometry (its sources are disposed here), and materials stay
 *     in the shared per-module caches (never disposed per object).
 *   • TRANSFORMS AFTER MERGE — merged meshes set matrixAutoUpdate = false
 *     (identity local matrix, world matrix still recomputed from the parent
 *     chain by three.js propagation).
 *
 * ESCAPE HATCHES:
 *   • `userData.noMerge = true` on any node → its whole subtree is untouched.
 *   • Non-indexed geometry, geometry with a morph/interleaved layout, or an
 *     attribute set that differs from its bucket head is left unmerged.
 *   • def.metadata.noMerge → the adapter skips the pass for that def.
 * -----------------------------------------------------------------------------
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Attribute layout fingerprint — buckets may only merge identical layouts. */
function attributeSignature(g: THREE.BufferGeometry): string {
  return Object.keys(g.attributes).sort().join(',') + '|idx=' + (g.index ? 1 : 0);
}

/** True when the geometry can take part in a merge bucket. */
function isMergeableGeometry(g: THREE.BufferGeometry): boolean {
  if (!g.index || g.attributes.position === undefined) return false;
  if (g.morphAttributes && Object.keys(g.morphAttributes).length > 0) return false;
  for (const key of Object.keys(g.attributes)) {
    if ((g.attributes[key] as unknown as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute) return false;
  }
  return true;
}

interface Bucket {
  /** The node whose frame the baked geometry lives in. */
  mount: THREE.Object3D;
  material: THREE.Material;
  items: Array<{ mesh: THREE.Mesh; rel: THREE.Matrix4 }>;
}

/**
 * Merge the static geometry of ONE managed object's tree, in place.
 * Call ONCE, right after the factory built the root and the adapter applied
 * the registry transform. Safe to call on any Object3D (single-mesh roots
 * are a no-op).
 */
export function mergeStaticGeometry(root: THREE.Object3D): void {
  // Escape hatch: the whole def opted out.
  if (root.userData?.noMerge === true) return;

  // Fresh world matrices — the bake below reads matrixWorld.
  root.updateMatrixWorld(true);

  // 1) The dynamic nodes: every runtime-rotated pivot in this tree.
  const dynamic = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o !== root && o.userData?.dynamic === true) dynamic.add(o);
  });

  // 2) Collect mergeable meshes grouped by (mount, material, layout).
  //    mount = the NEAREST dynamic ancestor, else the def root itself.
  const buckets = new Map<string, Bucket>();

  const addMesh = (mesh: THREE.Mesh, mount: THREE.Object3D): void => {
    const material = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) return; // multi-material meshes stay as-is
    const g = mesh.geometry;
    if (!g || !isMergeableGeometry(g)) return;
    const sig = attributeSignature(g);
    const existing = buckets.get(`${mount.uuid}|${material.uuid}|${sig}`);
    // Bake this mesh's world transform into MOUNT-LOCAL space (mount itself
    // may carry any transform — identity is NOT assumed).
    const rel = new THREE.Matrix4()
      .copy(mount.matrixWorld)
      .invert()
      .multiply(mesh.matrixWorld);
    if (existing) existing.items.push({ mesh, rel });
    else buckets.set(`${mount.uuid}|${material.uuid}|${sig}`, { mount, material, items: [{ mesh, rel }] });
  };

  /** Static walk: mounts are the root unless a dynamic node intervenes. */
  const walkStatic = (node: THREE.Object3D): void => {
    for (const child of node.children.slice()) {
      if (child.userData?.noMerge === true) continue; // subtree untouched
      if (dynamic.has(child)) {
        walkUnderMount(child, child);
        continue;
      }
      if ((child as THREE.Mesh).isMesh) addMesh(child as THREE.Mesh, root);
      walkStatic(child);
    }
  };
  /** Dynamic-subtree walk: everything buckets to `mount` (nearest dynamic). */
  const walkUnderMount = (node: THREE.Object3D, mount: THREE.Object3D): void => {
    for (const child of node.children.slice()) {
      if (child.userData?.noMerge === true) continue;
      if (dynamic.has(child)) {
        walkUnderMount(child, child);
        continue;
      }
      if ((child as THREE.Mesh).isMesh) addMesh(child as THREE.Mesh, mount);
      walkUnderMount(child, mount);
    }
  };

  walkStatic(root);

  // 3) Merge every bucket with ≥2 items; dispose the sources.
  for (const [, bucket] of buckets) {
    if (bucket.items.length < 2) continue;
    const baked = bucket.items.map((i) => i.mesh.geometry.clone().applyMatrix4(i.rel));
    const merged = mergeGeometries(baked, false);
    baked.forEach((g) => g.dispose());
    if (!merged) continue; // mergeGeometries refused (layout drift) — keep originals
    merged.name = bucket.items[0]!.mesh.geometry.name || 'merged-static';

    const first = bucket.items[0]!.mesh;
    const mergedMesh = new THREE.Mesh(merged, bucket.material);
    mergedMesh.name = `${first.name || 'part'}+merged`;
    // Union of the source flags: if ANY part cast shadows, the merged part does.
    mergedMesh.castShadow = bucket.items.some((i) => i.mesh.castShadow);
    mergedMesh.receiveShadow = bucket.items.some((i) => i.mesh.receiveShadow);
    mergedMesh.renderOrder = bucket.items.reduce((m, i) => Math.max(m, i.mesh.renderOrder), 0);
    mergedMesh.matrixAutoUpdate = false; // identity local matrix, never moves
    mergedMesh.userData.mergedFrom = bucket.items.map((i) => i.mesh.name);

    for (const { mesh } of bucket.items) {
      mesh.removeFromParent();
      mesh.geometry.dispose(); // baked into `merged`; never uploaded
    }
    // The baked geometry lives in MOUNT-LOCAL space, so the mount is the
    // only parent whose frame matches.
    bucket.mount.add(mergedMesh);
  }
}
