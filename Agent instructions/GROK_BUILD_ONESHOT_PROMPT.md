# CUBE GAME — GROK BUILD ONESHOT MASTER PROMPT
**Copy-paste this entire file into Grok Build. Generate the complete, runnable project in one shot.**

## MISSION
Generate a complete, production-ready, beautiful, scalable, offline-first Progressive Web App (PWA) game called **Cube Game**.  
It must run immediately after `npm install && npm run dev`, look premium on first load on mobile, and be fully installable on Android via “Add to Home Screen”.  
100% code-generated. Zero external image/model/audio assets. Zero Unity. Zero engines other than the browser.  
Follow every rule in agents.md strictly. Prefer the simplest working implementation. Grow only in layers that already function end-to-end. Keep modules cleanly separated. Use established libraries only when they reduce complexity (Three.js is approved and required). Make long-term architectural decisions. No speculative abstractions, no config sprawl, no future-proofing that is not needed today.

## CORE VISION (LOCKED)
- One giant procedural cube made of thousands of smaller destructible emissive blocks.
- Player controls a floating geometric drone ship that orbits the cube and fires energy beams.
- Goal of each level: completely destroy the cube.
- Hybrid idle + active: game progresses while AFK (with soft limits), but skilled manual play + upgrades produce large acceleration and unlock milestones.
- Autonomous upgradeable AI ally drones that continue clearing while the player is away.
- Deep tech tree of permanent upgrades.
- Strict Tron / digital / minimalist aesthetic: pure black void, high-contrast cyan / magenta / white emissive geometry, thin glowing lines, subtle scanlines, bloom, no textures, no organic shapes.
- Mobile-first touch controls, high visual polish, stable 30–60 FPS on mid-range Android Chrome.

## TECH STACK (LOCKED — DO NOT DEVIATE)
- **Language:** TypeScript (strict)
- **Bundler / Dev:** Vite (latest)
- **3D Rendering:** Three.js (latest stable, WebGL2 renderer)
- **Post-processing:** three/examples/jsm/postprocessing (EffectComposer + UnrealBloomPass + optional Scanline/FXAA) — this is the only approved “addon”
- **UI Layer:** Pure DOM + CSS (no React, no UI libraries). Overlay HUD, menus, tech tree, level select.
- **State & Logic:** Plain TypeScript classes + a minimal event bus. No Redux, no Zustand, no heavy state libraries.
- **Persistence:** localStorage for fast state + IndexedDB for larger offline progress snapshots if needed. JSON only.
- **Audio:** Web Audio API only — all sounds synthesized (oscillators, noise, envelopes). No sample files.
- **Input:** Pointer Events + touch (virtual joystick + fire). Optional DeviceOrientation for fine aim later, but not required for v1.
- **PWA:** Full service worker, web app manifest, offline caching of the entire app shell so the game works without network after first load.
- **Package.json dependencies (exact, minimal):**
  - three
  - vite
  - typescript
  - @types/three
  - vite-plugin-pwa (or manual service worker if simpler)
- No other runtime dependencies. No asset loaders. No physics engines. No animation libraries.

## ARCHITECTURE RULES (FROM agents.md)
- Start with the smallest end-to-end vertical slice that already feels good (orbital ship + single 8³ cube + shooting + destruction + level clear).
- Then layer: hierarchical chunks → more block types → currencies → tech tree → AI drones → idle simulator → polish.
- Every system must be a clear, single-responsibility class or module.
- No god objects. GameManager only coordinates; it does not contain cube logic or drone logic.
- Data-driven where it reduces code: LevelDefinition, BlockType, UpgradeNode as plain interfaces + const arrays or JSON-like objects inside the code.
- All geometry, materials, shaders, particles generated at runtime.
- Performance first: use InstancedMesh for blocks, object pooling for projectiles/particles/drones, requestAnimationFrame with fixed or semi-fixed timestep, adaptive quality on low FPS.

## FOLDER STRUCTURE (GENERATE EXACTLY)
```
cube-game/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── public/
│   ├── manifest.webmanifest
│   └── icons/          (generate simple SVG or canvas-based 192/512 icons in code or as data URLs — no external files)
├── src/
│   ├── main.ts                 // entry, creates Game
│   ├── style.css               // global Tron CSS, HUD, menus
│   ├── core/
│   │   ├── Game.ts             // main loop, systems ownership
│   │   ├── EventBus.ts
│   │   ├── Time.ts
│   │   └── SaveSystem.ts
│   ├── cube/
│   │   ├── CubeManager.ts
│   │   ├── Chunk.ts
│   │   ├── BlockTypes.ts
│   │   └── LevelGenerator.ts
│   ├── player/
│   │   ├── Ship.ts
│   │   ├── OrbitalCamera.ts
│   │   ├── Weapon.ts
│   │   └── InputController.ts
│   ├── drones/
│   │   ├── Drone.ts
│   │   ├── DroneManager.ts
│   │   └── DroneAI.ts
│   ├── progression/
│   │   ├── Currency.ts
│   │   ├── TechTree.ts
│   │   ├── UpgradeNode.ts
│   │   └── IdleSimulator.ts
│   ├── vfx/
│   │   ├── ParticlePool.ts
│   │   ├── ShatterSystem.ts
│   │   └── PostProcessing.ts
│   ├── ui/
│   │   ├── HUD.ts
│   │   ├── TechTreeUI.ts
│   │   ├── LevelSelectUI.ts
│   │   └── MenuUI.ts
│   ├── audio/
│   │   └── AudioEngine.ts      // Web Audio synthesizer
│   └── data/
│       ├── levels.ts           // first 30 concrete levels
│       ├── upgrades.ts         // first 30–40 tech nodes
│       └── constants.ts
└── README.md                   // exact run instructions + architecture notes
```

## DETAILED SYSTEM SPECIFICATIONS

### 1. Cube System (most critical for scale)
- Data: hierarchical chunks of 8³ (512) voxels. Occupancy stored as Uint8Array or BitArray per chunk.
- Rendering: single (or few) THREE.InstancedMesh with up to ~50k instances. Each instance has matrix + color (emissive intensity) + custom attribute for health/type if needed.
- Destruction: on zero health → flash color → scale matrix to 0 or swap-remove from instance count → spawn shatter particles → award currency.
- LOD / hierarchy: only create/update instances for chunks that are near the camera or recently damaged. Far chunks can be represented by a single larger solid mesh or skipped until the player approaches.
- Block types (progressive):
  - Standard (white/cyan)
  - Reinforced (higher HP, cooler color)
  - Regenerating (slow heal if not hit recently)
  - Explosive (damages neighbors)
  - Data Node (extra currency + temporary buff)
  - Core / Nucleus (high HP, protected, big reward + unique VFX)
- Level generation: pure math. Size, density, special %, regen rate, core presence all driven by level number + LevelDefinition data.
- Difficulty formula (implement exactly):
  ```
  totalVoxels = size³ * density
  score = totalVoxels * avgHP * (1 + specialPercent) * (1 + regenRate) * defensiveFactor
  ```
- First 15 levels must be fully defined in data/levels.ts with concrete numbers so the game is playable immediately.

### 2. Player Ship & Controls
- Procedural geometric ship (box + tapered cylinders + thin fins). All emissive materials.
- Movement: constrained orbital. Ship always faces the cube center. Virtual joystick rotates the orbital position (yaw + limited pitch). Ship never leaves its orbital sphere.
- Camera: custom orbital camera that follows the ship with soft lag, always looks at cube center, supports pinch-zoom for larger cubes.
- Weapon: hitscan energy beam (or short-lived projectile mesh) with visual trail. Fire rate, damage, multi-shot, splash all upgradeable.
- Input: left side virtual joystick (touch), right side or auto-fire button. One-thumb friendly. Support both mobile and desktop (WASD / mouse as fallback for testing).

### 3. AI Drones
- Unlockable, limited count (start 0–1, scale to 6–10).
- Smaller geometric versions of the ship.
- Simple utility AI each frame: score targets by (distance, type priority, health remaining). Priorities upgradeable via tech tree.
- Soft energy / heat pool that regenerates slower while the tab is hidden → encourages return without hard-stopping progress.
- Spawn from player ship or a bay point.

### 4. Progression
- Currencies: DataFragments (primary), CoreEnergy (level clears), later PrestigeTokens.
- Tech Tree: 6 branches (Offense, Ship, Drones, Cube Analysis, Idle Automation, Global Multipliers). Nodes are plain objects with id, cost, prerequisites, effects (stat multipliers or unlock flags).
- UI for tech tree: clean node graph drawn with SVG or Canvas2D, pan/zoom, glowing connections. Click to purchase if affordable.
- IdleSimulator: on load or visibilitychange, compute offline time, apply idle clear rate (capped), award currency, advance partial cube damage if applicable.
- SaveSystem: serialize entire progression + current level progress to localStorage on every meaningful change + on beforeunload. Load on start. Version the save so future changes can migrate by simply discarding old saves if needed (no backward-compat layers).

### 5. Visual & Audio Style (must look premium on first frame)
- Renderer: THREE.WebGLRenderer with antialias, high pixel ratio clamped for mobile.
- Materials: MeshStandardMaterial or custom ShaderMaterial with pure emissive colors, no maps. High emissiveIntensity. Tone mapping + exposure tuned for bloom.
- Post: UnrealBloomPass (strength ~0.6–1.0), subtle chromatic or scanline overlay via CSS or additional pass.
- Background: pure black. Optional subtle animated grid floor far below or floating data particles.
- Destruction VFX: digital shatter (small cubes or points that fly outward and fade), emissive flash, screen shake (camera), subtle controller vibration if available.
- UI: thin cyan/magenta glowing borders, monospace or clean futuristic font (system fonts or generated), dark panels with opacity, no heavy chrome.
- Audio: low continuous engine hum, sharp digital impact ticks, rising electronic arpeggio on level clear, soft UI beeps. All synthesized. Volume master + mute.

### 6. Performance & Mobile Constraints
- Target: 40+ FPS on mid-range Android (Snapdragon 7-series class) with 20k–40k visible instances.
- Adaptive: if FPS drops below 28 for 2 seconds → reduce particle count, lower instance update frequency, disable secondary post effects.
- Use THREE.InstancedMesh + manual matrix updates. Never create/destroy Mesh objects every frame.
- Pool every projectile, particle, floating text, drone.
- Chunk dirty flags so only changed chunks rebuild instance data.
- Visibility API + Page Lifecycle: pause heavy work when hidden, still allow lightweight idle tick.

### 7. First Playable Vertical Slice (must work end-to-end before any other feature)
1. Black void + orbital camera + procedural ship.
2. One 8³ solid cube of instanced emissive blocks.
3. Touch joystick + auto-fire or fire button that damages blocks.
4. Blocks flash and disappear with particles when health reaches 0.
5. When all blocks gone → “LEVEL CLEAR” UI → award currency → next larger cube.
6. Simple persistent currency counter and a single upgrade that increases damage.
7. PWA installable and works offline after first visit.

Only after this slice is solid may the generator add hierarchical chunks, more block types, full tech tree, AI drones, idle simulator, and polish.

## GENERATION INSTRUCTIONS FOR GROK BUILD
1. Output the complete project as a series of files with clear path headers (e.g. ```ts src/core/Game.ts).
2. Every file must be fully written, correct TypeScript, and compile under the given tsconfig/vite config.
3. package.json must contain exact scripts: "dev", "build", "preview".
4. index.html must include the canvas container, UI root divs, and correct viewport meta for mobile.
5. All constants, first 15 levels, and first 25–30 upgrade nodes must be present and balanced enough that a new player can clear several levels and buy upgrades.
6. README.md must contain:
   - Exact install & run commands
   - How to install as PWA on Android
   - Short architecture overview
   - Known performance notes
7. The game must feel satisfying and “premium” on the very first play session: responsive controls, beautiful emissive destruction, clear feedback, no placeholder text.
8. Do not leave TODO comments for core systems. Implement them.
9. Follow agents.md on every decision: simplest that works, modular, long-term (orbital model is final, InstancedMesh is final, DOM UI is final, Web Audio is final).

## ACCEPTANCE CRITERIA (ONESHOT MUST PASS)
- `npm install && npm run dev` starts a beautiful game in < 10 seconds.
- On mobile Chrome the game is fully playable with touch, looks Tron-perfect, and can be added to home screen.
- Player can destroy at least the first 5–8 cubes, earn currency, buy upgrades, and see the cube grow in complexity.
- AI drones (once unlocked) continue working when the tab is backgrounded for short periods.
- No external network requests after first load. No missing assets. No console errors on clean run.
- Code is modular, readable, and ready for further agentic iteration without rewrites.

## FINAL ORDER
Generate the entire project now. Begin with package.json, vite.config.ts, tsconfig.json, index.html, style.css, then every source file in dependency order. End with README.md. Make Cube Game real in one shot.

---
END OF MASTER PROMPT
Paste everything above this line into Grok Build and execute.
