/**
 * Block destruction: particle bursts + mesh debris with simple physics.
 * Fragments fade out to avoid clutter.
 */
import * as THREE from 'three';
import { colorForType, BlockType } from '../cube/BlockTypes';
import type { ParticlePool } from './ParticlePool';

export type ShatterStyle = 'beam' | 'bolt' | 'splash' | 'explosive' | 'default';

interface DebrisPiece {
  active: boolean;
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  life: number;
  maxLife: number;
}

const POOL = 96;

export class ShatterSystem {
  readonly group = new THREE.Group();
  private pieces: DebrisPiece[] = [];
  private next = 0;

  constructor(private pool: ParticlePool) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pieces.push({
        active: false,
        mesh,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        life: 0,
        maxLife: 1,
      });
    }
  }

  /**
   * Full block destroy with style-based physics.
   * @param nx,ny,nz optional impact direction (from attacker → block)
   */
  shatter(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    style: ShatterStyle = 'default',
    nx = 0,
    ny = 0,
    nz = 0,
    /** 0.3–1: scale particle/mesh count for mobile GPU budget */
    vfxScale = 1
  ): void {
    const color = colorForType(type);
    const isCore = type === BlockType.Core;
    const isExplosive = type === BlockType.Explosive || style === 'explosive';
    const isData = type === BlockType.DataNode;
    const vs = Math.max(0.25, Math.min(1, vfxScale));

    // Particle punch (scaled for thermal/FPS budget)
    const nDebris = Math.max(2, Math.floor((isCore ? 22 : isExplosive ? 20 : 14) * vs));
    const speed = isExplosive ? 12 : style === 'beam' ? 6 : style === 'bolt' ? 9 : 7;
    this.pool.spawn(x, y, z, color, nDebris, speed, 'debris');
    this.pool.spawn(x, y, z, 0xffffff, Math.max(2, Math.floor((isCore ? 12 : 7) * vs)), 6, 'glow');
    this.pool.spawn(
      x,
      y,
      z,
      color,
      Math.max(2, Math.floor((style === 'beam' ? 16 : 10) * vs)),
      12,
      'spark'
    );

    if (isExplosive) {
      this.pool.spawn(x, y, z, 0xff6622, Math.max(4, Math.floor(24 * vs)), 16, 'ember');
      if (vs > 0.5) this.pool.spawn(x, y, z, 0xffaa44, Math.max(3, Math.floor(12 * vs)), 9, 'glow');
    }
    if (isData && vs > 0.4) {
      this.pool.spawn(x, y, z, 0xaa66ff, Math.max(3, Math.floor(16 * vs)), 7, 'ember');
    }
    if (isCore) {
      this.pool.spawn(x, y, z, 0xff4488, Math.max(4, Math.floor(20 * vs)), 14, 'spark');
    }

    // Mesh debris with physics
    const count = Math.max(2, Math.floor((isCore ? 10 : isExplosive ? 12 : 7) * vs));
    const len = Math.hypot(nx, ny, nz);
    const ix = len > 1e-4 ? nx / len : 0;
    const iy = len > 1e-4 ? ny / len : 0;
    const iz = len > 1e-4 ? nz / len : 0;

    for (let i = 0; i < count; i++) {
      const p = this.pieces[this.next % POOL];
      this.next++;
      p.active = true;
      p.life = 0.55 + Math.random() * 0.55;
      p.maxLife = p.life;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.mesh.scale.setScalar(0.55 + Math.random() * 0.7);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 1;

      // Radial explode + impact bias
      const rx = (Math.random() - 0.5) * 2;
      const ry = (Math.random() - 0.5) * 2;
      const rz = (Math.random() - 0.5) * 2;
      let sp = 2.5 + Math.random() * 4;

      if (style === 'beam') {
        // Melt / soft outward drift
        sp *= 0.55;
        p.vy = 0.8 + Math.random() * 1.5;
        p.life *= 0.85;
      } else if (style === 'bolt') {
        // Punch along shot direction + scatter
        sp *= 1.15;
        p.vx = rx * sp + ix * (4 + Math.random() * 5);
        p.vy = ry * sp + iy * (3 + Math.random() * 4) + 1.5;
        p.vz = rz * sp + iz * (4 + Math.random() * 5);
      } else if (style === 'explosive' || isExplosive) {
        sp *= 1.8;
        p.vx = rx * sp;
        p.vy = Math.abs(ry) * sp + 3;
        p.vz = rz * sp;
      } else if (style === 'splash') {
        sp *= 1.1;
        p.vx = rx * sp;
        p.vy = Math.abs(ry) * sp * 0.6 + 1;
        p.vz = rz * sp;
      } else {
        p.vx = rx * sp + ix * 2;
        p.vy = ry * sp + 2;
        p.vz = rz * sp + iz * 2;
      }

      if (style === 'beam') {
        p.vx = rx * sp + ix * 1.2;
        p.vz = rz * sp + iz * 1.2;
      }

      p.rx = (Math.random() - 0.5) * 12;
      p.ry = (Math.random() - 0.5) * 12;
      p.rz = (Math.random() - 0.5) * 12;
    }
  }

  impact(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    crit = false
  ): void {
    const col = crit ? 0xffffff : 0x00f0ff;
    this.pool.spray(x, y, z, nx, ny, nz, col, crit ? 16 : 10, crit ? 16 : 11);
    this.pool.spawn(x, y, z, crit ? 0xff00aa : 0x00f0ff, crit ? 8 : 4, 4, 'glow');
  }

  update(dt: number): void {
    const g = 9.5;
    for (const p of this.pieces) {
      if (!p.active) continue;
      p.life -= dt;
      p.vy -= g * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += p.rx * dt;
      p.mesh.rotation.y += p.ry * dt;
      p.mesh.rotation.z += p.rz * dt;
      // Drag
      p.vx *= 1 - 1.8 * dt;
      p.vz *= 1 - 1.8 * dt;

      const t = Math.max(0, p.life / p.maxLife);
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t * t;
      p.mesh.scale.multiplyScalar(1 - dt * 0.35);

      if (p.life <= 0 || p.mesh.position.y < -40) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  dispose(): void {
    for (const p of this.pieces) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.group.clear();
  }
}
