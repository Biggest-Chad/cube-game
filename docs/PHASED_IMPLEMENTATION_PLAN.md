# Cube Game — Phased Implementation Plan (Sub-Agent Master Spec)

**Status:** Planning complete — ready for sequential / parallel agent execution  
**Scope:** Quality overhaul from vertical-slice prototype → deep, scalable, market-competitive idle/active orbital destroyer  
**Stack (locked):** TypeScript · Vite · Three.js · DOM UI · Web Audio · PWA · offline-first · no Unity  
**Save policy:** Bump `SAVE_VERSION` on any incompatible schema change; discard old saves (no migration layers unless trivial)

---

## 0. Feedback → Core Pillars

| Pillar | User intent | Design response |
|--------|-------------|-----------------|
| **A. Feel** | Ship still rubber-bands at top speed; early ship too fast | Velocity-based orbit with hard caps; early-game slow baseline; speed is upgrade-gated |
| **B. Atmosphere** | Empty void is sterile | Lightweight Tron ambient layer (grid, distant structures, fog particles) — GPU-cheap |
| **C. Economy / difficulty** | Power outpaces levels from ~L4 | Flatten income; raise HP-first difficulty; upgrades become *required* |
| **D. Loadouts** | Linear gun is shallow | Hardpoint system + deep modular weapons (sandbox, not rails) |
| **E. Drones** | Single drone type, low ceiling | Multi-role fleet, high cap, infinite cost curve, armor walls block AFK |
| **F. Session hygiene** | Clear leaves debris | Full play-session teardown between levels |
| **G. Living cube** | Static target | Rubik-style rotations + reactive telegraphs |
| **H. Cube defense** | One-sided combat | Staged shields / turrets / enemy drones; player survivability stats |
| **I. Shop UX** | Flat card spam | Tabbed shop, sequential dependency cards, live stat panel |
| **J. Sane caps** | No 99% armor nonsense | Soft/hard caps, DR formulas, competitor-informed ceilings |
| **K. Ads** | Monetize without hostility | AdMob-ready facade; dummy ads grant rewards now |

### Recommended additions (agent freedom)

Agents **should** implement these where they improve quality without scope explosion:

1. **Threat telegraphs** — cube rotation wind-up, turret charge rings, shield flicker states  
2. **Combo / overheat** — main gun heat meter discourages pure spray; loadout weapons manage heat differently  
3. **Milestone prestige-lite** — “Sector Ascension” after L30 that multiplies costs/rewards without deleting loadouts  
4. **Codex / unlock gallery** — weapons, drones, cube behaviors discovered once  
5. **Accessibility** — reduced motion toggle (disables cube rotation animation, keeps mechanical rotation), colorblind block tints  
6. **Audio stingers** — rotation, shield break, hardpoint unlock  
7. **Performance budget sheet** — hard limits on lights, particles, enemy units per tier  

---

## 1. Market Analysis (Competitors → Design Levers)

### Comparable products

| Title | Relevant mechanics | Steal | Avoid |
|-------|-------------------|-------|-------|
| **Geometry Wars / Resogun** | Neon void, particle juice, twin-stick feel | Atmosphere density without clutter | Pure score-chasing only |
| **Space Agency / Kerbal-adjacent hardpoint fantasy** | Mounted modules, visible hardware | Visible hardpoints under hull | Real physics complexity |
| **Everspace / Rebel Galaxy Outlaw** | Weapon slots, specialty guns | Role identity per weapon | Inventory bloat |
| **Idle On / Melvor / AFK arena** | Offline progress + active skill | Soft idle, hard walls | Full AFK of entire endgame |
| **Vampire Survivors / Brotato** | Combinatorial builds, not linear trees | Synergy sandbox | Instant power snowball |
| **Warframe / Anthem-style** | Modular weapons, forma-like sinks | Deep upgrade trees per weapon | Grind without agency |
| **FTL / Into the Breach** | Ship systems, shields as layers | Layered defense (shield → armor → hull) | Turn-based pace |
| **Armored Core / MechWarrior** | Hardpoints, loadout identity | 1→3 hardpoints as milestone | Grid inventory UI on mobile |
| **Raid: Shadow Legends ads** | Rewarded video for energy/boosts | Opt-in rewards at natural breaks | Interstitials mid-orbit |

### Balance norms to enforce

| Stat | Soft cap | Hard cap | Notes |
|------|----------|----------|-------|
| Damage reduction (armor) | ~35% effective mid | **55%** max | Use hyperbolic DR, never flat “99% absorb” |
| Shield absorb | Separate pool | 100% of hit until empty | Shield ≠ DR; regenerates after delay |
| Crit chance | 25% mid | **40%** | Crit mult hard-capped at **2.25×** |
| Fire rate mult (main) | 2.0× | **2.75×** | Beyond that, heat punishes |
| Orbit speed mult | 1.4× early end | **1.85×** | Never return to current “twitchy” baseline |
| Fragment income mult | 1.5× mid | **2.25×** total | Prefer level rewards over permanent mults |
| Idle clear rate | Partial progress | Cannot kill armored cores alone | High-armor blocks require player weapons |
| Drone count | — | **24** absolute | Cost curve is the real limit |
| Player DR + shield + dodge combined effective | — | ~**70%** peak theoretical | Still dies to focused turret fire |

**Damage reduction formula (mandatory):**

```
effectiveArmor = armorRating / (armorRating + ARMOR_K)   // ARMOR_K ≈ 100
damageTaken = raw * (1 - effectiveArmor) * shieldRules
```

Never use `damage *= (1 - armorPercent)` with uncapped percent.

---

## 2. Architecture Target (Post-Overhaul)

```
src/
  core/           Game, EventBus, Time, SaveSystem, SessionCleaner, BalanceConfig
  combat/         DamageModel, ProjectilePool, WeaponRuntime, HardpointSystem
  weapons/        definitions + behaviors (beam, rocket, rail, flak, torpedo, missile)
  loadout/        LoadoutState, WeaponInstance, UpgradePath, HardpointUnlocks
  cube/           + CubeAnimator (rubik), CubeDefense, ShieldSystem, Turret, EnemyDrone
  player/         Ship, ShipVitals (HP/Shield/Armor), OrbitalCamera (anti-jitter), Input
  drones/         DroneManager, roles (Miner/Breaker/Fighter/Shield), scaling costs
  progression/    Currency, ShopCatalog (sequential), IdleSimulator, AdsService
  world/          AmbientEnvironment (grid, fog, skyboxes-as-geometry)
  ui/             ShopUI (tabs), LoadoutUI, HUD, AdsOfferUI, StatPanel
  data/           levels, weapons, drones, balance curves, ad placements
  ads/            AdService interface + DummyAdProvider + (future) AdMobProvider
```

**Non-negotiable rules for agents:**

- No god-object growth in `Game.ts` — extract systems; Game only orchestrates.
- All combat damage goes through `DamageModel.apply(...)`.
- All weapons implement `WeaponBehavior` interface.
- Session transitions call `SessionCleaner.resetCombatWorld()`.
- Balance numbers live in `data/balance.ts` / curves — not magic numbers in systems.

---

## 3. Phased Plan Overview

| Phase | Name | Goal | Parallelizable? | Est. effort |
|-------|------|------|-----------------|-------------|
| **P0** | Foundations & anti-jitter | Stable movement, balance config, session cleaner, save v2 | No — blocks all | S |
| **P1** | Atmosphere | Ambient Tron environment | Yes after P0 | S |
| **P2** | Economy & level retune | Difficulty/income curves, progressive upgrades required | Yes after P0 | M |
| **P3** | Ship vitals + shop tabs | HP/shield/armor, tabbed sequential shop, stat panel | After P0; pairs with P2 | M |
| **P4** | Hardpoints & weapon framework | 1→3 hardpoints, mount visuals, loadout UI skeleton | After P0 | M |
| **P5** | Weapon roster depth | 6+ weapon types × multi-branch upgrades | After P4 | L |
| **P6** | Drone overhaul | Roles, caps, infinite costs, armor walls | After P2 | M–L |
| **P7** | Living cube (Rubik) | Epic rotations, telegraphs, gameplay impact | After P0; after P2 for pacing | M |
| **P8** | Cube self-defense | Shields, turrets, enemy drones, staged intro | After P3+P6 | L |
| **P9** | Ads facade | Dummy rewarded ads, placement UX, AdMob seam | After P3 | S |
| **P10** | Polish, QA, balance pass | Caps audit, performance, juiciness, docs | After P5–P9 | M |

**Critical path:**  
`P0 → (P1 ∥ P2 ∥ P3) → P4 → P5`  
`P0 → P2 → P6 → P8`  
`P0 → P7`  
`P3 → P9`  
`P10` last

---

## 4. Phase Specifications (Agent-Executable)

### P0 — Foundations, Movement Fix, Session Cleaner

**Objectives**

1. **Eliminate rubber-banding / jitter at top speed**
   - Root causes to investigate (fix all that apply):
     - Competing lerp layers (orbit angle + ship pos lag + camera lag fighting each other)
     - Frame-dependent accel (`Math.min(1, accel*dt)` overshoot)
     - Discrete angle updates vs continuous camera follow
     - Stick noise near full deflection
   - **Required fix approach:**
     - Single source of truth: `orbitState.yaw/pitch/radius` updated by velocity integrator only
     - Ship **visual** lag optional but **combat origin** uses orbit truth (or same lag for both — pick one and document)
     - Camera follows ship/orbit with critically damped spring **or** exp lag with **constant half-life**, never hard snap unless teleport
     - Cap `dt` (already 0.05) and use `1 - exp(-k*dt)` exclusively for all smoothers
     - At high angular velocity, temporarily **reduce** ship mesh lag so visual doesn't trail then whip
     - Optional: sub-step orbit integration (2 steps/frame) when `|ω| > threshold`

2. **Early-game ship slower; speed is upgrade-gated**
   - Baseline `yawSpeed` / `pitchSpeed` ~**60–70%** of current post-fix values
   - New ship stats: `topSpeed`, `acceleration`, `handling` (maps to max ω, angular accel, friction)
   - First 3–5 levels feel deliberate; speed nodes in shop required before L10 comfort

3. **`BalanceConfig` / `data/balance.ts`**
   - Central curves: level HP, rewards, armor K, caps, drone cost function

4. **`SessionCleaner`**
   - On level clear → next level / retry / menu:
     - Despawn all projectiles, beams, particles, rings, floating text
     - Despawn enemy units and temporary cube VFX
     - Reset weapon cooldowns/heat
     - Then load new cube
   - Must run **before** level clear UI dismiss continues into next sector

5. **Save v2 skeleton**
   - Version bump prep: ship vitals, loadout, hardpoints, ad flags (fields may be defaults until later phases)

**Acceptance**

- [ ] Full stick held for 10s: no visible oscillation / rubber band of ship or camera
- [ ] Fresh save L1–L3 feels slower than current build
- [ ] Level transition leaves zero orphan projectiles/particles
- [ ] `npm run build` clean

**Primary files:** `OrbitalCamera.ts`, `Ship.ts`, `Game.ts`, `data/constants.ts`, new `core/SessionCleaner.ts`, new `data/balance.ts`

---

### P1 — Ambient / Tron Atmosphere

**Objectives**

- Beautiful passive background that does **not** steal focus or FPS

**Recommended content (cheap)**

| Element | Technique | Budget |
|---------|-----------|--------|
| Infinite floor grid | Single large plane or shader grid, low opacity | 1 draw |
| Horizon ring / data equator | Thin torus or line loop | 1 draw |
| Distant “server monoliths” | 8–20 simple boxes far out, slow parallax rotation | 1 merged mesh ideal |
| Dust / data motes | Existing particle pool, ≤150, slow drift | shared pool |
| Subtle fog | `scene.fog = FogExp2` very mild | free |
| Optional scan pulse | Rare expanding ring on level start only | temp |

**Rules**

- No realtime shadows
- No extra post-process passes beyond current bloom
- Ambient must disable or simplify on adaptive low quality
- Colors: cyan/magenta/white on black — match existing aesthetic

**Acceptance**

- [ ] Mid-range feel improved on L1 screenshot test
- [ ] FPS impact ≤ 3–5 on desktop; adaptive path drops ambient density
- [ ] Gameplay readability of cube blocks **unchanged or improved**

**Primary files:** new `world/AmbientEnvironment.ts`, `Game.ts`, `PostProcessing.ts` (fog only if needed)

---

### P2 — Economy & Level Difficulty Retune

**Problem statement**  
Multiplicative upgrades (`1.25 × 1.35 × 1.45…`) + generous fragments make L4+ trivial.

**Design targets**

| Level band | Player power fantasy | Clear time target (active, no loadout endgame) |
|------------|----------------------|--------------------------------------------------|
| 1–3 | Tutorial, 0–1 upgrades | 30–90s |
| 4–8 | Upgrades required | 2–4 min |
| 9–15 | Hardpoint weapon helps a lot | 3–6 min |
| 16–25 | Dual hardpoints + drone mix | 5–10 min |
| 26–30+ | Full loadout + vitals | 8–15 min |

**Difficulty levers (priority order)**

1. **Block HP** (primary) — raise `avgHP` curve faster than size  
2. **Reinforced / high-armor share** — more tough blocks  
3. **Size / density** (secondary) — more blocks but not cubic explosion every level  
4. **Regen / specials** — later bands  
5. **Defenses (P8)** — staged, not early income fix  

**Income levers**

- Cut per-block fragment yield  
- Soft-cap fragment multipliers (see §1)  
- Level clear rewards grow **sublinearly** vs difficulty score  
- Prefer Core Energy for big unlocks (hardpoints) vs raw fragment spam  

**Upgrade philosophy**

- Additive stacking where possible for damage ranks; multiplicative only with diminishing returns  
- Example: `damage = base * (1 + sum(rankBonuses)) * globalMult` with `globalMult ≤ 2.0`  
- Early nodes: +12–18% effective power, not +25–45% multiplicative each  

**High-armor blocks (feeds P6/P8)**

- New block flag `armorClass`: `none | light | heavy | siege`  
- Drones deal `×0.15` to `siege` without Breaker role / armor-pierce  
- Player rail/torpedo ignore partial armor  

**Acceptance**

- [ ] Un-upgraded ship cannot comfortably clear L5  
- [ ] Fully upgraded **main gun only** (no hardpoint weapons) struggles past L12  
- [ ] Fragment income for L1–L10 reduced vs current by ~30–50% effective  
- [ ] Curves documented in `data/balance.ts` with comments  

**Primary files:** `data/levels.ts`, `data/upgrades.ts`, `data/balance.ts`, `Currency.ts`, `TechTree.ts`, `LevelGenerator.ts`, `BlockTypes.ts`

---

### P3 — Ship Vitals + Tabbed Sequential Shop + Stat Panel

**Ship vitals**

| Pool | Behavior |
|------|----------|
| **Hull HP** | Depleted = level fail / retreat (choose: fail with fragment keep 50%, or emergency extract) — **recommend:** hull break → “SYSTEMS CRITICAL” → auto-extract with 50% of level fragments, cube progress saved if partial |
| **Shield** | Absorbs first; recharges after 3s no damage; upgrade capacity + recharge |
| **Armor rating** | Hyperbolic DR (see §1), hard-capped effective 55% |

**Damage intake order:** Shield → (Armor DR on remainder) → Hull  

**Shop tabs**

1. **Ship** — speed, accel, hull, shield, armor, utility  
2. **Main Gun** — primary beam tree (sequential ranks)  
3. **Loadouts** — hardpoints & owned weapons (P4/P5 fill)  
4. **Drones** — sequential count + role unlocks (P6)  
5. **Analysis / Economy** — fragment efficiency, idle (capped)  
6. **Global** — rare multipliers with hard caps  

**Sequential dependency UI rule (mandatory)**

- Do **not** show Drone I / II / III as three cards  
- Show **one** card: “Wingman Bay (1/12)” → after purchase becomes next rank  
- Same for armor ranks, shield ranks, hardpoint unlocks  
- Locked branches show **one** teaser card (“Requires: Ally Protocol”) not full tree spam  

**Stat summary panel (always visible in shop)**

- DPS main / DPS loadout estimate  
- RoF main + per hardpoint  
- Crit chance / mult (capped display)  
- Drone count + drone DPS estimate  
- Hull / Shield / Armor% effective  
- Top speed / accel  
- Hardpoints used `n/max`  

**Acceptance**

- [ ] Shop is scannable on mobile portrait/landscape  
- [ ] Never more than ~1 visible sequential card per chain  
- [ ] Taking damage (once P8 exists) reduces shield then hull; shop stats update live  

**Primary files:** new `player/ShipVitals.ts`, rewrite `ui/TechTreeUI.ts` → `ui/ShopUI.ts`, `progression/*`, HUD damage feedback

---

### P4 — Hardpoint System & Loadout Framework

**Hardpoints**

| Slot | Unlock | Cost theme |
|------|--------|------------|
| HP0 | Free at game start | Tutorial rocket or empty until first weapon unlock |
| HP1 | Milestone ~L8–10 + Core Energy sink | Expensive, celebrated VFX |
| HP2 | Milestone ~L18–20 + large sink | Endgame identity |

- Hardpoints are **visible meshes** under/along the ship (pylons, clamps, cabling)  
- Empty slot shows dark pylon; equipped weapon swaps muzzle model  
- Fire input: main gun auto; loadouts fire on cadence / alt-fire / shared heat — **recommend:** all auto with individual cooldowns; optional hold-to-focus primary  

**Data model**

```ts
interface WeaponDef {
  id: string;
  name: string;
  family: WeaponFamily; // rocket | missile | beam | rail | flak | torpedo | ...
  baseStats: WeaponStats;
  branches: UpgradeBranchDef[]; // 2–3 branches each, 5–8 ranks
  tags: string[]; // armor-pierce, splash, anti-drone, sustained, burst...
  unlock: UnlockRule;
}

interface WeaponInstance {
  defId: string;
  branchRanks: Record<string, number>;
  // derived stats cached
}

interface LoadoutState {
  hardpointUnlocks: number; // 1..3
  slots: Array<WeaponInstance | null>; // length 3
}
```

**Sandbox vibe**

- Weapons unlock via levels / shop / rare drops (data nodes)  
- Any unlocked weapon equippable in any unlocked hardpoint  
- Respec: cheap early, expensive later (currency sink) **or** free swap between levels only  

**Acceptance**

- [ ] 1 hardpoint visible and functional mid-game path  
- [ ] Unlocking HP2/HP3 is a memorable milestone  
- [ ] Save/load preserves loadout  
- [ ] Session cleaner clears projectiles from all weapons  

**Primary files:** `loadout/*`, `combat/HardpointSystem.ts`, `Ship.ts` mounts, `ui/LoadoutUI.ts`, save schema

---

### P5 — Weapon Roster (USP + Deep Branches)

Implement **at least 6 families**. Each must have a **unique selling point** and **≥2 upgrade branches**.

| Family | USP | Strengths | Weaknesses | Branch examples |
|--------|-----|-----------|------------|-----------------|
| **Pulse Laser** (may migrate main gun here) | Reliable hitscan, low heat | Consistent DPS | Low armor break | Overcharge / Prism Split / Coolant |
| **Rocket Pod** | Dumb-fire splash | Clears clusters | Slow projectile, friendly? no | Payload / Barrage / Thermobaric |
| **Guided Missiles** | Homing, prioritizes tags | Hunts data/core | Low RoF, can be flak'd later | Swarm / Hunter-Killer / Payload |
| **Railgun** | Armor pierce, charge shot | Siege blocks | Charge time, skill timing | Capacitor / Spike / Ricochet |
| **Flak Cannon** | AoE bursts, anti-drone | Fighter defense | Poor vs single siege | Shrapnel / Proximity / Mag Dump |
| **Torpedo** | Huge delayed boom | Core / shield break | Telegraphed, ammo heat | Warhead / Magnetic / Cluster |
| **Beam Lance** (optional 7th) | Sustained beam melt | Boss/core | Rooted heat build | Focus / Sweep / Drain |
| **Nova Charge** (optional) | Burst omnidirectional | Emergency clear | Long CD | Radius / Echo / Vacuum |

**Balance rule:** No single weapon should dominate all content; **siege** wants rail/torpedo; **swarms** want flak/missiles; **general** pulse/rocket.

**Visual bar:** Each family needs distinct projectile, muzzle, impact SFX (synth), and hardpoint model.

**Acceptance**

- [ ] ≥6 equippable weapons with unique feel in 5-second demo  
- [ ] Each has multi-rank branches that change behavior not just +%  
- [ ] Combinations clearly exceed “main gun only” from L10+  
- [ ] Hundreds of theoretical combos: `weapons × branches × ranks × slot permutations` documented in README  

**Primary files:** `weapons/*.ts`, `data/weapons.ts`, VFX hooks, audio hooks

---

### P6 — Drone Fleet Overhaul

**Roles**

| Role | Function | Notes |
|------|----------|-------|
| **Miner** | Standard block clear | Default |
| **Breaker** | Partial armor pierce | Required for heavy armor AFK partial |
| **Guardian** | Repairs player shield slowly / taunts turrets | Support |
| **Fighter** | Engages **enemy drones**, ignores blocks mostly | P8 synergy |
| **Sentry** | Orbit-fixed, high RoF low damage | Optional |

**Quantity**

- Soft cap via cost: `cost(n) = base * (growth ^ n)` with `growth ≈ 1.35–1.5`  
- Hard cap **24**  
- Early: 0–2; mid: 6–10; late: 12–20 with sinks  

**AFK wall**

- `siege` / high-armor blocks: miners deal tiny damage  
- Idle simulator cannot fully clear levels past band threshold without player  
- Fighters don't help cube clear  

**Acceptance**

- [ ] Infinite-feeling cost sink (cost still rises at n=20+)  
- [ ] At least 3 roles playable  
- [ ] AFK 1 hour cannot finish a high-armor level from full  
- [ ] Fighters prioritize enemy drones when present  

**Primary files:** `drones/*`, `data/drones.ts`, `IdleSimulator.ts`, shop sequential drone cards

---

### P7 — Rubik / Living Cube

**Fantasy:** A mysterious force reorients the lattice — alien, telegraphed, epic.

**Mechanics**

- From level band ~6+: occasional **face rotation** (90° around random principal axis)  
- Blocks are re-parented in data OR instance matrices animated then occupancy remapped  
- Prefer: animate chunk group rotation 0.8–1.4s with ease-in-out; **during wind-up**, shield shimmer / glitch SFX  
- Player projectiles mid-flight may miss (acceptable); optional soft magnetism  

**Reactivity**

- Damage spikes increase rotation chance  
- Low HP cube rotates more desperately  
- Never rotate every 2s — cadence tables in balance  

**VFX**

- Axis glyphs, ghost afterimage, chromatic glitch on shell  
- Camera slight shake at snap complete  

**Accessibility**

- Reduced motion: instant snap + icon warning, no interpolated spin  

**Acceptance**

- [ ] Rotation readable and fair (telegraph ≥0.6s)  
- [ ] No soft-lock / NaN in cube occupancy after rotate  
- [ ] Feels “epic” in capture, not annoying spam  

**Primary files:** `cube/CubeAnimator.ts`, `CubeManager.ts`, audio, balance cadence

---

### P8 — Cube Self-Defense (Staged)

**Introduction schedule (tunable)**

| Level | Defense feature |
|-------|-----------------|
| 1–4 | None |
| 5–7 | Light **shield bubble** on core only (breaks with sustained fire) |
| 8–10 | **1 turret**, slow projectile at player |
| 11–14 | Face shields + 2 turrets |
| 15–18 | **Enemy drones** (2–4) + turrets |
| 19–25 | Layered shields, turret types, fighter drones |
| 26+ | Elite mix, adaptive targeting of player drones |

**Turrets**

- Mounted on cube surface; destroyed as special blocks OR independent entities with HP  
- Projectile types: slow orb, tracking bolt (later), flak vs drones  

**Enemy drones**

- Engage player drones and ship  
- Fighters (player) counter them  

**Player feedback**

- Shield hit flash, low HP screen edge, audio  
- Death/extract flow from P3  

**Acceptance**

- [ ] Early levels unchanged in threat  
- [ ] By L10 player must manage positioning / shield  
- [ ] Un-upgraded hull dies if AFK against turrets  
- [ ] Defenses cleaned on session reset  

**Primary files:** `cube/CubeDefense.ts`, `cube/Turret.ts`, `cube/EnemyDrone.ts`, `ShipVitals.ts`, levels data flags

---

### P9 — Ads Framework (Dummy → AdMob-ready)

**Principles**

- Rewarded, opt-in, at natural breaks  
- Never block core loop  
- No surprise interstitials mid-combat (v1)

**Placements**

| Placement | Offer | Reward examples |
|-----------|-------|-----------------|
| After level clear | “Double clear reward” | ×2 fragments/core (cap daily) |
| Shop | “Instant data packet” | Flat fragments (diminishing) |
| On extract/death | “Emergency repair” | Restore shield + 30% hull once |
| Idle return | “Boost offline” | +50% offline cap for next 1 claim |
| Hardpoint unlock near-miss | “Sponsorship surge” | 20% cost discount once |

**Architecture**

```ts
interface AdProvider {
  isReady(placement: AdPlacement): boolean;
  showRewarded(placement: AdPlacement): Promise<AdResult>;
}
// DummyAdProvider: resolves success immediately
// AdMobProvider: future, same interface
```

**Daily caps** per placement to prevent abuse  

**Acceptance**

- [ ] Dummy ads grant rewards instantly  
- [ ] UI clearly labeled “Watch Ad”  
- [ ] `AdService` swappable without rewriting callers  
- [ ] Caps persist in save  

**Primary files:** `ads/*`, `ui/AdsOfferUI.ts`, shop/clear overlays

---

### P10 — Integration Polish & QA

- Full balance spreadsheet pass (or markdown table) L1–30 with expected DPS vs EHP  
- Cap audit script or unit tests for DR, crit, mults  
- Performance: L20 with max drones + turrets + particles on mid Android  
- Tutorial tooltips: hardpoint, armor blocks, first turret  
- README update: architecture, ads, loadout  
- Bug bash: session cleaner, rubik occupancy, save/load loadout  

---

## 5. Cross-Cutting Implementation Notes

### 5.1 Anti-jitter movement (detail for P0 agent)

```
// Pseudocode — authoritative orbit
targetω = f(smoothedInput) * topSpeedStat
ω = approach(ω, targetω, accelStat, dt)  // exp or torque model
yaw += ω.yaw * dt
// ship.position = orbitPoint(yaw,pitch,r)  // optionally slight lag ONLY if camera uses same
// camera = damp(camera, thirdPersonFrom(ship or orbit), halfLife, dt)
// FORBIDDEN: ship.lerp(orbit) AND camera.lerp(ship) AND orbit jumps from raw input
```

### 5.2 Level clear session flow

```
onAllBlocksDestroyed:
  pause combat input
  play clear fanfare
  SessionCleaner.wipe()
  show rewards UI (ads offer optional)
onNextSector:
  SessionCleaner.wipe()  // second guarantee
  startLevel(n+1) → intro cinematic → playing
```

### 5.3 Shop sequential card algorithm

```
for each chain in tab:
  node = first unpurchased node in chain whose prereqs met
  if node affordable → highlight
  if chain complete → show "MAXED" once
```

### 5.4 Testing checklist (every phase)

- `npx tsc --noEmit` / `npm run build`  
- Manual: L1 fresh, L10 mid save (when available), resize, tab background, PWA offline  
- No console errors  

---

## 6. Suggested Agent Assignments

| Agent | Phase | Independence |
|-------|-------|--------------|
| Agent-Move | P0 movement + SessionCleaner | First |
| Agent-World | P1 ambient | After P0 |
| Agent-Balance | P2 curves + armor classes | After P0 |
| Agent-Shop | P3 vitals + shop UX | After P0; merge balance effects with P2 |
| Agent-Loadout | P4 hardpoints framework | After P0 |
| Agent-Weapons | P5 weapon implementations | After P4 |
| Agent-Drones | P6 fleet | After P2 |
| Agent-CubeLive | P7 rubik | After P0 |
| Agent-Defense | P8 defenses | After P3, P6, P7 preferred |
| Agent-Ads | P9 | After P3 |
| Agent-QA | P10 | Last |

**Merge discipline:** One phase = one PR/branch when possible; balance constants only in `data/balance.ts` to reduce conflicts.

---

## 7. Milestone Definition of Done (Product)

The overhaul is **complete** when:

1. Movement is slow-to-upgrade, smooth at max speed (no rubber band).  
2. Atmosphere is present and cheap.  
3. L4+ requires upgrades; L12+ strongly wants loadout weapons.  
4. 1–3 hardpoints with ≥6 deep weapons and sandbox equipping.  
5. Diversified drones with cost sinks and AFK walls.  
6. Clean session resets between levels.  
7. Cube rotates with telegraphs; later levels fight back.  
8. Shop is tabbed, sequential, with live stats.  
9. All % stats respect hard caps; no 99% DR.  
10. Dummy ads work; AdMob seam documented.  

---

## 8. Out of Scope (Explicit Non-Goals for This Plan)

- Real multiplayer / PvP  
- Real money IAP economy design (beyond ad placeholders)  
- Full 3D asset pipeline (keep procedural / runtime geometry unless agents generate compact glTF later)  
- Backend servers / accounts  
- Unity or native engines  

---

## 9. Immediate Next Step

**Execute P0 first** with a single agent focused on:

1. Orbit integrator rewrite (anti-jitter)  
2. Early speed nerf + upgrade hooks  
3. `SessionCleaner`  
4. `data/balance.ts` scaffold + `SAVE_VERSION` bump  

Only after P0 acceptance should parallel agents start P1/P2/P3/P4.

---

*Document version: 1.0 — 2026-08-03*  
*Owner: Grok Build planning pass from user feedback master list*  
*Consumers: implementation sub-agents, QA agent, future balance patches*
