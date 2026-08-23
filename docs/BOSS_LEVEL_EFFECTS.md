# Boss / nucleus effects — current behavior

Chronobeacon bosses are every 5th sector (`5, 10, 15, 20…`). Attribute cycle:

| Sector | Attribute |
| --- | --- |
| 5, 20, 35… | **Rage** |
| 10, 25, 40… | **Regeneration** |
| 15, 30, 45… | **Swarm** |
| All other sectors | **Standard** (no attribute) |

Every sector has a nucleus. Shared HP pool. Shell DR scales with remaining shell (max 88%, min 12% always chips through). Overload fires at **75% / 50% / 25%** nucleus HP.

## Shared nucleus states

| State | Trigger | Effect |
| --- | --- | --- |
| **Exposed** | ≤ **10%** shell remaining | HUD EXPOSED. Attribute on-exposed extra fires. |
| **Destabilizing** | ≤ **5%** shell remaining | Nucleus HP decays (~1.8% maxHP/s, min 6/s). HUD DESTABILIZING. |
| **Overload** | HP crosses 75 / 50 / 25% | Attribute-specific burst (or spike burst on Standard). |

## Rage (5 / 20 / 35…)

Always while the attribute is active:

- Turret / enemy-drone fire rate × **1.35**

When **exposed**:

- Sweep laser: warmup 0.7s, charge 2.4s, fire 5.0s, cooldown 3.8s
- Slow track while charging (0.20 rad/s) and firing (0.30 rad/s)
- Hit radius 1.18, range 78, **16 DPS**
- Player must circle off the line

On **overload** (3.2s):

- Laser slew faster (0.42 rad/s) and **20 DPS**
- Extra spray of **8** dodgeable arc bolts (speed 12, damage 22)

## Regeneration (10 / 25 / 40…)

Always:

- Living shell heals **0.8% of block max HP / s** (pauses ~1.2s after a hit)
- Innermost dead voxels revive at **1.2% of current dead / s**

When **exposed**:

- Spawns **4** repair drones

On **overload** (2.5s):

- Instantly revives **5–10%** of dead voxels (inner first)

Ignore the cube and it grows back.

## Swarm (15 / 30 / 45…)

Always:

- Factory spawn every **5.5s** (every **3.0s** while exposed)

When **exposed**:

- Burst of **6** mixed attack/repair drones

On **overload** (5s):

- Enraged wave: **8** mixed drones
- Enrage: speed × **1.55**, fire × **1.70** for 5s

## Standard (non-boss sectors)

On **overload**: telegraphed **spike burst**

- Omni spray + **1** spike locked on the ship
- Base omni count **25** (was 10; +150%), stage/ATK scaled, cap 90
- Optional extra spray waves at high ATK (2 at 1.35, 3 at 1.8)
- Close shockwave (~11 radius, 14 dmg) — default orbit 18 is outside it
- Late ATK: some non-aimed spikes **air-burst**
- Spikes can be shot down (intercept)

## Stage-gated nucleus kit (all sectors at that stage+)

Idle casts keep using every unlocked toy. Overload extra-fires blob (if unlocked) plus the **highest** later toy.

| From stage | Toy | What it does |
| --- | --- | --- |
| **10** | Ion charge (blob) | Electric energy orbs. **+50%** impact dmg (12). Lightning arc in **1.5× radius** does minor DPS (~28% of impact / s). Overload fans **4**. Shoot them down. |
| **20** | Kamikaze drones | 2 seekers (+1 per 15 stages after 20). Contact damage. |
| **30** | Depth charges | Floating mines (max 3 live). Proximity / fuse blast + 8 shrapnel. |
| **40** | Gravity well | 2.1s orbit tug. Core-proximity DPS if you get pulled in. |
| **50** | Mirror shards | 2 orbiting plates (3 hits each, 12s). Soak bolts. |
| **60** | Phase rift | Telegraph then a cutting line (0.7s, 18 DPS). Step off. |
| **70** | Static bloom | 1.15s visual flash. **No damage.** |
| **80** | Lattice javelin | Telegraph then a fast spear (dmg 22, speed 28). Shoot or dodge. |

Kit damage/cooldown also scale with nucleus ATK power vs stage.

## Cube defenses (not nucleus attributes)

These stack on top of the boss kit:

| Sectors | Core shield | Face shields | Extra turrets | Enemy drones | Layered / elite |
| --- | --- | --- | --- | --- | --- |
| 1–3 | — | — | 0 | 0 | — |
| 4–6 | yes | — | 1 | 0 | — |
| 7–10 | yes | — | 2 | 0 | — |
| 11–14 | yes | yes | 2 | 1 | — |
| 15–18 | yes | yes | 3 | 3 | — |
| 19–25 | yes | yes | 3 | 5 | layered |
| 26+ | yes | yes | 4 | 7 | layered + elite |

Lattice-mounted turrets also spawn from turret blocks. Regenerating **block type** (level `regenRate`) is separate from the Regeneration **attribute**.
