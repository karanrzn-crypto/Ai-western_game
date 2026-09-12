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
function findFramePair(hours: number): { from: Keyframe; to: Keyframe; t: number } {
  const normalized = normalizeHour(hours);
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    const from = KEYFRAMES[i]!; const to = KEYFRAMES[i + 1]!;
    if (normalized >= from.time && normalized <= to.time) return { from, to, t: smoothstep((normalized - from.time) / Math.max(to.time - from.time, 1e-6)) };
  }
  return { from: KEYFRAMES[0]!, to: KEYFRAMES[1]!, t: 0 };
}

export class DayNightCycle {
  private readonly scene: THREE.Scene; private readonly sun: THREE.DirectionalLight; private readonly hemisphere: THREE.HemisphereLight;
  private readonly dayDuration: number; private readonly sunDistance: number; private readonly sunHeight: number; private timeOfDay: number;
  private readonly skyColor = new THREE.Color(); private readonly fogColor = new THREE.Color(); private readonly sunColor = new THREE.Color();
  constructor(scene: THREE.Scene, sun: THREE.DirectionalLight, hemisphere: THREE.HemisphereLight, options: DayNightCycleOptions = {}) {
    this.scene = scene; this.sun = sun; this.hemisphere = hemisphere; this.dayDuration = Math.max(10, options.dayDurationSeconds ?? 180);
    this.sunDistance = Math.max(10, options.sunDistance ?? 38); this.sunHeight = Math.max(10, options.sunHeight ?? 42); this.timeOfDay = normalizeHour(options.startTime ?? 8); this.apply();
  }
  update(deltaSeconds: number): void { this.timeOfDay = normalizeHour(this.timeOfDay + (deltaSeconds * 24) / this.dayDuration); this.apply(); }
  getTimeOfDay(): number { return this.timeOfDay; }
  setTimeOfDay(hours: number): void { this.timeOfDay = normalizeHour(hours); this.apply(); }
  getSnapshot(): DayNightSnapshot { return { timeOfDay: this.timeOfDay, sunIntensity: this.sun.intensity, hemisphereIntensity: this.hemisphere.intensity, skyColor: `#${this.skyColor.getHexString()}`, fogColor: `#${this.fogColor.getHexString()}`, sunPosition: { x: this.sun.position.x, y: this.sun.position.y, z: this.sun.position.z } }; }
  private apply(): void {
    const { from, to, t } = findFramePair(this.timeOfDay); const orbitAngle = ((this.timeOfDay - 6) / 24) * Math.PI * 2; const sunAltitude = Math.sin(orbitAngle); const daylight = Math.max(0, sunAltitude);
    this.sun.position.set(Math.cos(orbitAngle) * this.sunDistance, sunAltitude * this.sunHeight, 12 + daylight * 12);
    this.sun.intensity = lerpNumber(from.sunIntensity, to.sunIntensity, t); this.hemisphere.intensity = lerpNumber(from.hemisphereIntensity, to.hemisphereIntensity, t);
    this.sunColor.lerpColors(new THREE.Color(from.sunColor), new THREE.Color(to.sunColor), t); this.sun.color.copy(this.sunColor);
    this.skyColor.lerpColors(new THREE.Color(from.skyColor), new THREE.Color(to.skyColor), t); this.fogColor.lerpColors(new THREE.Color(from.fogColor), new THREE.Color(to.fogColor), t);
    this.scene.background = this.skyColor.clone(); if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(this.fogColor);
  }
}
