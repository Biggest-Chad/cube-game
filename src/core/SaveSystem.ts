import { SAVE_KEY, SAVE_VERSION } from '../data/constants';
import { HARDPOINTS_START, VITALS_BASE } from '../data/balance';
import {
  BASELINE_IDENTITY,
  baselineFromTier,
  type AscensionBaseline,
} from '../data/evolve';
import {
  DEFAULT_GRAPHICS_QUALITY,
  normalizeGraphicsQuality,
  type GraphicsQuality,
} from '../data/graphics';

/** Weapon instance mounted in a hardpoint slot (null = empty). */
export interface SaveLoadoutSlot {
  defId: string;
  ranks: Record<string, number>;
}

export interface SaveData {
  version: number;
  dataFragments: number;
  coreEnergy: number;
  prestigeTokens: number;
  /** Shop sequential progress (upgrade node ids). */
  ownedUpgrades: string[];
  highestLevel: number;
  currentLevel: number;
  levelProgress: number;
  totalBlocksDestroyed: number;
  lastSaveTime: number;
  muted: boolean;
  masterVolume: number;
  /** User graphics tier: low | medium | high (default medium). */
  graphicsQuality: GraphicsQuality;

  // --- v2: ship vitals ---
  hullHp: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  armorRating: number;

  // --- v2: hardpoints / loadout ---
  /** Number of hardpoints unlocked (1..3). */
  hardpointsUnlocked: number;
  /** Per-slot equipped weapon instance or null. Length up to 3. */
  loadout: Array<SaveLoadoutSlot | null>;
  /** Weapon definition ids owned (unlock gallery). */
  ownedWeapons: string[];

  // --- v2: drones ---
  /** Role id → count assigned (e.g. miner, breaker, fighter, shield). */
  droneRoles: Record<string, number>;

  // --- v2: ads ---
  /** placementId → watches completed today */
  adsWatchedToday: Record<string, number>;
  /** YYYY-MM-DD local day key for adsWatchedToday rollover */
  adsDayKey: string;

  // --- tutorials ---
  tutorialStage1Done: boolean;
  tutorialLoadoutDone: boolean;

  // --- Evolve / Ascension + Research Lattice ---
  /** Times evolved (0 = no prestige). */
  ascensionTier: number;
  lifetimeEvolves: number;
  /** Permanent baseline mults from Ascension (recomputed from tier if missing). */
  baseline: AscensionBaseline;
  /** Research Lattice node ids owned (Core Energy meta tree). */
  researchOwned: string[];
  /** IAP / cosmetic: cyan trail unlocked outside research ids. */
  cosmeticTrail: boolean;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    dataFragments: 0,
    coreEnergy: 0,
    prestigeTokens: 0,
    ownedUpgrades: [],
    highestLevel: 1,
    currentLevel: 1,
    levelProgress: 0,
    totalBlocksDestroyed: 0,
    lastSaveTime: Date.now(),
    muted: false,
    masterVolume: 0.7,
    graphicsQuality: DEFAULT_GRAPHICS_QUALITY,

    hullHp: VITALS_BASE.hullHp,
    maxHull: VITALS_BASE.maxHull,
    shield: VITALS_BASE.shield,
    maxShield: VITALS_BASE.maxShield,
    armorRating: VITALS_BASE.armorRating,

    hardpointsUnlocked: HARDPOINTS_START,
    loadout: [null, null, null],
    ownedWeapons: [],

    droneRoles: {},

    adsWatchedToday: {},
    adsDayKey: todayKey(),

    tutorialStage1Done: false,
    tutorialLoadoutDone: false,

    ascensionTier: 0,
    lifetimeEvolves: 0,
    baseline: { ...BASELINE_IDENTITY },
    researchOwned: [],
    cosmeticTrail: false,
  };
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function sanitizeCurrency(raw: unknown, fallback = 0): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.floor(raw));
}

function normalizeBaseline(raw: unknown): AscensionBaseline {
  const b = { ...BASELINE_IDENTITY };
  if (!raw || typeof raw !== 'object') return b;
  const o = raw as Partial<AscensionBaseline>;
  for (const k of Object.keys(b) as (keyof AscensionBaseline)[]) {
    if (typeof o[k] === 'number' && (o[k] as number) > 0 && Number.isFinite(o[k] as number)) {
      b[k] = o[k] as number;
    }
  }
  return b;
}

function normalizeLoadout(raw: unknown): Array<SaveLoadoutSlot | null> {
  const out: Array<SaveLoadoutSlot | null> = [null, null, null];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < 3; i++) {
    const slot = raw[i];
    if (
      slot &&
      typeof slot === 'object' &&
      typeof (slot as SaveLoadoutSlot).defId === 'string'
    ) {
      const ranks =
        (slot as SaveLoadoutSlot).ranks &&
        typeof (slot as SaveLoadoutSlot).ranks === 'object'
          ? { ...(slot as SaveLoadoutSlot).ranks }
          : {};
      out[i] = { defId: (slot as SaveLoadoutSlot).defId, ranks };
    } else {
      out[i] = null;
    }
  }
  return out;
}

export class SaveSystem {
  data: SaveData = defaultSave();

  load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        this.data = defaultSave();
        return this.data;
      }
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (!parsed || parsed.version !== SAVE_VERSION) {
        // Policy: discard incompatible saves (no migration layers).
        this.data = defaultSave();
        return this.data;
      }
      const base = defaultSave();
      this.data = {
        ...base,
        ...parsed,
        version: SAVE_VERSION,
        ownedUpgrades: Array.isArray(parsed.ownedUpgrades)
          ? parsed.ownedUpgrades
          : base.ownedUpgrades,
        loadout: normalizeLoadout(parsed.loadout),
        ownedWeapons: Array.isArray(parsed.ownedWeapons)
          ? parsed.ownedWeapons
          : base.ownedWeapons,
        droneRoles:
          parsed.droneRoles && typeof parsed.droneRoles === 'object'
            ? { ...parsed.droneRoles }
            : base.droneRoles,
        adsWatchedToday:
          parsed.adsWatchedToday && typeof parsed.adsWatchedToday === 'object'
            ? { ...parsed.adsWatchedToday }
            : base.adsWatchedToday,
        adsDayKey:
          typeof parsed.adsDayKey === 'string' ? parsed.adsDayKey : base.adsDayKey,
        graphicsQuality: normalizeGraphicsQuality(parsed.graphicsQuality),
        ascensionTier:
          typeof parsed.ascensionTier === 'number' && parsed.ascensionTier >= 0
            ? Math.floor(parsed.ascensionTier)
            : base.ascensionTier,
        lifetimeEvolves:
          typeof parsed.lifetimeEvolves === 'number' && parsed.lifetimeEvolves >= 0
            ? Math.floor(parsed.lifetimeEvolves)
            : base.lifetimeEvolves,
        baseline: normalizeBaseline(parsed.baseline),
        researchOwned: Array.isArray(parsed.researchOwned)
          ? parsed.researchOwned.filter((id): id is string => typeof id === 'string')
          : base.researchOwned,
        cosmeticTrail: !!parsed.cosmeticTrail,
        dataFragments: sanitizeCurrency(parsed.dataFragments, base.dataFragments),
        coreEnergy: sanitizeCurrency(parsed.coreEnergy, base.coreEnergy),
        prestigeTokens: sanitizeCurrency(parsed.prestigeTokens, base.prestigeTokens),
      };
      // Always fold baseline from tier (ignore tampered mult blobs)
      this.data.baseline = baselineFromTier(this.data.ascensionTier);
      this.rolloverAdsIfNeeded();
      return this.data;
    } catch {
      this.data = defaultSave();
      return this.data;
    }
  }

  /** Reset daily ad counters when the local day changes. */
  rolloverAdsIfNeeded(): void {
    const key = todayKey();
    if (this.data.adsDayKey !== key) {
      this.data.adsDayKey = key;
      this.data.adsWatchedToday = {};
    }
  }

  save(): void {
    this.rolloverAdsIfNeeded();
    this.data.lastSaveTime = Date.now();
    this.data.version = SAVE_VERSION;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // quota / private mode
    }
  }

  reset(): void {
    this.data = defaultSave();
    this.save();
  }
}
