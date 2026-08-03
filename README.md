# Cube Game

A premium, offline-first **Progressive Web App** cube-destruction game for Android (and desktop).  
Built with **TypeScript · Vite · Three.js · Web Audio** — no Unity, no native engines, no external art assets.

Orbit a giant emissive cube, fire energy beams and modular hardpoint weapons, survive cube defenses, shatter blocks, buy sequential tech upgrades, and deploy multi-role AI drones.

See `docs/PHASED_IMPLEMENTATION_PLAN.md` for the full systems roadmap (P0–P10).

## Quick start

```bash
cd Projects/cube-game
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). Use Chrome on a phone (same Wi‑Fi) or desktop.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve the production build |

## Install on Android (PWA)

1. Open the game in **Chrome** (device or after deploying `dist/`).
2. Menu → **Add to Home screen** / **Install app**.
3. Launch from the home screen — fullscreen, offline after first load (service worker caches the app shell).

For local testing on a device: `npm run dev -- --host` and visit `http://<your-pc-ip>:5173`.

## Controls

| Input | Action |
|-------|--------|
| Left virtual joystick / WASD / arrows | Orbit around the cube |
| FIRE button / Space | Fire energy beam (auto-fire on by default) |
| Pinch / mouse wheel | Zoom |
| HUD icons | Tech tree, sectors, mute, menu |

## Architecture

```
src/
  core/          Game loop, EventBus, Time, SaveSystem
  cube/          Hierarchical chunks, InstancedMesh, generation
  player/        Ship, orbital camera, weapon, input
  drones/        AI ally drones
  progression/   Currency, tech tree, idle simulator
  vfx/           Particle pool, shatter, bloom post-FX
  ui/            DOM HUD, menus, tech tree, level select
  audio/         Web Audio synthesizer (no samples)
  data/          Levels, upgrades, constants
```

- **Rendering:** Three.js WebGL2 + `InstancedMesh` for blocks + UnrealBloom.
- **UI:** Pure DOM/CSS overlay (no React).
- **Save:** `localStorage` JSON, versioned; incompatible versions reset.
- **Idle:** Offline time (capped) applies damage/currency on return; drones soft-throttle when the tab is hidden.

## Progression

- **Data Fragments** — destroy blocks, spend on tech.
- **Core Energy** — awarded on level clear.
- **Tech tree** — Offense, Ship, Drones, Analysis, Idle, Global (30+ nodes).
- **30 hand-authored levels**, then procedural sectors.

## Performance notes

- Target mid-range Android Chrome ~40–60 FPS with tens of thousands of instances on early levels.
- Adaptive quality: if FPS stays below ~28 for 2s, bloom softens, particle budget drops, pixel ratio clamps to 1.
- All geometry and audio are runtime-generated — no network after first load.

## License

All rights reserved unless otherwise noted.
