/**
 * WAVE36 F-Zero GX + BallisticNG — clear deck ribbon + emissive edges + far shells.
 * Kit: deck_ribbon, curb_ribbon L/R, emissive_edge (+zone), bank_halfpipe, arch_gate,
 * far_facade_shell_* (W41 multi-mass), mass_tower/billboard/scaffold/gantry, boost_pad + WAVE44 interactives (place portal + distinct buffs/enemies/hazards) (rings/portal/enemy/buffs/hazard/finish). NO midlane clutter densify. Placement: flyerWipeoutGrammar.
 * KEEP: pathFrameQuat RH.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

export const CORRIDOR_GLB_IDS = [
  'wall_panel_r',
  'wall_panel_l',
  'facade_windowed_r',
  'facade_windowed_l',
  'facade_canyon_r',
  'facade_canyon_l',
  'facade_yard_r',
  'facade_yard_l',
  'facade_rift_r',
  'facade_rift_l',
  'facade_tower_r',
  'facade_tower_l',
  'facade_stack_r',
  'facade_stack_l',
  'facade_bridge_r',
  'facade_bridge_l',
  'facade_band_r',
  'facade_band_l',
  'facade_pipe_r',
  'facade_pipe_l',
  'facade_fin_r',
  'facade_fin_l',
  'facade_overhang_r',
  'facade_overhang_l',
  'facade_cantilever_r',
  'facade_cantilever_l',
  'facade_broken_r',
  'facade_broken_l',
  'ad_board_wide',
  'ad_board_tall',
  'ad_board_mega',
  'arch_gantry',
  'curb_barrier',
  'wall_dress_strip',
  'deck_plate_seg',
  'wormhole_honeycomb',
  'edge_scaffold',
  'horizon_shell',
  'hazard_spike_rack',
  'hazard_laser_gate',
  'hazard_cone_cluster',
  'rib_arch',
  'wall_ribbon_canyon_r',
  'wall_ribbon_canyon_l',
  'wall_ribbon_yard_r',
  'wall_ribbon_yard_l',
  'wall_ribbon_rift_r',
  'wall_ribbon_rift_l',
  'curb_ribbon',
  'deck_ribbon',
  'curb_ribbon_l',
  'curb_ribbon_r',
  'emissive_edge_l',
  'emissive_edge_r',
  'emissive_edge_canyon_l',
  'emissive_edge_canyon_r',
  'emissive_edge_yard_l',
  'emissive_edge_yard_r',
  'emissive_edge_rift_l',
  'emissive_edge_rift_r',
  'bank_halfpipe',
  'arch_gate',
  'far_facade_shell_canyon_l',
  'far_facade_shell_canyon_r',
  'far_facade_shell_yard_l',
  'far_facade_shell_yard_r',
  'far_facade_shell_rift_l',
  'far_facade_shell_rift_r',
  'mass_tower_cluster_canyon_l',
  'mass_tower_cluster_canyon_r',
  'mass_tower_cluster_yard_l',
  'mass_tower_cluster_yard_r',
  'mass_tower_cluster_rift_l',
  'mass_tower_cluster_rift_r',
  'mass_billboard_stack_canyon_l',
  'mass_billboard_stack_canyon_r',
  'mass_billboard_stack_yard_l',
  'mass_billboard_stack_yard_r',
  'mass_billboard_stack_rift_l',
  'mass_billboard_stack_rift_r',
  'mass_scaffold_ring_canyon_l',
  'mass_scaffold_ring_canyon_r',
  'mass_scaffold_ring_yard_l',
  'mass_scaffold_ring_yard_r',
  'mass_scaffold_ring_rift_l',
  'mass_scaffold_ring_rift_r',
  'mass_gantry_block_canyon_l',
  'mass_gantry_block_canyon_r',
  'mass_gantry_block_yard_l',
  'mass_gantry_block_yard_r',
  'mass_gantry_block_rift_l',
  'mass_gantry_block_rift_r',
  'boost_pad',
  'interact_acro_ring',
  'interact_end_portal',
  'interact_enemy_cube',
  'interact_buff_speed',
  'interact_buff_shield',
  'interact_buff_hull',
  'interact_hazard_pylon',
  'interact_hazard_canyon',
  'interact_hazard_yard',
  'interact_hazard_rift',
  'interact_finish_frame_canyon',
  'interact_finish_frame_yard',
  'interact_finish_frame_rift',
] as const;

export type CorridorGlbId = (typeof CORRIDOR_GLB_IDS)[number];

/** WAVE54: critical-path corridor IDs only (craft lane + near module). Far façades deferred. */
export const CORRIDOR_NEAR_IDS = [
  'deck_ribbon',
  'deck_plate_seg',
  'curb_ribbon',
  'curb_ribbon_l',
  'curb_ribbon_r',
  'emissive_edge_l',
  'emissive_edge_r',
  'emissive_edge_canyon_l',
  'emissive_edge_canyon_r',
  'emissive_edge_yard_l',
  'emissive_edge_yard_r',
  'emissive_edge_rift_l',
  'emissive_edge_rift_r',
  'wall_panel_r',
  'wall_panel_l',
  'boost_pad',
  'arch_gate',
  'arch_gantry',
  'bank_halfpipe',
  'hazard_laser_gate',
  'hazard_cone_cluster',
  'rib_arch',
  'wormhole_honeycomb',
  'interact_acro_ring',
  'interact_end_portal',
  'interact_enemy_cube',
  'interact_buff_speed',
  'interact_buff_shield',
  'interact_buff_hull',
  'interact_hazard_pylon',
  'interact_hazard_canyon',
  'interact_hazard_yard',
  'interact_hazard_rift',
  'interact_finish_frame_canyon',
  'interact_finish_frame_yard',
  'interact_finish_frame_rift',
] as const satisfies readonly CorridorGlbId[];

/** WAVE54: far façades / mass / skyline — load after first frames or when approaching. */
export const CORRIDOR_FAR_IDS: CorridorGlbId[] = CORRIDOR_GLB_IDS.filter(
  (id) => !(CORRIDOR_NEAR_IDS as readonly string[]).includes(id)
);


export interface CorridorGlbProto {
  id: CorridorGlbId;
  root: THREE.Group;
  height: number;
  length: number;
  width: number;
}

export type FlyerCorridorLib = Record<CorridorGlbId, CorridorGlbProto | null>;

const URLS: Record<CorridorGlbId, string> = {
  wall_panel_r: './flyer/corridor/wall_panel_r.glb',
  wall_panel_l: './flyer/corridor/wall_panel_l.glb',
  facade_windowed_r: './flyer/corridor/facade_windowed_r.glb',
  facade_windowed_l: './flyer/corridor/facade_windowed_l.glb',
  facade_canyon_r: './flyer/corridor/facade_canyon_r.glb',
  facade_canyon_l: './flyer/corridor/facade_canyon_l.glb',
  facade_yard_r: './flyer/corridor/facade_yard_r.glb',
  facade_yard_l: './flyer/corridor/facade_yard_l.glb',
  facade_rift_r: './flyer/corridor/facade_rift_r.glb',
  facade_rift_l: './flyer/corridor/facade_rift_l.glb',
  facade_tower_r: './flyer/corridor/facade_tower_r.glb',
  facade_tower_l: './flyer/corridor/facade_tower_l.glb',
  facade_stack_r: './flyer/corridor/facade_stack_r.glb',
  facade_stack_l: './flyer/corridor/facade_stack_l.glb',
  facade_bridge_r: './flyer/corridor/facade_bridge_r.glb',
  facade_bridge_l: './flyer/corridor/facade_bridge_l.glb',
  facade_band_r: './flyer/corridor/facade_band_r.glb',
  facade_band_l: './flyer/corridor/facade_band_l.glb',
  facade_pipe_r: './flyer/corridor/facade_pipe_r.glb',
  facade_pipe_l: './flyer/corridor/facade_pipe_l.glb',
  facade_fin_r: './flyer/corridor/facade_fin_r.glb',
  facade_fin_l: './flyer/corridor/facade_fin_l.glb',
  facade_overhang_r: './flyer/corridor/facade_overhang_r.glb',
  facade_overhang_l: './flyer/corridor/facade_overhang_l.glb',
  facade_cantilever_r: './flyer/corridor/facade_cantilever_r.glb',
  facade_cantilever_l: './flyer/corridor/facade_cantilever_l.glb',
  facade_broken_r: './flyer/corridor/facade_broken_r.glb',
  facade_broken_l: './flyer/corridor/facade_broken_l.glb',
  ad_board_wide: './flyer/corridor/ad_board_wide.glb',
  ad_board_tall: './flyer/corridor/ad_board_tall.glb',
  ad_board_mega: './flyer/corridor/ad_board_mega.glb',
  arch_gantry: './flyer/corridor/arch_gantry.glb',
  curb_barrier: './flyer/corridor/curb_barrier.glb',
  wall_dress_strip: './flyer/corridor/wall_dress_strip.glb',
  deck_plate_seg: './flyer/corridor/deck_plate_seg.glb',
  wormhole_honeycomb: './flyer/corridor/wormhole_honeycomb.glb',
  edge_scaffold: './flyer/corridor/edge_scaffold.glb',
  horizon_shell: './flyer/corridor/horizon_shell.glb',
  hazard_spike_rack: './flyer/corridor/hazard_spike_rack.glb',
  hazard_laser_gate: './flyer/corridor/hazard_laser_gate.glb',
  hazard_cone_cluster: './flyer/corridor/hazard_cone_cluster.glb',
  rib_arch: './flyer/corridor/rib_arch.glb',
  wall_ribbon_canyon_r: './flyer/corridor/wall_ribbon_canyon_r.glb',
  wall_ribbon_canyon_l: './flyer/corridor/wall_ribbon_canyon_l.glb',
  wall_ribbon_yard_r: './flyer/corridor/wall_ribbon_yard_r.glb',
  wall_ribbon_yard_l: './flyer/corridor/wall_ribbon_yard_l.glb',
  wall_ribbon_rift_r: './flyer/corridor/wall_ribbon_rift_r.glb',
  wall_ribbon_rift_l: './flyer/corridor/wall_ribbon_rift_l.glb',
  curb_ribbon: './flyer/corridor/curb_ribbon.glb',
  deck_ribbon: './flyer/corridor/deck_ribbon.glb',
  curb_ribbon_l: './flyer/corridor/curb_ribbon_l.glb',
  curb_ribbon_r: './flyer/corridor/curb_ribbon_r.glb',
  emissive_edge_l: './flyer/corridor/emissive_edge_l.glb',
  emissive_edge_r: './flyer/corridor/emissive_edge_r.glb',
  emissive_edge_canyon_l: './flyer/corridor/emissive_edge_canyon_l.glb',
  emissive_edge_canyon_r: './flyer/corridor/emissive_edge_canyon_r.glb',
  emissive_edge_yard_l: './flyer/corridor/emissive_edge_yard_l.glb',
  emissive_edge_yard_r: './flyer/corridor/emissive_edge_yard_r.glb',
  emissive_edge_rift_l: './flyer/corridor/emissive_edge_rift_l.glb',
  emissive_edge_rift_r: './flyer/corridor/emissive_edge_rift_r.glb',
  bank_halfpipe: './flyer/corridor/bank_halfpipe.glb',
  arch_gate: './flyer/corridor/arch_gate.glb',
  far_facade_shell_canyon_l: './flyer/corridor/far_facade_shell_canyon_l.glb',
  far_facade_shell_canyon_r: './flyer/corridor/far_facade_shell_canyon_r.glb',
  far_facade_shell_yard_l: './flyer/corridor/far_facade_shell_yard_l.glb',
  far_facade_shell_yard_r: './flyer/corridor/far_facade_shell_yard_r.glb',
  far_facade_shell_rift_l: './flyer/corridor/far_facade_shell_rift_l.glb',
  far_facade_shell_rift_r: './flyer/corridor/far_facade_shell_rift_r.glb',
  mass_tower_cluster_canyon_l: './flyer/corridor/mass_tower_cluster_canyon_l.glb',
  mass_tower_cluster_canyon_r: './flyer/corridor/mass_tower_cluster_canyon_r.glb',
  mass_tower_cluster_yard_l: './flyer/corridor/mass_tower_cluster_yard_l.glb',
  mass_tower_cluster_yard_r: './flyer/corridor/mass_tower_cluster_yard_r.glb',
  mass_tower_cluster_rift_l: './flyer/corridor/mass_tower_cluster_rift_l.glb',
  mass_tower_cluster_rift_r: './flyer/corridor/mass_tower_cluster_rift_r.glb',
  mass_billboard_stack_canyon_l: './flyer/corridor/mass_billboard_stack_canyon_l.glb',
  mass_billboard_stack_canyon_r: './flyer/corridor/mass_billboard_stack_canyon_r.glb',
  mass_billboard_stack_yard_l: './flyer/corridor/mass_billboard_stack_yard_l.glb',
  mass_billboard_stack_yard_r: './flyer/corridor/mass_billboard_stack_yard_r.glb',
  mass_billboard_stack_rift_l: './flyer/corridor/mass_billboard_stack_rift_l.glb',
  mass_billboard_stack_rift_r: './flyer/corridor/mass_billboard_stack_rift_r.glb',
  mass_scaffold_ring_canyon_l: './flyer/corridor/mass_scaffold_ring_canyon_l.glb',
  mass_scaffold_ring_canyon_r: './flyer/corridor/mass_scaffold_ring_canyon_r.glb',
  mass_scaffold_ring_yard_l: './flyer/corridor/mass_scaffold_ring_yard_l.glb',
  mass_scaffold_ring_yard_r: './flyer/corridor/mass_scaffold_ring_yard_r.glb',
  mass_scaffold_ring_rift_l: './flyer/corridor/mass_scaffold_ring_rift_l.glb',
  mass_scaffold_ring_rift_r: './flyer/corridor/mass_scaffold_ring_rift_r.glb',
  mass_gantry_block_canyon_l: './flyer/corridor/mass_gantry_block_canyon_l.glb',
  mass_gantry_block_canyon_r: './flyer/corridor/mass_gantry_block_canyon_r.glb',
  mass_gantry_block_yard_l: './flyer/corridor/mass_gantry_block_yard_l.glb',
  mass_gantry_block_yard_r: './flyer/corridor/mass_gantry_block_yard_r.glb',
  mass_gantry_block_rift_l: './flyer/corridor/mass_gantry_block_rift_l.glb',
  mass_gantry_block_rift_r: './flyer/corridor/mass_gantry_block_rift_r.glb',
  boost_pad: './flyer/corridor/boost_pad.glb',
  interact_acro_ring: './flyer/corridor/interact_acro_ring.glb',
  interact_end_portal: './flyer/corridor/interact_end_portal.glb',
  interact_enemy_cube: './flyer/corridor/interact_enemy_cube.glb',
  interact_buff_speed: './flyer/corridor/interact_buff_speed.glb',
  interact_buff_shield: './flyer/corridor/interact_buff_shield.glb',
  interact_buff_hull: './flyer/corridor/interact_buff_hull.glb',
  interact_hazard_pylon: './flyer/corridor/interact_hazard_pylon.glb',
  interact_hazard_canyon: './flyer/corridor/interact_hazard_canyon.glb',
  interact_hazard_yard: './flyer/corridor/interact_hazard_yard.glb',
  interact_hazard_rift: './flyer/corridor/interact_hazard_rift.glb',
  interact_finish_frame_canyon: './flyer/corridor/interact_finish_frame_canyon.glb',
  interact_finish_frame_yard: './flyer/corridor/interact_finish_frame_yard.glb',
  interact_finish_frame_rift: './flyer/corridor/interact_finish_frame_rift.glb',
};

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

let cache: Promise<FlyerCorridorLib> | null = null;
let resolved: FlyerCorridorLib | null = null;

export function getFlyerCorridorLib(): FlyerCorridorLib | null {
  return resolved;
}

let nearCache: Promise<FlyerCorridorLib> | null = null;
let farCache: Promise<FlyerCorridorLib> | null = null;

/** WAVE54: full lib (near+far). Prefer preloadFlyerCorridorNear on critical path. */
export function preloadFlyerCorridorGlb(): Promise<FlyerCorridorLib> {
  if (!cache) {
    cache = (async () => {
      await preloadFlyerCorridorNear();
      return preloadFlyerCorridorFar();
    })();
  }
  return cache;
}

/** WAVE54: critical path — deck/curb/edge/interactives only. */
export function preloadFlyerCorridorNear(): Promise<FlyerCorridorLib> {
  if (!nearCache) nearCache = loadCorridorIds([...CORRIDOR_NEAR_IDS], 'near');
  return nearCache;
}

/** WAVE54: far façades/mass — defer until after first frames / approaching. */
export function preloadFlyerCorridorFar(): Promise<FlyerCorridorLib> {
  if (!farCache) {
    farCache = (async () => {
      await preloadFlyerCorridorNear();
      return loadCorridorIds(CORRIDOR_FAR_IDS, 'far');
    })();
  }
  return farCache;
}

async function loadCorridorIds(ids: readonly CorridorGlbId[], phase: 'near' | 'far'): Promise<FlyerCorridorLib> {
  const out = (resolved ? { ...resolved } : {}) as FlyerCorridorLib;
  await Promise.all(
    ids.map(async (id) => {
      if (out[id]) return;
      out[id] = await loadOne(id, URLS[id]);
    })
  );
  resolved = out;
  try {
    (globalThis as any).__WIPEOUT_CORRIDOR_GLB = {
      loaded: CORRIDOR_GLB_IDS.filter((id) => !!out[id]).length,
      ids: CORRIDOR_GLB_IDS.filter((id) => !!out[id]),
      phase,
      near: CORRIDOR_NEAR_IDS.filter((id) => !!out[id]).length,
      far: CORRIDOR_FAR_IDS.filter((id) => !!out[id]).length,
      wave54: true,
    };
  } catch {}
  return out;
}

async function loadCorridorLib(): Promise<FlyerCorridorLib> {
  return preloadFlyerCorridorGlb();
}

async function loadOne(id: CorridorGlbId, url: string): Promise<CorridorGlbProto | null> {
  try {
    const gltf = await loader.loadAsync(url);
    const src = gltf.scene;
    src.updateMatrixWorld(true);
    _box.setFromObject(src);
    _box.getSize(_size);
    const height = Math.max(0.01, _size.y);
    const length = Math.max(0.01, _size.z);
    const width = Math.max(0.01, _size.x);
    const center = new THREE.Vector3();
    _box.getCenter(center);
    const root = new THREE.Group();
    root.name = 'CorridorGlbProto_' + id;
    const clone = src.clone(true);
    clone.position.x -= center.x;
    clone.position.z -= center.z;
    if (id === 'wormhole_honeycomb') {
      clone.position.y -= center.y;
    } else {
      clone.position.y -= _box.min.y;
    }
    clone.updateMatrixWorld(true);
    clone.traverse((o) => {
      const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
      if (!mesh) return;
      mesh.frustumCulled = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        m.userData = m.userData || {};
        m.userData.shared = true;
        const anyM = m as THREE.MeshStandardMaterial;
        if ('toneMapped' in anyM) (anyM as any).toneMapped = false;
        if ('fog' in anyM) (anyM as any).fog = true;
        if ('emissiveIntensity' in anyM && typeof anyM.emissiveIntensity === 'number') {
          anyM.emissiveIntensity = Math.min(2.2, Math.max(0.35, anyM.emissiveIntensity || 1.0));
        }
      }
    });
    root.add(clone);
    return { id, root, height, length, width };
  } catch (err) {
    console.warn('[flyer-corridor-glb] miss', id, url, err);
    return null;
  }
}

/** Clone a corridor proto with per-instance material variance. */
export function instantiateCorridorGlb(proto: CorridorGlbProto, seed: number): THREE.Group {
  const g = proto.root.clone(true);
  g.name = 'FlyerWipeoutCorridorGlb_' + proto.id;
  g.userData.corridorGlbId = proto.id;
  g.userData.wearSeed = seed >>> 0;
  const hueShift = ((seed % 11) - 5) * 0.008;
  g.traverse((o) => {
    const mesh = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh) : null;
    if (!mesh || !mesh.material) return;
    const srcMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out: THREE.Material[] = [];
    for (let i = 0; i < srcMats.length; i++) {
      const m = srcMats[i] as THREE.MeshStandardMaterial;
      if (!m) continue;
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.toneMapped = false;
      (c as any).fog = true;
      if (c.color) {
        const hsl = { h: 0, s: 0, l: 0 };
        c.color.getHSL(hsl);
        c.color.setHSL((hsl.h + hueShift + 1) % 1, hsl.s, hsl.l);
      }
      if (c.emissive && c.emissiveIntensity) {
        c.emissiveIntensity = Math.min(2.4, c.emissiveIntensity * (0.9 + ((seed >>> 3) % 5) * 0.05));
      }
      out.push(c);
    }
    mesh.material = out.length === 1 ? out[0] : out;
  });
  return g;
}

export function availableCorridorProtos(lib: FlyerCorridorLib): CorridorGlbProto[] {
  return CORRIDOR_GLB_IDS.map((id) => lib[id]).filter((p): p is CorridorGlbProto => !!p);
}
