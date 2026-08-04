/**
 * World-space reticle disabled — aim is a fixed neon HUD overlay (depth-independent).
 * Kept as a thin facade so Game call sites stay stable.
 */
import * as THREE from 'three';
import type { CubeManager } from '../cube/CubeManager';

export class AimReticle {
  readonly group = new THREE.Group();
  private visible = false;

  constructor() {
    this.group.visible = false;
    this.group.name = 'AimReticleDisabled';
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.group.visible = false;
  }

  /** No-op: HUD crosshair is driven from Game/HUD instead. */
  update(
    _dt: number,
    _origin: THREE.Vector3,
    _direction: THREE.Vector3,
    _cube: CubeManager,
    _camera: THREE.Camera
  ): void {
    this.group.visible = false;
    void this.visible;
  }

  dispose(): void {
    this.group.clear();
  }
}
