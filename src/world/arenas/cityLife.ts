import * as THREE from 'three';
import { addCircuitFloor } from './circuitFloor';

/**
 * Distant floor fade + cheap circuit deck. No trains, flyers, or glitter.
 */
export function addCityAmbience(root: THREE.Group): void {
  addCircuitFloor(root);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name !== 'CityStreets' && o.name !== 'CityLots' && o.name !== 'Ground' && o.name !== 'GroundApron' && o.name !== 'HorizonCore') {
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      if ('emissiveIntensity' in m) {
        const std = m as THREE.MeshStandardMaterial;
        std.emissiveIntensity *= 0.7;
      }
    }
  });

  const fade = new THREE.Mesh(
    new THREE.CircleGeometry(180, 16),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uInner: { value: 72 }, uOuter: { value: 145 } },
      vertexShader: `
        varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position,1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying vec3 vW;
        uniform float uInner;
        uniform float uOuter;
        void main(){
          float d = length(vW.xz);
          float a = smoothstep(uInner, uOuter, d);
          gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.96);
        }`,
    })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.y = 0.09;
  fade.name = 'DistanceFade';
  fade.renderOrder = 2;
  root.add(fade);
}
