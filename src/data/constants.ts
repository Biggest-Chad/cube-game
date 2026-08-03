export const SAVE_VERSION = 2;
export const SAVE_KEY = 'cube-game-save-v2';

export const COLORS = {
  black: 0x000000,
  cyan: 0x00f0ff,
  magenta: 0xff00aa,
  white: 0xe8ffff,
  green: 0x00ffaa,
  gold: 0xffd060,
  core: 0xff4488,
  reinforced: 0x4488ff,
  regen: 0x44ff88,
  explosive: 0xff6622,
  dataNode: 0xaa66ff,
} as const;

export const BLOCK_SIZE = 1;
export const CHUNK_SIZE = 8;

/**
 * Heavy, deliberate orbital flight — early-game baseline is intentionally slow.
 * Speed is upgrade-gated (orbitSpeedMul / topSpeedMul). Values are ~60–70% of
 * the prior post-fix rates to kill twitchy rubber-band feel.
 *
 * Smoothing MUST use 1 - exp(-k*dt) only; never Math.min(1, k*dt) for motion.
 */
export const ORBIT = {
  defaultRadius: 18,
  minRadius: 10,
  maxRadius: 80,
  minPitch: -Math.PI / 2 + 0.04,
  maxPitch: Math.PI / 2 - 0.04,
  /** Peak yaw / pitch rate (rad/s) at full stick — early game slow */
  yawSpeed: 0.55,
  pitchSpeed: 0.48,
  /** How quickly angular velocity approaches stick target */
  angularAccel: 1.8,
  /** Coast-down when stick released */
  angularFriction: 4.2,
  /** Soften raw stick before velocity mapping */
  inputSmooth: 7,
  zoomSpeed: 0.05,
  /** Camera follow half-life rate; reduced further at high |ω| */
  cameraLag: 3.0,
  cameraBack: 3.8,
  cameraHeight: 2.25,
  cameraSide: 2.55,
  /**
   * Ship mesh visual lag only — combat origin uses OrbitalCamera.getShipPosition
   * / getOrbitPoint (orbit truth). Visual lag is reduced when |ω| is high.
   */
  shipPosLag: 5.0,
  shipRotLag: 4.0,
  introDuration: 3.2,
  introRadiusMul: 1.55,
} as const;

export const COMBAT = {
  baseFireRate: 5.5,
  baseDamage: 12,
  beamRange: 120,
  beamDuration: 0.12,
  projectileSpeed: 95,
  multiShotBase: 1,
  splashRadius: 0,
  autoFire: true,
} as const;

export const PERF = {
  targetFps: 50,
  lowFpsThreshold: 28,
  lowFpsSeconds: 2,
  maxParticles: 1200,
  lowMaxParticles: 400,
  maxProjectiles: 48,
  instanceRebuildBudgetMs: 4,
} as const;

export const IDLE = {
  maxOfflineSeconds: 8 * 60 * 60,
  baseClearRate: 0.15,
  softHeatRegen: 0.35,
} as const;

export const CURRENCY = {
  fragmentPerBlock: 1,
  coreClearBase: 25,
} as const;
