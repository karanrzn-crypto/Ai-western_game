import * as THREE from 'three';

export interface DayNightCycleOptions {
  dayDurationSeconds?: number;
  startTime?: number;
  sunDistance?: number;
  sunHeight?: number;
}

export interface DayNightSnapshot {
  timeOfDay: number;
  sunIntensity: number;
  hemisphereIntensity: number;
  skyColor: string;
  fogColor: string;
  sunPosition: { x: number; y: number; z: number };
}

interface Keyframe { time: number; sunIntensity: number; hemisphereIntensity: number; skyColor: number; fogColor: number; sunColor: number; }
const KEYFRAMES: readonly Keyframe[] = [
  { time: 0, sunIntensity: 0.05, hemisphereIntensity: 0.16, skyColor: 0x0f1622, fogColor: 0x121926, sunColor: 0x8aa0c5 },
  { time: 6, sunIntensity: 0.18, hemisphereIntensity: 0.26, skyColor: 0x6d5e5c, fogColor: 0x655754, sunColor: 0xffb676 },
  { time: 8, sunIntensity: 1.1, hemisphereIntensity: 0.6, skyColor: 0x9db5ca, fogColor: 0x90a7ba, sunColor: 0xffdeaa },
  { time: 12, sunIntensity: 2.35, hemisphereIntensity: 1.04, skyColor: 0xbdd8f0, fogColor: 0xb4cfe6, sunColor: 0xffffff },
  { time: 15, sunIntensity: 1.95, hemisphereIntensity: 0.88, skyColor: 0xaed0ea, fogColor: 0xa4c6df, sunColor: 0xfff5df },
  { time: 18, sunIntensity: 0.62, hemisphereIntensity: 0.42, skyColor: 0xe19a70, fogColor: 0xc88361, sunColor: 0xffb070 },
  { time: 20, sunIntensity: 0.08, hemisphereIntensity: 0.2, skyColor: 0x283247, fogColor: 0x242d3f, sunColor: 0x93a7c7 },
  { time: 24, sunIntensity: 0.05, hemisphereIntensity: 0.16, skyColor: 0x0f1622, fogColor: 0x121926, sunColor: 0x8aa0c5 },
] as const;
function normalizeHour(hours: number): number { return ((hours % 24) + 24) % 24; }
function smoothstep(t: number): number { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); }
function lerpNumber(a: number, b: number, t: number): number { return a + (b - a) * t; }
/**
 * Unified keyframe sampler — the ONLY interpolation path for every keyframed
 * channel (sun/hemisphere intensity, sky/fog/sun color). Segments are
 * half-open [from, to) so each instant is owned by exactly one segment; the
 * shared keyframe value keeps segment joins C0-continuous and smoothstep
 * (zero slope at both ends) keeps them C1. At h = keyframe.time the t = 0
 * side wins, so keyframe values are returned bit-exact — no pop anywhere.
 */
function findFramePair(hours: number): { from: Keyframe; to: Keyframe; t: number } {
  const normalized = normalizeHour(hours);
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    const from = KEYFRAMES[i]!; const to = KEYFRAMES[i + 1]!;
    const isLast = i === KEYFRAMES.length - 2;
    if (normalized >= from.time && (normalized < to.time || (isLast && normalized <= to.time))) {
      return { from, to, t: smoothstep((normalized - from.time) / Math.max(to.time - from.time, 1e-6)) };
    }
  }
  return { from: KEYFRAMES[0]!, to: KEYFRAMES[1]!, t: 0 };
}

// --- Continuous sun orbit ----------------------------------------------------
// One analytic orbit drives BOTH the visible light position and the
// shadow-casting direction. Sunrise/sunset sit at 06:00/18:00 (altitude
// factor 0) and noon peaks at 12:00 — aligned with the keyframe times, so
// keyframed channels and the orbit form a single continuous timeline.
const ORBIT_HOUR_OFFSET = 6;
// Smooth altitude floor for the shadow/light direction. The raw orbit dips
// below the horizon plane after 18:00, which made the directional light shine
// upward from underground and flipped/vanished the shadows at a fixed hour.
// Instead, the effective light altitude settles at LIGHT_ALT_FLOOR below
// ALT_BLEND_START and rejoins the true orbit above ALT_BLEND_END; the C1
// hermite join means the direction sweeps continuously — shadows persist
// through sunset and fade with intensity instead of popping at 18:00.
const ALT_BLEND_START = -0.4;
const ALT_BLEND_END = 0.22;
const LIGHT_ALT_FLOOR = 0.16;
const TARGET_DISTANCE = 80;
// C1 hermite: h(0)=0, h'(0)=0, h(1)=1, h'(1)=1.
function slopeOneBlend(u: number): number { const u2 = u * u; return -u2 * u + 2 * u2; }
// Smooth positive part — replaces max(0, alt) so the z offset has no kink at
// sunrise/sunset (C1 instead of a velocity discontinuity).
function smoothPositive(alt: number): number { return alt * smoothstep(alt / ALT_BLEND_END); }
function effectiveLightAltitude(alt: number): number {
  if (alt >= ALT_BLEND_END) return alt;
  if (alt <= ALT_BLEND_START) return LIGHT_ALT_FLOOR;
  const u = (alt - ALT_BLEND_START) / (ALT_BLEND_END - ALT_BLEND_START);
  return LIGHT_ALT_FLOOR + (ALT_BLEND_END - LIGHT_ALT_FLOOR) * slopeOneBlend(u);
}

export class DayNightCycle {
  private readonly scene: THREE.Scene; private readonly sun: THREE.DirectionalLight; private readonly hemisphere: THREE.HemisphereLight;
  private readonly dayDuration: number; private readonly sunDistance: number; private readonly sunHeight: number; private timeOfDay: number;
  private readonly skyColor = new THREE.Color(); private readonly fogColor = new THREE.Color(); private readonly sunColor = new THREE.Color();
  private readonly tmpDir = new THREE.Vector3(); private readonly tmpLightPos = new THREE.Vector3();
  private readonly tmpChannelFrom = new THREE.Color(); private readonly tmpChannelTo = new THREE.Color();
  /** Persistent background instance — mutated in place every frame. The old
   *  per-frame `scene.background = skyColor.clone()` allocated a Color object
   *  60×/s (GC hitches on weak laptops) and swapped the background identity
   *  every frame for zero visual benefit. */
  private readonly background = new THREE.Color();
  // --- Lamp policy (weak-laptop perf revision) ------------------------------
  // Forward rendering pays for EVERY visible PointLight in EVERY fragment —
  // a light's range does not matter to cost, only the COUNT does. The map
  // shipped 18 real point lights, measured as the dominant fill-rate tax on
  // weak GPUs (≈2.6× frame time headless). The cycle owns the sun timeline,
  // so it owns the lamp state too: lamps burn only while the sun is
  // effectively down. Two thresholds form a hysteresis band (no flip-flop at
  // dawn/dusk); the flame/glass EMISSIVE meshes keep lamps looking lit in
  // daylight. A visible-count change recompiles material programs ONCE per
  // transition (cached after the first day).
  private static readonly LAMPS_ON_BELOW = 0.35;
  private static readonly LAMPS_OFF_ABOVE = 0.55;
  private readonly lamps = new Set<THREE.PointLight>();
  private lampsLit = true;
  constructor(scene: THREE.Scene, sun: THREE.DirectionalLight, hemisphere: THREE.HemisphereLight, options: DayNightCycleOptions = {}) {
    this.scene = scene; this.sun = sun; this.hemisphere = hemisphere; this.dayDuration = Math.max(10, options.dayDurationSeconds ?? 180);
    this.sunDistance = Math.max(10, options.sunDistance ?? 38); this.sunHeight = Math.max(10, options.sunHeight ?? 42);
    // The light target is repositioned every frame to steer the shadow-casting
    // direction; it must live in the scene graph for its matrix to update.
    scene.add(sun.target);
    this.timeOfDay = normalizeHour(options.startTime ?? 8); this.apply();
  }
  update(deltaSeconds: number): void { this.timeOfDay = normalizeHour(this.timeOfDay + (deltaSeconds * 24) / this.dayDuration); this.apply(); }
  getTimeOfDay(): number { return this.timeOfDay; }
  setTimeOfDay(hours: number): void { this.timeOfDay = normalizeHour(hours); this.apply(); }
  /** Register a real PointLight under the lamp policy (boot sweep — the def
   *  set is static after load; the editor moves groups, never spawns lights). */
  registerLamp(light: THREE.PointLight): void {
    this.lamps.add(light);
    light.visible = this.lampsLit;
  }
  /** How many real lamps the policy currently owns. */
  get lampCount(): number { return this.lamps.size; }
  /** Whether lamps burn under the current sun (for tests/harnesses). */
  get areLampsLit(): boolean { return this.lampsLit; }
  private updateLamps(): void {
    if (this.lamps.size === 0) return;
    const s = this.sun.intensity;
    if (!this.lampsLit && s < DayNightCycle.LAMPS_ON_BELOW) this.lampsLit = true;
    else if (this.lampsLit && s > DayNightCycle.LAMPS_OFF_ABOVE) this.lampsLit = false;
    else return;
    for (const lamp of this.lamps) lamp.visible = this.lampsLit;
  }
  getSnapshot(): DayNightSnapshot { return { timeOfDay: this.timeOfDay, sunIntensity: this.sun.intensity, hemisphereIntensity: this.hemisphere.intensity, skyColor: `#${this.skyColor.getHexString()}`, fogColor: `#${this.fogColor.getHexString()}`, sunPosition: { x: this.sun.position.x, y: this.sun.position.y, z: this.sun.position.z } }; }
  private apply(): void {
    const hours = normalizeHour(this.timeOfDay);
    const { from, to, t } = findFramePair(hours);

    // Single continuous orbit — one interpolation for position AND shadows.
    const orbitAngle = ((hours - ORBIT_HOUR_OFFSET) / 24) * Math.PI * 2;
    const cosA = Math.cos(orbitAngle);
    const alt = Math.sin(orbitAngle);
    const daylight = smoothPositive(alt);
    // Visible light position: the true orbit, unchanged (sun at the horizon
    // at 06:00/18:00, peak at noon).
    this.sun.position.set(cosA * this.sunDistance, alt * this.sunHeight, 12 + daylight * 12);

    // Shadow/light direction: the same orbit with the smooth altitude floor,
    // expressed through the light target so the direction (and only the
    // direction) stays above the horizon plane at every hour.
    const lightAlt = effectiveLightAltitude(alt);
    this.tmpLightPos.set(cosA * this.sunDistance, lightAlt * this.sunHeight, 12 + daylight * 12);
    this.tmpDir.copy(this.tmpLightPos).multiplyScalar(-1).normalize();
    this.sun.target.position.copy(this.sun.position).addScaledVector(this.tmpDir, TARGET_DISTANCE);

    // Keyframed channels — one unified sampler (see findFramePair).
    this.sun.intensity = lerpNumber(from.sunIntensity, to.sunIntensity, t);
    this.hemisphere.intensity = lerpNumber(from.hemisphereIntensity, to.hemisphereIntensity, t);
    this.sunColor.lerpColors(this.tmpChannelFrom.set(from.sunColor), this.tmpChannelTo.set(to.sunColor), t); this.sun.color.copy(this.sunColor);
    this.skyColor.lerpColors(this.tmpChannelFrom.set(from.skyColor), this.tmpChannelTo.set(to.skyColor), t);
    this.fogColor.lerpColors(this.tmpChannelFrom.set(from.fogColor), this.tmpChannelTo.set(to.fogColor), t);
    this.scene.background = this.background; // assigned ONCE — see the field note
    this.background.copy(this.skyColor);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.fogColor);
    this.updateLamps();
  }
}
