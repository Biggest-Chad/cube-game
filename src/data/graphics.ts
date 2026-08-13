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
    description: 'Best performance · cooler phone · reduced bloom & particles',
    dprCap: 1,
    antialias: false,
    exposure: 0.94,
    bloomEnabled: false,
    bloomStrength: 0.1,
    bloomThreshold: 0.88,
    bloomRadius: 0.22,
    particleBudget: 160,
    ambientTier: 0,
    impactRingCount: 8,
  },
  medium: {
    id: 'medium',
    label: 'MEDIUM',
    description: 'Balanced look & performance (recommended)',
    dprCap: 1.1,
    antialias: false,
    exposure: 0.96,
    bloomEnabled: true,
    bloomStrength: 0.22,
    bloomThreshold: 0.72,
    bloomRadius: 0.3,
    particleBudget: 260,
    ambientTier: 1,
    impactRingCount: 10,
  },
  high: {
    id: 'high',
    label: 'HIGH',
    description: 'Maximum bloom, particles & resolution',
    dprCap: 1.5,
    antialias: true,
    exposure: 0.98,
    bloomEnabled: true,
    bloomStrength: 0.4,
    bloomThreshold: 0.55,
    bloomRadius: 0.45,
    particleBudget: 620,
    ambientTier: 2,
    impactRingCount: 22,
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
