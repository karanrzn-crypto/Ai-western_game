import * as THREE from 'three';

export interface DayNightCycleOptions {
  dayDurationSeconds?: number;
  startTime?: number;
}

/** Smooth 24-hour lighting cycle for the playable world. */
export class DayNightCycle {
  private readonly scene: THREE.Scene;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly dayDuration: number;
  private timeOfDay: number;

  private readonly dayColor = new THREE.Color(0x9a8d72);
  private readonly nightColor = new THREE.Color(0x101827);
  private readonly dawnColor = new THREE.Color(0x6f5b55);
  private readonly currentColor = new THREE.Color();
  private readonly skyColor = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    sun: THREE.DirectionalLight,
    hemisphere: THREE.HemisphereLight,
    options: DayNightCycleOptions = {},
  ) {
    this.scene = scene;
    this.sun = sun;
    this.hemisphere = hemisphere;
    this.dayDuration = Math.max(10, options.dayDurationSeconds ?? 180);
    this.timeOfDay = ((options.startTime ?? 8) % 24 + 24) % 24;
    this.apply();
  }

  update(deltaSeconds: number): void {
    this.timeOfDay = (this.timeOfDay + (deltaSeconds * 24) / this.dayDuration) % 24;
    this.apply();
  }

  getTimeOfDay(): number {
    return this.timeOfDay;
  }

  setTimeOfDay(hours: number): void {
    this.timeOfDay = ((hours % 24) + 24) % 24;
    this.apply();
  }

  private apply(): void {
    const angle = ((this.timeOfDay - 6) / 24) * Math.PI * 2;
    const daylight = Math.max(0, Math.sin(angle));
    const warm = Math.max(0, 1 - Math.abs(daylight - 0.35) / 0.35);

    this.sun.position.set(
      Math.cos(angle) * 35,
      Math.sin(angle) * 40,
      15,
    );
    this.sun.intensity = 0.12 + daylight * 2.1;
    this.hemisphere.intensity = 0.3 + daylight * 0.9;

    if (daylight > 0.08) {
      this.currentColor.lerpColors(this.nightColor, this.dayColor, daylight);
      if (warm > 0) this.currentColor.lerp(this.dawnColor, warm * 0.28);
    } else {
      const dusk = daylight / 0.08;
      this.currentColor.lerpColors(this.nightColor, this.dawnColor, Math.max(0, dusk));
    }

    this.skyColor.copy(this.currentColor);
    this.scene.background = this.skyColor.clone();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.skyColor);
    }
  }
}
