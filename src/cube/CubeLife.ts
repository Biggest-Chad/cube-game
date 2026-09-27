/**
 * Orbiting motes and a scan band around the lattice. One extra instanced
 * draw plus one ring. No lights. Positions stay in cube-local space.
 */
import * as THREE from 'three';

const _dummy = new THREE.Object3D();
const _healthy = new THREE.Color(0x7ef0ff);
const _hurt = new THREE.Color(0xff8844);

export class CubeLife {
  private motes: THREE.InstancedMesh | null = null;
  private ring: THREE.Mesh | null = null;
  private t = 0;
  private readonly count = 14;

  mount(host: THREE.Group, halfExtent: number): void {
    this.clear();
    const half = Math.max(1.2, halfExtent);
    const geo = new THREE.SphereGeometry(0.16, 6, 5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7ef0ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const motes = new THREE.InstancedMesh(geo, mat, this.count);
    motes.name = 'CubeLifeMotes';
    motes.frustumCulled = false;
    motes.count = this.count;
    host.add(motes);
    this.motes = motes;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(half * 1.08, half * 1.16, 48),
      new THREE.MeshBasicMaterial({
        color: 0x66f0ff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );
    ring.name = 'CubeLifeScan';
    ring.rotation.x = -Math.PI / 2;
    ring.frustumCulled = false;
    host.add(ring);
    this.ring = ring;
    this.update(0, half, 1, 0);
  }

  update(dt: number, halfExtent: number, aliveRatio: number, excitement: number): void {
    this.t += dt;
    const half = Math.max(1.2, halfExtent);
    const hurt = 1 - THREE.MathUtils.clamp(aliveRatio, 0, 1);
    const speed = 0.35 + hurt * 0.85 + excitement * 0.4;
    if (this.motes) {
      const mat = this.motes.material as THREE.MeshBasicMaterial;
      mat.color.copy(_healthy).lerp(_hurt, hurt);
      const rad = half * (1.38 + hurt * 0.1);
      for (let i = 0; i < this.count; i++) {
        const band = i < this.count / 2 ? 0 : 1;
        const a = this.t * speed * (band ? -0.8 : 1) + (i / this.count) * Math.PI * 2;
        const lift = Math.sin(a * 2 + i) * half * 0.28;
        if (band === 0) {
          _dummy.position.set(Math.cos(a) * rad, lift, Math.sin(a) * rad);
        } else {
          _dummy.position.set(Math.cos(a) * rad, Math.sin(a) * rad, lift);
        }
        const s = 0.7 + (i % 3) * 0.22;
        _dummy.scale.setScalar(s);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        this.motes.setMatrixAt(i, _dummy.matrix);
      }
      this.motes.instanceMatrix.needsUpdate = true;
    }
    if (this.ring) {
      const u = (this.t * (0.12 + hurt * 0.1)) % 1;
      this.ring.position.y = (u * 2 - 1) * half * 0.92;
      const mat = this.ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.sin(u * Math.PI) * (0.42 + excitement * 0.15);
      mat.color.copy(_healthy).lerp(_hurt, hurt);
    }
  }

  clear(): void {
    for (const mesh of [this.motes, this.ring]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    this.motes = null;
    this.ring = null;
  }
}
