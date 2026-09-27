/**
 * WAVE47 flight settle — intentional left-stick steer, damped cruise, mild curve drift.
 * DISCARD: FZERO_BANK_DRIFT / endless bank thrash. Wall slap + boost juice kept.
 * Nose stays cube local -Z on path tangent (FlyerRun). Camera roll follows brief bank then levels.
 */
import * as THREE from 'three';
import {
  FLYER_LANE_HALF,
  FLYER_THRUST_BASE,
  FLYER_THRUST_BOOST,
  FLYER_THRUST_HAZARD,
  FLYER_THRUST_MAX,
  FLYER_THRUST_MIN,
} from '../data/flyer';

/** Base FOV during transit (degrees). Combat camera is 55 and is restored on exit. */
export const FLYER_FOV_BASE = 68;
/** Boost FOV — a real speed punch, still short of a fisheye. */
export const FLYER_FOV_BOOST = 80;
/** Min FOV when scrubbing off a hazard. */
export const FLYER_FOV_BRAKE = 60;

/** Extra boost on pad pickup (on top of FLYER_THRUST_BOOST). */
export const WIPEOUT_BOOST_EXTRA = 18; // WAVE46: pad + ring incentive
/** Stronger hazard dump. */
export const WIPEOUT_HAZARD_EXTRA = 8;
/** Airbrake thrust scrub per second — only while actually grinding the rail. */
export const WIPEOUT_AIRBRAKE_SCRUB = 16;
/** Strafe |x|/lane fraction that starts airbrake. Steering itself must not scrub speed. */
export const WIPEOUT_AIRBRAKE_START = 0.94;
/** Bank lean multipliers (applied to FlyerRun lean terms). */
/** WAVE52: cut visual bank lean — steer via lane MOVE, not roll thrash. */
export const WIPEOUT_BANK_MUL = 0.82;
export const WIPEOUT_STRAFE_RATE_MUL = 1.65;
export const WIPEOUT_STICK_LEAN_MUL = 0.72;
/** Streak length / opacity emphasis. */
export const WIPEOUT_STREAK_LEN_MUL = 1.38;
export const WIPEOUT_STREAK_OP_MUL = 0.72;

// ─── WAVE47 settle model (replaces F-Zero bank-drift thrash) ────────────────
/** |stick| below this = released. No steer, no player bank. */
export const FLIGHT_STICK_DEADZONE = 0.05;
/** Lateral accel toward stick target (units/s²). Intentional steer with inertia. */
export const FLIGHT_STEER_ACCEL = 140;
/** Extra accel when stick opposes current lateral velocity. */
export const FLIGHT_STEER_REVERSE_ACCEL = 190;
/** Max lateral speed (units/s). Lane half is 6.2 — full throw crosses in about a quarter second. */
export const FLIGHT_STRAFE_MAX = 26;

/**
 * Lateral-velocity settle time constant when stick is released (seconds).
 * v(t) = v0 * e^(-t/τ). Overdamped — no spring, no oscillation.
 * τ = 0.18 → ~63% gone at 0.18s, ~95% at 0.54s, cruise stable by ~0.6s.
 */
export const FLIGHT_SETTLE_VEL_TAU = 0.13;

/**
 * Visual bank settle time constant when stick is released (seconds).
 * bank → 0 with first-order lag. τ = 0.24 → ~0.4s clearly leveling,
 * ~5% residual at 0.72s (inside the 0.4–0.8s level window).
 */
export const FLIGHT_SETTLE_BANK_TAU = 0.16;
/** Visual bank follow while steering (snappy, still inertial). */
export const FLIGHT_STEER_BANK_TAU = 0.07;
/** Full-stick visual bank (radians), roll around path tangent. ~24°. */
export const FLIGHT_BANK_STICK = 0.42;
/** Visual bank from lateral velocity while steering (rad per unit/s). */
export const FLIGHT_BANK_RATE = 0.012;
/** Visual bank clamp (radians). ~33°. */
export const FLIGHT_BANK_MAX = 0.58;

/**
 * Mild outward drift on curves when stick is neutral.
 * accel = clamp(-κ * GAIN * speedMul, ±MAX). κ is signed path curvature
 * (rad/m, + if tangent yaws toward +right). Not autopilot, not roll thrash.
 * Tight curve at the cap (~2.2 u/s²) drifts a few meters over a couple seconds
 * unless the player steers the optimal line.
 */
export const FLIGHT_CURVE_DRIFT_GAIN = 38;
export const FLIGHT_CURVE_DRIFT_MAX = 2.2;
/** |κ| below this is a straight — zero drift so cruise is stable. */
export const FLIGHT_CURVE_KAPPA_DEAD = 0.006;

/** Discarded WAVE42 bank-drift (kept exported so old notes resolve; not applied). */
export const FZERO_BANK_DRIFT = 0;
/** Discarded WAVE42 curve-from-roll bias (not applied). */
export const FZERO_CURVE_DRIFT = 0;

/** Wall slap: thrust% dump. WAVE46/47: keep penalty — imperfect runs stay slower. */
export const FZERO_WALL_THRUST_PENALTY = 32;
/** Wall slap: instantaneous speedScale floor (recovery via damp). */
export const FZERO_WALL_SPEED_SCALE = 0.52;
/** Seconds before another wall slap can fire. */
export const FZERO_WALL_COOLDOWN = 0.55;
/** Fraction of outward velocity kept on slap (rest reverses = scrape bounce). */
export const FZERO_WALL_BOUNCE = 0.28;
/** Lane |x| fraction that counts as rail contact. */
export const FZERO_WALL_EDGE = 0.985;

export interface WipeoutDynInput {
  dt: number;
  thrust: number;
  speedMul: number;
  laneX: number;
  stickX: number;
  boosting: boolean;
  hazardHit: boolean;
  /** Unused by WAVE47 settle (was bank-drift). Kept so callers compile. */
  pathRoll?: number;
  /** Signed path curvature rad/m (+ toward +right). Neutral-stick outward drift. */
  curveKappa?: number;
  /** True this frame when wall slap just fired. */
  wallSlap?: boolean;
}

export interface WipeoutDynState {
  fov: number;
  bankMul: number;
  streakLenMul: number;
  streakOpMul: number;
  airbrake: number;
  boostPunch: number;
  /** >1 when airbraking — trades speed for turn authority (Wipeout HD). */
  turnAuthority: number;
  /** 0..1 distinct BOOST state vs baseline cruise. */
  boostState: number;
  /** Speed scale on top of thrust% (boost accel curve). */
  speedScale: number;
  /** Thruster bloom scale (white/cyan plumes). */
  thrusterBloom: number;
  /** 0..1 scrape flash intensity after wall slap. */
  scrapeFlash: number;
  /** Visual bank around path tangent (radians). Decays to 0 when stick released. */
  visualBank: number;
}

export class FlyerDynamics {
  readonly state: WipeoutDynState = {
    fov: FLYER_FOV_BASE,
    bankMul: WIPEOUT_BANK_MUL,
    streakLenMul: 1,
    streakOpMul: 1,
    airbrake: 0,
    boostPunch: 0,
    turnAuthority: 1,
    boostState: 0,
    speedScale: 1,
    thrusterBloom: 0.82,
    scrapeFlash: 0,
    visualBank: 0,
  };

  private fovSmooth = FLYER_FOV_BASE;
  private wallSpeedMul = 1;

  /** Stronger pad boost (still clamped to FLYER_THRUST_MAX). */
  applyBoost(thrust: number): number {
    return Math.min(FLYER_THRUST_MAX, thrust + FLYER_THRUST_BOOST + WIPEOUT_BOOST_EXTRA);
  }

  /** Brief FOV dilation. The damp in update() pulls it back to the speed target. */
  kickFov(add: number): void {
    this.fovSmooth = Math.min(FLYER_FOV_BOOST + 4, this.fovSmooth + Math.max(0, add));
    this.state.fov = this.fovSmooth;
  }

  /** Harder hazard scrub. */
  applyHazard(thrust: number): number {
    return Math.max(FLYER_THRUST_MIN, thrust - FLYER_THRUST_HAZARD - WIPEOUT_HAZARD_EXTRA);
  }

  /** F-Zero wall slap: dump thrust%. */
  applyWallSlap(thrust: number): number {
    return Math.max(FLYER_THRUST_MIN, thrust - FZERO_WALL_THRUST_PENALTY);
  }

  /** Clear visual bank / scrape (seek, scene swap). */
  resetSettle(): void {
    this.state.visualBank = 0;
  }

  /**
   * WAVE47: stick drives lateral velocity with inertia.
   * Released stick: exponential velocity damp (stable cruise) + mild curve outward drift.
   * No path-roll bank thrash, no auto-center to the racing line.
   */
  integrateStrafe(
    vel: number,
    stickX: number,
    curveKappa: number,
    speedMul: number,
    turnAuth: number,
    dt: number
  ): number {
    const stick = THREE.MathUtils.clamp(stickX, -1, 1);
    const absStick = Math.abs(stick);
    let v = vel;
    const maxV = FLIGHT_STRAFE_MAX * Math.max(0.75, turnAuth);
    const step = Math.max(0, dt);

    if (absStick > FLIGHT_STICK_DEADZONE) {
      const target = stick * maxV;
      const opposing = Math.sign(v) !== 0 && Math.sign(stick) !== Math.sign(v) && Math.abs(v) > 0.4;
      const accel = opposing ? FLIGHT_STEER_REVERSE_ACCEL : FLIGHT_STEER_ACCEL;
      const dv = THREE.MathUtils.clamp(target - v, -accel * step, accel * step);
      v += dv;
    } else {
      // Strong first-order damp. Not a spring — cannot oscillate.
      const tau = Math.max(0.05, FLIGHT_SETTLE_VEL_TAU);
      v *= Math.exp(-step / tau);
      const kappa = curveKappa;
      if (Math.abs(kappa) > FLIGHT_CURVE_KAPPA_DEAD) {
        const outward = THREE.MathUtils.clamp(
          -kappa * FLIGHT_CURVE_DRIFT_GAIN * Math.max(0.75, speedMul),
          -FLIGHT_CURVE_DRIFT_MAX,
          FLIGHT_CURVE_DRIFT_MAX
        );
        v += outward * step;
      }
      if (Math.abs(v) < 0.08 && Math.abs(curveKappa) <= FLIGHT_CURVE_KAPPA_DEAD) v = 0;
    }

    return THREE.MathUtils.clamp(v, -maxV, maxV);
  }

  /**
   * Visual bank: follows stick (and a little rate) while steering, then decays to level.
   * Independent of lane offset and path roll so cruise does not stay cocked.
   */
  stepVisualBank(stickX: number, strafeVel: number, dt: number): number {
    const stick = THREE.MathUtils.clamp(stickX, -1, 1);
    const steer = Math.abs(stick) > FLIGHT_STICK_DEADZONE;
    const stickBank = steer ? -stick * FLIGHT_BANK_STICK : 0;
    const rateBank = steer ? -strafeVel * FLIGHT_BANK_RATE : 0;
    const target = THREE.MathUtils.clamp(stickBank + rateBank, -FLIGHT_BANK_MAX, FLIGHT_BANK_MAX);
    const tau = steer ? FLIGHT_STEER_BANK_TAU : FLIGHT_SETTLE_BANK_TAU;
    const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.04, tau));
    this.state.visualBank += (target - this.state.visualBank) * k;
    if (!steer && Math.abs(this.state.visualBank) < 0.012) this.state.visualBank = 0;
    return this.state.visualBank;
  }

  /**
   * Per-frame juice: airbrake when near lane walls / hard stick,
   * FOV punch from thrust, streak emphasis from speed.
   */
  update(input: WipeoutDynInput): WipeoutDynState {
    const { dt, thrust, speedMul, laneX, stickX } = input;
    const edge = Math.abs(laneX) / Math.max(0.1, FLYER_LANE_HALF);
    let air = 0;
    // Rail grind only. A hard stick used to dump speed, which read as a dead stick.
    if (edge > WIPEOUT_AIRBRAKE_START) {
      air = (edge - WIPEOUT_AIRBRAKE_START) / (1 - WIPEOUT_AIRBRAKE_START);
    }
    this.state.airbrake = THREE.MathUtils.clamp(air, 0, 1);
    void stickX;

    const boostT = THREE.MathUtils.clamp((thrust - FLYER_THRUST_BASE) / Math.max(1, FLYER_THRUST_MAX - FLYER_THRUST_BASE), 0, 1);
    const brakeT = THREE.MathUtils.clamp((FLYER_THRUST_BASE - thrust) / Math.max(1, FLYER_THRUST_BASE - FLYER_THRUST_MIN), 0, 1);
    const targetFov =
      FLYER_FOV_BASE +
      boostT * (FLYER_FOV_BOOST - FLYER_FOV_BASE) -
      brakeT * (FLYER_FOV_BASE - FLYER_FOV_BRAKE) * 0.55 -
      this.state.airbrake * 2.5;
    this.fovSmooth = THREE.MathUtils.damp(this.fovSmooth, targetFov, 7.2, dt);
    this.state.fov = this.fovSmooth;

    this.state.boostPunch = THREE.MathUtils.damp(this.state.boostPunch, boostT, 5.5, dt);
    this.state.boostState = THREE.MathUtils.damp(this.state.boostState, boostT > 0.08 ? boostT : 0, 8, dt);
    const boostAccel = 1 + this.state.boostState * 0.42 + this.state.boostPunch * 0.16;
    if (input.wallSlap) {
      this.wallSpeedMul = FZERO_WALL_SPEED_SCALE;
      this.state.scrapeFlash = 1;
    }
    this.wallSpeedMul = THREE.MathUtils.damp(this.wallSpeedMul, 1, 2.8, dt);
    this.state.scrapeFlash = THREE.MathUtils.damp(this.state.scrapeFlash, 0, 6.5, dt);
    const speedTarget = boostAccel * this.wallSpeedMul;
    this.state.speedScale = THREE.MathUtils.damp(this.state.speedScale, speedTarget, 6, dt);
    const bloomTarget = 0.78 + Math.max(0, speedMul - 1) * 0.28 + this.state.boostState * 0.38;
    this.state.thrusterBloom = THREE.MathUtils.damp(this.state.thrusterBloom, THREE.MathUtils.clamp(bloomTarget, 0.55, 1.12), 10, dt);
    const rush = 0.55 + Math.max(0, speedMul - 0.85) * 0.85 + this.state.boostState * 0.7;
    this.state.streakLenMul = WIPEOUT_STREAK_LEN_MUL * rush;
    this.state.streakOpMul = 0.42 + this.state.boostState * 0.5;
    this.state.bankMul = WIPEOUT_BANK_MUL * (1 + this.state.airbrake * 0.2 + boostT * 0.12);
    this.state.turnAuthority = 1 + this.state.airbrake * 0.55;
    return this.state;
  }

  /** Apply airbrake scrub to thrust (returns new thrust). */
  scrubThrust(thrust: number, dt: number): number {
    if (this.state.airbrake < 0.05) return thrust;
    const scrub = WIPEOUT_AIRBRAKE_SCRUB * this.state.airbrake * dt;
    const target = FLYER_THRUST_BASE - 12 * this.state.airbrake;
    if (thrust > target) return Math.max(target, thrust - scrub);
    return thrust;
  }

  /** Bank lean angle contribution multipliers for craft pose. */
  leanScale(): { strafe: number; rate: number; stick: number } {
    const m = this.state.bankMul;
    return {
      strafe: m,
      rate: WIPEOUT_STRAFE_RATE_MUL * (m / WIPEOUT_BANK_MUL),
      stick: WIPEOUT_STICK_LEAN_MUL * (m / WIPEOUT_BANK_MUL),
    };
  }

  /** Apply FOV to perspective camera; restores base when leaving transit. */
  applyFov(camera: THREE.PerspectiveCamera): void {
    if (Math.abs(camera.fov - this.state.fov) < 0.4) return;
    camera.fov = this.state.fov;
    camera.updateProjectionMatrix();
  }

  resetFov(camera: THREE.PerspectiveCamera, base = FLYER_FOV_BASE): void {
    this.fovSmooth = base;
    this.state.fov = base;
    this.wallSpeedMul = 1;
    this.state.scrapeFlash = 0;
    this.state.visualBank = 0;
    if (Math.abs(camera.fov - base) > 0.05) {
      camera.fov = base;
      camera.updateProjectionMatrix();
    }
  }
}

export const flyerDynamics = new FlyerDynamics();
