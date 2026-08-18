# Late-stage performance — high block counts

This is the follow-on plan after the 1.1.4 graphics wins (merged Intergalactic hull, MeshBasic living pads, hash-backed closest / peel / splash, incremental hash updates, instance-color impact glow). It is about **CPU/GPU cost when a late sector still has thousands of live voxels**, not about deleting cube fidelity.

The cube is one `InstancedMesh`. Visual quality stays on that path. Do not split it into 98k wire cages, do not add per-block PointLights, do not convert the cube to MeshBasic.

## What is already cheap

| System | Cost model now |
| --- | --- |
| Cube draw | 1 InstancedMesh + 1 shared Standard material |
| Raycasts | World-space hash, cell size 2, DDA + 1-cell pad |
| Closest voxel | Expanding Chebyshev rings on the hash |
| Peel / splash / glow | Occupied buckets, or a tight cell AABB when the radius is small |
| Destroy | Incremental unindex / remap — **not** a full hash rebuild |
| Ship hull | Static authored meshes merged per material (maps kept; EngineGlow/Nozzle live) |
| Ground pads | MeshBasic + additive beads (no SpotLights) |

## What still hurts at 4k–20k live blocks

Measured / inferred from the current loop, worst first:

1. **Per-frame flash / visual rewrite.** `flashMap` calls `updateInstanceVisual` (get/set matrix + color) for every glowing voxel. A HE salvo can light 40–80 blocks. Decay is ~0.3s. Cap or dirty-bucket this first.
2. **`getMatrixAt` + `applyMatrix4` inside hash walks.** Closest/peel/splash still pull a matrix per candidate. Fine at 2k, noisy at 12k if many drones + pads query every tick.
3. **Splash collect + swap-remove.** High-id-first damage is correct, but a 3-radius HE blast still walks neighbors and remaps hash slots one by one. Batch splash to a sorted id list and flush GPU once.
4. **Inner-volume work.** Peel / closest / idle / regen still consider buried voxels the player cannot see. Late sectors are dense cubes; most instances are occluded.
5. **Defense entities, not the cube.** Turrets, enemy drones, particle pools, and bloom are the usual FPS cliff after the cube is already one draw. Do not “optimize the cube” by cutting city or ship maps.

## Next PRs (in this order)

### PR-A — Dirty instance color / flash budget (safe, no look change)

- Keep `flashMap` but mark `instanceColor.needsUpdate` once per frame.
- Skip `setMatrixAt` during flash decay unless HP/scale actually changed.
- Hard cap concurrent flashes (e.g. 96). Extra glow only raises the shared `emissiveIntensity` pulse we already have.

**Expected:** HE / artillery / cube-bomb frames stop hitching. Player still sees the same warm flash.

### PR-B — Cached world centers

- Parallel `Float32Array` of world xyz (or cell + local) rebuilt only when the lattice moves (scramble / slice / resurrect).
- Hash walks read the array instead of `getMatrixAt`.
- `setInstanceWorldPos` / slice commit already dirty the hash — hook the cache there.

**Expected:** drone retarget + pad peel + splash scale past 10k blocks.

### PR-C — Surface / shell set

- Maintain a `surfaceIds` list: voxel with at least one empty 6-neighbor (or nucleus-exposed face).
- Fighters, bombers, SAM peel, and CIWS default to this set.
- Splash / raycast stay on the full hash (blasts still hit one layer in).
- Rebuild incrementally on destroy / resurrect (neighbors of the changed cell become surface).

**Expected:** targeting cost tracks *surface area* (~O(n²/3)), not volume. A 20³ cube is ~8k voxels but ~1.5–2k surface.

### PR-D — Splash batching

- `applySplash` collects ids, sorts desc, applies damage, **one** `instanceMatrix/instanceColor.needsUpdate` and **one** hash remap pass.
- Optional: falloff by distance using the cached centers (gameplay change — only if we want HE to feel less binary).

### PR-E — Do not do these

- Per-instance MeshStandard or extra lights on the cube.
- CPU meshing / greedy merge of live voxels (destroys the one-draw InstancedMesh and shatter FX).
- Dropping authored ship maps or city ambience to “save” late-game frames. Those are not the 12k-block cost.
- Full hash rebuild on every destroy (already removed in 1.1.4 — do not reintroduce).

## Validation

- Sector with ≥8k starting blocks, all pads + full drone wing, HE magazine.
- Watch: frame time during a 4-pad artillery volley, fighter retarget ticks, and a 200-block HE chain.
- Visual A/B: cube maps, hit flash color, explosion radius feel. Fail the PR if the cube looks flatter or HE reads weaker.

## Suggested order vs content

Ship A before any gameplay ammo tweaks. B and C are the real late-sector unlock. D is a cleanup once C exists. Keep this file next to `docs/PHASED_IMPLEMENTATION_PLAN.md` — it is the block-count appendix, not a rewrite of that plan.
