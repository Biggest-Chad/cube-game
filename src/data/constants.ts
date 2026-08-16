import {
  BLOCK_WORLD_SIZE,
  CHUNK_VOXEL_COUNT,
  CURRENCY_CORE_CLEAR_BASE,
  CURRENCY_FRAGMENTS_PER_BLOCK,
  IDLE_BASE_CLEAR_RATE,
  IDLE_MAX_OFFLINE_SECONDS,
  IDLE_SOFT_HEAT_REGEN,
  MAIN_GUN_AUTO_FIRE,
  MAIN_GUN_BASE_DAMAGE,
  MAIN_GUN_BASE_FIRE_RATE,
  MAIN_GUN_BEAM_DURATION,
  MAIN_GUN_BEAM_RANGE,
  MAIN_GUN_MULTI_SHOT_BASE,
  MAIN_GUN_PROJECTILE_SPEED,
  MAIN_GUN_SPLASH_RADIUS_BASE,
  ORBIT_ANGULAR_ACCEL,
  ORBIT_ANGULAR_FRICTION,
  ORBIT_CAMERA_BACK,
  ORBIT_CAMERA_HEIGHT,
  ORBIT_CAMERA_LAG,
  ORBIT_CAMERA_SIDE,
  ORBIT_CAMERA_SWAY,
  ORBIT_CAMERA_SWAY_LAG,
  ORBIT_DEFAULT_RADIUS,
  ORBIT_INPUT_SMOOTH,
  ORBIT_INTRO_DURATION_SECONDS,
  ORBIT_INTRO_RADIUS_MULTIPLIER,
  ORBIT_MAXIMUM_PITCH,
  ORBIT_MAXIMUM_RADIUS,
  ORBIT_MINIMUM_PITCH,
  ORBIT_MINIMUM_RADIUS,
  ORBIT_PITCH_SPEED,
  ORBIT_SHIP_POSITION_LAG,
  ORBIT_SHIP_ROTATION_LAG,
  ORBIT_YAW_SPEED,
  ORBIT_ZOOM_SPEED,
  PERFORMANCE_INSTANCE_REBUILD_BUDGET_MS,
  PERFORMANCE_LOW_FPS_SECONDS_BEFORE_DEMOTE,
  PERFORMANCE_LOW_FPS_THRESHOLD,
  PERFORMANCE_LOW_MAX_PARTICLES,
  PERFORMANCE_MAX_PARTICLES,
  PERFORMANCE_MAX_PROJECTILES,
  PERFORMANCE_TARGET_FPS,
  SAVE_LOCAL_STORAGE_KEY,
  SAVE_SCHEMA_VERSION,
} from './constraints';

export const SAVE_VERSION = SAVE_SCHEMA_VERSION;
export const SAVE_KEY = SAVE_LOCAL_STORAGE_KEY;

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

export const BLOCK_SIZE = BLOCK_WORLD_SIZE;
export const CHUNK_SIZE = CHUNK_VOXEL_COUNT;

/**
 * Heavy, deliberate orbital flight — early-game baseline is intentionally slow.
 * Speed is upgrade-gated (orbitSpeedMul / topSpeedMul). Values are ~60–70% of
 * the prior post-fix rates to kill twitchy rubber-band feel.
 *
 * Smoothing MUST use 1 - exp(-k*dt) only; never Math.min(1, k*dt) for motion.
 */
export const ORBIT = {
  defaultRadius: ORBIT_DEFAULT_RADIUS,
  minRadius: ORBIT_MINIMUM_RADIUS,
  maxRadius: ORBIT_MAXIMUM_RADIUS,
  minPitch: ORBIT_MINIMUM_PITCH,
  maxPitch: ORBIT_MAXIMUM_PITCH,
  /** Peak yaw / pitch rate (rad/s) at full stick — early game slow */
  yawSpeed: ORBIT_YAW_SPEED,
  pitchSpeed: ORBIT_PITCH_SPEED,
  /** How quickly angular velocity approaches stick target */
  angularAccel: ORBIT_ANGULAR_ACCEL,
  /** Coast-down when stick released */
  angularFriction: ORBIT_ANGULAR_FRICTION,
  /** Soften raw stick before velocity mapping */
  inputSmooth: ORBIT_INPUT_SMOOTH,
  zoomSpeed: ORBIT_ZOOM_SPEED,
  /** Camera follow half-life rate; reduced further at high |ω| */
  cameraLag: ORBIT_CAMERA_LAG,
  /** Chase cam: centered behind ship (side ≈ 0 for aim accuracy) */
  cameraBack: ORBIT_CAMERA_BACK,
  cameraHeight: ORBIT_CAMERA_HEIGHT,
  cameraSide: ORBIT_CAMERA_SIDE,
  /** Motion sway amplitude (world units) when orbiting */
  cameraSway: ORBIT_CAMERA_SWAY,
  cameraSwayLag: ORBIT_CAMERA_SWAY_LAG,
  /**
   * Ship mesh visual lag only — combat origin uses OrbitalCamera.getShipPosition
   * / getOrbitPoint (orbit truth). Visual lag is reduced when |ω| is high.
   */
  shipPosLag: ORBIT_SHIP_POSITION_LAG,
  shipRotLag: ORBIT_SHIP_ROTATION_LAG,
  /** Level-intro orbit sweep length (seconds) — lands on third-person combat seat. */
  introDuration: ORBIT_INTRO_DURATION_SECONDS,
  /** Start radius multiplier for the wide establishing pull-in. */
  introRadiusMul: ORBIT_INTRO_RADIUS_MULTIPLIER,
} as const;

export const COMBAT = {
  baseFireRate: MAIN_GUN_BASE_FIRE_RATE,
  baseDamage: MAIN_GUN_BASE_DAMAGE,
  beamRange: MAIN_GUN_BEAM_RANGE,
  beamDuration: MAIN_GUN_BEAM_DURATION,
  projectileSpeed: MAIN_GUN_PROJECTILE_SPEED,
  multiShotBase: MAIN_GUN_MULTI_SHOT_BASE,
  splashRadius: MAIN_GUN_SPLASH_RADIUS_BASE,
  autoFire: MAIN_GUN_AUTO_FIRE,
} as const;

export const PERF = {
  targetFps: PERFORMANCE_TARGET_FPS,
  lowFpsThreshold: PERFORMANCE_LOW_FPS_THRESHOLD,
  /** Faster demotion on sustained jank (thermal protection) */
  lowFpsSeconds: PERFORMANCE_LOW_FPS_SECONDS_BEFORE_DEMOTE,
  maxParticles: PERFORMANCE_MAX_PARTICLES,
  lowMaxParticles: PERFORMANCE_LOW_MAX_PARTICLES,
  maxProjectiles: PERFORMANCE_MAX_PROJECTILES,
  instanceRebuildBudgetMs: PERFORMANCE_INSTANCE_REBUILD_BUDGET_MS,
} as const;

export const IDLE = {
  maxOfflineSeconds: IDLE_MAX_OFFLINE_SECONDS,
  baseClearRate: IDLE_BASE_CLEAR_RATE,
  softHeatRegen: IDLE_SOFT_HEAT_REGEN,
} as const;

export const CURRENCY = {
  fragmentPerBlock: CURRENCY_FRAGMENTS_PER_BLOCK,
  coreClearBase: CURRENCY_CORE_CLEAR_BASE,
} as const;
