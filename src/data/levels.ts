import type { ArenaId } from './arenas';
import {
  LEVEL_DEFAULT_CORE_ENERGY_BASE,
  LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_BONUS,
  LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_FROM_ID,
  LEVEL_DEFAULT_CORE_ENERGY_PER_ID,
  LEVEL_DEFAULT_CORE_HP_AVG_WEIGHT,
  LEVEL_DEFAULT_CORE_HP_FLAT,
  LEVEL_DEFAULT_CORE_HP_PER_ID,
  LEVEL_DEFAULT_FRAG_BASE,
  LEVEL_DEFAULT_FRAG_GLOBAL_SCALE,
  LEVEL_DEFAULT_FRAG_PER_ID,
  LEVEL_DEFAULT_FRAG_SQRT_WEIGHT,
} from './constraints';

export interface LevelDefinition {
  id: number;
  name: string;
  /** Optional explicit backdrop. Unset = pick from unlocked arenas (Ascension). */
  arena?: ArenaId;
  size: number;
  density: number;
  avgHP: number;
  specialPercent: number;
  regenRate: number;
  defensiveFactor: number;
  reinforced: number;
  regenerating: number;
  explosive: number;
  dataNode: number;
  /** Fraction of blocks that are siege-class (late-game armor wall). */
  siege: number;
  hasCore: boolean;
  coreHP: number;
  rewardFragments: number;
  rewardCoreEnergy: number;
}

function scoreOf(
  l: Pick<
    LevelDefinition,
    'size' | 'density' | 'avgHP' | 'specialPercent' | 'regenRate' | 'defensiveFactor'
  >
): number {
  const totalVoxels = l.size ** 3 * l.density;
  return totalVoxels * l.avgHP * (1 + l.specialPercent) * (1 + l.regenRate) * l.defensiveFactor;
}

/**
 * P2 retune:
 * - Levels 1–3 easy tutorial (low HP, few specials)
 * - L4+ raises avgHP aggressively; size grows slower
 * - rewardFragments cut ~35% vs prior curve
 * - Reinforced / heavy / siege share climbs with level
 */
function makeLevel(
  id: number,
  name: string,
  size: number,
  density: number,
  avgHP: number,
  specialPercent: number,
  regenRate: number,
  defensiveFactor: number,
  extras: Partial<LevelDefinition> = {}
): LevelDefinition {
  const base = {
    size,
    density,
    avgHP,
    specialPercent,
    regenRate,
    defensiveFactor,
  };
  const s = scoreOf(base);
  // Steeper soft-cap: clear rewards grow slowly so prestige sinks stay relevant
  const defaultFrags = Math.round(
    (LEVEL_DEFAULT_FRAG_BASE + Math.sqrt(s) * LEVEL_DEFAULT_FRAG_SQRT_WEIGHT + id * LEVEL_DEFAULT_FRAG_PER_ID) *
      LEVEL_DEFAULT_FRAG_GLOBAL_SCALE
  );
  return {
    id,
    name,
    ...base,
    reinforced: extras.reinforced ?? Math.min(0.42, specialPercent * 0.45 + id * 0.004),
    regenerating: extras.regenerating ?? Math.min(0.22, regenRate > 0 ? specialPercent * 0.28 : 0),
    explosive: extras.explosive ?? Math.min(0.12, specialPercent * 0.14),
    dataNode: extras.dataNode ?? Math.min(0.08, specialPercent * 0.1),
    siege: extras.siege ?? Math.min(0.28, Math.max(0, (id - 10) * 0.012 + specialPercent * 0.08)),
    // Every sector has a shared nucleus (clear condition + combat pillar)
    hasCore: extras.hasCore ?? true,
    coreHP:
      extras.coreHP ??
      Math.round(avgHP * LEVEL_DEFAULT_CORE_HP_AVG_WEIGHT + id * LEVEL_DEFAULT_CORE_HP_PER_ID + LEVEL_DEFAULT_CORE_HP_FLAT),
    rewardFragments: extras.rewardFragments ?? defaultFrags,
    rewardCoreEnergy:
      extras.rewardCoreEnergy ??
      Math.round(
        LEVEL_DEFAULT_CORE_ENERGY_BASE +
          id * LEVEL_DEFAULT_CORE_ENERGY_PER_ID +
          (id >= LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_FROM_ID ? LEVEL_DEFAULT_CORE_ENERGY_MIDGAME_BONUS : 0)
      ),
  };
}

/** First 30 concrete levels — HP is the primary difficulty lever. */
export const LEVELS: LevelDefinition[] = [
  // —— Tutorial band: 0–1 upgrades ——
  // Ramp: enough combat + clear frags for first drone (100 FRAG) over L1–L2;
  // modular weapons stay locked until highestLevel >= 3 (after L2 clear).
  makeLevel(1, 'AWAKENING', 6, 1.0, 12, 0, 0, 1.0, {
    hasCore: true,
    coreHP: 180,
    reinforced: 0,
    siege: 0,
    rewardFragments: 55,
    rewardCoreEnergy: 10,
  }),
  makeLevel(2, 'PULSE GRID', 7, 1.0, 16, 0.04, 0, 1.0, {
    hasCore: true,
    coreHP: 220,
    reinforced: 0.05,
    siege: 0,
    rewardFragments: 70,
    rewardCoreEnergy: 12,
  }),
  makeLevel(3, 'CYAN ARRAY', 8, 0.95, 22, 0.06, 0, 1.05, {
    hasCore: true,
    reinforced: 0.08,
    siege: 0,
    rewardFragments: 85,
    rewardCoreEnergy: 14,
  }),

  // —— Upgrades required ——
  makeLevel(4, 'FRACTURE', 8, 1.0, 38, 0.1, 0, 1.08, {
    hasCore: true,
    reinforced: 0.14,
    explosive: 0.05,
    siege: 0,
  }),
  makeLevel(5, 'CHRONOBEACON · NUCLEUS I', 8, 1.0, 52, 0.14, 0, 1.12, {
    hasCore: true,
    coreHP: 280,
    reinforced: 0.16,
    siege: 0,
  }),
  makeLevel(6, 'HARDEN', 9, 0.92, 68, 0.18, 0.02, 1.15, {
    reinforced: 0.22,
    siege: 0,
    hasCore: true,
  }),
  makeLevel(7, 'REGEN FIELD', 9, 0.94, 85, 0.2, 0.08, 1.18, {
    regenerating: 0.12,
    reinforced: 0.2,
    siege: 0.02,
    hasCore: true,
  }),
  makeLevel(8, 'DATA VEIN', 9, 0.9, 105, 0.22, 0.05, 1.2, {
    dataNode: 0.08,
    reinforced: 0.22,
    siege: 0.03,
    hasCore: true,
  }),

  // —— Hardpoint weapon helps a lot ——
  makeLevel(9, 'BLAST SHELL', 10, 0.92, 125, 0.25, 0.05, 1.22, {
    explosive: 0.1,
    reinforced: 0.24,
    siege: 0.04,
    hasCore: true,
  }),
  makeLevel(10, 'CHRONOBEACON · MONOLITH', 10, 0.9, 150, 0.28, 0.06, 1.25, {
    hasCore: true,
    coreHP: 520,
    reinforced: 0.26,
    siege: 0.06,
  }),
  makeLevel(11, 'LATTICE', 11, 0.88, 175, 0.3, 0.08, 1.28, {
    reinforced: 0.28,
    siege: 0.08,
    hasCore: true,
  }),
  makeLevel(12, 'ECHO CORE', 11, 0.86, 205, 0.32, 0.1, 1.3, {
    regenerating: 0.14,
    reinforced: 0.28,
    siege: 0.1,
    hasCore: true,
  }),
  makeLevel(13, 'MAGENTA WALL', 12, 0.85, 240, 0.34, 0.08, 1.32, {
    hasCore: true,
    coreHP: 700,
    reinforced: 0.3,
    siege: 0.12,
  }),
  makeLevel(14, 'CASCADE', 12, 0.84, 275, 0.36, 0.1, 1.35, {
    explosive: 0.1,
    dataNode: 0.06,
    reinforced: 0.3,
    siege: 0.12,
    hasCore: true,
  }),
  makeLevel(15, 'CHRONOBEACON · APEX PRIME', 12, 0.82, 320, 0.4, 0.12, 1.38, {
    hasCore: true,
    coreHP: 900,
    reinforced: 0.32,
    siege: 0.14,
  }),

  // —— Dual hardpoints + drones ——
  makeLevel(16, 'DEEP GRID', 13, 0.82, 360, 0.42, 0.12, 1.4, {
    reinforced: 0.32,
    siege: 0.15,
    hasCore: true,
  }),
  makeLevel(17, 'OVERCLOCK', 13, 0.8, 410, 0.44, 0.14, 1.42, {
    reinforced: 0.34,
    siege: 0.16,
    hasCore: true,
  }),
  makeLevel(18, 'VOID FRAME', 14, 0.8, 460, 0.46, 0.14, 1.45, {
    reinforced: 0.34,
    siege: 0.17,
    hasCore: true,
  }),
  makeLevel(19, 'ION CAGE', 14, 0.78, 520, 0.48, 0.15, 1.48, {
    reinforced: 0.35,
    siege: 0.18,
    hasCore: true,
  }),
  makeLevel(20, 'CHRONOBEACON · TITAN CUBE', 14, 0.78, 580, 0.5, 0.16, 1.52, {
    hasCore: true,
    coreHP: 1400,
    reinforced: 0.36,
    siege: 0.2,
  }),
  makeLevel(21, 'QUANTUM SHELL', 15, 0.76, 640, 0.5, 0.16, 1.54, {
    reinforced: 0.36,
    siege: 0.2,
    hasCore: true,
  }),
  makeLevel(22, 'NEXUS', 15, 0.75, 710, 0.52, 0.18, 1.56, {
    reinforced: 0.38,
    siege: 0.22,
    hasCore: true,
  }),
  makeLevel(23, 'PRISM WAR', 15, 0.74, 780, 0.54, 0.18, 1.58, {
    reinforced: 0.38,
    siege: 0.22,
    hasCore: true,
  }),
  makeLevel(24, 'HELLIX', 16, 0.74, 860, 0.55, 0.2, 1.6, {
    reinforced: 0.38,
    siege: 0.24,
    hasCore: true,
  }),
  makeLevel(25, 'CHRONOBEACON · SINGULARITY', 16, 0.72, 950, 0.56, 0.2, 1.65, {
    hasCore: true,
    coreHP: 2000,
    reinforced: 0.4,
    siege: 0.24,
  }),

  // —— Full loadout + vitals ——
  makeLevel(26, 'ABYSS ARRAY', 16, 0.72, 1050, 0.58, 0.22, 1.68, {
    reinforced: 0.4,
    siege: 0.26,
    hasCore: true,
  }),
  makeLevel(27, 'OMEGA LATTICE', 17, 0.7, 1160, 0.58, 0.22, 1.7, {
    reinforced: 0.42,
    siege: 0.26,
    hasCore: true,
  }),
  makeLevel(28, 'HYPERCORE', 17, 0.7, 1280, 0.6, 0.24, 1.72, {
    reinforced: 0.42,
    siege: 0.28,
    hasCore: true,
  }),
  makeLevel(29, 'FINAL GRID', 18, 0.68, 1420, 0.62, 0.24, 1.75, {
    reinforced: 0.42,
    siege: 0.28,
    hasCore: true,
  }),
  makeLevel(30, 'CHRONOBEACON · CUBE ZERO', 18, 0.68, 1600, 0.65, 0.26, 1.8, {
    hasCore: true,
    coreHP: 3200,
    reinforced: 0.44,
    siege: 0.3,
  }),
];

export function getLevel(id: number): LevelDefinition {
  const found = LEVELS.find((l) => l.id === id);
  if (found) return found;
  // Procedural beyond 30 — HP primary, size soft-capped
  const size = Math.min(22, 10 + Math.floor((id - 30) * 0.25) + 8);
  const density = Math.max(0.55, 0.9 - id * 0.008);
  const avgHP = 160 + id * 48;
  return makeLevel(
    id,
    id > 0 && id % 5 === 0 ? `CHRONOBEACON · SECTOR ${id}` : `SECTOR ${id}`,
    size,
    density,
    avgHP,
    Math.min(0.7, 0.2 + id * 0.012),
    Math.min(0.3, id * 0.007),
    1 + id * 0.018,
    {
      hasCore: true,
      coreHP: 200 + id * 80,
      siege: Math.min(0.35, 0.12 + id * 0.006),
      reinforced: Math.min(0.45, 0.25 + id * 0.005),
    }
  );
}

export function levelDifficultyScore(level: LevelDefinition): number {
  const totalVoxels = level.size ** 3 * level.density;
  const armorWeight = 1 + level.reinforced * 0.4 + level.siege * 1.2;
  return (
    totalVoxels *
    level.avgHP *
    (1 + level.specialPercent) *
    (1 + level.regenRate) *
    level.defensiveFactor *
    armorWeight
  );
}
