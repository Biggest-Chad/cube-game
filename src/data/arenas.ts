/**
 * Stage backdrops. New arenas register here and unlock by Ascension (and
 * optionally campaign progress). Unimplemented IDs are ignored by the picker
 * so we can name Bone / Foundry now without shipping them.
 */
export type ArenaId = 'grid-void' | 'bone-arena' | 'foundry-ring';

export interface ArenaDef {
  id: ArenaId;
  title: string;
  /** Minimum Evolve / Ascension tier. */
  minAscension: number;
  minHighestLevel?: number;
  weight: number;
  /** False until the GLB / loader exists. */
  implemented: boolean;
}

export const ARENAS: ArenaDef[] = [
  {
    id: 'grid-void',
    title: 'GRID VOID',
    minAscension: 0,
    weight: 1,
    implemented: true,
  },
  {
    id: 'bone-arena',
    title: 'BONE ARENA',
    minAscension: 2,
    weight: 1,
    implemented: false,
  },
  {
    id: 'foundry-ring',
    title: 'FOUNDRY RING',
    minAscension: 4,
    weight: 1,
    implemented: false,
  },
];

export const DEFAULT_ARENA: ArenaId = 'grid-void';

export interface ArenaResolveContext {
  levelId: number;
  ascensionTier: number;
  highestLevel: number;
  /** LevelDefinition.arena or debug override. */
  preferred?: ArenaId | null;
}

export function getArenaDef(id: ArenaId): ArenaDef | undefined {
  return ARENAS.find((a) => a.id === id);
}

export function unlockedArenas(ctx: ArenaResolveContext): ArenaDef[] {
  return ARENAS.filter(
    (a) =>
      a.implemented &&
      ctx.ascensionTier >= a.minAscension &&
      (a.minHighestLevel == null || ctx.highestLevel >= a.minHighestLevel)
  );
}

/**
 * Stable per-sector pick among unlocked arenas.
 * Preferred wins if that arena is unlocked + implemented.
 */
export function resolveArenaId(ctx: ArenaResolveContext): ArenaId {
  const open = unlockedArenas(ctx);
  if (open.length === 0) return DEFAULT_ARENA;

  if (ctx.preferred) {
    const pref = open.find((a) => a.id === ctx.preferred);
    if (pref) return pref.id;
  }

  if (open.length === 1) return open[0].id;

  const total = open.reduce((s, a) => s + a.weight, 0);
  const seed = (ctx.levelId * 17 + ctx.ascensionTier * 31 + 7) % 1000;
  let acc = 0;
  const pick = (seed / 1000) * total;
  for (const a of open) {
    acc += a.weight;
    if (pick < acc) return a.id;
  }
  return open[0].id;
}
