import * as THREE from 'three';
import { CHUNK_SIZE } from '../data/constants';
import type { LevelDefinition } from '../data/levels';
import { bus } from '../core/EventBus';
import { BLOCK_DEFS, BlockType, colorForType } from './BlockTypes';
import { Chunk } from './Chunk';
import { CoreNucleus } from './CoreNucleus';
import { chunkWorldPosition, generateCube, type GeneratedCube } from './LevelGenerator';

const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);

/** Sentinel instance id for the living nucleus (not a lattice voxel). */
export const NUCLEUS_HIT_ID = -2;

export interface DamageResult {
  destroyed: boolean;
  type: BlockType;
  x: number;
  y: number;
  z: number;
  fragments: number;
  explosive: boolean;
  /** Shared nucleus was hit (may not destroy instance). */
  coreHit?: boolean;
  coreDestroyed?: boolean;
}

interface InstanceRef {
  chunk: Chunk;
  localIndex: number;
  instanceId: number;
}

export class CubeManager {
  readonly group = new THREE.Group();
  readonly nucleus = new CoreNucleus();
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
  /** When true, core block hits route through shared nucleus (prevent re-entry). */
  private coreRouting = true;

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
    if (this.nucleus.isActive || this.nucleus.isDestroyed) {
      return this.nucleus.combatProgress();
    }
    return this.rawBlockProgress();
  }

  rawBlockProgress(): number {
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
    this.nucleus.reset();

    this.maxInstances = Math.max(this.totalBlocks + 256, 512);
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
    this.nucleus.bind(this);
    this.nucleus.startLevel(level);
    this.group.add(this.nucleus.vfxGroup);
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

  private removeInstance(instanceId: number, opts?: { deferGpu?: boolean }): void {
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
    this.aliveBlocks = last;
    if (!opts?.deferGpu) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** Wipe remaining instances without N GPU uploads (one flush at the end). */
  private removeInstanceDeferred(instanceId: number): void {
    this.removeInstance(instanceId, { deferGpu: true });
  }

  /**
   * Raycast against shell blocks + solid nucleus hitbox.
   * Nucleus is a real collision sphere so projectiles cannot tunnel through the core VFX.
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
    /** True when the solid nucleus sphere was the closest hit (not a shell voxel). */
    nucleusSolid?: boolean;
  } | null {
    if (!this.generated) return null;
    const dirLen = direction.lengthSq();
    if (dirLen < 1e-12) return null;
    const dir = direction.clone().normalize();
    let bestDist = maxDist;
    let bestId = -1;
    let bestPoint: THREE.Vector3 | null = null;
    let nucleusSolid = false;
    const half = halfExtent;
    const box = new THREE.Box3();
    const hitPt = new THREE.Vector3();

    // —— Solid nucleus sphere (full isotropic 3D; wins when closer than shell) ——
    // Test first so a clean sphere hit is the baseline; shell voxels may still
    // win when they are strictly nearer (outer armor).
    if (this.nucleus.isActive) {
      const nucPt = new THREE.Vector3();
      const nucDist = this.nucleus.raycastSolid(origin, dir, maxDist, nucPt);
      if (nucDist != null && nucDist <= bestDist) {
        bestDist = nucDist;
        bestId = NUCLEUS_HIT_ID;
        bestPoint = nucPt.clone();
        nucleusSolid = true;
      }
    }

    // —— Block AABBs (local instance space ≈ world when cube.group is at origin) ——
    // Transform instance positions by cube.group world matrix so group rotation
    // never creates axis-biased misses relative to the nucleus sphere.
    this.group.updateWorldMatrix(true, false);
    const mw = this.group.matrixWorld;
    if (this.mesh && this.mesh.count > 0) {
      for (let id = 0; id < this.mesh.count; id++) {
        if (id === ignoreId) continue;
        // Core voxels: skip AABB — shared pool is handled only via solid sphere
        // so multi-voxel core clusters cannot create lopsided hit volumes.
        if (this.getBlockType(id) === BlockType.Core) continue;

        this.mesh.getMatrixAt(id, _matrix);
        _pos.setFromMatrixPosition(_matrix);
        _pos.applyMatrix4(mw);
        box.min.set(_pos.x - half, _pos.y - half, _pos.z - half);
        box.max.set(_pos.x + half, _pos.y + half, _pos.z + half);
        const hit = new THREE.Ray(origin, dir).intersectBox(box, hitPt);
        if (!hit) continue;
        const d = origin.distanceTo(hit);
        if (d < bestDist && d >= 0) {
          if (d < 1e-5 && bestId >= 0 && !nucleusSolid) continue;
          bestDist = d;
          bestId = id;
          bestPoint = hit.clone();
          nucleusSolid = false;
        }
      }
    }

    if (bestId < 0 || !bestPoint) return null;

    const normal = new THREE.Vector3();
    if (nucleusSolid) {
      // Outward from nucleus center
      this.nucleus.getWorldCenter(_pos);
      normal.copy(bestPoint).sub(_pos);
      if (normal.lengthSq() < 1e-8) normal.copy(dir).multiplyScalar(-1);
      else normal.normalize();
    } else {
      // Face normal from nearest axis of hit relative to block center
      this.mesh!.getMatrixAt(bestId, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      const lx = bestPoint.x - _pos.x;
      const ly = bestPoint.y - _pos.y;
      const lz = bestPoint.z - _pos.z;
      const ax = Math.abs(lx);
      const ay = Math.abs(ly);
      const az = Math.abs(lz);
      if (ax >= ay && ax >= az) normal.set(Math.sign(lx) || 1, 0, 0);
      else if (ay >= ax && ay >= az) normal.set(0, Math.sign(ly) || 1, 0);
      else normal.set(0, 0, Math.sign(lz) || 1);
    }

    return {
      instanceId: bestId,
      point: bestPoint,
      distance: bestDist,
      normal,
      nucleusSolid,
    };
  }

  /** First live Core block instance (for routing solid-nucleus hits into the shared pool). */
  findCoreInstanceId(ignoreId = -1): number {
    if (!this.mesh) return -1;
    for (let id = 0; id < this.mesh.count; id++) {
      if (id === ignoreId) continue;
      if (this.getBlockType(id) === BlockType.Core) return id;
    }
    return -1;
  }

  /**
   * Peel the lattice from the outside in.
   * Fighters/bombers prefer destructible blocks with the largest radius
   * from cube center, then work inward. `seed` jitters so a swarm
   * does not all lock the same voxel.
   */
  findPeelTarget(
    from: THREE.Vector3,
    maxDist: number,
    opts?: {
      prefer?: (t: BlockType) => number;
      seed?: number;
      allowNucleus?: boolean;
    }
  ): { instanceId: number; distance: number } | null {
    if (!this.mesh && !this.nucleus.isActive) return null;
    const prefer = opts?.prefer;
    const seed = opts?.seed ?? 1;
    let bestScore = -Infinity;
    let bestId = -1;
    let bestDist = maxDist;

    if (this.mesh) {
      for (let id = 0; id < this.mesh.count; id++) {
        const t = this.getBlockType(id);
        if (t === BlockType.Empty || t === BlockType.Core) continue;
        this.mesh.getMatrixAt(id, _matrix);
        _pos.setFromMatrixPosition(_matrix);
        const d = from.distanceTo(_pos);
        if (d > maxDist) continue;
        const radial = Math.hypot(_pos.x, _pos.y, _pos.z);
        const typePrio = prefer ? prefer(t) : BLOCK_DEFS[t]?.priority ?? 1;
        // Cheap per-drone hash so adjacent craft pick different faces
        const jitter = ((id * 2654435761 + seed * 97) >>> 0) % 1000 / 1000;
        const score = radial * 9 + typePrio * 2.4 - d * 0.28 + jitter * 3.2;
        if (score > bestScore) {
          bestScore = score;
          bestId = id;
          bestDist = d;
        }
      }
    }

    if (opts?.allowNucleus && this.nucleus.isActive) {
      this.nucleus.getWorldCenter(_pos);
      const d = from.distanceTo(_pos);
      if (d <= maxDist) {
        const shell = this.nucleus.snapshot().shellRatio;
        // Nucleus is last — only attractive once the outer hull is thin
        const nucScore = (1 - shell) * 22 + (prefer?.(BlockType.Core) ?? 0) * 0.4 - d * 0.15;
        if (shell < 0.38 && nucScore > bestScore) {
          bestScore = nucScore;
          bestId = NUCLEUS_HIT_ID;
          bestDist = d;
        }
      }
    }

    if (bestId < 0) return null;
    return { instanceId: bestId, distance: bestDist };
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
    if (instanceId === NUCLEUS_HIT_ID) return BlockType.Core;
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
    if (id === NUCLEUS_HIT_ID) return this.nucleus.isActive;
    return !!this.mesh && id >= 0 && id < this.mesh.count && this.getBlockType(id) !== BlockType.Empty;
  }

  applyDamage(instanceId: number, damage: number, now: number): DamageResult | null {
    if (!this.generated || !this.level) return null;
    if (instanceId === NUCLEUS_HIT_ID || this.getBlockType(instanceId) === BlockType.Core) {
      return this.applyNucleusHit(damage, now);
    }
    if (!this.mesh) return null;
    const ref = this.refs[instanceId];
    if (!ref) return null;
    return this.applyDamageDirect(instanceId, damage, now);
  }

  /** Shared nucleus HP pool — the living core, not a lattice voxel. */
  applyNucleusHit(damage: number, now: number): DamageResult | null {
    if (!this.nucleus.isActive || !this.level) return null;
    const outcome = this.nucleus.applyDamage(damage, now);
    this.nucleus.getWorldCenter(_pos);
    const def = BLOCK_DEFS[BlockType.Core];
    const fragments = outcome.destroyed
      ? Math.max(
          8,
          Math.round(Math.sqrt(Math.max(1, this.level.avgHP)) * 1.2 * def.fragmentMul)
        )
      : 0;
    if (outcome.destroyed) {
      bus.emit('block-destroyed', {
        type: BlockType.Core,
        x: _pos.x,
        y: _pos.y,
        z: _pos.z,
        fragments,
      });
    }
    return {
      destroyed: !!outcome.destroyed,
      type: BlockType.Core,
      x: _pos.x,
      y: _pos.y,
      z: _pos.z,
      fragments,
      explosive: false,
      coreHit: true,
      coreDestroyed: outcome.destroyed,
    };
  }

  /**
   * Damage without nucleus routing (shell transfers, final core wipe, idle).
   */
  applyDamageDirect(instanceId: number, damage: number, now: number): DamageResult | null {
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
    const fragments = Math.max(
      1,
      Math.round(Math.sqrt(Math.max(1, this.level.avgHP)) * 0.55 * def.fragmentMul)
    );
    const explosive = t === BlockType.Explosive;
    const wasShell = t !== BlockType.Core;
    chunk.clearBlock(i);
    this.removeInstance(instanceId);
    if (wasShell && this.nucleus.isActive) {
      this.nucleus.onShellCountDelta(-1);
    }

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

  /** Inflate core block HP so instances survive until shared pool dies. */
  boostCoreBlockHealth(hp: number): void {
    const cap = 65000;
    const v = Math.min(cap, Math.max(1, Math.floor(hp)));
    if (!this.mesh) return;
    for (let id = 0; id < this.mesh.count; id++) {
      if (this.getBlockType(id) !== BlockType.Core) continue;
      const ref = this.refs[id];
      if (!ref) continue;
      ref.chunk.health[ref.localIndex] = v;
      ref.chunk.maxHealth[ref.localIndex] = v;
    }
  }

  pickRandomShellInstance(): number {
    if (!this.mesh || this.mesh.count === 0) return -1;
    const candidates: number[] = [];
    for (let id = 0; id < this.mesh.count; id++) {
      const t = this.getBlockType(id);
      if (t !== BlockType.Empty && t !== BlockType.Core) candidates.push(id);
    }
    if (!candidates.length) return -1;
    return candidates[(Math.random() * candidates.length) | 0];
  }

  /** Slow heal on shell blocks (regeneration attribute). */
  regenShellBlocks(fracOfMaxPerSec: number, now: number): void {
    if (!this.mesh || fracOfMaxPerSec <= 0) return;
    let dirty = false;
    for (let id = 0; id < this.mesh.count; id++) {
      const t = this.getBlockType(id);
      if (t === BlockType.Empty || t === BlockType.Core) continue;
      const ref = this.refs[id];
      if (!ref) continue;
      if (now - ref.chunk.lastHitTime < 1.2) continue;
      const i = ref.localIndex;
      const max = ref.chunk.maxHealth[i];
      if (ref.chunk.health[i] >= max) continue;
      ref.chunk.health[i] = Math.min(max, ref.chunk.health[i] + max * fracOfMaxPerSec);
      this.updateInstanceVisual(id);
      dirty = true;
    }
    if (dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Resurrect destroyed shell density by re-adding blocks near surface.
   * Simplified: heal all remaining shell to full + spawn fake HP bump via new random fills.
   */
  resurrectShellFraction(fraction: number, now: number): number {
    if (!this.mesh || !this.generated || !this.level) return 0;
    // Heal all living shell fully
    for (let id = 0; id < this.mesh.count; id++) {
      const t = this.getBlockType(id);
      if (t === BlockType.Empty || t === BlockType.Core) continue;
      const ref = this.refs[id];
      if (!ref) continue;
      ref.chunk.health[ref.localIndex] = ref.chunk.maxHealth[ref.localIndex];
      this.updateInstanceVisual(id);
    }
    // Add HP to damaged shell count as "resurrect" feel — refill weak blocks
    const targetAdds = Math.max(
      1,
      Math.floor(this.nucleus.snapshot().shellTotal * Math.max(0.02, fraction))
    );
    // Strengthen remaining shell
    let buffed = 0;
    for (let id = 0; id < this.mesh.count && buffed < targetAdds; id++) {
      const t = this.getBlockType(id);
      if (t === BlockType.Empty || t === BlockType.Core) continue;
      const ref = this.refs[id];
      if (!ref) continue;
      const i = ref.localIndex;
      const add = Math.floor(ref.chunk.maxHealth[i] * 0.5);
      ref.chunk.maxHealth[i] = Math.min(65000, ref.chunk.maxHealth[i] + add);
      ref.chunk.health[i] = ref.chunk.maxHealth[i];
      this.updateInstanceVisual(id);
      buffed++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.nucleus.recountShell();
    bus.emit('core-resurrect-done', { buffed, now });
    return buffed;
  }

  isLevelComplete(): boolean {
    return this.nucleus.isLevelComplete();
  }

  /**
   * Snapshot and clear every remaining lattice block (post-nucleus death).
   * Returns world positions for shatter / float FX. Order is high→low id.
   */
  ejectAllRemainingBlocks(now: number): Array<{
    x: number;
    y: number;
    z: number;
    type: BlockType;
  }> {
    const out: Array<{ x: number; y: number; z: number; type: BlockType }> = [];
    if (!this.mesh || this.mesh.count <= 0) return out;
    this.group.updateWorldMatrix(true, false);
    const mw = this.group.matrixWorld;
    // High → low so swap-remove stays valid
    for (let id = this.mesh.count - 1; id >= 0; id--) {
      const t = this.getBlockType(id);
      if (t === BlockType.Empty) continue;
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      _pos.applyMatrix4(mw);
      out.push({ x: _pos.x, y: _pos.y, z: _pos.z, type: t });
      // Direct wipe (nucleus already dead — no shell accounting needed)
      const ref = this.refs[id];
      if (ref) {
        ref.chunk.clearBlock(ref.localIndex);
        this.removeInstanceDeferred(id);
      }
    }
    if (this.mesh) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    void now;
    return out;
  }

  /**
   * Splash damage around world point.
   * Core voxels in radius route through the shared nucleus (once — first core only).
   * @param ignoreId Skip this instance (usually the primary impact already damaged).
   */
  applySplash(
    center: THREE.Vector3,
    radius: number,
    damage: number,
    now: number,
    ignoreId = -1
  ): DamageResult[] {
    const results: DamageResult[] = [];
    if (!this.mesh) return results;
    // collect ids first (mutation shifts ids)
    const hits: number[] = [];
    for (let id = 0; id < this.mesh.count; id++) {
      if (id === ignoreId) continue;
      this.mesh.getMatrixAt(id, _matrix);
      _pos.setFromMatrixPosition(_matrix);
      if (center.distanceTo(_pos) <= radius) hits.push(id);
    }
    // Also include solid nucleus if blast overlaps the hitbox but no core voxel was in range
    // (and primary impact was not already a core hit)
    if (this.nucleus.isActive) {
      const primaryWasCore =
        ignoreId >= 0 && this.getBlockType(ignoreId) === BlockType.Core;
      if (!primaryWasCore && ignoreId !== NUCLEUS_HIT_ID) {
        this.nucleus.getWorldCenter(_pos);
        const nucR = this.nucleus.hitRadius;
        if (center.distanceTo(_pos) <= radius + nucR * 0.85) {
          hits.push(NUCLEUS_HIT_ID);
        }
      }
    }
    // damage from high id to low so swap-remove is safer... actually applyDamage uses swap-remove
    // so process sorted descending
    hits.sort((a, b) => b - a);
    let coreSplashed = false;
    for (const id of hits) {
      if (id === NUCLEUS_HIT_ID || this.getBlockType(id) === BlockType.Core) {
        if (coreSplashed) continue;
        coreSplashed = true;
      }
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
    if (id === NUCLEUS_HIT_ID) return this.nucleus.getWorldCenter(out);
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
