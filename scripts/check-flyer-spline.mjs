/** Table-level spline sanity using three's centripetal Catmull-Rom. */
import * as THREE from 'three';

const tracks = {
  canyon: [
    [0, 0, 0, 0],
    [0, 0, 80, 0],
    [40, 5, 160, -25],
    [70, 8, 240, -35],
    [20, 6, 320, 15],
    [-50, 4, 400, 30],
    [-30, 0, 500, 10],
    [10, -8, 600, -20],
    [60, -6, 720, -40],
    [40, 0, 820, 0],
    [0, 2, 920, 0],
  ],
  wormhole: [
    [0, 0, 0, 0],
    [0, 0, 60, 0],
    [25, 15, 120, 45],
    [0, 35, 180, 90],
    [-25, 50, 240, 135],
    [0, 55, 300, 180],
    [30, 40, 380, 220],
    [10, 20, 480, 270],
    [-10, 10, 600, 320],
    [0, 5, 720, 350],
    [0, 0, 880, 360],
  ],
};

let failed = 0;
for (const [name, rows] of Object.entries(tracks)) {
  const pts = rows.map((r) => new THREE.Vector3(r[0], r[1], r[2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const len = curve.getLength();
  let maxLat = 0;
  let maxY = 0;
  let maxRoll = 0;
  const n = 64;
  const p0 = curve.getPoint(0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPoint(t);
    maxLat = Math.max(maxLat, Math.hypot(p.x - p0.x, p.z - p0.z));
    maxY = Math.max(maxY, Math.abs(p.y - p0.y));
    const x = t * (rows.length - 1);
    const i0 = Math.min(rows.length - 2, Math.floor(x));
    const f = x - i0;
    const roll = rows[i0][3] + (rows[i0 + 1][3] - rows[i0][3]) * f;
    maxRoll = Math.max(maxRoll, Math.abs(roll));
  }
  const dur = len / 26;
  const pass = len > 800 && len < 1300 && maxLat > 50 && maxRoll > 20 && dur > 32 && dur < 50;
  if (!pass) failed++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${name} S=${len.toFixed(1)}m dur=${dur.toFixed(1)}s lat=${maxLat.toFixed(1)} dY=${maxY.toFixed(1)} roll=${maxRoll}deg`
  );
}
if (failed) process.exit(1);
console.log('canyon+wormhole tables are banked curves');
