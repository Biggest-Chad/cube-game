import * as THREE from 'three';
import { COLORS } from '../data/constants';

interface Ring {
  mesh: THREE.Mesh;
  outer: THREE.Mesh;
  life: number;
  maxLife: number;
  active: boolean;
  baseScale: number;
}

/** Multi-layer expanding impact rings — punchy neon shockwaves. */
export class ImpactRings {
  readonly group = new THREE.Group();
  private pool: Ring[] = [];

  constructor(count = 28) {
    const geo = new THREE.RingGeometry(0.12, 0.32, 16);
    const geoOuter = new THREE.RingGeometry(0.3, 0.42, 16);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const matO = new THREE.MeshBasicMaterial({
        color: COLORS.magenta,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const outer = new THREE.Mesh(geoOuter, matO);
      mesh.visible = false;
      outer.visible = false;
      mesh.frustumCulled = false;
      outer.frustumCulled = false;
      this.group.add(mesh, outer);
      this.pool.push({ mesh, outer, life: 0, maxLife: 0.4, active: false, baseScale: 1 });
    }
  }

  spawn(x: number, y: number, z: number, color: number = COLORS.cyan, scale = 1): void {
    const ring = this.pool.find((r) => !r.active);
    if (!ring) return;
    ring.active = true;
    ring.life = 0.38 + Math.random() * 0.18;
    ring.maxLife = ring.life;
    ring.baseScale = scale * 1.25;
    ring.mesh.position.set(x, y, z);
    ring.outer.position.set(x, y, z);
    ring.mesh.scale.setScalar(0.25 * scale);
    ring.outer.scale.setScalar(0.2 * scale);
    ring.mesh.visible = true;
    ring.outer.visible = true;
    ring.mesh.lookAt(0, 0, 0);
    ring.outer.lookAt(0, 0, 0);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    (ring.outer.material as THREE.MeshBasicMaterial).color.setHex(
      color === COLORS.magenta ? COLORS.cyan : COLORS.magenta
    );
    (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
    (ring.outer.material as THREE.MeshBasicMaterial).opacity = 0.5;
  }

  update(dt: number): void {
    for (const r of this.pool) {
      if (!r.active) continue;
      r.life -= dt;
      const t = Math.max(0, r.life / r.maxLife);
      const age = 1 - t;
      const grow = r.baseScale * (0.3 + age * 4.2);
      r.mesh.scale.setScalar(grow);
      r.outer.scale.setScalar(grow * 1.15);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = t * t * 0.95;
      (r.outer.material as THREE.MeshBasicMaterial).opacity = t * t * 0.45;
      if (r.life <= 0) {
        r.active = false;
        r.mesh.visible = false;
        r.outer.visible = false;
      }
    }
  }

  dispose(): void {
    for (const r of this.pool) {
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
      r.outer.geometry.dispose();
      (r.outer.material as THREE.Material).dispose();
    }
  }
}
