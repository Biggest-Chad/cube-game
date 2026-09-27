import * as THREE from 'three';
import { ORBIT } from '../data/constants';
import { maxOrbitSpeedMul } from '../data/balance';
import { ARENA_FLOOR_WORLD_Y, ORBIT_CITY_CAMERA_LIMIT, SHIP_FLOOR_CLEARANCE } from '../data/constraints';
import { rollIntroReel, type IntroBeat, type RolledIntro } from './IntroReels';

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
  /** Zoom-out stop: chase camera stays just inside the megacity towers. */
  private fittedMaxR = ORBIT_CITY_CAMERA_LIMIT - ORBIT.cameraBack - 1.6;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
    this.radius = ORBIT.defaultRadius;
    this.targetRadius = ORBIT.defaultRadius;
    this.minR = ORBIT.minRadius;
    this.maxR = this.fittedMaxR;
    this.baseFov = this.camera.fov;
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
    // Chase sits cameraBack behind the ship. Cap the ship so that camera stays
    // inside the nearest towers (centers at 34, faces near 31).
    const cityCap = ORBIT_CITY_CAMERA_LIMIT - ORBIT.cameraBack - 1.6;
    this.fittedMaxR = cityCap;
    const close = Math.max(ORBIT.minRadius, halfExtent * 1.85 + 0.6);
    this.minR = close < cityCap - 1.5 ? close : Math.max(halfExtent + 2, cityCap - 1.5);
    this.maxR = this.fittedMaxR;
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

  extendMaxRadius(_add: number): void {
    // Shop zoom used to push the seat out past 80. The skyline is the hard stop.
    this.maxR = this.fittedMaxR;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private lookYOffset = 0;
  private scriptedLag = 3.5;

  /** Combat radius the current intro docks to. */
  private introEndRadius = 18;
  private introReel: RolledIntro | null = null;
  private introDurationSec: number = ORBIT.introDuration;
  private introTitle = 'SECTOR SCAN';
  private introLastId: string | null = null;
  private introActive = false;
  private introRoll = 0;
  private introEnergy = 0;
  private introPrevCamYaw = 0;
  private introPrevShipYaw = 0;
  private introPrevShipPitch = 0.28;
  private baseFov = 55;
  private readonly storyLag = 3.5;
  private introShipPos = new THREE.Vector3();
  private introCamPos = new THREE.Vector3();
  private introOut = new THREE.Vector3();
  private introSide = new THREE.Vector3();
  private introChaseFocus = new THREE.Vector3();

  /**
   * Begin a short between-level reel. The ship and the filming camera are
   * separate until the last moment, then both dock on the combat chase seat.
   * `forceReel` is for tests; gameplay leaves it unset.
   */
  beginLevelIntro(_startYaw = this.yaw, forceReel?: string): void {
    this.introEndRadius = THREE.MathUtils.clamp(
      this.targetRadius > 0.1 ? this.targetRadius : this.radius,
      this.minR,
      this.maxR
    );
    this.introReel = rollIntroReel({ avoidId: this.introLastId, forceId: forceReel ?? null });
    this.introLastId = this.introReel.id;
    this.introTitle = this.introReel.title;
    this.introDurationSec = this.introReel.duration;
    this.introActive = true;
    this.introEnergy = 0;
    this.introRoll = 0;
    this.resetVelocities();
    this.applyIntroFrame(0, 0);
  }

  getIntroDuration(): number {
    return this.introDurationSec;
  }

  getIntroTitle(): string {
    return this.introTitle;
  }

  /** 0..1 how hard the filming camera is moving. Drives intro embers. */
  getIntroEnergy(): number {
    return this.introEnergy;
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
    this.introActive = false;
    this.introRoll = 0;
    this.introEnergy = 0;
    this.scriptedLag = this.storyLag;
    this.applyIntroFov(this.baseFov);
    this.camera.up.set(0, 1, 0);
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
   * Drive the level-intro reel. Progress 0→1. At 1 the ship orbit is the
   * combat seat and the camera is the chase cam behind it.
   */
  updateIntro(progress: number, dt: number): void {
    this.applyIntroFrame(progress, dt);
  }

  private applyIntroFrame(progress: number, dt: number): void {
    const reel = this.introReel;
    if (!reel) return;
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const combatR = this.introEndRadius;
    const dockYaw = reel.dockYaw;
    const span = reel.span(p * reel.duration);
    const camA = this.resolveIntroCam(span.a, combatR);
    const camB = this.resolveIntroCam(span.b, combatR);
    const u = span.u;
    const camYaw = THREE.MathUtils.lerp(camA.yaw, this.nearYaw(camA.yaw, camB.yaw), u);
    const camPitch = THREE.MathUtils.lerp(camA.pitch, camB.pitch, u);
    const camR = THREE.MathUtils.lerp(camA.radius, camB.radius, u);

    let shipYaw = THREE.MathUtils.lerp(span.a.shipYaw, span.b.shipYaw, u);
    let shipPitch = THREE.MathUtils.lerp(span.a.shipPitch, span.b.shipPitch, u);
    let shipR = THREE.MathUtils.lerp(
      combatR * span.a.shipRadiusMul,
      combatR * span.b.shipRadiusMul,
      u
    );
    let lookAt = Math.min(0.92, THREE.MathUtils.lerp(span.a.lookAt, span.b.lookAt, u));
    let lookY = THREE.MathUtils.lerp(span.a.lookY, span.b.lookY, u);
    let fov = THREE.MathUtils.lerp(span.a.fov, span.b.fov, u);
    let roll = THREE.MathUtils.lerp(span.a.roll, span.b.roll, u);
    let shake = THREE.MathUtils.lerp(span.a.shake, span.b.shake, u);
    this.scriptedLag = THREE.MathUtils.lerp(span.a.lag, span.b.lag, u);

    // Last ~12% eases onto the real chase cam. Earlier than that each reel plays out.
    const dockStart = 0.88;
    const dockU =
      p <= dockStart ? 0 : this.smooth01((p - dockStart) / (1 - dockStart));
    if (dockU > 0) {
      shipYaw = THREE.MathUtils.lerp(shipYaw, dockYaw, dockU);
      shipPitch = THREE.MathUtils.lerp(shipPitch, 0.28, dockU);
      shipR = THREE.MathUtils.lerp(shipR, combatR, dockU);
      lookAt = THREE.MathUtils.lerp(lookAt, 0, dockU);
      lookY = THREE.MathUtils.lerp(lookY, 0, dockU);
      fov = THREE.MathUtils.lerp(fov, this.baseFov, dockU);
      roll *= 1 - dockU;
      shake *= 1 - dockU;
    }

    shipR = THREE.MathUtils.clamp(shipR, this.introMinRadius(), this.maxR);
    shipPitch = this.pitchAboveFloor(shipPitch, shipR, this.floorClearance);
    let filmR = THREE.MathUtils.clamp(camR, this.introMinRadius(), this.maxR);
    let filmPitch = this.pitchAboveFloor(camPitch, filmR, 1.15);
    const time = p * reel.duration;
    const wob = Math.sin(time * 46) * shake;
    filmPitch = this.pitchAboveFloor(filmPitch + Math.cos(time * 33) * shake * 0.65, filmR, 1.15);
    // Keep the displayed yaw on a continuous branch. spherePos is 2π-periodic,
    // and a whip longer than π must stay on the authored side of nearYaw.
    let filmYaw = this.nearYaw(this.introPrevCamYaw, camYaw + wob);
    this.spherePos(shipYaw, shipPitch, shipR, this.introShipPos);
    const clear = this.pushOffShip(filmYaw, filmPitch, filmR, this.introShipPos);
    filmYaw = clear.yaw;
    filmPitch = clear.pitch;
    filmR = clear.radius;

    if (dt > 0) {
      const dy = filmYaw - this.introPrevCamYaw;
      const dp = filmPitch - this.cinematicPitch;
      this.introEnergy = THREE.MathUtils.clamp(
        Math.hypot(dy, dp) / Math.max(dt, 1 / 120) / 1.55,
        0,
        1
      );
      const shipDy = shipYaw - this.introPrevShipYaw;
      if (Math.abs(shipDy) < 0.35) {
        this.velYaw = THREE.MathUtils.clamp(shipDy / dt, -2.4, 2.4);
        this.velPitch = THREE.MathUtils.clamp(
          (shipPitch - this.introPrevShipPitch) / dt,
          -2.4,
          2.4
        );
      } else {
        this.velYaw = 0;
        this.velPitch = 0;
      }
    }

    this.yaw = shipYaw;
    this.pitch = shipPitch;
    this.radius = shipR;
    this.targetRadius = combatR;

    const yawJump = Math.abs(filmYaw - this.cinematicYaw) > 0.55;
    const radJump = Math.abs(filmR - this.cinematicRadius) > Math.max(3.5, this.cinematicRadius * 0.2);
    this.cinematicYaw = filmYaw;
    this.cinematicPitch = filmPitch;
    this.cinematicRadius = filmR;

    this.lookTarget.set(0, lookY, 0).addScaledVector(this.introShipPos, lookAt);
    this.lookYOffset = this.lookTarget.y;
    this.introRoll = roll;
    this.applyIntroFov(fov);
    this.introPrevCamYaw = filmYaw;
    this.introPrevShipYaw = shipYaw;
    this.introPrevShipPitch = shipPitch;

    if (p >= 0.999) {
      this.yaw = dockYaw;
      this.pitch = 0.28;
      this.radius = combatR;
      this.targetRadius = combatR;
      this.lookYOffset = 0;
      this.lookTarget.set(0, 0, 0);
      this.introRoll = 0;
      this.introActive = false;
      this.introEnergy = 0;
      this.scriptedLag = this.storyLag;
      this.applyIntroFov(this.baseFov);
      this.camera.up.set(0, 1, 0);
      this.mode = 'gameplay';
      this.blend = 1;
      this.resetVelocities();
      this.sync(true, dt);
      return;
    }

    if (dockU <= 0) {
      this.mode = 'cinematic';
      this.blend = 0;
    } else {
      this.mode = 'blend';
      this.blend = dockU;
    }
    this.introActive = true;
    const snap = p <= 0 || span.snap || yawJump || radJump || dockU > 0.72;
    this.sync(snap, dt);
  }

  /** Closest cube-clear radius for an intro shot. */
  private introMinRadius(): number {
    // minR ≈ max(10, half * 3.1). 0.70*minR stays outside the cube corner (~0.56*minR).
    return Math.max(ORBIT.minRadius * 0.75, this.minR * 0.7);
  }

  /** Keep a sphere pose above the arena floor. Positive pitch is up. */
  private pitchAboveFloor(pitch: number, radius: number, clearance: number): number {
    const minY = this.floorY + clearance;
    const ratio = THREE.MathUtils.clamp(minY / Math.max(radius, 0.01), -0.98, 0.98);
    const lim = Math.max(ORBIT.minPitch, Math.asin(ratio));
    return THREE.MathUtils.clamp(Math.max(pitch, lim), ORBIT.minPitch, ORBIT.maxPitch);
  }

  private smooth01(u: number): number {
    const t = THREE.MathUtils.clamp(u, 0, 1);
    return t * t * (3 - 2 * t);
  }

  private nearYaw(from: number, to: number): number {
    let y = to;
    const pi2 = Math.PI * 2;
    while (y - from > Math.PI) y -= pi2;
    while (from - y > Math.PI) y += pi2;
    return y;
  }

  /**
   * Filming pose for one beat. Framed beats sit a fixed distance off the ship;
   * orbit beats use the sphere around the cube.
   */
  private resolveIntroCam(
    beat: IntroBeat,
    combatR: number
  ): { yaw: number; pitch: number; radius: number } {
    if (!beat.frame) {
      const radius = THREE.MathUtils.clamp(
        combatR * beat.radiusMul,
        this.introMinRadius(),
        this.maxR
      );
      return { yaw: beat.yaw, pitch: this.pitchAboveFloor(beat.pitch, radius, 1.15), radius };
    }
    const shipR = THREE.MathUtils.clamp(
      combatR * beat.shipRadiusMul,
      this.introMinRadius(),
      this.maxR
    );
    const shipPitch = this.pitchAboveFloor(beat.shipPitch, shipR, this.floorClearance);
    this.spherePos(beat.shipYaw, shipPitch, shipR, this.introShipPos);
    this.introOut.copy(this.introShipPos);
    if (this.introOut.lengthSq() < 1e-8) this.introOut.set(0, 0, 1);
    else this.introOut.normalize();
    this.introSide.crossVectors(this.worldUp, this.introOut);
    if (this.introSide.lengthSq() < 1e-8) this.introSide.set(1, 0, 0);
    else this.introSide.normalize();
    this.introCamPos
      .copy(this.introShipPos)
      .addScaledVector(this.introOut, beat.frame.out)
      .addScaledVector(this.introSide, beat.frame.side)
      .addScaledVector(this.worldUp, beat.frame.up);
    const minR = this.introMinRadius();
    const len = this.introCamPos.length();
    if (len < minR) this.introCamPos.setLength(minR);
    else if (len > this.maxR) this.introCamPos.setLength(this.maxR);
    const sphere = this.worldToSphere(this.introCamPos);
    sphere.pitch = this.pitchAboveFloor(sphere.pitch, sphere.radius, 1.15);
    return sphere;
  }

  /**
   * A reel lerp can thread the camera through the ship. Shove it out to a
   * readable gap without changing shots that are already clear.
   */
  private pushOffShip(
    yaw: number,
    pitch: number,
    radius: number,
    ship: THREE.Vector3
  ): { yaw: number; pitch: number; radius: number } {
    this.spherePos(yaw, pitch, radius, this.introCamPos);
    this.introOut.copy(this.introCamPos).sub(ship);
    const sep = this.introOut.length();
    const minSep = 5.4;
    if (sep >= minSep) return { yaw, pitch, radius };
    if (sep < 0.08) {
      this.introOut.copy(ship);
      if (this.introOut.lengthSq() < 1e-6) this.introOut.set(0, 0.2, 1);
      this.introOut.normalize();
      this.introCamPos.copy(ship).addScaledVector(this.introOut, minSep);
    } else {
      this.introCamPos.copy(ship).addScaledVector(this.introOut, minSep / sep);
    }
    const floorY = this.floorY + 1.15;
    if (this.introCamPos.y < floorY) this.introCamPos.y = floorY;
    const minR = this.introMinRadius();
    const len = this.introCamPos.length();
    if (len < minR) this.introCamPos.setLength(minR);
    else if (len > this.maxR) this.introCamPos.setLength(this.maxR);
    const sphere = this.worldToSphere(this.introCamPos);
    sphere.pitch = this.pitchAboveFloor(sphere.pitch, sphere.radius, 1.15);
    sphere.yaw = this.nearYaw(yaw, sphere.yaw);
    return sphere;
  }

  /** Inverse of spherePos. Yaw matches atan2(x, z); pitch is asin(y/r). */
  private worldToSphere(p: THREE.Vector3): { yaw: number; pitch: number; radius: number } {
    const radius = Math.max(0.01, p.length());
    const pitch = Math.asin(THREE.MathUtils.clamp(p.y / radius, -1, 1));
    const yaw = Math.atan2(p.x, p.z);
    return { yaw, pitch, radius };
  }

  private applyIntroFov(fov: number): void {
    const f = THREE.MathUtils.clamp(fov, 34, 82);
    if (Math.abs(this.camera.fov - f) < 0.04) return;
    this.camera.fov = f;
    this.camera.updateProjectionMatrix();
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
    this.introActive = false;
    this.introRoll = 0;
    this.introEnergy = 0;
    this.scriptedLag = this.storyLag;
    this.applyIntroFov(this.baseFov);
    this.camera.up.set(0, 1, 0);
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
      this.mode === 'cinematic' ? Math.max(1.4, this.scriptedLag) : ORBIT.cameraLag;
    const omega = Math.hypot(this.velYaw, this.velPitch);
    const peak = ORBIT.yawSpeed * maxOrbitSpeedMul;
    const t = peak > 0 ? THREE.MathUtils.clamp(omega / peak, 0, 1) : 0;
    // Stay with the ship on hard turns so it does not slide off-frame.
    return base * (1 + 0.4 * t);
  }

  /**
   * Chase would pass through the arena floor: pull toward the subject
   * (zoom in) instead of clipping. Does not raise the orbit pitch.
   */
  private pullCamAboveFloor(cam: THREE.Vector3, subject: THREE.Vector3): void {
    const minY = this.floorY + 0.45;
    if (cam.y >= minY) return;
    const dy = subject.y - cam.y;
    if (dy <= 0.04) {
      cam.y = minY;
      return;
    }
    const t = THREE.MathUtils.clamp((minY - cam.y) / dy, 0, 0.92);
    cam.lerp(subject, t);
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
      if (this.introActive) {
        // Shot focus → the chase aim (origin * 0.68 + ship * 0.32, origin term is 0).
        this.introChaseFocus.copy(this.shipPos).multiplyScalar(0.32);
        this.focus.lerpVectors(this.lookTarget, this.introChaseFocus, this.blend);
      } else {
        this.focus
          .copy(this.lookTarget)
          .multiplyScalar(THREE.MathUtils.lerp(1, 0.68, this.blend))
          .addScaledVector(this.shipPos, THREE.MathUtils.lerp(0, 0.32, this.blend));
      }
    } else {
      this.desiredCam.copy(this.gameplayCam);
      this.focus
        .copy(this.lookTarget)
        .multiplyScalar(0.68)
        .addScaledVector(this.shipPos, 0.32);
    }

    const subject = this.mode === 'cinematic' ? this.lookTarget : this.shipPos;
    this.pullCamAboveFloor(this.desiredCam, subject);

    if (snap) {
      // Level load / cinematic start only
      this.camera.position.copy(this.desiredCam);
    } else {
      const rate = this.cameraLagRate();
      const k = 1 - Math.exp(-rate * Math.max(dt, 1e-6));
      this.camera.position.lerp(this.desiredCam, k);
      // No hard-snap catch-up — continuous exp only
    }
    this.pullCamAboveFloor(this.camera.position, subject);
    this.camera.lookAt(this.focus);
    // Roll is reapplied after lookAt. lookAt rebuilds orientation from camera.up,
    // so a zero roll next frame leaves gameplay untilted.
    if (this.introActive && this.introRoll !== 0) this.camera.rotateZ(this.introRoll);
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
    return baseLag * (1 + 0.55 * t);
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
