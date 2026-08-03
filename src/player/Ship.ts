import * as THREE from 'three';
import { COLORS, ORBIT } from '../data/constants';
import type { OrbitalCamera } from './OrbitalCamera';

/**
 * High-detail procedural interceptor — layered hull plates, canopy, pods, headlights.
 */
export class Ship {
  readonly group = new THREE.Group();
  private body: THREE.Group;
  private engineGlow: THREE.Mesh[] = [];
  private headLightL!: THREE.SpotLight;
  private headLightR!: THREE.SpotLight;
  private headTarget = new THREE.Object3D();
  private fillLight!: THREE.PointLight;
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

  private hull(color = 0x1a2430, metal = 0.72, rough = 0.38): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      metalness: metal,
      roughness: rough,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
  }

  private accent(color: number, intensity = 0.45): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      metalness: 0.35,
      roughness: 0.28,
    });
  }

  private glass(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x6ad4ef,
      metalness: 0.15,
      roughness: 0.12,
      transparent: true,
      opacity: 0.72,
      emissive: 0x1a4050,
      emissiveIntensity: 0.35,
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
    const hullDark = this.hull(0x121820, 0.78, 0.32);
    const hullMid = this.hull(0x1e2a38, 0.7, 0.4);
    const hullLight = this.hull(0x2a3a4c, 0.65, 0.45);
    const panel = this.hull(0x0c1018, 0.85, 0.5);
    const cyan = this.accent(COLORS.cyan, 0.4);
    const mag = this.accent(COLORS.magenta, 0.5);
    const white = this.accent(COLORS.white, 0.55);
    const eng = this.accent(0xff66cc, 0.9);

    // —— Main fuselage (multi-step tapered look) ——
    this.addBox(g, 0.42, 0.28, 1.35, 0, 0, 0.05, hullMid);
    this.addBox(g, 0.5, 0.18, 1.0, 0, 0.08, 0.1, hullLight);
    this.addBox(g, 0.36, 0.22, 0.55, 0, -0.02, -0.55, hullDark); // nose base
    this.addBox(g, 0.28, 0.16, 0.4, 0, 0.02, -0.85, hullMid);

    // Nose cone / sensor spike
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.42, 8), hullDark);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.01, -1.15);
    g.add(nose);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), white);
    tip.position.set(0, 0.01, -1.38);
    g.add(tip);

    // Dorsal spine + antenna
    this.addBox(g, 0.06, 0.12, 0.9, 0, 0.2, 0.05, panel);
    this.addCyl(g, 0.015, 0.015, 0.35, 6, 0, 0.38, -0.15, cyan, 0, 0, 0);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), cyan);
    dish.position.set(0, 0.52, -0.15);
    g.add(dish);

    // Cockpit canopy
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this.glass());
    canopy.scale.set(1.1, 0.7, 1.4);
    canopy.position.set(0, 0.18, -0.35);
    g.add(canopy);
    this.addBox(g, 0.32, 0.04, 0.45, 0, 0.12, -0.35, panel); // canopy frame

    // Side armor plates
    this.addBox(g, 0.08, 0.2, 0.7, 0.26, 0, 0.05, hullDark, 0, 0, 0.12);
    this.addBox(g, 0.08, 0.2, 0.7, -0.26, 0, 0.05, hullDark, 0, 0, -0.12);

    // Panel line greebles
    for (const z of [-0.2, 0.15, 0.45]) {
      this.addBox(g, 0.44, 0.01, 0.02, 0, 0.15, z, panel);
      this.addBox(g, 0.01, 0.16, 0.5, 0.2, 0, z - 0.1, panel);
      this.addBox(g, 0.01, 0.16, 0.5, -0.2, 0, z - 0.1, panel);
    }

    // Accent light strips
    this.addBox(g, 0.02, 0.03, 0.8, 0.22, 0.05, 0.05, cyan);
    this.addBox(g, 0.02, 0.03, 0.8, -0.22, 0.05, 0.05, cyan);
    this.addBox(g, 0.2, 0.02, 0.04, 0, -0.12, -0.5, mag);

    // Wings / fins
    const wingMat = hullLight;
    this.addBox(g, 0.95, 0.035, 0.38, 0.55, -0.02, 0.25, wingMat, 0, 0.15, 0.18);
    this.addBox(g, 0.95, 0.035, 0.38, -0.55, -0.02, 0.25, wingMat, 0, -0.15, -0.18);
    this.addBox(g, 0.5, 0.025, 0.22, 0.7, 0.02, 0.35, cyan, 0, 0.2, 0.1);
    this.addBox(g, 0.5, 0.025, 0.22, -0.7, 0.02, 0.35, cyan, 0, -0.2, -0.1);

    // Vertical stabilizers
    this.addBox(g, 0.03, 0.28, 0.32, 0.18, 0.22, 0.45, hullMid, 0.2, 0, 0.15);
    this.addBox(g, 0.03, 0.28, 0.32, -0.18, 0.22, 0.45, hullMid, 0.2, 0, -0.15);
    this.addBox(g, 0.02, 0.12, 0.08, 0.18, 0.32, 0.4, mag);
    this.addBox(g, 0.02, 0.12, 0.08, -0.18, 0.32, 0.4, mag);

    // Engine pods (port / starboard)
    for (const side of [-1, 1]) {
      const pod = new THREE.Group();
      pod.position.set(side * 0.38, -0.06, 0.35);
      this.addCyl(pod, 0.1, 0.12, 0.55, 10, 0, 0, 0, hullDark, Math.PI / 2, 0, 0);
      this.addCyl(pod, 0.08, 0.09, 0.2, 10, 0, 0, 0.28, panel, Math.PI / 2, 0, 0);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.12, 10), eng);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.z = 0.42;
      pod.add(nozzle);
      this.engineGlow.push(nozzle);

      const glowCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 8, 8),
        new THREE.MeshBasicMaterial({
          color: COLORS.magenta,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glowCore.position.z = 0.5;
      pod.add(glowCore);
      this.engineGlow.push(glowCore);

      // Pod pylons
      this.addBox(pod, 0.04, 0.12, 0.08, -side * 0.08, 0.08, -0.05, hullMid);
      g.add(pod);
    }

    // Center rear thruster
    this.addCyl(g, 0.1, 0.14, 0.28, 10, 0, 0, 0.72, hullDark, Math.PI / 2, 0, 0);
    const mainNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.14, 10), eng);
    mainNozzle.rotation.x = Math.PI / 2;
    mainNozzle.position.set(0, 0, 0.88);
    g.add(mainNozzle);
    this.engineGlow.push(mainNozzle);

    // Weapon hardpoints under chin
    this.addBox(g, 0.1, 0.06, 0.25, 0.12, -0.12, -0.55, panel);
    this.addBox(g, 0.1, 0.06, 0.25, -0.12, -0.12, -0.55, panel);
    this.addCyl(g, 0.025, 0.025, 0.2, 6, 0.12, -0.12, -0.7, cyan, Math.PI / 2, 0, 0);
    this.addCyl(g, 0.025, 0.025, 0.2, 6, -0.12, -0.12, -0.7, cyan, Math.PI / 2, 0, 0);

    // Ventral thrusters
    this.addBox(g, 0.15, 0.05, 0.15, 0.2, -0.16, 0.1, panel);
    this.addBox(g, 0.15, 0.05, 0.15, -0.2, -0.16, 0.1, panel);

    // —— Headlight housings (front) ——
    const lampMat = this.hull(0x222830, 0.5, 0.4);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0xffffee,
      emissive: 0xfff5d0,
      emissiveIntensity: 1.2,
      metalness: 0.2,
      roughness: 0.15,
    });
    for (const side of [-1, 1]) {
      this.addBox(g, 0.1, 0.08, 0.12, side * 0.16, -0.04, -0.95, lampMat);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), lensMat);
      lens.position.set(side * 0.16, -0.04, -1.02);
      g.add(lens);
      // glow disc
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.05, 12),
        new THREE.MeshBasicMaterial({
          color: 0xfff2c8,
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      glow.position.set(side * 0.16, -0.04, -1.025);
      g.add(glow);
    }

    // Ring detail near engines
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.015, 8, 20),
      cyan
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0, 0, 0.65);
    g.add(ring);

    // Scale up slightly for third-person readability
    g.scale.setScalar(1.15);
    return g;
  }

  private setupLights(): void {
    this.headTarget.position.set(0, 0, -40);
    this.group.add(this.headTarget);

    // Twin frontal spotlights — bright, long throw onto the cube face
    this.headLightL = new THREE.SpotLight(0xfff0d0, 48, 55, Math.PI / 7, 0.45, 1.15);
    this.headLightR = new THREE.SpotLight(0xfff0d0, 48, 55, Math.PI / 7, 0.45, 1.15);
    for (const [light, x] of [
      [this.headLightL, -0.18],
      [this.headLightR, 0.18],
    ] as const) {
      light.position.set(x, -0.02, -1.05);
      light.target = this.headTarget;
      light.castShadow = false;
      this.group.add(light);
    }

    // Soft local fill so ship self-illuminates slightly in void
    this.fillLight = new THREE.PointLight(0x66ccff, 1.1, 14, 2);
    this.fillLight.position.set(0, 0.3, 0);
    this.group.add(this.fillLight);

    // Narrow cyan accent beam down the nose (Tron read)
    const accent = new THREE.SpotLight(COLORS.cyan, 8, 30, Math.PI / 12, 0.5, 1.4);
    accent.position.set(0, 0.05, -1.1);
    accent.target = this.headTarget;
    this.group.add(accent);
  }

  update(camera: OrbitalCamera, dt: number): void {
    // Orbit truth for combat; visual lag shrinks at high turn rate (anti rubber-band)
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

    // Aim headlights at cube center (local-space target)
    this._localOrigin.set(0, 0, 0);
    this.group.worldToLocal(this._localOrigin);
    this.headTarget.position.copy(this._localOrigin);
    this.headLightL.target.updateMatrixWorld();
    this.headLightR.target.updateMatrixWorld();

    // Engine pulse with turn rate
    this.thrusterPulse += dt * (4 + camera.turnRate * 6);
    const pulse = 0.75 + Math.sin(this.thrusterPulse) * 0.15 + camera.turnRate * 0.2;
    for (const m of this.engineGlow) {
      if (m.material instanceof THREE.MeshStandardMaterial) {
        m.material.emissiveIntensity = 0.7 + pulse * 0.5;
      } else if (m.material instanceof THREE.MeshBasicMaterial) {
        m.material.opacity = 0.55 + pulse * 0.35;
        m.scale.setScalar(0.9 + pulse * 0.25);
      }
    }
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  getForward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 0, 0).sub(this.group.position).normalize();
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
