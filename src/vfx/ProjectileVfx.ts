/**
 * Shared high-fidelity projectile / trail builders for weapon systems.
 * Additive multi-layer meshes so UnrealBloom reads strong without muddy lines.
 */
import * as THREE from 'three';

export function addMat(
  color: number,
  opacity = 0.9,
  opts: { depthWrite?: boolean } = {}
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: opts.depthWrite ?? false,
    blending: THREE.AdditiveBlending,
  });
}

export function stdHull(
  color: number,
  metal = 0.82,
  rough = 0.28,
  emissive = 0x000000,
  eInt = 0
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: metal,
    roughness: rough,
    emissive,
    emissiveIntensity: eInt,
  });
}

export function stdEmit(color: number, intensity = 0.7): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.35,
    roughness: 0.22,
  });
}

/** Multi-segment ribbon trail (Line with N points). */
export function makeTrail(
  color: number,
  segs = 6,
  opacity = 0.7
): { line: THREE.Line; positions: Float32Array; set: (i: number, p: THREE.Vector3) => void; show: (on: boolean) => void } {
  const n = Math.max(2, segs);
  const positions = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  line.visible = false;
  line.frustumCulled = false;
  return {
    line,
    positions,
    set(i, p) {
      const i3 = i * 3;
      positions[i3] = p.x;
      positions[i3 + 1] = p.y;
      positions[i3 + 2] = p.z;
    },
    show(on) {
      line.visible = on;
    },
  };
}

/**
 * Layered bolt: hot core + colored sheath + tip flare.
 * Default orientation: local +Z forward (caller rotates group).
 */
export function makeLayeredBolt(opts: {
  coreColor?: number;
  sheathColor?: number;
  length?: number;
  coreR?: number;
  sheathR?: number;
}): THREE.Group {
  const coreColor = opts.coreColor ?? 0xffffff;
  const sheathColor = opts.sheathColor ?? 0x00f0ff;
  const length = opts.length ?? 0.9;
  const coreR = opts.coreR ?? 0.028;
  const sheathR = opts.sheathR ?? 0.07;
  const g = new THREE.Group();

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(coreR * 0.85, coreR, length, 8),
    addMat(coreColor, 1)
  );
  core.rotation.x = Math.PI / 2;
  g.add(core);

  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(sheathR * 0.85, sheathR, length * 0.92, 10),
    addMat(sheathColor, 0.5)
  );
  sheath.rotation.x = Math.PI / 2;
  g.add(sheath);

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(sheathR * 1.55, sheathR * 1.7, length * 0.75, 10),
    addMat(sheathColor, 0.22)
  );
  outer.rotation.x = Math.PI / 2;
  g.add(outer);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(sheathR * 1.1, 10, 10), addMat(coreColor, 0.95));
  tip.position.z = length * 0.48;
  tip.scale.set(0.75, 0.75, 1.35);
  g.add(tip);

  const tail = new THREE.Mesh(new THREE.SphereGeometry(sheathR * 0.9, 8, 8), addMat(sheathColor, 0.45));
  tail.position.z = -length * 0.45;
  g.add(tail);

  return g;
}

/** Fat missile/rocket body with fins + glow core + built-in exhaust stub. */
export function makeMissileBody(color: number, length = 0.65, radius = 0.08): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, length, 4, 10),
    addMat(color, 0.98)
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const sheath = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius * 1.15, length * 0.85, 4, 10),
    addMat(color, 0.35)
  );
  sheath.rotation.x = Math.PI / 2;
  g.add(sheath);

  const core = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius * 0.4, length * 0.75, 3, 6),
    addMat(0xffffff, 0.95)
  );
  core.rotation.x = Math.PI / 2;
  g.add(core);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(radius * 1.05, radius * 2.6, 8), addMat(0xffccff, 0.95));
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -length * 0.55 - radius * 0.7;
  g.add(nose);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, radius * 1.9, radius * 1.35),
      addMat(color, 0.85)
    );
    fin.position.set(Math.cos(a) * radius * 1.05, Math.sin(a) * radius * 1.05, length * 0.3);
    g.add(fin);
  }

  // Hot exhaust nozzle glow (secondary plume is added by MissileWeapon)
  const exhaust = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.85, 10, 10),
    addMat(0xffaa55, 0.9)
  );
  exhaust.position.z = length * 0.5;
  g.add(exhaust);

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.75, radius * 0.8, 8),
    addMat(0x442266, 0.7)
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = length * 0.42;
  g.add(nozzle);

  return g;
}

/** Soft sphere flash for muzzle / detonation. */
export function makeFlash(color: number, r = 0.2): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 12),
    addMat(color, 0)
  );
}

export function orientZForward(
  obj: THREE.Object3D,
  dir: THREE.Vector3,
  q = new THREE.Quaternion(),
  fwd = new THREE.Vector3(0, 0, 1)
): void {
  if (dir.lengthSq() < 1e-8) return;
  const d = dir.clone().normalize();
  q.setFromUnitVectors(fwd, d);
  obj.quaternion.copy(q);
}
