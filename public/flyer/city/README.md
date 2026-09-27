# Flyer City Kit — Low-Poly Cyberpunk Buildings

Unique silhouette buildings for cube-game flyer scenery. Breaks the procedural box-tower look with distinct shapes, dark steel + neon accent materials (Principled BSDF, baked-looking). Mobile-friendly low poly (~10–22 KB GLB each).

**Origin:** Blender 4.3.2 CLI (`generate_buildings.py`)  
**Export:** glTF 2.0 binary (Y-up), single joined mesh per file, materials embedded  
**Game path:** `public/flyer/city/*.glb` (Wave21/22 loaders — do not rewire here)

## Files

| File | Silhouette | Notes |
|------|------------|-------|
| `setback_tower.glb` | Terraced setback skyscraper | Classic cyberpunk taper; cyan neon edges + window bands |
| `warehouse.glb` | Low wide industrial shed | Loading bay, roof vents, orange neon sign strip |
| `billboard_slab.glb` | Thin tall advertising slab | Huge pink billboard face, magenta/cyan frame |
| `needle.glb` | Ultra-thin spire / needle | Tapered shaft, lime neon tip + ring platforms |
| `broken_roof.glb` | Damaged / unfinished tower | Jagged top, exposed beams, scaffolding, warning neon |
| `skybridge_stub.glb` | Tower + incomplete skybridge | Bridge arm on +X with truss + cyan neon rails |
| `antenna_farm.glb` | Stumpy roof crowded with masts | Dishes, dual-color beacons, magenta belt |
| `dock_office.glb` | Asymmetric pier office | Canopy, pier deck stub, lime neon, control bump |
| `mega_block.glb` | Chunky mid-rise with wings | Stepped wings, balcony strips, pink neon pillars |
| `arcology_chunk.glb` | Ziggurat / pyramid fragment | Four tiers, cyan/magenta ribs, side buttress |
| `vent_stack.glb` | Cylindrical cooling stack | Pipes, hazard rings, ladder, glowing mouth |

Also included:
- `generate_buildings.py` — Blender script to regenerate all assets
- `README.md` — this file

## Intended use

- Place as static scenery props along flyer routes / city backdrop strips.
- Scale freely in Three.js / game loader; models sit with bottom near z=0 (Y-up after export).
- Neon materials use Emission — ensure environment or tone-mapping keeps emissives readable at night.
- Prefer instancing / LOD if scattering many copies; each mesh is already a single node.

## Regenerate

```bash
blender -b --python /workspace/flyer-city-kit/generate_buildings.py
```

## Deploy target (CentralCommand)

`C:\Users\Chad\cube-game-flyer-wipeout\public\flyer\city\`
