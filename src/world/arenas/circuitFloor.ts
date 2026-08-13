/**
 * Cheap unlit cyber floor — one plane + a canvas texture.
 * Avoids custom ShaderMaterial fog includes (those crash some Android WebViews
 * and leave a frozen cube on black).
 */
import * as THREE from 'three';

function paintCircuitTexture(size = 1024): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#07141c';
  ctx.fillRect(0, 0, size, size);

  // Soft radial pit so the cube isn't sitting in a hole
  const glow = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.48);
  glow.addColorStop(0, 'rgba(0, 70, 90, 0.55)');
  glow.addColorStop(0.45, 'rgba(8, 24, 36, 0.15)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);

  const major = size / 16;
  ctx.strokeStyle = 'rgba(0, 210, 230, 0.42)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const x = i * major + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.moveTo(0, x);
    ctx.lineTo(size, x);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 120, 150, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const x = i * (size / 64) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.moveTo(0, x);
    ctx.lineTo(size, x);
  }
  ctx.stroke();

  // Concentric hex-ish rings
  ctx.strokeStyle = 'rgba(180, 40, 200, 0.22)';
  ctx.lineWidth = 2;
  for (let r = size * 0.08; r < size * 0.48; r += size * 0.07) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Circuit pads / stubs
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      const n = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
      const h = n - Math.floor(n);
      const cx = (gx + 0.5) * major;
      const cy = (gy + 0.5) * major;
      if (h > 0.84) {
        ctx.fillStyle = 'rgba(80, 230, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80, 230, 255, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (h > 0.72) {
        ctx.strokeStyle = 'rgba(255, 70, 190, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy);
        ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy + 14);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.anisotropy = 2;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function addCircuitFloor(root: THREE.Group): void {
  const mat = new THREE.MeshBasicMaterial({
    map: paintCircuitTexture(1024),
    toneMapped: false,
    fog: true,
    transparent: false,
    depthWrite: true,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(90, 40), mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.12;
  floor.name = 'CircuitFloor';
  floor.frustumCulled = true;
  floor.matrixAutoUpdate = false;
  floor.updateMatrix();
  root.add(floor);
}
