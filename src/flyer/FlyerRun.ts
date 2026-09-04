/**
 * Auto-forward transit corridor. Left stick strafes; right stick tap shoots
 * a locked destructible. Hits drain shield/hull; speed pickups stack.
 */
import * as THREE from 'three';
import {
  FLYER_BASE_SPEED,
  FLYER_DURATION_SECONDS,
  FLYER_HIT_COOLDOWN,
  FLYER_LANE_HALF,
  FLYER_LOCK_AHEAD,
  FLYER_LOCK_XY,
  FLYER_SPEED_MUL_CAP,
  FLYER_SPEED_PICKUP_MUL,
  FLYER_STRAFE,
  flyerHitProfile,
  flyerLatticeReward,
  flyerSceneTitle,
  flyerStars,
  type FlyerHitKind,
  type FlyerSceneId,
} from '../data/flyer';

type Kind = 'solid' | 'emp' | 'mine' | 'gate' | 'speed';

interface Node {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  r: number;
  mesh: THREE.Object3D;
  alive: boolean;
}

export interface FlyerResult {
  stars: 1 | 2 | 3;
  lattice: number;
  time: number;
  hullRatio: number;
  hits: number;
  scene: FlyerSceneId;
}

const PALETTE: Record<FlyerSceneId, { fog: number; accent: number; fill: number; glow: number }> = {
  canyon: { fog: 0x160820, accent: 0x44f0ff, fill: 0x121820, glow: 0xff3aa8 },
  wormhole: { fog: 0x120018, accent: 0xb44cff, fill: 0x1a0828, glow: 0x66e8ff },
  yard: { fog: 0x1a1008, accent: 0xffb020, fill: 0x2a1c10, glow: 0xff6622 },
  rift: { fog: 0x07141c, accent: 0x9ef2ff, fill: 0x102028, glow: 0x7ad8ff },
};

export class FlyerRun {
  readonly root = new THREE.Group();
  readonly sceneId: FlyerSceneId;
  readonly title: string;
  readonly parTime = FLYER_DURATION_SECONDS;
  z = 0;
  x = 0;
  y = 0;
  speedMul = 1;
  t = 0;
  hits = 0;
  finished = false;
  failed = false;
  lockOn = false;
  private nodes: Node[] = [];
  private hitCd = 0;
  private readonly courseLen: number;
  private readonly pal: (typeof PALETTE)[FlyerSceneId];
  private readonly dummy = new THREE.Object3D();
  private readonly _fwd = new THREE.Vector3(0, 0, 1);
  fogColor: number;

  constructor(sceneId: FlyerSceneId) {
    this.sceneId = sceneId;
    this.title = flyerSceneTitle(sceneId);
    this.pal = PALETTE[sceneId];
    this.fogColor = this.pal.fog;
    this.courseLen = FLYER_BASE_SPEED * FLYER_DURATION_SECONDS;
    this.root.name = 'FlyerRun';
    this.buildDecor();
    this.scatter();
  }

  private col(kind: Kind): number {
    if (kind === 'emp') return this.pal.accent;
    if (kind === 'mine') return 0xff3355;
    if (kind === 'gate') return this.pal.glow;
    if (kind === 'speed') return 0x66ffaa;
    return this.pal.fill;
  }

  private buildDecor(): void {
    const p = this.pal;
    if (this.sceneId === 'wormhole') {
      for (let i = 0; i < 28; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(8.4, 0.18, 6, 32),
          new THREE.MeshBasicMaterial({
            color: p.accent,
            transparent: true,
            opacity: 0.35,
            toneMapped: false,
          })
        );
        ring.position.z = i * 42 + 20;
        this.root.add(ring);
      }
      return;
    }
    const wallMat = new THREE.MeshBasicMaterial({
      color: p.fill,
      toneMapped: false,
      fog: true,
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = this.sceneId === 'canyon' ? 90 : 70;
    const walls = new THREE.InstancedMesh(geo, wallMat, n);
    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const h = this.sceneId === 'rift' ? 4 + (i % 5) * 1.4 : 8 + (i % 7) * 2.2;
      this.dummy.position.set(side * (9.2 + (i % 3)), h * 0.5 - 1.2, 18 + i * 14);
      this.dummy.rotation.set(0, (i % 5) * 0.08, 0);
      this.dummy.scale.set(2.4 + (i % 3), h, 3.2);
      this.dummy.updateMatrix();
      walls.setMatrixAt(i, this.dummy.matrix);
    }
    walls.instanceMatrix.needsUpdate = true;
    this.root.add(walls);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, this.courseLen + 40),
      new THREE.MeshBasicMaterial({ color: p.fog, toneMapped: false, fog: true })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -3.4, this.courseLen * 0.5);
    this.root.add(floor);
  }

  private scatter(): void {
    let z = 22;
    let i = 0;
    while (z < this.courseLen - 18) {
      const roll = hash(i, 3);
      let kind: Kind = 'solid';
      if (roll > 0.86) kind = 'speed';
      else if (roll > 0.72) kind = 'gate';
      else if (roll > 0.55) kind = 'emp';
      else if (roll > 0.38) kind = 'mine';
      const x = (hash(i, 7) - 0.5) * FLYER_LANE_HALF * 1.7;
      const y = (hash(i, 11) - 0.5) * 3.6;
      const r = kind === 'gate' ? 1.5 : kind === 'speed' ? 1.1 : 1.05;
      const mesh = this.makeMesh(kind, r);
      mesh.position.set(x, y, z);
      this.root.add(mesh);
      this.nodes.push({ kind, x, y, z, r, mesh, alive: true });
      i++;
      z += 9 + hash(i, 13) * 8;
    }
  }

  private makeMesh(kind: Kind, r: number): THREE.Object3D {
    const c = this.col(kind);
    if (kind === 'speed') {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.12, 6, 16),
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
        })
      );
      m.rotation.x = Math.PI / 2;
      return m;
    }
    if (kind === 'emp') {
      return new THREE.Mesh(
        new THREE.OctahedronGeometry(r, 0),
        new THREE.MeshBasicMaterial({
          color: c,
          transparent: true,
          opacity: 0.8,
          toneMapped: false,
        })
      );
    }
    if (kind === 'gate') {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 2.8, 0.28),
          new THREE.MeshBasicMaterial({
            color: c,
            transparent: true,
            opacity: 0.55,
            toneMapped: false,
          })
        )
      );
      return g;
    }
    const geo = kind === 'mine' ? new THREE.SphereGeometry(r, 8, 8) : new THREE.BoxGeometry(r * 1.8, r * 1.8, r * 1.8);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  }

  shipPos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y, this.z);
  }

  lookTarget(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y, this.z + 16);
  }

  camPos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x * 0.35, this.y * 0.35 + 2.2, this.z - 8.5);
  }

  lockedNode(): Node | null {
    let best: Node | null = null;
    let bestD = FLYER_LOCK_AHEAD;
    for (const n of this.nodes) {
      if (!n.alive || n.kind !== 'gate') continue;
      const dz = n.z - this.z;
      if (dz < 3.2 || dz > FLYER_LOCK_AHEAD) continue;
      const xy = Math.hypot(n.x - this.x, n.y - this.y);
      if (xy > FLYER_LOCK_XY) continue;
      if (dz < bestD) {
        bestD = dz;
        best = n;
      }
    }
    return best;
  }

  update(
    dt: number,
    axisX: number,
    axisY: number,
    fire: boolean,
    onHit: (kind: FlyerHitKind, shield: number, hull: number) => boolean
  ): void {
    if (this.finished || this.failed) return;
    this.t += dt;
    this.hitCd = Math.max(0, this.hitCd - dt);
    this.z += FLYER_BASE_SPEED * this.speedMul * dt;
    this.x = THREE.MathUtils.clamp(this.x + axisX * FLYER_STRAFE * dt, -FLYER_LANE_HALF, FLYER_LANE_HALF);
    this.y = THREE.MathUtils.clamp(this.y - axisY * FLYER_STRAFE * dt, -3.4, 4.2);

    const lock = this.lockedNode();
    this.lockOn = !!lock;
    if (fire && lock) {
      lock.alive = false;
      lock.mesh.visible = false;
    }

    for (const n of this.nodes) {
      if (!n.alive) continue;
      const dz = n.z - this.z;
      if (dz < -2.5 || dz > 8) continue;
      const d = Math.hypot(n.x - this.x, n.y - this.y, dz);
      if (d > n.r + 0.85) continue;
      if (n.kind === 'speed') {
        n.alive = false;
        n.mesh.visible = false;
        this.speedMul = Math.min(FLYER_SPEED_MUL_CAP, this.speedMul * FLYER_SPEED_PICKUP_MUL);
        continue;
      }
      if (n.kind === 'gate' && !n.alive) continue;
      if (this.hitCd > 0) continue;
      const kind: FlyerHitKind = n.kind === 'emp' || n.kind === 'mine' || n.kind === 'gate' ? n.kind : 'solid';
      n.alive = false;
      n.mesh.visible = false;
      this.speedMul = 1;
      this.hitCd = FLYER_HIT_COOLDOWN;
      this.hits++;
      const dmg = flyerHitProfile(kind);
      const died = onHit(kind, dmg.shield, dmg.hull);
      if (died) {
        this.failed = true;
        return;
      }
    }

    if (this.z >= this.courseLen) this.finished = true;
  }

  result(levelId: number, hullRatio: number): FlyerResult {
    const stars = flyerStars(hullRatio, this.t, this.parTime);
    return {
      stars,
      lattice: flyerLatticeReward(stars, levelId),
      time: this.t,
      hullRatio,
      hits: this.hits,
      scene: this.sceneId,
    };
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else (m as THREE.Material).dispose();
      }
    });
    this.root.clear();
    this.nodes = [];
  }
}

function hash(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
