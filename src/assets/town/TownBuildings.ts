/**
 * src/assets/town/TownBuildings.ts
 * -----------------------------------------------------------------------------
 * The six NEW buildings of the redesigned town + the square fountain:
 *
 *   Farm house      (خانه مزرعه)     — before town, fenced yard, faces the road
 *   Worker house    (خانه کارگری)    — LEFT side when entering the square
 *   Family house    (خانه خانوادگی)  — far side of the square
 *   Wealthy house   (خانه پولداری)   — far side of the square (2-story, cream)
 *   Meat shop       (قصابی)          — RIGHT side when entering the square
 *   Ruined house    (خانه خراب)      — far outskirts, collapsed, isolated
 *
 * ARCHITECTURE
 * One shared `emitHouseShell` system builds every intact house from a spec —
 * walls are plain town-box defs whose scale IS their collider box (exact,
 * axis-aligned), roofs/porch roofs/windows/posts are decor. The ruined house
 * is bespoke (partial walls, collapsed roof, debris).
 *
 * SCALE/COLLIDER CONTRACT: every collider def is a unit box scaled to its
 * true extents (collider == visual, zero gaps); all decorative defs carry
 * `collider: false` explicitly. No pitched-roof def ever collides (its
 * transform scale would under/over-cover the slope); walls do the blocking.
 * Doors are collider boxes in the wall line + a decor trim kit.
 * -----------------------------------------------------------------------------
 */

import type { Vec3 } from '../../core/types.js';

export type TownDefSink = (
  assetType: string,
  name: string,
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 },
  metadata: Record<string, unknown>,
) => void;

const identity = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const deg = (d: number): Vec3 => ({ x: d, y: 0, z: 0 });

export interface HouseShellSpec {
  width: number;
  depth: number;
  wallHeight: number;
  wallT: number;
  /** true: ridge runs along X (slopes face ±Z, gables at ±X) */
  ridgeAlongX: boolean;
  roofPitchDeg: number;
  roofOverhang: number;
  tint: string;
  doorWidth: number;
  doorHeight: number;
  doorOffsetX: number;
  windows: Array<{ side: 'front' | 'back' | 'left' | 'right'; offset: number; w: number; h: number; sill: number }>;
  porchDepth: number | null;
  porchRoof: boolean;
  chimney: { side: 'left' | 'right'; offsetZ: number } | null;
  falseFrontTop: number | null;
  pad: boolean;
}

/**
 * Emit one intact house shell (walls + door + windows + roof + porch).
 * Every def is positioned BUILDING-LOCAL then offset by (ox, oz): local +Z is
 * the ENTRANCE side, the town-wide convention (yaw applied at map assembly).
 */
export function emitHouseShell(
  sink: TownDefSink,
  spec: HouseShellSpec,
  ox: number,
  oz: number,
  nameFa: string,
): void {
  const { width: W, depth: D, wallT: t } = spec;
  // gable walls (ridge ends) rise to the ridge; eave walls stop at wallHeight
  const runZ = D / 2 + spec.roofOverhang;
  const rise = runZ * Math.tan((spec.roofPitchDeg * Math.PI) / 180);
  const ridgeY = spec.wallHeight + rise;
  const gableH = ridgeY;
  const at = (x: number, y: number, z: number) => ({ position: { x: ox + x, y, z: oz + z }, rotation: identity(), scale: { x: 1, y: 1, z: 1 } });
  const box = (
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    suffix: string, tint: string, collider: boolean,
    rotation: Vec3 = identity(),
  ): void => {
    sink(
      'town-box', `${nameFa} — ${suffix}`,
      { position: { x: ox + x, y, z: oz + z }, rotation, scale: { x: sx, y: sy, z: sz } },
      { tint, collider, editable: true },
    );
  };

  // --- foundation pad --------------------------------------------------------
  if (spec.pad) {
    box(0, 0.07, 0, W + 0.3, 0.14, D + 0.3, 'فونداسیون سنگی', 'stoneDark', true);
  }

  // --- walls -----------------------------------------------------------------
  const frontH = spec.falseFrontTop ?? (spec.ridgeAlongX ? spec.wallHeight : gableH);
  const backH = spec.ridgeAlongX ? spec.wallHeight : gableH;
  const sideH = spec.ridgeAlongX ? gableH : spec.wallHeight;
  // back wall (−Z)
  box(0, backH / 2, -D / 2, W, backH, t, 'دیوار پشتی', spec.tint, true);
  // side walls (span BETWEEN front/back walls — back-to-back, never overlapped)
  box(-W / 2, sideH / 2, 0, t, sideH, D - 2 * t, 'دیوار غربی', spec.tint, true);
  box(W / 2, sideH / 2, 0, t, sideH, D - 2 * t, 'دیوار شرقی', spec.tint, true);
  // front wall (+Z): split around the door + header above it
  const doorW = spec.doorWidth;
  const doorX = spec.doorOffsetX;
  const segL = doorX - doorW / 2;          // west segment right edge
  const segR = doorX + doorW / 2;          // east segment left edge
  box((-(W / 2) + segL) / 2, frontH / 2, D / 2, segL + W / 2, frontH, t, 'دیوار جلوئی (غربی)', spec.tint, true);
  box(segR + (W / 2 - segR) / 2, frontH / 2, D / 2, W / 2 - segR, frontH, t, 'دیوار جلوئی (شرقی)', spec.tint, true);
  box(doorX, frontH - (frontH - spec.doorHeight) / 2, D / 2, doorW, frontH - spec.doorHeight, t, 'بالای در', spec.tint, true);

  // --- door (collider box) + trim (decor) -------------------------------------
  box(doorX, spec.doorHeight / 2 + 0.02, D / 2, doorW, spec.doorHeight, 0.1, 'در ورودی', 'woodDark', true);
  sink(
    'town-door', `${nameFa} — چارچوب در`,
    { ...at(doorX, 0, D / 2 + 0.05), scale: { x: 1, y: 1, z: 1 } },
    { doorWidth: doorW, doorHeight: spec.doorHeight, collider: false, editable: true },
  );

  // --- windows (decor, proud of the wall face) --------------------------------
  for (const win of spec.windows) {
    const rot: Record<string, Vec3> = { front: identity(), back: deg(180), left: deg(-90), right: deg(90) };
    const pos: Record<string, Vec3> = {
      front: { x: win.offset, y: win.sill + win.h / 2, z: D / 2 + 0.04 },
      back: { x: win.offset, y: win.sill + win.h / 2, z: -D / 2 - 0.04 },
      left: { x: -W / 2 - 0.04, y: win.sill + win.h / 2, z: win.offset },
      right: { x: W / 2 + 0.04, y: win.sill + win.h / 2, z: win.offset },
    };
    sink(
      'town-window', `${nameFa} — پنجره`,
      { position: { x: ox + pos[win.side].x, y: pos[win.side].y, z: oz + pos[win.side].z }, rotation: rot[win.side], scale: { x: 1, y: 1, z: 1 } },
      { winWidth: win.w, winHeight: win.h, collider: false, editable: true },
    );
  }

  // --- roof slabs (decor — walls block the player, roofs never collide) ------
  if (!spec.falseFrontTop) {
    const slopeLen = Math.sqrt(runZ * runZ + rise * rise);
    const slabT = 0.09;
    if (spec.ridgeAlongX) {
      box(0, spec.wallHeight + rise / 2, runZ / 2, W + 2 * spec.roofOverhang, slabT, slopeLen, 'سقف (جنوبی)', 'shingle', false, deg(spec.roofPitchDeg));
      box(0, spec.wallHeight + rise / 2, -runZ / 2, W + 2 * spec.roofOverhang, slabT, slopeLen, 'سقف (شمالی)', 'shingle', false, deg(-spec.roofPitchDeg));
    } else {
      const runX = W / 2 + spec.roofOverhang;
      const riseX = runX * Math.tan((spec.roofPitchDeg * Math.PI) / 180);
      const slopeX = Math.sqrt(runX * runX + riseX * riseX);
      box(-runX / 2, spec.wallHeight + riseX / 2, 0, slopeX, slabT, D + 2 * spec.roofOverhang, 'سقف (غربی)', 'shingle', false, { x: 0, y: 0, z: spec.roofPitchDeg });
      box(runX / 2, spec.wallHeight + riseX / 2, 0, slopeX, slabT, D + 2 * spec.roofOverhang, 'سقف (شرقی)', 'shingle', false, { x: 0, y: 0, z: -spec.roofPitchDeg });
    }
    // ridge cap
    if (spec.ridgeAlongX) {
      box(0, ridgeY + 0.04, 0, W + 2 * spec.roofOverhang, 0.1, 0.24, 'خط الراس', 'shingleDark', false);
    } else {
      box(0, ridgeY + 0.04, 0, 0.24, 0.1, D + 2 * spec.roofOverhang, 'خط الراس', 'shingleDark', false);
    }
  } else {
    // false-front storefront: flat shed roof BEHIND the parapet (the parapet
    // hides it from the street; the slab seals the top so the shop is closed)
    box(0, spec.wallHeight + 0.05, 0, W + 2 * spec.roofOverhang, 0.09, D + 2 * spec.roofOverhang, 'سقف پشت نمای فيروزه‌ای', 'shingleDark', false);
    box(0, spec.falseFrontTop + 0.06, D / 2 - 0.02, W + 0.3, 0.12, t + 0.12, 'نوار نما', 'woodDark', false);
  }

  // --- porch (deck collider; posts + roof decor) ------------------------------
  if (spec.porchDepth) {
    const pd = spec.porchDepth;
    box(0, 0.07, D / 2 + pd / 2, W + 0.4, 0.14, pd, 'ایوان — کف', 'plankA', true);
    const postH = 2.5;
    const posts = spec.porchRoof ? [-W / 2 + 0.25, W / 2 - 0.25] : [];
    for (const px of posts) {
      box(px, postH / 2 + 0.1, D / 2 + pd - 0.15, 0.14, postH, 0.14, 'پایه ایوان', 'woodDark', false);
    }
    if (spec.porchRoof) {
      box(0, postH + 0.16, D / 2 + pd / 2, W + 0.5, 0.08, pd + 0.35, 'سقف ایوان', 'shingle', false, deg(7));
    }
  }

  // --- chimney (decor, exterior) ----------------------------------------------
  if (spec.chimney) {
    const cx = (spec.chimney.side === 'left' ? -1 : 1) * (W / 2 - 0.45);
    box(cx, ridgeY * 0.62, spec.chimney.offsetZ, 0.7, ridgeY * 1.24, 0.7, 'دودکش سنگی', 'stone', false);
  }
}

/* -------------------------------------------------------------------------- */
/* The fountain — the central square's landmark (user spec §8)                */
/* -------------------------------------------------------------------------- */

export function emitFountain(sink: TownDefSink, ox: number, oz: number): void {
  const box = (
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    suffix: string, tint: string, collider: boolean,
  ): void => {
    sink(
      'town-box', `آب‌نمای میدان — ${suffix}`,
      { position: { x: ox + x, y, z: oz + z }, rotation: identity(), scale: { x: sx, y: sy, z: sz } },
      { tint, collider, editable: true },
    );
  };
  // square stone basin: 4 exact wall boxes + water + pedestal
  box(0, 0.07, 0, 3.4, 0.14, 3.4, 'سکوی سنگی', 'stoneDark', true);
  box(0, 0.41, -1.35, 3.0, 0.55, 0.3, 'جداره شمالی', 'stone', true);
  box(0, 0.41, 1.35, 3.0, 0.55, 0.3, 'جداره جنوبی', 'stone', true);
  box(-1.35, 0.41, 0, 0.3, 0.55, 2.4, 'جداره غربی', 'stone', true);
  box(1.35, 0.41, 0, 0.3, 0.55, 2.4, 'جداره شرقی', 'stone', true);
  box(0, 0.3, 0, 2.4, 0.32, 2.4, 'کف حوض', 'stoneDark', true);
  box(0, 0.47, 0, 2.36, 0.06, 2.36, 'آب حوض', 'water', false);
  box(0, 0.85, 0, 0.55, 0.85, 0.55, 'ستون میانی', 'stone', true);
  box(0, 1.32, 0, 0.95, 0.16, 0.95, 'طشت بالایی', 'stoneDark', true);
  box(0, 1.42, 0, 0.8, 0.06, 0.8, 'آب طشت', 'water', false);
}

/* -------------------------------------------------------------------------- */
/* The ruined house (bespoke — collapsed, isolated on the outskirts)           */
/* -------------------------------------------------------------------------- */

export function emitRuinedHouse(sink: TownDefSink, ox: number, oz: number): void {
  const box = (
    x: number, y: number, z: number,
    sx: number, sy: number, sz: number,
    suffix: string, tint: string, collider: boolean,
    rotation: Vec3 = identity(),
  ): void => {
    sink(
      'town-box', `خانه خراب — ${suffix}`,
      { position: { x: ox + x, y, z: oz + z }, rotation, scale: { x: sx, y: sy, z: sz } },
      { tint, collider, editable: true },
    );
  };
  const W = 8;
  const D = 6;
  const t = 0.3;
  // south wall: two broken stubs flanking a gap (the old doorway)
  box(-W / 2 + 1.5, 0.9, D / 2, 3.0, 1.8, t, 'دیوار جنوبی (بخش غربی)', 'plankC', true);
  box(W / 2 - 1.2, 1.1, D / 2, 2.4, 2.2, t, 'دیوار جنوبی (بخش شرقی)', 'plankC', true);
  // west wall (low ruin)
  box(-W / 2, 0.7, 0, t, 1.4, D - t, 'دیوار غربی (خراب)', 'plankC', true);
  // north wall (tallest remnant, jagged top read via two stacked boxes)
  box(0, 1.3, -D / 2, W, 2.6, t, 'دیوار شمالی', 'plankC', true);
  box(-2.4, 2.85, -D / 2, 3.2, 0.5, t, 'دیوار شمالی (لبه)', 'plankC', true);
  // collapsed roof slab leaning against the north wall
  box(-1.2, 1.15, -1.9, 7.2, 0.1, 3.6, 'تخته سقف فروریخته', 'shingleDark', false, { x: 38, y: 0, z: 4 });
  // broken beams
  box(2.6, 0.35, 0.6, 0.18, 0.18, 3.4, 'تیر سوخته ۱', 'woodDark', false, { x: 0, y: 0, z: 62 });
  box(-2.9, 0.28, 1.4, 0.16, 0.16, 2.6, 'تیر سوخته ۲', 'woodDark', false, { x: 0, y: 0, z: -48 });
  // charred hearth remnant
  box(2.2, 0.55, -1.6, 1.1, 1.1, 0.7, 'باقیمانده اجاق', 'stoneDark', true);
}
