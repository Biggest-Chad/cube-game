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
    // Preserve current instance position (scramble moves blocks; never snap back to spawn lattice)
    this.mesh.getMatrixAt(instanceId, _matrix);
    _pos.setFromMatrixPosition(_matrix);
    const flash = this.flashMap.get(instanceId) ?? 0;
    const hpRatio = chunk.health[i] / Math.max(1, chunk.maxHealth[i]);
    const s = 0.55 + 0.45 * Math.min(1, hpRatio);
    _scale.set(s, s, s);
    _quat.identity();
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
   * Returns approximate outward face normal for bounce / refract weapons.
   */
  /**
   * @param halfExtent Block AABB half-size for hit tests (default 0.52 = mild forgiveness).
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDist: number,
    ignoreId = -1,
    halfExtent = 0.52
  ): {
    instanceId: number;
    point: THREE.Vector3;
    distance: number;
    normal: THREE.Vector3;
  } | null {
    if (!this.mesh || this.mesh.count === 0 || !this.generated) return null;
    const dir = direction.clone().normalize();
    let bestDist = maxDist;
    let bestId = -1;
    let bestPoint: THREE.Vector3 | null = null;
    const half = halfExtent;
    const box = new THREE.Box3();
    const hitPt = new THREE.Vector3();

    for (let id = 0; id < this.mesh.count; id++) {
      if (id === ignoreId) continue;
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      box.min.set(_pos.x - half, _pos.y - half, _pos.z - half);
      box.max.set(_pos.x + half, _pos.y + half, _pos.z + half);
      const hit = new THREE.Ray(origin, dir).intersectBox(box, hitPt);
      if (!hit) continue;
      const d = origin.distanceTo(hit);
      if (d < bestDist && d > 1e-4) {
        bestDist = d;
        bestId = id;
        bestPoint = hit.clone();
      }
    }
    if (bestId < 0 || !bestPoint) return null;

    // Face normal from nearest axis of hit relative to block center
    this.mesh.getMatrixAt(bestId, _matrix);
    _pos.setFromMatrixPosition(_matrix);
    const lx = bestPoint.x - _pos.x;
    const ly = bestPoint.y - _pos.y;
    const lz = bestPoint.z - _pos.z;
    const ax = Math.abs(lx);
    const ay = Math.abs(ly);
    const az = Math.abs(lz);
    const normal = new THREE.Vector3();
    if (ax >= ay && ax >= az) normal.set(Math.sign(lx) || 1, 0, 0);
    else if (ay >= ax && ay >= az) normal.set(0, Math.sign(ly) || 1, 0);
    else normal.set(0, 0, Math.sign(lz) || 1);

    return {
      instanceId: bestId,
      point: bestPoint,
      distance: bestDist,
      normal,
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

  /** All live instance ids of a given block type (e.g. lattice turrets). */
  collectIdsOfType(type: BlockType): number[] {
    if (!this.mesh) return [];
    const ids: number[] = [];
    for (let id = 0; id < this.mesh.count; id++) {
      if (this.getBlockType(id) === type) ids.push(id);
    }
    return ids;
  }

  hasInstance(id: number): boolean {
    return !!this.mesh && id >= 0 && id < this.mesh.count && this.getBlockType(id) !== BlockType.Empty;
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
    // Soft sqrt curve — late levels no longer mint absurd frag/block
    const fragments = Math.max(
      1,
      Math.round(Math.sqrt(Math.max(1, this.level.avgHP)) * 0.55 * def.fragmentMul)
    );
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

  get blockSize(): number {
    return this.generated?.blockSize ?? 1;
  }

  /** Snap world position to integer lattice coords (0..size-1). */
  worldToLattice(pos: THREE.Vector3): { ix: number; iy: number; iz: number } {
    const n = Math.max(1, this.size);
    const bs = this.blockSize;
    const half = (n * bs) / 2;
    const clamp = (v: number) => Math.max(0, Math.min(n - 1, Math.round(v)));
    return {
      ix: clamp((pos.x + half) / bs - 0.5),
      iy: clamp((pos.y + half) / bs - 0.5),
      iz: clamp((pos.z + half) / bs - 0.5),
    };
  }

  latticeToWorld(ix: number, iy: number, iz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const n = Math.max(1, this.size);
    const bs = this.blockSize;
    const half = (n * bs) / 2;
    return out.set(
      (ix + 0.5) * bs - half,
      (iy + 0.5) * bs - half,
      (iz + 0.5) * bs - half
    );
  }

  /**
   * Rotate lattice indices 90° about cube center.
   * sign +1 = right-hand 90° about +axis.
   */
  rotateLatticeCoord(
    ix: number,
    iy: number,
    iz: number,
    axis: 'x' | 'y' | 'z',
    sign: 1 | -1
  ): { ix: number; iy: number; iz: number } {
    const n = Math.max(1, this.size);
    const last = n - 1;
    if (axis === 'y') {
      return sign > 0
        ? { ix: iz, iy, iz: last - ix }
        : { ix: last - iz, iy, iz: ix };
    }
    if (axis === 'x') {
      return sign > 0
        ? { ix, iy: last - iz, iz: iy }
        : { ix, iy: iz, iz: last - iy };
    }
    // z
    return sign > 0
      ? { ix: last - iy, iy: ix, iz }
      : { ix: iy, iy: last - ix, iz };
  }

  /** Layer index along axis for a world position (0..size-1). */
  layerIndexOf(pos: THREE.Vector3, axis: 'x' | 'y' | 'z'): number {
    const L = this.worldToLattice(pos);
    if (axis === 'x') return L.ix;
    if (axis === 'y') return L.iy;
    return L.iz;
  }

  /**
   * Collect live instance ids whose lattice coord matches layer on axis.
   */
  collectSliceIds(axis: 'x' | 'y' | 'z', layer: number): number[] {
    if (!this.mesh) return [];
    const ids: number[] = [];
    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      if (this.layerIndexOf(_pos, axis) === layer) ids.push(id);
    }
    return ids;
  }

  /** Layers that currently contain at least one live block. */
  populatedLayers(axis: 'x' | 'y' | 'z'): number[] {
    if (!this.mesh) return [];
    const set = new Set<number>();
    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      set.add(this.layerIndexOf(_pos, axis));
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  getInstanceWorldPos(id: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.mesh || id < 0 || id >= this.mesh.count) return out.copy(_zero);
    this.mesh.getMatrixAt(id, _matrix);
    return out.setFromMatrixPosition(_matrix);
  }

  getInstanceScale(id: number, out = new THREE.Vector3()): THREE.Vector3 {
    if (!this.mesh || id < 0 || id >= this.mesh.count) return out.set(1, 1, 1);
    this.mesh.getMatrixAt(id, _matrix);
    return out.setFromMatrixScale(_matrix);
  }

  setInstanceWorldPos(id: number, pos: THREE.Vector3, scale?: THREE.Vector3): void {
    if (!this.mesh || id < 0 || id >= this.mesh.count) return;
    this.mesh.getMatrixAt(id, _matrix);
    _scale.setFromMatrixScale(_matrix);
    if (scale) _scale.copy(scale);
    _quat.identity();
    _matrix.compose(pos, _quat, _scale);
    this.mesh.setMatrixAt(id, _matrix);
  }

  markInstanceMatrixDirty(): void {
    if (this.mesh) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Snap a slice of blocks to final lattice positions after a 90° slice turn.
   * Prefer `commitSliceFromStarts` after an animated turn (blocks leave the layer mid-spin).
   */
  commitSliceRotation(axis: 'x' | 'y' | 'z', layer: number, sign: 1 | -1): void {
    if (!this.mesh) return;
    const ids = this.collectSliceIds(axis, layer);
    const starts: THREE.Vector3[] = [];
    const scales: THREE.Vector3[] = [];
    for (const id of ids) {
      starts.push(this.getInstanceWorldPos(id, new THREE.Vector3()));
      scales.push(this.getInstanceScale(id, new THREE.Vector3()));
    }
    this.commitSliceFromStarts(ids, starts, scales, axis, sign);
  }

  /**
   * Commit using pre-spin world positions (correct after mid-animation).
   */
  commitSliceFromStarts(
    ids: number[],
    startPositions: THREE.Vector3[],
    scales: THREE.Vector3[],
    axis: 'x' | 'y' | 'z',
    sign: 1 | -1
  ): void {
    if (!this.mesh) return;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id < 0 || id >= this.mesh.count) continue;
      const L = this.worldToLattice(startPositions[i]);
      const r = this.rotateLatticeCoord(L.ix, L.iy, L.iz, axis, sign);
      this.latticeToWorld(r.ix, r.iy, r.iz, _pos);
      _scale.copy(scales[i] ?? new THREE.Vector3(1, 1, 1));
      _quat.identity();
      _matrix.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(id, _matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // Do NOT reset group.quaternion/rotation — menu & cinematic own the group transform
  }

  /**
   * Remap ALL live blocks after a 90° whole-cube rotation (legacy / rare full scramble step).
   */
  commitLatticeRotation(axis: 'x' | 'y' | 'z', sign: 1 | -1): void {
    if (!this.mesh || !this.generated) return;
    const snaps: Array<{ id: number; ix: number; iy: number; iz: number; sx: number; sy: number; sz: number }> = [];
    for (let id = 0; id < this.mesh.count; id++) {
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      _scale.setFromMatrixScale(_matrix);
      const L = this.worldToLattice(_pos);
      snaps.push({ id, ix: L.ix, iy: L.iy, iz: L.iz, sx: _scale.x, sy: _scale.y, sz: _scale.z });
    }
    for (const s of snaps) {
      const r = this.rotateLatticeCoord(s.ix, s.iy, s.iz, axis, sign);
      this.latticeToWorld(r.ix, r.iy, r.iz, _pos);
      _scale.set(s.sx, s.sy, s.sz);
      _quat.identity();
      _matrix.compose(_pos, _quat, _scale);
      this.mesh.setMatrixAt(s.id, _matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
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
