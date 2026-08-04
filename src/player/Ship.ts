import * as THREE from 'three';
import { COLORS, ORBIT } from '../data/constants';
import type { OrbitalCamera } from './OrbitalCamera';

/**
 * Aggressive cinematic interceptor — dagger silhouette, forward-swept wings,
 * exposed nose cannon, layered armor. Local -Z is forward (toward cube).
 */
export class Ship {
  readonly group = new THREE.Group();
  private body: THREE.Group;
  private engineGlow: THREE.Mesh[] = [];
  private headLightL!: THREE.SpotLight;
  private headLightR!: THREE.SpotLight;
  private headTarget = new THREE.Object3D();
  private fillLight!: THREE.PointLight;
  /** Local-space muzzle tip (nose cannon aperture). */
  private muzzleLocal = new THREE.Vector3(0, -0.02, -1.72);
  private _muzzleWorld = new THREE.Vector3();
  private _desired = new THREE.Vector3();
  private _look = new THREE.Vector3();
  private _targetQuat = new THREE.Quaternion();
  private _up = new THREE.Vector3(0, 1, 0);
  private _m = new THREE.Matrix4();
  private _localOrigin = new THREE.Vector3();
  private thrusterPulse = 0;

  constructor() {
    this.body = this.buildMesh();
    this.group.add(this.body);
    this.setupLights();
  }

  private hull(color = 0x1a2430, metal = 0.78, rough = 0.32): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
    });
  }

  private accent(color: number, intensity = 0.45): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.4,
      roughness: 0.22,
    });
  }

  private glass(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x4ec8e8,
      metalness: 0.2,
      roughness: 0.08,
      transparent: true,
      opacity: 0.78,
      emissive: 0x0a3040,
      emissiveIntensity: 0.4,
    });
  }

  private addBox(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  private addCyl(
    parent: THREE.Object3D,
    rt: number,
    rb: number,
    h: number,
    segs: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    return m;
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();
    const hullDark = this.hull(0x0e141c, 0.85, 0.28);
    const hullMid = this.hull(0x182230, 0.78, 0.34);
    const hullLite = this.hull(0x243444, 0.7, 0.4);
    const panel = this.hull(0x080c12, 0.9, 0.45);
    const edge = this.hull(0x2a3848, 0.75, 0.3);
    const cyan = this.accent(COLORS.cyan, 0.55);
    const mag = this.accent(COLORS.magenta, 0.65);
    const white = this.accent(COLORS.white, 0.7);
    const eng = this.accent(0xff44bb, 1.1);
    const warn = this.accent(0xff6622, 0.5);

    // ═══════════════════════════════════════════
    // AGGRESSIVE DAGGER FUSELAGE (front = -Z)
    // ═══════════════════════════════════════════

    // Main body — deep wedge
    this.addBox(g, 0.38, 0.22, 1.55, 0, 0.02, 0.05, hullMid);
    this.addBox(g, 0.48, 0.12, 1.2, 0, 0.12, 0.12, hullLite);
    this.addBox(g, 0.34, 0.16, 0.9, 0, -0.08, 0.15, hullDark);

    // Chin plow / armor beak
    this.addBox(g, 0.3, 0.1, 0.7, 0, -0.1, -0.55, hullDark, 0.18, 0, 0);
    this.addBox(g, 0.22, 0.06, 0.45, 0, -0.12, -0.95, panel, 0.12, 0, 0);

    // Tapered nose stack (aggressive needle)
    this.addBox(g, 0.28, 0.14, 0.5, 0, 0.02, -0.7, hullMid);
    this.addBox(g, 0.2, 0.11, 0.4, 0, 0.01, -1.05, hullDark);
    this.addBox(g, 0.12, 0.08, 0.28, 0, 0, -1.32, panel);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 7), hullDark);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, -1.55);
    g.add(nose);

    // Primary plasma cannon barrel (muzzle beyond tip)
    this.addCyl(g, 0.035, 0.042, 0.42, 8, 0, -0.02, -1.48, edge, Math.PI / 2, 0, 0);
    this.addCyl(g, 0.028, 0.028, 0.18, 8, 0, -0.02, -1.68, panel, Math.PI / 2, 0, 0);
    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.01, 6, 14),
      cyan
    );
    muzzleRing.rotation.y = Math.PI / 2;
    muzzleRing.position.set(0, -0.02, -1.78);
    g.add(muzzleRing);
    const muzzleGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 10),
      new THREE.MeshBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    muzzleGlow.position.set(0, -0.02, -1.8);
    g.add(muzzleGlow);
    this.muzzleLocal.set(0, -0.02, -1.88);

    // Twin secondary barrels under chin
    for (const side of [-1, 1]) {
      this.addCyl(g, 0.018, 0.022, 0.28, 6, side * 0.1, -0.12, -1.15, cyan, Math.PI / 2, 0, 0);
    }

    // ── Cockpit (recessed, armored) ──
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
      this.glass()
    );
    canopy.scale.set(1.05, 0.65, 1.35);
    canopy.position.set(0, 0.16, -0.28);
    g.add(canopy);
    this.addBox(g, 0.3, 0.04, 0.42, 0, 0.1, -0.28, panel);
    // Canopy frame rails
    this.addBox(g, 0.02, 0.06, 0.38, 0.12, 0.14, -0.28, edge);
    this.addBox(g, 0.02, 0.06, 0.38, -0.12, 0.14, -0.28, edge);

    // Dorsal spine ridge (predator line)
    this.addBox(g, 0.05, 0.1, 1.1, 0, 0.2, 0.1, panel);
    this.addBox(g, 0.08, 0.04, 0.5, 0, 0.24, -0.1, cyan);
    // Sensor fin
    this.addBox(g, 0.02, 0.22, 0.18, 0, 0.34, 0.35, hullMid, 0.15, 0, 0);
    this.addBox(g, 0.015, 0.08, 0.06, 0, 0.46, 0.32, mag);

    // Side cheek armor (angular)
    for (const side of [-1, 1]) {
      this.addBox(g, 0.12, 0.18, 0.85, side * 0.28, 0.02, 0.0, hullDark, 0, 0, side * -0.35);
      this.addBox(g, 0.08, 0.1, 0.55, side * 0.32, -0.02, -0.35, panel, 0, 0, side * -0.25);
      // Intake scoops
      this.addBox(g, 0.1, 0.08, 0.22, side * 0.26, -0.06, -0.15, panel, 0.2, 0, 0);
      this.addBox(g, 0.06, 0.04, 0.12, side * 0.26, -0.06, -0.28, warn);
    }

    // Panel greebles / heat vents
    for (const z of [-0.45, -0.1, 0.25, 0.55]) {
      this.addBox(g, 0.42, 0.008, 0.018, 0, 0.14, z, panel);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        this.addBox(g, 0.04, 0.015, 0.06, side * 0.2, -0.14, 0.2 + i * 0.12, edge);
      }
    }

    // Accent strips
    this.addBox(g, 0.015, 0.025, 1.0, 0.2, 0.06, 0.0, cyan);
    this.addBox(g, 0.015, 0.025, 1.0, -0.2, 0.06, 0.0, cyan);
    this.addBox(g, 0.18, 0.015, 0.03, 0, -0.14, -0.7, mag);

    // ── Forward-swept combat wings ──
    for (const side of [-1, 1]) {
      // Main wing — swept forward aggressively
      this.addBox(g, 1.05, 0.03, 0.32, side * 0.62, -0.02, 0.05, hullLite, 0, side * 0.35, side * 0.22);
      // Leading edge blade
      this.addBox(g, 0.7, 0.02, 0.1, side * 0.75, 0.0, -0.12, edge, 0, side * 0.4, side * 0.15);
      // Wing tip blade
      this.addBox(g, 0.35, 0.02, 0.12, side * 1.05, 0.02, 0.18, cyan, 0, side * 0.25, side * 0.1);
      // Underside hardpoint rail
      this.addBox(g, 0.4, 0.04, 0.08, side * 0.55, -0.08, 0.08, panel);
      // Tip light
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mag);
      tip.position.set(side * 1.15, 0.02, 0.22);
      g.add(tip);
    }

    // Canard / forward fins
    for (const side of [-1, 1]) {
      this.addBox(g, 0.35, 0.02, 0.14, side * 0.28, 0.0, -0.75, hullMid, 0, side * -0.2, side * 0.3);
      this.addBox(g, 0.12, 0.015, 0.06, side * 0.4, 0.01, -0.82, cyan);
    }

    // Vertical stabs — canted outward (aggressive)
    for (const side of [-1, 1]) {
      this.addBox(g, 0.025, 0.32, 0.28, side * 0.16, 0.26, 0.55, hullMid, 0.25, 0, side * 0.35);
      this.addBox(g, 0.02, 0.14, 0.1, side * 0.18, 0.4, 0.5, mag);
      // Rudder stripe
      this.addBox(g, 0.012, 0.2, 0.04, side * 0.17, 0.28, 0.62, cyan);
    }

    // ── Engine cluster ──
    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(side * 0.36, -0.04, 0.55);

      this.addCyl(pod, 0.09, 0.12, 0.5, 10, 0, 0, 0, hullDark, Math.PI / 2, 0, 0);
      this.addCyl(pod, 0.07, 0.085, 0.18, 10, 0, 0, 0.28, panel, Math.PI / 2, 0, 0);
      // Intake lip front of pod
      this.addCyl(pod, 0.1, 0.08, 0.08, 10, 0, 0, -0.28, edge, Math.PI / 2, 0, 0);

      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 0.14, 10), eng);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.z = 0.4;
      pod.add(nozzle);
      this.engineGlow.push(nozzle);

      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.28, 8),
        new THREE.MeshBasicMaterial({
          color: COLORS.magenta,
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      plume.rotation.x = -Math.PI / 2;
      plume.position.z = 0.58;
      pod.add(plume);
      this.engineGlow.push(plume);

      this.addBox(pod, 0.05, 0.14, 0.1, -side * 0.1, 0.06, -0.1, hullMid);
      g.add(pod);
    }

    // Center afterburner
    this.addCyl(g, 0.09, 0.13, 0.32, 10, 0, 0, 0.85, hullDark, Math.PI / 2, 0, 0);
    const mainNoz = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 10), eng);
    mainNoz.rotation.x = Math.PI / 2;
    mainNoz.position.set(0, 0, 1.02);
    g.add(mainNoz);
    this.engineGlow.push(mainNoz);

    const mainPlume = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.35, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff66cc,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    mainPlume.rotation.x = -Math.PI / 2;
    mainPlume.position.set(0, 0, 1.22);
    g.add(mainPlume);
    this.engineGlow.push(mainPlume);

    // Engine ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 8, 20), cyan);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 0, 0.75);
    g.add(ring);

    // Ventral thruster banks
    for (const side of [-1, 1]) {
      this.addBox(g, 0.14, 0.05, 0.18, side * 0.18, -0.16, 0.25, panel);
      this.addBox(g, 0.08, 0.02, 0.1, side * 0.18, -0.19, 0.25, mag);
    }

    // ── Headlights in cheek mounts ──
    const lampMat = this.hull(0x1a2028, 0.5, 0.35);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0xfff2c8,
      emissiveIntensity: 1.4,
      metalness: 0.15,
      roughness: 0.12,
    });
    for (const side of [-1, 1]) {
      this.addBox(g, 0.09, 0.07, 0.1, side * 0.18, -0.02, -1.2, lampMat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.032, 12), lensMat);
      lens.position.set(side * 0.18, -0.02, -1.26);
      g.add(lens);
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.048, 12),
        new THREE.MeshBasicMaterial({
          color: 0xfff0c0,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.set(side * 0.18, -0.02, -1.265);
      g.add(glow);
    }

    // Kill markings / hazard stripe near rear
    this.addBox(g, 0.35, 0.01, 0.04, 0, 0.16, 0.7, warn);

    // Slight overall scale for third-person readability
    g.scale.setScalar(1.12);
    // Scale muzzle local to match body scale
    this.muzzleLocal.multiplyScalar(1.12);
    return g;
  }

  private setupLights(): void {
    this.headTarget.position.set(0, 0, -40);
    this.group.add(this.headTarget);

    this.headLightL = new THREE.SpotLight(0xfff0d0, 52, 58, Math.PI / 7, 0.45, 1.15);
    this.headLightR = new THREE.SpotLight(0xfff0d0, 52, 58, Math.PI / 7, 0.45, 1.15);
    for (const [light, x] of [
      [this.headLightL, -0.18],
      [this.headLightR, 0.18],
    ] as const) {
      light.position.set(x, -0.02, -1.2);
      light.target = this.headTarget;
      this.group.add(light);
    }

    this.fillLight = new THREE.PointLight(0x66ccff, 1.0, 12, 2);
    this.fillLight.position.set(0, 0.25, 0);
    this.group.add(this.fillLight);

    const accent = new THREE.SpotLight(COLORS.cyan, 10, 32, Math.PI / 14, 0.45, 1.3);
    accent.position.set(0, 0, -1.5);
    accent.target = this.headTarget;
    this.group.add(accent);
  }

  /**
   * World-space position of the nose cannon aperture.
   * Use this as main-gun projectile origin (not ship center).
   */
  getMuzzleWorldPosition(out = this._muzzleWorld): THREE.Vector3 {
    out.copy(this.muzzleLocal);
    this.group.localToWorld(out);
    return out;
  }

  /** Forward direction in world space (toward cube / -local Z). */
  getForward(out = new THREE.Vector3()): THREE.Vector3 {
    // After lookAt(0,0,0), local -Z faces the cube
    out.set(0, 0, -1).applyQuaternion(this.group.quaternion).normalize();
    return out;
  }

  update(camera: OrbitalCamera, dt: number): void {
    camera.getShipPosition(this._desired);
    const posLag =
      typeof camera.getShipVisualLagRate === 'function'
        ? camera.getShipVisualLagRate(ORBIT.shipPosLag)
        : ORBIT.shipPosLag;
    const posK = 1 - Math.exp(-posLag * dt);
    this.group.position.lerp(this._desired, posK);

    this._look.set(0, 0, 0);
    this._m.lookAt(this.group.position, this._look, this._up);
    this._targetQuat.setFromRotationMatrix(this._m);
    const rotK = 1 - Math.exp(-ORBIT.shipRotLag * dt);
    this.group.quaternion.slerp(this._targetQuat, rotK);

    this._localOrigin.set(0, 0, 0);
    this.group.worldToLocal(this._localOrigin);
    this.headTarget.position.copy(this._localOrigin);
    this.headLightL.target.updateMatrixWorld();
    this.headLightR.target.updateMatrixWorld();

    this.thrusterPulse += dt * (4 + camera.turnRate * 6);
    const pulse = 0.75 + Math.sin(this.thrusterPulse) * 0.15 + camera.turnRate * 0.2;
    for (const m of this.engineGlow) {
      if (m.material instanceof THREE.MeshStandardMaterial) {
        m.material.emissiveIntensity = 0.75 + pulse * 0.55;
      } else if (m.material instanceof THREE.MeshBasicMaterial) {
        m.material.opacity = 0.5 + pulse * 0.4;
        m.scale.setScalar(0.85 + pulse * 0.3);
      }
    }
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
      if (o instanceof THREE.SpotLight || o instanceof THREE.PointLight) {
        o.dispose();
      }
    });
  }
}
