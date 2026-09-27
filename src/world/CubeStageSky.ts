import * as THREE from "three";

/**
 * Cube-mode stage sky — stage-wide atmosphere (Wave51).
 * Not a local clip bubble around the cube: large inward dome past camera far,
 * fog/clear colors matched to the halo palette so the whole level is "inside" it.
 */
export class CubeStageSky {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private dome: THREE.Mesh;
  private horizonRing: THREE.Mesh;
  private readonly top = new THREE.Color(0x071018);
  private readonly mid = new THREE.Color(0x123044);
  private readonly horizon = new THREE.Color(0x2a6a78);

  constructor() {
    this.group.name = "CubeStageSky";
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: this.top },
        uMid: { value: this.mid },
        uHorizon: { value: this.horizon },
        uPulse: { value: 0 },
        uSeed: { value: 1 },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform float uPulse;
        uniform float uSeed;
        varying vec3 vPos;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453);
        }
        void main() {
          vec3 n = normalize(vPos);
          float h = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.06, 0.42, h));
          col = mix(col, uTop, smoothstep(0.4, 0.95, h));
          float band = exp(-pow((h - 0.16) * 6.2, 2.0));
          col += uHorizon * band * 0.42;
          float star = step(0.993, hash(floor(n.xz * 90.0 + n.y * 14.0)));
          col += vec3(0.75, 0.9, 1.0) * star * (0.32 + 0.28 * sin(uPulse + n.x * 9.0));
          float haze = 0.045 * sin(n.x * 5.5 + uPulse * 0.18 + uSeed);
          // Soft full-sphere wash — reads as stage atmosphere, not a hard shell edge
          float rim = pow(1.0 - abs(n.y), 3.5) * 0.08;
          col += uHorizon * rim;
          float bandY = 0.22 + 0.045 * sin(uPulse * 0.22 + uSeed);
          float aurora = exp(-pow((h - bandY) * 4.6, 2.0));
          float drift = 0.55 + 0.45 * sin(n.x * 2.4 + uPulse * 0.35);
          col += uHorizon * aurora * drift * 0.22;
          gl_FragColor = vec4(col + haze, 1.0);
        }
      `,
    });
    // Inside ArenaDirector camera.far (1100) so the dome is visible, not clipped.
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(980, 32, 20), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -20;
    this.group.add(this.dome);

    // Distant horizon glow ring — not a tight bubble around the cube
    this.horizonRing = new THREE.Mesh(
      new THREE.RingGeometry(220, 268, 64),
      new THREE.MeshBasicMaterial({
        color: 0x44d0c8,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.horizonRing.rotation.x = Math.PI / 2;
    this.horizonRing.position.y = -18;
    this.horizonRing.frustumCulled = false;
    this.group.add(this.horizonRing);
  }

  setStage(levelId: number, name = ""): void {
    const voidish = /void|wormhole|rift/i.test(name);
    const palettes = [
      [0x050910, 0x102433, 0x1d6a72],
      [0x120814, 0x3a1840, 0xc43d78],
      [0x0a0c08, 0x243018, 0x8a7a32],
      [0x081018, 0x16324a, 0x3aa0c8],
      [0x100c08, 0x3a2418, 0xd07a32],
    ];
    const p = voidish ? [0x020204, 0x0a0a12, 0x241838] : palettes[Math.abs(levelId) % palettes.length];
    this.top.setHex(p[0]);
    this.mid.setHex(p[1]);
    this.horizon.setHex(p[2]);
    this.mat.uniforms.uSeed.value = levelId * 17.13;
    const ringMat = this.horizonRing.material as THREE.MeshBasicMaterial;
    ringMat.color.copy(this.horizon);
    ringMat.opacity = voidish ? 0.06 : 0.11;
    ringMat.userData.baseOpacity = ringMat.opacity;
  }

  /** Clear + fog colors so arena fog matches the halo (no nested bubble mismatch). */
  getClearColor(out = new THREE.Color()): THREE.Color {
    return out.copy(this.top);
  }

  getFogColor(out = new THREE.Color()): THREE.Color {
    return out.copy(this.mid).lerp(this.horizon, 0.35);
  }

  /** Apply stage-wide atmosphere: CubeStageSky owns the sky; fog is distant wash. */
  applyStageAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const clear = this.getClearColor();
    renderer.setClearColor(clear.getHex(), 1);
    // Drop equirect/local bubble backgrounds — dome is the level look
    scene.background = null;
    scene.environment = null;
    const fogCol = this.getFogColor();
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogCol);
      scene.fog.near = 70;
      scene.fog.far = 520;
    } else if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(fogCol);
      scene.fog.density = 0.0016;
    } else {
      scene.fog = new THREE.Fog(fogCol.getHex(), 70, 520);
    }
  }

  update(dt: number): void {
    const pulse = (this.mat.uniforms.uPulse.value as number) + dt;
    this.mat.uniforms.uPulse.value = pulse;
    const ringMat = this.horizonRing.material as THREE.MeshBasicMaterial;
    const base = (ringMat.userData.baseOpacity as number) || ringMat.opacity;
    ringMat.opacity = base * (0.72 + 0.28 * Math.sin(pulse * 0.55));
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }
}
