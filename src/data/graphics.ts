/**
 * User-selectable graphics tiers. Default: medium.
 * Applied via Game.applyGraphics() to renderer, bloom, particles, ambient.
 */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export const GRAPHICS_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];

export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = 'medium';

export interface GraphicsPreset {
  id: GraphicsQuality;
  label: string;
  description: string;
  /** Cap on devicePixelRatio */
  dprCap: number;
  antialias: boolean;
  exposure: number;
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** Max concurrent particles */
  particleBudget: number;
  /** Ambient density tier: 0 = sparse, 1 = normal, 2 = rich */
  ambientTier: 0 | 1 | 2;
  /** Impact ring pool size preference (applied at construction / visibility) */
  impactRingCount: number;
}

export const GRAPHICS_PRESETS: Record<GraphicsQuality, GraphicsPreset> = {
  low: {
    id: 'low',
    label: 'LOW',
    description: 'Best performance · reduced bloom & particles',
    dprCap: 1,
    antialias: false,
    exposure: 0.94,
    bloomEnabled: false,
    bloomStrength: 0.1,
    bloomThreshold: 0.88,
    bloomRadius: 0.22,
    particleBudget: 220,
    ambientTier: 0,
    impactRingCount: 12,
  },
  medium: {
    id: 'medium',
    label: 'MEDIUM',
    description: 'Balanced look & performance (recommended)',
    dprCap: 1.25,
    antialias: false,
    exposure: 0.96,
    bloomEnabled: true,
    bloomStrength: 0.32,
    bloomThreshold: 0.62,
    bloomRadius: 0.4,
    particleBudget: 520,
    ambientTier: 1,
    impactRingCount: 20,
  },
  high: {
    id: 'high',
    label: 'HIGH',
    description: 'Maximum bloom, particles & resolution',
    dprCap: 1.75,
    antialias: true,
    exposure: 0.98,
    bloomEnabled: true,
    bloomStrength: 0.46,
    bloomThreshold: 0.52,
    bloomRadius: 0.5,
    particleBudget: 900,
    ambientTier: 2,
    impactRingCount: 28,
  },
};

export function normalizeGraphicsQuality(raw: unknown): GraphicsQuality {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return DEFAULT_GRAPHICS_QUALITY;
}

export function getGraphicsPreset(q: GraphicsQuality): GraphicsPreset {
  return GRAPHICS_PRESETS[normalizeGraphicsQuality(q)];
}

/** Peek saved graphics tier before full SaveSystem load (for renderer boot). */
export function peekSavedGraphicsQuality(saveKey: string): GraphicsQuality {
  try {
    const raw = localStorage.getItem(saveKey);
    if (!raw) return DEFAULT_GRAPHICS_QUALITY;
    const parsed = JSON.parse(raw) as { graphicsQuality?: unknown };
    return normalizeGraphicsQuality(parsed.graphicsQuality);
  } catch {
    return DEFAULT_GRAPHICS_QUALITY;
  }
}
