import * as THREE from 'three';
import { ORBIT } from '../data/constants';
import { maxOrbitSpeedMul } from '../data/balance';
import { ARENA_FLOOR_WORLD_Y, SHIP_FLOOR_CLEARANCE } from '../data/constraints';

export type CameraMode = 'gameplay' | 'cinematic' | 'blend';

/**
 * Anti-jitter orbital camera — single source of truth for orbit state.
 *
 * ## Architecture (P0)
 * - **Orbit truth:** `yaw`, `pitch`, `radius` updated only by the velocity
 *   integrator in `applyInput` / intro helpers. Combat origin and aiming MUST
 *   use `getShipPosition` / `getOrbitPoint` (same point).
 * - **Ship visual:** may lag slightly behind orbit truth (see Ship mesh lag
 *   using `ORBIT.shipPosLag`). Prefer `getShipVisualLagRate()` so lag shrinks
 *   at high |ω| and the mesh does not trail then whip.
 * - **Camera:** follows desired chase point with exp lag only
 *   (`1 - exp(-k*dt)`). No competing hard snaps except level load (`sync(true)`).
 * - **Smoothing:** every continuous blend uses `1 - exp(-k*dt)`. Never
 *   `Math.min(1, k*dt)` for motion.
 */
export class OrbitalCamera {
  readonly camera: THREE.PerspectiveCamera;

  /** Orbit state — single source of truth (radians / world units). */
  yaw = 0.85;
  pitch = 0.28;
  radius: number;

  private targetRadius: number;
  private lookTarget = new THREE.Vector3(0, 0, 0);
  private focus = new THREE.Vector3();
  private desiredCam = new THREE.Vector3();
  private shipPos = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private worldUp = new THREE.Vector3(0, 1, 0);
  private minR: number;
  private maxR: number;
  private mode: CameraMode = 'gameplay';
  private blend = 1;
  private cinematicYaw = 0;
  private cinematicPitch = 0.35;
  private cinematicRadius = 24;
  private gameplayCam = new THREE.Vector3();
  private cinematicCam = new THREE.Vector3();

  /** Smoothed stick (−1..1) */
  private smoothX = 0;
  private smoothY = 0;
  /** Angular velocity (rad/s) — integrator state */
  private velYaw = 0;
  private velPitch = 0;
  /** Chase-camera motion sway (centered default; banks with turn rate) */
  private swayX = 0;
  private swayY = 0;

  /**
   * Top-speed multiplier from ship stats / upgrades.
   * Combined with the per-frame `speedMul` arg on `applyInput`.
   * Soft-clamped to balance maxOrbitSpeedMul.
   */
  private topSpeedMul = 1;
  private floorY = ARENA_FLOOR_WORLD_Y;
  private floorClearance = SHIP_FLOOR_CLEARANCE;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.1, 500);
    this.radius = ORBIT.defaultRadius;
    this.targetRadius = ORBIT.defaultRadius;
    this.minR = ORBIT.minRadius;
    this.maxR = ORBIT.maxRadius;
    this.sync(true);
  }

  /**
   * Set orbit-speed multiplier from ship stats (upgrade tree, etc.).
   * Clamped to a tiny floor and balance hard cap.
   */
  setTopSpeedMul(mul: number): void {
    const v = Number.isFinite(mul) ? mul : 1;
    this.topSpeedMul = THREE.MathUtils.clamp(v, 0.05, maxOrbitSpeedMul);
  }

  getTopSpeedMul(): number {
    return this.topSpeedMul;
  }

  /** Keep the combat seat above the arena deck (no flying under the floor). */
  setFloorLimit(y: number, clearance = SHIP_FLOOR_CLEARANCE): void {
    this.floorY = y;
    this.floorClearance = clearance;
    this.clampPitchToFloor();
  }

  /**
   * Fit orbit radius range to the current cube.
   * @param hardSnap When true (default), snap radius to the preferred combat distance.
   *                 When false, only update limits and clamp current radius (no pose pop).
   */
  setOrbitLimits(halfExtent: number, hardSnap = true): void {
    // Spawn / combat distance scales with cube size (2× prior seat distance).
    this.minR = Math.max(ORBIT.minRadius, halfExtent * 3.1);
    this.maxR = Math.max(this.minR + 8, halfExtent * 9.0 + ORBIT.maxRadius * 0.25);
    const preferred = THREE.MathUtils.clamp(halfExtent * 5.4, this.minR, this.maxR);
    if (hardSnap) {
      this.targetRadius = preferred;
      this.radius = this.targetRadius;
      this.cinematicRadius = this.radius * ORBIT.introRadiusMul;
      this.resetVelocities();
      this.sync(true);
    } else {
      this.targetRadius = THREE.MathUtils.clamp(this.targetRadius, this.minR, this.maxR);
      // Prefer combat distance if still at a wild cinematic radius
      if (Math.abs(this.targetRadius - preferred) > preferred * 0.35) {
        this.targetRadius = preferred;
      }
      this.radius = THREE.MathUtils.clamp(this.radius, this.minR, this.maxR);
      this.cinematicRadius = THREE.MathUtils.clamp(this.cinematicRadius, this.minR, this.maxR);
    }
  }

  extendMaxRadius(add: number): void {
    this.maxR = ORBIT.maxRadius + add;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private lookYOffset = 0;
  private scriptedLag = 3.5;

  /** Level-intro camera sweep: start pose → final third-person combat seat. */
  private introStartYaw = 0;
  private introStartPitch = 0.42;
  private introStartRadius = 24;
  private introEndYaw = 0.85;
  private introEndPitch = 0.28;
  private introEndRadius = 18;

  /**
   * Begin the short level-intro orbit sweep.
   * Ends at the standard third-person chase seat (ready for countdown / combat).
   */
  beginLevelIntro(startYaw = this.yaw): void {
    // Resting combat pose — matches finishIntro / gameplay defaults
    this.introEndYaw = 0.85;
    this.introEndPitch = 0.28;
    this.introEndRadius = THREE.MathUtils.clamp(
      this.targetRadius > 0.1 ? this.targetRadius : this.radius,
      this.minR,
      this.maxR
    );

    // Sweep in from a wider, higher angle with a yaw arc
    this.introStartYaw = startYaw - 1.15;
    this.introStartPitch = 0.52;
    this.introStartRadius = Math.min(
      this.maxR,
      this.introEndRadius * ORBIT.introRadiusMul
    );

    this.yaw = this.introStartYaw;
    this.pitch = this.introStartPitch;
    this.radius = this.introStartRadius;
    this.targetRadius = this.introEndRadius;

    this.cinematicYaw = this.introStartYaw;
    this.cinematicPitch = this.introStartPitch;
    this.cinematicRadius = this.introStartRadius;
    this.lookYOffset = 0;
    this.lookTarget.set(0, 0, 0);
    this.mode = 'cinematic';
    this.blend = 0;
    this.resetVelocities();
    this.sync(true);
  }

  /** @deprecated Prefer beginLevelIntro — kept for any external callers. */
  startCinematic(startYaw = this.yaw): void {
    this.beginLevelIntro(startYaw);
  }

  /** Begin fully scripted cinematic (IntroCinematic drives poses each frame). */
  beginScriptedCinematic(pose: {
    yaw: number;
    pitch: number;
    radius: number;
    lookY?: number;
  }): void {
    this.mode = 'cinematic';
    this.blend = 0;
    this.cinematicYaw = pose.yaw;
    this.cinematicPitch = pose.pitch;
    this.cinematicRadius = pose.radius;
    this.lookYOffset = pose.lookY ?? 0;
    this.lookTarget.set(0, this.lookYOffset, 0);
    this.resetVelocities();
    this.sync(true);
  }

  /**
   * Drive cinematic camera each frame.
   * hard=true snaps immediately (action cut); otherwise exp-lags toward pose.
   */
  setScriptedPose(pose: {
    yaw: number;
    pitch: number;
    radius: number;
    lookY?: number;
    hard?: boolean;
    lag?: number;
  }): void {
    this.mode = 'cinematic';
    this.blend = 0;
    if (pose.hard) {
      this.cinematicYaw = pose.yaw;
      this.cinematicPitch = pose.pitch;
      this.cinematicRadius = pose.radius;
      this.lookYOffset = pose.lookY ?? 0;
      this.lookTarget.set(0, this.lookYOffset, 0);
      this.sync(true);
      return;
    }
    this.cinematicYaw = pose.yaw;
    this.cinematicPitch = pose.pitch;
    this.cinematicRadius = pose.radius;
    this.lookYOffset = pose.lookY ?? this.lookYOffset;
    this.lookTarget.set(0, this.lookYOffset, 0);
    this.scriptedLag = pose.lag ?? this.scriptedLag;
  }

  /**
   * Drive level-intro sweep. Progress 0→1; at 1 the camera is at the final
   * third-person combat seat (yaw/pitch/radius = intro end pose).
   */
  updateIntro(progress: number, dt: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    // Smooth ease-in-out so the settle into combat seat feels deliberate
    const e = p * p * (3 - 2 * p);
    // Secondary ease that ramps harder in the last third (dock into chase cam)
    const dock = p < 0.55 ? 0 : (p - 0.55) / 0.45;
    const dockE = dock * dock * (3 - 2 * dock);

    // Gentle mid-sweep flourish that fades out as we dock
    const flourish = Math.sin(p * Math.PI) * (1 - dockE);
    const yaw =
      THREE.MathUtils.lerp(this.introStartYaw, this.introEndYaw, e) + flourish * 0.42;
    const pitch =
      THREE.MathUtils.lerp(this.introStartPitch, this.introEndPitch, e) +
      flourish * 0.1;
    const radius = THREE.MathUtils.lerp(
      this.introStartRadius,
      this.introEndRadius,
      e
    );

    this.cinematicYaw = yaw;
    this.cinematicPitch = THREE.MathUtils.clamp(pitch, ORBIT.minPitch, ORBIT.maxPitch);
    this.cinematicRadius = radius;

    // Keep orbit truth in lockstep so blend/gameplay handoff has zero pop
    this.yaw = this.cinematicYaw;
    this.pitch = this.cinematicPitch;
    this.radius = this.cinematicRadius;
    this.targetRadius = this.introEndRadius;
    this.lookYOffset = THREE.MathUtils.lerp(0.15, 0, e);
    this.lookTarget.set(0, this.lookYOffset, 0);

    if (p < 0.55) {
      this.mode = 'cinematic';
      this.blend = 0;
    } else if (p < 0.999) {
      // Blend cinematic sphere → third-person chase over the final stretch
      this.mode = 'blend';
      this.blend = dockE;
    } else {
      // Land exactly on combat seat
      this.yaw = this.introEndYaw;
      this.pitch = this.introEndPitch;
      this.radius = this.introEndRadius;
      this.targetRadius = this.introEndRadius;
      this.lookYOffset = 0;
      this.lookTarget.set(0, 0, 0);
      this.mode = 'gameplay';
      this.blend = 1;
      this.resetVelocities();
      this.sync(true);
      return;
    }

    this.sync(false, dt);
  }

  /** Advance scripted cinematic camera lag (call from Game when intro cinematic runs). */
  updateScriptedCinematic(dt: number): void {
    if (this.mode !== 'cinematic') return;
    this.sync(false, dt);
  }

  /**
   * Leave cinematic/blend into pure gameplay chase.
   * When `snapPose` is provided, orbit truth is set first (final combat seat).
   */
  endCinematic(snapPose?: { yaw?: number; pitch?: number; radius?: number }): void {
    if (snapPose) {
      if (snapPose.yaw !== undefined) this.yaw = snapPose.yaw;
      if (snapPose.pitch !== undefined) {
        this.pitch = THREE.MathUtils.clamp(snapPose.pitch, ORBIT.minPitch, ORBIT.maxPitch);
      }
      if (snapPose.radius !== undefined) {
        const r = THREE.MathUtils.clamp(snapPose.radius, this.minR, this.maxR);
        this.radius = r;
        this.targetRadius = r;
      }
    }
    this.mode = 'gameplay';
    this.blend = 1;
    this.lookYOffset = 0;
    this.lookTarget.set(0, 0, 0);
    this.resetVelocities();
    this.sync(true);
  }

  /** Final third-person seat used by level intro / post-cinematic handoff. */
  getDefaultCombatPose(): { yaw: number; pitch: number; radius: number } {
    const radius = THREE.MathUtils.clamp(
      this.targetRadius > 0.1 ? this.targetRadius : this.radius,
      this.minR,
      this.maxR
    );
    return { yaw: 0.85, pitch: 0.28, radius };
  }

  /**
   * Integrate stick → angular velocity → yaw/pitch.
   * @param speedMul Additional mult (e.g. tech.stats.orbitSpeedMul); combined with topSpeedMul.
   */
  applyInput(axisX: number, axisY: number, zoomDelta: number, dt: number, speedMul: number): void {
    if (this.mode === 'cinematic') return;
    if (dt <= 0) return;

    // Deadzone + quadratic response for deliberate fine aim
    const dz = 0.08;
    let ix = Math.abs(axisX) < dz ? 0 : Math.sign(axisX) * ((Math.abs(axisX) - dz) / (1 - dz));
    let iy = Math.abs(axisY) < dz ? 0 : Math.sign(axisY) * ((Math.abs(axisY) - dz) / (1 - dz));
    ix = Math.sign(ix) * ix * ix;
    iy = Math.sign(iy) * iy * iy;

    // Stick smooth — exp only
    const kIn = 1 - Math.exp(-ORBIT.inputSmooth * dt);
    this.smoothX += (ix - this.smoothX) * kIn;
    this.smoothY += (iy - this.smoothY) * kIn;

    const mul = THREE.MathUtils.clamp(
      (Number.isFinite(speedMul) ? speedMul : 1) * this.topSpeedMul,
      0.05,
      maxOrbitSpeedMul
    );

    const targetVelYaw = this.smoothX * ORBIT.yawSpeed * mul;
    const targetVelPitch = -this.smoothY * ORBIT.pitchSpeed * mul;

    // Angular accel toward target — exp blend (frame-rate independent, no overshoot snap)
    const kAcc = 1 - Math.exp(-ORBIT.angularAccel * dt);
    this.velYaw += (targetVelYaw - this.velYaw) * kAcc;
    this.velPitch += (targetVelPitch - this.velPitch) * kAcc;

    // Extra friction when stick near center (brake)
    if (Math.abs(this.smoothX) < 0.05 && Math.abs(this.smoothY) < 0.05) {
      const fr = Math.exp(-ORBIT.angularFriction * dt);
      this.velYaw *= fr;
      this.velPitch *= fr;
      if (Math.abs(this.velYaw) < 0.002) this.velYaw = 0;
      if (Math.abs(this.velPitch) < 0.002) this.velPitch = 0;
    }

    // Optional 2-step sub-integration when spinning hard (reduces large-dt error)
    const omega = Math.hypot(this.velYaw, this.velPitch);
    const steps = omega > 0.9 ? 2 : 1;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.yaw += this.velYaw * h;
      this.pitch += this.velPitch * h;
      this.pitch = THREE.MathUtils.clamp(this.pitch, this.effectiveMinPitch(), ORBIT.maxPitch);
      // Soft stop at poles / deck: kill pitch velocity into the limit
      if (this.pitch <= this.effectiveMinPitch() + 0.001 && this.velPitch < 0) this.velPitch = 0;
      if (this.pitch >= ORBIT.maxPitch - 0.001 && this.velPitch > 0) this.velPitch = 0;
    }

    // Keep yaw bounded without discontinuities in velocity
    if (this.yaw > Math.PI * 4 || this.yaw < -Math.PI * 4) {
      this.yaw = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }

    if (zoomDelta !== 0) {
      this.targetRadius = THREE.MathUtils.clamp(
        this.targetRadius + zoomDelta * (this.targetRadius * ORBIT.zoomSpeed * 3),
        this.minR,
        this.maxR
      );
    }
  }

  update(dt: number): void {
    if (this.mode === 'cinematic' || this.mode === 'blend') return;
    if (dt <= 0) return;
    const rk = 1 - Math.exp(-ORBIT.cameraLag * dt);
    this.radius += (this.targetRadius - this.radius) * rk;
    this.clampPitchToFloor();
    // Sway lag with real dt (buildGameplayCamera uses a 1/60 placeholder blend)
    const peak = ORBIT.yawSpeed * maxOrbitSpeedMul;
    const tYaw = peak > 0 ? THREE.MathUtils.clamp(this.velYaw / peak, -1, 1) : 0;
    const tPitch = peak > 0 ? THREE.MathUtils.clamp(this.velPitch / peak, -1, 1) : 0;
    const swayAmt = ORBIT.cameraSway ?? 0.5;
    const sk = 1 - Math.exp(-(ORBIT.cameraSwayLag ?? 5.5) * dt);
    this.swayX += (-tYaw * swayAmt - this.swayX) * sk;
    this.swayY += (tPitch * swayAmt * 0.45 - this.swayY) * sk;
    this.sync(false, dt);
  }

  private effectiveMinPitch(): number {
    const minY = this.floorY + this.floorClearance;
    const r = Math.max(this.radius, this.targetRadius, 0.01);
    const ratio = THREE.MathUtils.clamp(minY / r, -0.98, 0.98);
    return Math.max(ORBIT.minPitch, Math.asin(ratio));
  }

  private clampPitchToFloor(): void {
    if (this.mode === 'cinematic') return;
    const lim = this.effectiveMinPitch();
    if (this.pitch < lim) {
      this.pitch = lim;
      if (this.velPitch < 0) this.velPitch = 0;
    }
  }

  private resetVelocities(): void {
    this.velYaw = 0;
    this.velPitch = 0;
    this.smoothX = 0;
    this.smoothY = 0;
    this.swayX = 0;
    this.swayY = 0;
  }

  private spherePos(yaw: number, pitch: number, r: number, out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(pitch);
    return out.set(Math.sin(yaw) * cp * r, Math.sin(pitch) * r, Math.cos(yaw) * cp * r);
  }

  private computeOrbitPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.spherePos(this.yaw, this.pitch, this.radius, out);
  }

  private buildGameplayCamera(ship: THREE.Vector3, out: THREE.Vector3): void {
    this.forward.copy(this.lookTarget).sub(ship).normalize();
    this.right.crossVectors(this.forward, this.worldUp);
    if (this.right.lengthSq() < 1e-4) {
      this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    } else {
      this.right.normalize();
    }
    this.up.crossVectors(this.right, this.forward).normalize();

    // Centered chase + motion sway (swayX/Y updated in update())
    out
      .copy(ship)
      .addScaledVector(this.forward, -ORBIT.cameraBack)
      .addScaledVector(this.up, ORBIT.cameraHeight + this.swayY)
      .addScaledVector(this.right, ORBIT.cameraSide + this.swayX);
  }

  /**
   * Camera lag rate: lower snappiness (smaller k) at high |ω| so the chase
   * camera eases rather than rubber-banding behind a fast orbit.
   */
  private cameraLagRate(): number {
    const base =
      this.mode === 'cinematic' ? Math.max(1.4, this.scriptedLag) : ORBIT.cameraLag * 0.85;
    const omega = Math.hypot(this.velYaw, this.velPitch);
    // Peak yawSpeed * maxMul ≈ 1.0; map high ω → up to ~45% less snappy
    const peak = ORBIT.yawSpeed * maxOrbitSpeedMul;
    const t = peak > 0 ? THREE.MathUtils.clamp(omega / peak, 0, 1) : 0;
    return base * (1 - 0.45 * t);
  }

  private sync(snap: boolean, dt = 1 / 60): void {
    this.computeOrbitPoint(this.shipPos);
    this.buildGameplayCamera(this.shipPos, this.gameplayCam);

    this.spherePos(
      this.cinematicYaw,
      this.cinematicPitch,
      this.cinematicRadius,
      this.cinematicCam
    );

    if (this.mode === 'cinematic') {
      this.desiredCam.copy(this.cinematicCam);
      this.focus.copy(this.lookTarget);
    } else if (this.mode === 'blend') {
      this.desiredCam.lerpVectors(this.cinematicCam, this.gameplayCam, this.blend);
      this.focus
        .copy(this.lookTarget)
        .multiplyScalar(THREE.MathUtils.lerp(1, 0.78, this.blend))
        .addScaledVector(this.shipPos, THREE.MathUtils.lerp(0, 0.22, this.blend));
    } else {
      this.desiredCam.copy(this.gameplayCam);
      this.focus
        .copy(this.lookTarget)
        .multiplyScalar(0.78)
        .addScaledVector(this.shipPos, 0.22);
    }

    if (snap) {
      // Level load / cinematic start only
      this.camera.position.copy(this.desiredCam);
    } else {
      const rate = this.cameraLagRate();
      const k = 1 - Math.exp(-rate * Math.max(dt, 1e-6));
      this.camera.position.lerp(this.desiredCam, k);
      // No hard-snap catch-up — continuous exp only
    }
    this.camera.lookAt(this.focus);
  }

  /**
   * Orbit truth point on the sphere (combat origin / aim root).
   * Alias of getShipPosition for call-site clarity.
   */
  getOrbitPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.computeOrbitPoint(out);
  }

  /**
   * Desired ship orbit point (orbit truth — before ship-mesh visual lag).
   * Weapons, drones, hit detection should use this, not the lagged mesh position.
   */
  getShipPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.computeOrbitPoint(out);
  }

  /**
   * Recommended ship mesh position-lag rate for `1 - exp(-rate*dt)`.
   * Increases with angular speed so the visual tracks orbit truth under fast turns
   * (reduces trail-then-whip rubber band). Ship systems may ignore and use ORBIT.shipPosLag.
   */
  getShipVisualLagRate(baseLag: number = ORBIT.shipPosLag): number {
    const omega = Math.hypot(this.velYaw, this.velPitch);
    const peak = ORBIT.yawSpeed * maxOrbitSpeedMul;
    const t = peak > 0 ? THREE.MathUtils.clamp(omega / peak, 0, 1) : 0;
    // Up to ~2.2× snappier position tracking when spinning hard
    return baseLag * (1 + 1.2 * t);
  }

  get isCinematic(): boolean {
    return this.mode === 'cinematic' || this.mode === 'blend';
  }

  /** Current turn rate magnitude — thruster visuals, lag scaling */
  get turnRate(): number {
    return Math.hypot(this.velYaw, this.velPitch);
  }

  /** External orbit tug (gravity well). */
  nudgeAngular(dYaw: number, dPitch: number): void {
    this.velYaw += dYaw;
    this.velPitch += dPitch;
  }

  /** Signed yaw angular velocity (rad/s) — ship bank / camera sway */
  get yawVelocity(): number {
    return this.velYaw;
  }

  /** Instantaneous angular velocity components (rad/s). */
  getAngularVelocity(out?: { yaw: number; pitch: number }): { yaw: number; pitch: number } {
    if (out) {
      out.yaw = this.velYaw;
      out.pitch = this.velPitch;
      return out;
    }
    return { yaw: this.velYaw, pitch: this.velPitch };
  }

  shake(amount: number): void {
    this.camera.position.x += (Math.random() - 0.5) * amount * 0.65;
    this.camera.position.y += (Math.random() - 0.5) * amount * 0.4;
  }
}
