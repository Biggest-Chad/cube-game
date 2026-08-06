# Evolve (Prestige) & Research Lattice — Design Plan

**Status:** Design approved for implementation (phased)  
**Date:** 2026-08-06  
**Brand language:** Prefer **EVOLVE** / **ASCENSION** over generic “prestige.” UI copy: *“Evolve the hull”*, *“Ascension Tier N”*, *“Lattice Authority.”*

---

## 1. Problem statement

By mid-campaign (≈ stage 12) players can:

- Max every combat shop upgrade
- Sit on hundreds of thousands of **Data Fragments** with nothing to spend
- Hold **Core Energy** with almost no sinks (hardpoints only)

There is no long-term loop after “max the current ship.”

---

## 2. Design goals

| Goal | Design response |
|------|-----------------|
| Soft wall mid-run | Combat shop has a finite power budget per **Ascension tier** |
| Big fragment sinks | **Evolve** costs 100k → 200k → 300k… Fragments |
| Permanent progression | Evolve raises **baseline** ship/drone stats |
| Reset for replay | Combat upgrades (shop tree) reset on Evolve |
| Core Energy purpose | **Research Lattice** (menu) spends Core Energy |
| Monetization path | Core Energy becomes premium (“gems”); ad/IAP top-ups later |
| Hardpoint pacing | HP2 @ Ascension 1, HP3 @ Ascension 2 (not raw level/core alone) |
| Brand fit | Neon / lattice / ascension theming |

---

## 3. Currencies (locked roles)

| Currency | Role | Earn | Spend |
|----------|------|------|--------|
| **Data Fragments** | Soft / run economy | Blocks, clears, idle | Combat shop upgrades; **Evolve** milestones |
| **Core Energy** | Premium / meta | Clears (small), Evolve grant (large), future ads/IAP | **Research Lattice** unlocks; optional cosmetics later |
| **Ascension Tier** | Meta rank (not spent) | +1 per Evolve | Gates hardpoints & research rows |

Do **not** let Fragments buy Research Lattice nodes, or Core buy combat Pulse Amps — keep roles clean.

---

## 4. Evolve (prestige) system

### 4.1 Trigger & cost

```
evolveCost(tier) = 100_000 * (tier + 1)
// tier 0→1: 100k, 1→2: 200k, 2→3: 300k, …
```

Requirements to Evolve:

- `dataFragments >= evolveCost(currentAscension)`
- Optional soft gate: `highestLevel >= 8 + currentAscension * 3` (prevents day-1 Evolve spam)

### 4.2 On Evolve (atomic transaction)

1. Spend Fragments (all cost; surplus Fragments **kept** so the player isn’t zeroed for shop re-buy).
2. `ascensionTier += 1`
3. **Reset combat shop** `ownedUpgrades` → empty (retrain loop).
4. Apply permanent **baseline** multipliers from tier (see 4.3).
5. Grant **Core Energy**: `coreGrant = 80 + 40 * newTier` (tunable).
6. Recalculate stats; full hull/shield restore.
7. Persist: `ascensionTier`, `lifetimeEvolves`, baselines, core, frags.

**Do not reset:**

- Owned weapons catalog (or optional: keep catalog, reset branch ranks — **recommend keep weapons + branch ranks** so loadout mastery persists)
- Research Lattice unlocks
- Highest sector unlocked
- Tutorials / settings / cosmetics

### 4.3 Permanent baseline (per Ascension)

Stacked permanent bonuses (example table):

| Ascension | Damage | Hull/Shield | Drone damage | Orbit speed | Notes |
|-----------|--------|-------------|--------------|-------------|--------|
| 1 | +8% | +10% | +8% | +4% | Unlocks HP2 (with core cost) |
| 2 | +8% | +10% | +8% | +4% | Unlocks HP3 |
| 3+ | +7% each | +8% each | +7% | +3% | Soft-cap total at ~+80% dmg |

Baselines apply **after** combat shop retrain, so maxed post-Evolve ship always exceeds previous tier’s ceiling.

### 4.4 Hardpoint gates

| Slot | Unlock |
|------|--------|
| HP1 (0) | Free at start |
| HP2 (1) | `ascensionTier >= 1` + Core cost (e.g. 160) |
| HP3 (2) | `ascensionTier >= 2` + Core cost (e.g. 480) |

Remove pure level-based hardpoint unlocks; keep Core cost so Core still has a small combat sink.

### 4.5 UI

- Combat HUD / shop: **EVOLVE** panel when frags ≥ 50% of next cost (preview).
- Confirm modal: “Retrain all combat upgrades. Permanent Ascension +I. Grant N Core Energy.”
- Main menu: Ascension badge under brand.

---

## 5. Research Lattice (main-menu tech tree)

### 5.1 Access

- Main menu button: **RESEARCH** / **LATTICE**
- Not available mid-combat (no soft-lock); optional read-only during play
- Full-screen landscape panel, same chrome language as shop but distinct (magenta-dominant)

### 5.2 Spend: Core Energy only

Nodes cost Core; never Fragments.

### 5.3 Node types

| Type | Examples |
|------|----------|
| **Permanent mult** | +2% all damage, +3% frag find (small — stacks with Ascension) |
| **Unlock** | New drone role earlier, idle boost tier, sector skip token |
| **Ability** | Once-per-clear overshield, emergency thruster burst, scan pulse |
| **Quality of life** | Extra loadout preset slot, auto-collect idle |
| **Cosmetic** | Ship trail color, reticle skin (cheap Core sinks) |

### 5.4 Layout

- Rows gated by Ascension tier (row 0 free, row 1 needs Ascension ≥ 1, …)
- Horizontal prereq chains within a row
- No full respec of Research (premium feel); optional rare “refund 50%” ad later

### 5.5 Monetization (later phase)

- IAP packs: Core Energy + optional cosmetics
- Rewarded ads: small Core drip (capped/day)
- Never sell Fragments that skip Evolve entirely without care — if selling Fragments, cap purchases/day

---

## 6. Combat shop role after this design

Combat shop = **within-tier specialization** (Pulse Amp, thrusters, drones, weapon branches).

Targets:

- Full re-buy of combat tree after Evolve ≈ 40–70% of next Evolve cost (so player farms again)
- Soft wall when tree is maxed → push Evolve
- Late-tier expensive ranks exist as interim sinks until Evolve ships

---

## 7. Intended loop (player-facing)

1. Clear sectors → earn Fragments & small Core  
2. Spend Fragments on combat shop until soft-maxed  
3. Hit power wall / expensive late ranks  
4. **Evolve** at 100k / 200k / … → permanent baseline + Core dump + retrain  
5. Spend Core on **Research Lattice** between runs  
6. Unlock HP2/HP3 via Ascension  
7. Repeat at higher ceiling  

---

## 8. Data model (implementation sketch)

```ts
// SaveSystem
ascensionTier: number;          // 0..N
lifetimeEvolves: number;
baseline: {
  damageMul: number;
  hullMul: number;
  shieldMul: number;
  droneDamageMul: number;
  orbitSpeedMul: number;
};
researchOwned: string[];        // research node ids
```

```ts
// TechTree recompute
finalDamage = base * shopDamage * baseline.damageMul * researchDamage;
```

```ts
// HARDPOINT_UNLOCK
{ slot: 1, costCore: 160, minAscension: 1 }
{ slot: 2, costCore: 480, minAscension: 2 }
```

---

## 9. Phased implementation

| Phase | Deliverable |
|-------|-------------|
| **P0** | Death repair immunity; VFX/perf budget; frag soft-cap; late combat sinks; this design doc |
| **P1** | Evolve button + cost + reset combat upgrades + baseline mult + Core grant + save fields |
| **P2** | Hardpoints gated by Ascension; shop UI Evolve panel |
| **P3** | Research Lattice UI + Core-only nodes + menu entry |
| **P4** | IAP / ad Core packs; balance pass on evolve costs |
| **P5** | Sub-agent adversarial quality review (logic, economy, save, UI, balance exploits) |

---

## 10. Balance dials (initial)

| Dial | Start value |
|------|-------------|
| Evolve cost base | 100_000 |
| Core grant | 100 + 60×tier (Asc1 = 160, covers HP2) |
| Frag surplus after Evolve | keep all remaining |
| Weapons on Evolve | keep owned + branches |
| Combat tree re-max cost | ~0.5× next evolve |
| Research row 0 cheapest | 15–40 Core |
| Research row 2 flagship | 200–400 Core |

---

## 11. Open decisions (resolve in P1)

1. Exact brand string: **EVOLVE** vs **ASCEND** vs **REFORGE**  
2. Keep weapon branch ranks across Evolve? (**Recommend yes**)  
3. Highest sector: keep (**yes**) or soft-reset?  
4. Should idle income scale with Ascension? (**small yes**)

---

*End of design plan. Implementation of P1+ should follow this document without inventing parallel currencies.*
