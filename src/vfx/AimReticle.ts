/**
 * Subtle world-space aim reticle for the main gun.
 * Sits on the first block hit (or far along the aim ray if miss).
 */
import * as THREE from 'three';
import { COLORS } from '../data/constants';
import type { CubeManager } from '../cube/CubeManager';

export class AimReticle {
  readonly group = new THREE.Group();
  private ring: THREE.Mesh;
  private ring2: THREE.Mesh;
  private crossH: THREE.Mesh;
  private crossV: THREE.Mesh;
  private dot: THREE.Mesh;
  private visible = true;
  private pulse = 0;
  private readonly _pos = new THREE.Vector3();
  private readonly _n = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _m = new THREE.Matrix4();
  private readonly _up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 32), ringMat);
    this.ring2 = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.38, 32),
      new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    );

    const barMat = new THREE.MeshBasicMaterial({
      color: COLORS.white,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.02), barMat);
    this.crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.18), barMat.clone());
    this.dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 12),
      new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );

    this.group.add(this.ring, this.ring2, this.crossH, this.crossV, this.dot);
    this.group.visible = false;
    this.group.renderOrder = 10;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) this.group.visible = false;
  }

  /**
   * @param origin muzzle world position
   * @param direction normalized aim
   * @param cube cube manager for raycast
   * @param camera for billboard fall-back when facing camera
   */
  update(
    dt: number,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    cube: CubeManager,
    camera: THREE.Camera
  ): void {
    if (!this.visible) {
      this.group.visible = false;
      return;
    }

    this.pulse += dt * 3;
    const hit = cube.raycast(origin, direction, 120);

    if (hit) {
      this._pos.copy(hit.point);
      // Offset slightly toward camera so it doesn't z-fight into the block
      this._n.copy(camera.position).sub(this._pos).normalize();
      this._pos.addScaledVector(this._n, 0.08);
      this.group.position.copy(this._pos);
      // Face camera
      this.group.quaternion.copy(camera.quaternion);
      this.group.visible = true;
      this.group.scale.setScalar(0.95 + Math.sin(this.pulse) * 0.04);

      const onTarget = true;
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.pulse * 2) * 0.1;
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(
        onTarget ? COLORS.cyan : COLORS.white
      );
      (this.dot.material as THREE.MeshBasicMaterial).opacity = 0.75;
    } else {
      // Soft far reticle along aim (no lock)
      this._pos.copy(origin).addScaledVector(direction, 28);
      this.group.position.copy(this._pos);
      this.group.quaternion.copy(camera.quaternion);
      this.group.visible = true;
      this.group.scale.setScalar(0.7);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.2;
      (this.dot.material as THREE.MeshBasicMaterial).opacity = 0.25;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.group.clear();
  }
}
