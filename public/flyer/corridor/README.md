# Flyer corridor kit (Blender-authored)

WAVE31 deepened kit — zone-unique facades, horizon shell, richer deck/curb/honeycomb.
Primary midground look. Placed via `pathFrameQuat` (RH) in `flyerWipeoutGrammar.ts`.
Loader: `src/flyer/flyerCorridorGlb.ts`.

## GLBs (21)

| File | Role |
|------|------|
| wall_panel_r/l | Authored wall panels (insets/vents/windows/I-beams) |
| facade_windowed_r/l | Generic dense lit-window facade |
| facade_canyon_r/l | Canyon: tall 8x6 magenta/amber + rock ledge |
| facade_yard_r/l | Yard: wide industrial windows + dock doors + crane |
| facade_rift_r/l | Rift: irregular 3-5-4 rhythm + angular fins |
| ad_board_wide/tall/mega | Billboard variants |
| wall_dress_strip | Cable trays / deep vents / scaffold stubs |
| curb_barrier | Industrial curb ribs / hazard bands / trim lights |
| arch_gantry | Overhead gantry |
| deck_plate_seg | Plated deck seams/drains/cyan+blue inlays |
| wormhole_honeycomb | Wormhole torus honeycomb (void BG kept) |
| edge_scaffold | Mid-cadence edge scaffold |
| horizon_shell | Distant skyline silhouette for grounded BG |
| hazard_spike_rack | Path-framed edge spike telegraph rack |

Generate: `blender -b --python scripts/blender/generate_corridor_kit_w31.py`
