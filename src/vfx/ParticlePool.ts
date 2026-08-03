import * as THREE from 'three';
import { PERF } from '../data/constants';

export type ParticleStyle = 'spark' | 'debris' | 'glow' | 'ember';

interface Particle {
  active: boolean;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  drag: number;
  gravity: number;
  style: ParticleStyle;
  cr: number;
  cg: number;
  cb: number;
}

export class ParticlePool {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private max: number;
  private geo: THREE.BufferGeometry;
  private mat: THREE.PointsMaterial;
  private scratchColor = new THREE.Color();

  constructor(max = PERF.maxParticles) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.mat = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;

    for (let i = 0; i < max; i++) {
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 1,
        vx: 0,
        vy: 0,
        vz: 0,
        drag: 0.98,
        gravity: 0,
        style: 'spark',
        cr: 1,
        cg: 1,
        cb: 1,
      });
      this.positions[i * 3 + 1] = -9999;
    }
  }

  setBudget(maxActive: number): void {
    this.max = Math.min(this.particles.length, maxActive);
    this.mat.size = maxActive < PERF.maxParticles * 0.5 ? 0.14 : 0.2;
  }

  spawn(
    x: number,
    y: number,
    z: number,
    color: number,
    count: number,
    speed = 4,
    style: ParticleStyle = 'spark'
  ): void {
    this.scratchColor.setHex(color);
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active || i >= this.max) continue;

      p.active = true;
      p.style = style;
      p.cr = this.scratchColor.r;
      p.cg = this.scratchColor.g;
      p.cb = this.scratchColor.b;

      if (style === 'debris') {
        p.life = 0.5 + Math.random() * 0.55;
        p.drag = 0.96;
        p.gravity = 4 + Math.random() * 3;
      } else if (style === 'glow') {
        p.life = 0.22 + Math.random() * 0.28;
        p.drag = 0.9;
        p.gravity = -0.8;
      } else if (style === 'ember') {
        p.life = 0.55 + Math.random() * 0.7;
        p.drag = 0.97;
        p.gravity = 1.4;
      } else {
        p.life = 0.18 + Math.random() * 0.28;
        p.drag = 0.93;
        p.gravity = 0.6;
      }
      p.maxLife = p.life;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.55 + Math.random() * 0.75);
      p.vx = Math.sin(phi) * Math.cos(theta) * sp;
      p.vy = Math.sin(phi) * Math.sin(theta) * sp;
      p.vz = Math.cos(phi) * sp;

      const i3 = i * 3;
      this.positions[i3] = x + (Math.random() - 0.5) * 0.15;
      this.positions[i3 + 1] = y + (Math.random() - 0.5) * 0.15;
      this.positions[i3 + 2] = z + (Math.random() - 0.5) * 0.15;
      this.colors[i3] = p.cr;
      this.colors[i3 + 1] = p.cg;
      this.colors[i3 + 2] = p.cb;
      spawned++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  spray(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    color: number,
    count: number,
    speed = 8
  ): void {
    this.scratchColor.setHex(color);
    const n = new THREE.Vector3(nx, ny, nz).normalize();
    const tmp = new THREE.Vector3();
    const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const t1 = new THREE.Vector3().crossVectors(n, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();

    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active || i >= this.max) continue;
      p.active = true;
      p.style = 'spark';
      p.life = 0.14 + Math.random() * 0.22;
      p.maxLife = p.life;
      p.drag = 0.92;
      p.gravity = 1.2;
      p.cr = this.scratchColor.r;
      p.cg = this.scratchColor.g;
      p.cb = this.scratchColor.b;

      const cone = 0.6;
      tmp
        .copy(n)
        .addScaledVector(t1, (Math.random() - 0.5) * cone)
        .addScaledVector(t2, (Math.random() - 0.5) * cone)
        .normalize()
        .multiplyScalar(speed * (0.45 + Math.random()));
      p.vx = tmp.x;
      p.vy = tmp.y;
      p.vz = tmp.z;

      const i3 = i * 3;
      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = z;
      this.colors[i3] = p.cr;
      this.colors[i3 + 1] = p.cg;
      this.colors[i3 + 2] = p.cb;
      spawned++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      any = true;
      p.life -= dt;
      const i3 = i * 3;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag - p.gravity * dt;
      p.vz *= p.drag;
      this.positions[i3] += p.vx * dt;
      this.positions[i3 + 1] += p.vy * dt;
      this.positions[i3 + 2] += p.vz * dt;

      if (p.life <= 0) {
        p.active = false;
        this.positions[i3 + 1] = -9999;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
      } else {
        const t = p.life / p.maxLife;
        const fade = t * t;
        this.colors[i3] = p.cr * fade;
        this.colors[i3 + 1] = p.cg * fade;
        this.colors[i3 + 2] = p.cb * fade;
      }
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
