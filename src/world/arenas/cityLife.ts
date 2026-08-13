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

  const fadeCanvas = document.createElement('canvas');
  fadeCanvas.width = fadeCanvas.height = 256;
  const fctx = fadeCanvas.getContext('2d')!;
  const grd = fctx.createRadialGradient(128, 128, 70, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.62, 'rgba(0,0,0,0.15)');
  grd.addColorStop(1, 'rgba(0,0,0,0.92)');
  fctx.fillStyle = grd;
  fctx.fillRect(0, 0, 256, 256);
  const fadeTex = new THREE.CanvasTexture(fadeCanvas);
  fadeTex.colorSpace = THREE.NoColorSpace;
  const fade = new THREE.Mesh(
    new THREE.CircleGeometry(160, 24),
    new THREE.MeshBasicMaterial({
      map: fadeTex,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    })
  );
  fade.rotation.x = -Math.PI / 2;
  fade.position.y = 0.08;
  fade.name = 'DistanceFade';
  fade.renderOrder = 2;
  fade.matrixAutoUpdate = false;
  fade.updateMatrix();
  root.add(fade);
}
