import * as THREE from 'three';
import { COLORS } from '../data/constants';

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
  baseScale: number;
}

/** Expanding emissive rings at impact / destroy points. */
export class ImpactRings {
  readonly group = new THREE.Group();
  private pool: Ring[] = [];

  constructor(count = 24) {
    const geo = new THREE.RingGeometry(0.15, 0.28, 24);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pool.push({ mesh, life: 0, maxLife: 0.35, active: false, baseScale: 1 });
    }
  }

  spawn(x: number, y: number, z: number, color: number = COLORS.cyan, scale = 1): void {
    const ring = this.pool.find((r) => !r.active);
    if (!ring) return;
    ring.active = true;
    ring.life = 0.28 + Math.random() * 0.12;
    ring.maxLife = ring.life;
    ring.baseScale = scale;
    ring.mesh.position.set(x, y, z);
    ring.mesh.scale.setScalar(0.35 * scale);
    ring.mesh.visible = true;
    ring.mesh.lookAt(0, 0, 0);
    const mat = ring.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = 0.7;
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.active) continue;
      r.life -= dt;
      const t = Math.max(0, r.life / r.maxLife);
      const age = 1 - t;
      const grow = r.baseScale * (0.35 + age * 3.2);
      r.mesh.scale.setScalar(grow);
      const mat = r.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t * t * 0.85;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }

  dispose(): void {
    for (const r of this.pool) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
  }
}
