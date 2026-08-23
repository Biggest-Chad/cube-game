# Megacity background tileset

Procedural Three.js reconstruction of the arena skyline from:

- `assets/images/main reference.jpg` — primary composition, palette, density
- `assets/images/tileset only buildings.jpg` — five tower silhouettes
- `assets/images/layer-neon-billboard*.png` — screen art

Method follows **img2threejs** (code-only primitives + canvas facades + instancing, not photogrammetry). Python forge scripts were not available on this machine (`python` / `py` missing), so intake/spec gates ran as agent-vision analysis instead of `forge/*.py`.

## What matches the reference

- Dense canyon of stepped gunmetal towers around the cube
- Magenta / purple portrait screens on facades
- Cyan + magenta edge trims and roof masts
- Warm window grid + cooler body
- Metro rails with trains
- Far-ring impostor sprites from `layer-cyberpunk-skyscraper.png`
- Purple-black fog

## Limits

A single screenshot cannot give hidden sides or exact floor plans. Towers are stylized real-time stand-ins (instanced boxes + planes) sized for mobile WebGL, not the high-poly hero models in the tileset sheet.
