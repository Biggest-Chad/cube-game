/**
 * Cheap unlit cyber floor — one plane, one shader.
 * Replaces the stripped hex/square grid meshes without their triangle cost.
 */
import * as THREE from 'three';

export function addCircuitFloor(root: THREE.Group): void {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: false,
    uniforms: {
      uFogNear: { value: 38 },
      uFogFar: { value: 130 },
    },
    vertexShader: `
      varying vec3 vW;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float line(float x, float w) {
        return smoothstep(w, 0.0, abs(x));
      }

      void main() {
        vec2 p = vW.xz;
        float dist = length(p);

        // Navy void, not crushed black
        vec3 col = vec3(0.012, 0.03, 0.045);

        // Major circuit grid
        vec2 g1 = abs(fract(p / 4.0) - 0.5);
        float major = line(min(g1.x, g1.y) * 4.0, 0.045);
        col += vec3(0.0, 0.55, 0.62) * major * 0.55;

        // Fine traces
        vec2 g2 = abs(fract(p / 1.0) - 0.5);
        float fine = line(min(g2.x, g2.y) * 1.0, 0.028);
        col += vec3(0.0, 0.28, 0.38) * fine * 0.22;

        // Hex-ish concentric rings around the combat pit
        float rings = abs(fract(dist / 6.5) - 0.5);
        col += vec3(0.35, 0.08, 0.42) * line(rings * 6.5, 0.07) * 0.18;

        // Sparse "pad" nodes
        vec2 cell = floor(p / 4.0);
        float n = hash(cell);
        if (n > 0.82) {
          vec2 lp = fract(p / 4.0) - 0.5;
          float pad = smoothstep(0.18, 0.08, length(lp));
          col += vec3(0.15, 0.85, 0.95) * pad * 0.35;
        } else if (n > 0.7) {
          vec2 lp = fract(p / 4.0) - 0.5;
          float stub = line(lp.x, 0.03) * step(abs(lp.y), 0.28)
                     + line(lp.y, 0.03) * step(abs(lp.x), 0.28);
          col += vec3(0.9, 0.25, 0.7) * clamp(stub, 0.0, 1.0) * 0.22;
        }

        // Soft pit glow so the cube doesn't sit in a hole
        float pit = exp(-dist * dist / 220.0);
        col += vec3(0.02, 0.08, 0.1) * pit;

        float a = 0.92 * smoothstep(95.0, 28.0, dist);
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }
    `,
  });

  const floor = new THREE.Mesh(new THREE.CircleGeometry(110, 48), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.12;
  floor.name = 'CircuitFloor';
  floor.renderOrder = 1;
  floor.frustumCulled = true;
  floor.matrixAutoUpdate = false;
  floor.updateMatrix();
  root.add(floor);
}
