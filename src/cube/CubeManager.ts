import * as THREE from 'three';
import { CHUNK_SIZE } from '../data/constants';
import type { LevelDefinition } from '../data/levels';
import { bus } from '../core/EventBus';
import { BLOCK_DEFS, BlockType, colorForType } from './BlockTypes';
import { Chunk } from './Chunk';
import { chunkWorldPosition, generateCube, type GeneratedCube } from './LevelGenerator';

const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);

export interface DamageResult {
  destroyed: boolean;
  type: BlockType;
  x: number;
  y: number;
  z: number;
  fragments: number;
  explosive: boolean;
}

interface InstanceRef {
  chunk: Chunk;
  localIndex: number;
  instanceId: number;
}

export class CubeManager {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private material: THREE.MeshStandardMaterial;
  private generated: GeneratedCube | null = null;
  private level: LevelDefinition | null = null;
  /** Maps instanceId -> ref; dense 0..count-1 */
  private refs: InstanceRef[] = [];
  /** Maps chunkKey+localIndex -> instanceId */
  private lookup = new Map<string, number>();
  private maxInstances = 0;
  aliveBlocks = 0;
  totalBlocks = 0;
  private regenTimer = 0;
  private flashMap = new Map<number, number>();

  constructor() {
    // Low global emissive — per-instance color carries hue; keeps bloom from washing out the cube
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x000000,
      emissiveIntensity: 0,
      metalness: 0.25,
      roughness: 0.42,
      toneMapped: true,
    });
  }

  get halfExtent(): number {
    return this.generated?.halfExtent ?? 4;
  }

  get size(): number {
    return this.generated?.size ?? 0;
  }

  get progress(): number {
    if (this.totalBlocks <= 0) return 1;
    return 1 - this.aliveBlocks / this.totalBlocks;
  }

  loadLevel(level: LevelDefinition): void {
    this.disposeMesh();
    this.level = level;
    this.generated = generateCube(level);
    this.totalBlocks = this.generated.totalBlocks;
    this.aliveBlocks = this.generated.totalBlocks;
    this.refs = [];
    this.lookup.clear();
    this.flashMap.clear();

    this.maxInstances = Math.max(this.totalBlocks + 64, 512);
    const geo = new THREE.BoxGeometry(0.92, 0.92, 0.92);
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.maxInstances);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.group.clear();
    this.group.add(this.mesh);

    // Wireframe outline shell for premium look
    const shellSize = level.size * 1.02;
    const shellGeo = new THREE.BoxGeometry(shellSize, shellSize, shellSize);
    const shellMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.06,
    });
    this.group.add(new THREE.Mesh(shellGeo, shellMat));

    this.rebuildAllInstances();
  }

  private key(chunk: Chunk, localIndex: number): string {
    return `${chunk.cx},${chunk.cy},${chunk.cz}:${localIndex}`;
  }

  private rebuildAllInstances(): void {
    if (!this.mesh || !this.generated) return;
    this.refs = [];
    this.lookup.clear();
    let id = 0;
    const size = this.generated.size;
    const blockSize = this.generated.blockSize;

    for (const chunk of this.generated.chunks) {
      for (let i = 0; i < chunk.types.length; i++) {
        const t = chunk.types[i] as BlockType;
        if (t === BlockType.Empty) continue;
        const lz = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
        const ly = Math.floor((i % (CHUNK_SIZE * CHUNK_SIZE)) / CHUNK_SIZE);
        const lx = i % CHUNK_SIZE;
        const wp = chunkWorldPosition(chunk, lx, ly, lz, size, blockSize);
        _pos.set(wp.x, wp.y, wp.z);
        const hpRatio = chunk.health[i] / Math.max(1, chunk.maxHealth[i]);
        const s = 0.55 + 0.45 * Math.min(1, hpRatio);
        _scale.set(s, s, s);
        _matrix.compose(_pos, _quat, _scale);
        this.mesh.setMatrixAt(id, _matrix);
        _color.setHex(colorForType(t));
        // Dimmer base for readability; damaged blocks darken further
        _color.multiplyScalar(0.42 + 0.28 * Math.min(1, hpRatio));
        this.mesh.setColorAt(id, _color);
        this.refs.push({ chunk, localIndex: i, instanceId: id });
        this.lookup.set(this.key(chunk, i), id);
        id++;
      }
      chunk.dirty = false;
    }
    this.mesh.count = id;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.aliveBlocks = id;
  }

  private updateInstanceVisual(instanceId: number): void {
    if (!this.mesh || !this.generated) return;
    const ref = this.refs[instanceId];
    if (!ref) return;
    const { chunk, localIndex: i } = ref;
    const t = chunk.types[i] as BlockType;
    if (t === BlockType.Empty) return;
    const lz = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
    const ly = Math.floor((i % (CHUNK_SIZE * CHUNK_SIZE)) / CHUNK_SIZE);
    const lx = i % CHUNK_SIZE;
    const wp = chunkWorldPosition(chunk, lx, ly, lz, this.generated.size, this.generated.blockSize);
    const flash = this.flashMap.get(instanceId) ?? 0;
    const hpRatio = chunk.health[i] / Math.max(1, chunk.maxHealth[i]);
    const s = 0.55 + 0.45 * Math.min(1, hpRatio);
    _pos.set(wp.x, wp.y, wp.z);
    _scale.set(s, s, s);
    _matrix.compose(_pos, _quat, _scale);
    this.mesh.setMatrixAt(instanceId, _matrix);
    _color.setHex(colorForType(t));
    if (flash > 0) {
      _color.lerp(new THREE.Color(0xffffff), flash * 0.55);
    } else {
      _color.multiplyScalar(0.42 + 0.28 * Math.min(1, hpRatio));
    }
    this.mesh.setColorAt(instanceId, _color);
  }

  private removeInstance(instanceId: number): void {
    if (!this.mesh) return;
    const last = this.mesh.count - 1;
    const ref = this.refs[instanceId];
    if (!ref) return;
    this.lookup.delete(this.key(ref.chunk, ref.localIndex));
    this.flashMap.delete(instanceId);

    if (instanceId !== last) {
      const moved = this.refs[last];
      this.refs[instanceId] = moved;
      moved.instanceId = instanceId;
      this.lookup.set(this.key(moved.chunk, moved.localIndex), instanceId);
      this.mesh.getMatrixAt(last, _matrix);
      this.mesh.setMatrixAt(instanceId, _matrix);
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(last, _color);
        this.mesh.setColorAt(instanceId, _color);
      }
      const flash = this.flashMap.get(last);
      if (flash !== undefined) {
        this.flashMap.delete(last);
        this.flashMap.set(instanceId, flash);
      }
    }
    this.refs.pop();
    this.mesh.count = last;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.aliveBlocks = last;
  }

  /**
   * Raycast against axis-aligned blocks via ray-box on remaining instances (coarse but fine for mobile).
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDist: number): {
    instanceId: number;
    point: THREE.Vector3;
    distance: number;
  } | null {
    if (!this.mesh || this.mesh.count === 0 || !this.generated) return null;
    const dir = direction.clone().normalize();
    let bestDist = maxDist;
    let bestId = -1;
    const half = 0.48;
    const box = new THREE.Box3();

    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      box.min.set(_pos.x - half, _pos.y - half, _pos.z - half);
      box.max.set(_pos.x + half, _pos.y + half, _pos.z + half);
      const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
      if (!hit) continue;
      const d = origin.distanceTo(hit);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    if (bestId < 0) return null;
    return {
      instanceId: bestId,
      point: origin.clone().addScaledVector(dir, bestDist),
      distance: bestDist,
    };
  }

  /** Find nearest block to a world point (for drones / splash). */
  findNearest(world: THREE.Vector3, maxDist: number, prefer?: (t: BlockType) => number): {
    instanceId: number;
    distance: number;
  } | null {
    if (!this.mesh) return null;
    let bestScore = -Infinity;
    let bestId = -1;
    let bestDist = maxDist;
    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      const d = world.distanceTo(_pos);
      if (d > maxDist) continue;
      const ref = this.refs[id];
      const t = ref.chunk.types[ref.localIndex] as BlockType;
      const prio = prefer ? prefer(t) : BLOCK_DEFS[t]?.priority ?? 1;
      const score = prio * 10 - d;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
        bestDist = d;
      }
    }
    if (bestId < 0) return null;
    return { instanceId: bestId, distance: bestDist };
  }

  getBlockWorldPos(instanceId: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.mesh) return out.copy(_zero);
    this.mesh.getMatrixAt(instanceId, _matrix);
    return out.setFromMatrixPosition(_matrix);
  }

  getBlockType(instanceId: number): BlockType {
    const ref = this.refs[instanceId];
    if (!ref) return BlockType.Empty;
    return ref.chunk.types[ref.localIndex] as BlockType;
  }

  applyDamage(instanceId: number, damage: number, now: number): DamageResult | null {
    if (!this.mesh || !this.generated || !this.level) return null;
    const ref = this.refs[instanceId];
    if (!ref) return null;
    const { chunk, localIndex: i } = ref;
    const t = chunk.types[i] as BlockType;
    if (t === BlockType.Empty) return null;

    chunk.health[i] = Math.max(0, chunk.health[i] - damage);
    chunk.lastHitTime = now;
    this.flashMap.set(instanceId, 1);

    this.mesh.getMatrixAt(instanceId, _matrix);
    _pos.setFromMatrixPosition(_matrix);

    if (chunk.health[i] > 0) {
      this.updateInstanceVisual(instanceId);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      return {
        destroyed: false,
        type: t,
        x: _pos.x,
        y: _pos.y,
        z: _pos.z,
        fragments: 0,
        explosive: false,
      };
    }

    const def = BLOCK_DEFS[t];
    const fragments = Math.max(1, Math.round((this.level.avgHP / 10) * def.fragmentMul));
    const explosive = t === BlockType.Explosive;
    chunk.clearBlock(i);
    this.removeInstance(instanceId);

    bus.emit('block-destroyed', {
      type: t,
      x: _pos.x,
      y: _pos.y,
      z: _pos.z,
      fragments,
    });

    return {
      destroyed: true,
      type: t,
      x: _pos.x,
      y: _pos.y,
      z: _pos.z,
      fragments,
      explosive,
    };
  }

  /** Splash damage around world point */
  applySplash(center: THREE.Vector3, radius: number, damage: number, now: number): DamageResult[] {
    const results: DamageResult[] = [];
    if (!this.mesh) return results;
    // collect ids first (mutation shifts ids)
    const hits: number[] = [];
    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      if (center.distanceTo(_pos) <= radius) hits.push(id);
    }
    // damage from high id to low so swap-remove is safer... actually applyDamage uses swap-remove
    // so process sorted descending
    hits.sort((a, b) => b - a);
    for (const id of hits) {
      // id may be stale if earlier removal shifted — re-find by position is safer for splash
      const r = this.applyDamage(id, damage, now);
      if (r) results.push(r);
    }
    return results;
  }

  applyExplosiveChain(x: number, y: number, z: number, now: number): DamageResult[] {
    return this.applySplash(new THREE.Vector3(x, y, z), 1.8, 40, now);
  }

  update(dt: number, now: number): void {
    if (!this.mesh || !this.level) return;

    // Flash decay
    if (this.flashMap.size > 0) {
      for (const [id, v] of this.flashMap) {
        const nv = v - dt * 4;
        if (nv <= 0) {
          this.flashMap.delete(id);
          this.updateInstanceVisual(id);
        } else {
          this.flashMap.set(id, nv);
          this.updateInstanceVisual(id);
        }
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    // Regenerating blocks
    if (this.level.regenRate > 0) {
      this.regenTimer += dt;
      if (this.regenTimer > 0.5) {
        this.regenTimer = 0;
        const heal = this.level.regenRate * this.level.avgHP * 0.15;
        let dirty = false;
        for (let id = 0; id < this.mesh.count; id++) {
          const ref = this.refs[id];
          const t = ref.chunk.types[ref.localIndex] as BlockType;
          if (t !== BlockType.Regenerating) continue;
          if (now - ref.chunk.lastHitTime < 2.5) continue;
          const i = ref.localIndex;
          if (ref.chunk.health[i] < ref.chunk.maxHealth[i]) {
            ref.chunk.health[i] = Math.min(
              ref.chunk.maxHealth[i],
              ref.chunk.health[i] + heal
            );
            this.updateInstanceVisual(id);
            dirty = true;
          }
        }
        if (dirty) {
          this.mesh.instanceMatrix.needsUpdate = true;
          if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Remap all live block instance matrices after a 90° lattice rotation about origin.
   * Visual group rotation should be identity after this (CubeAnimator handles that).
   * axis: 'x' | 'y' | 'z', sign: +1 or -1 for direction of 90° turn.
   */
  commitLatticeRotation(axis: 'x' | 'y' | 'z', sign: 1 | -1): void {
    if (!this.mesh || !this.generated) return;
    const ang = (sign * Math.PI) / 2;
    const q = new THREE.Quaternion();
    if (axis === 'x') q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
    else if (axis === 'y') q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    else q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
    _quat.identity();

    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      _scale.setFromMatrixScale(_matrix);
      _pos.applyQuaternion(q);
      _matrix.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(id, _matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // Keep quaternion identity on group so future updates use world positions
    this.group.quaternion.identity();
  }

  /** Idle damage: destroy approximate fraction of remaining blocks */
  applyIdleDamage(blocksToDestroy: number, now: number): { fragments: number; destroyed: number } {
    if (!this.mesh || blocksToDestroy <= 0) return { fragments: 0, destroyed: 0 };
    let fragments = 0;
    let destroyed = 0;
    const n = Math.min(blocksToDestroy, this.mesh.count);
    for (let k = 0; k < n; k++) {
      if (this.mesh.count === 0) break;
      const id = this.mesh.count - 1;
      const r = this.applyDamage(id, 99999, now);
      if (r?.destroyed) {
        fragments += r.fragments;
        destroyed++;
      }
    }
    return { fragments, destroyed };
  }

  private disposeMesh(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.group.remove(this.mesh);
      this.mesh = null;
    }
    while (this.group.children.length) {
      const c = this.group.children[0];
      this.group.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }
  }

  dispose(): void {
    this.disposeMesh();
    this.material.dispose();
  }
}
