/**
 * Catmull-Rom centerline → arc-length LUT → path frames (p, t, r, u).
 * LUT is built once; runtime sample is binary search + lerp.
 */
import * as THREE from 'three';

export interface FlyerControlPoint {
  pos: THREE.Vector3;
  roll: number;
}

export class PathFrame {
  readonly p = new THREE.Vector3();
  readonly t = new THREE.Vector3();
  readonly r = new THREE.Vector3();
  readonly u = new THREE.Vector3();
  roll = 0;
  s = 0;

  copy(src: PathFrame): this {
    this.p.copy(src.p);
    this.t.copy(src.t);
    this.r.copy(src.r);
    this.u.copy(src.u);
    this.roll = src.roll;
    this.s = src.s;
    return this;
  }
}

const SAMPLES_PER_SEGMENT = 32;
const ALPHA_POW = 0.25; // centripetal α=0.5 on squared distance
const SINGULARITY = 0.92;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(1, 0, 0);

const _p0 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _px = cubicPoly();
const _py = cubicPoly();
const _pz = cubicPoly();
const _tmp = new THREE.Vector3();
const _upRef = new THREE.Vector3();
const _b0 = new THREE.Vector3();
const _n0 = new THREE.Vector3();
const _q = new THREE.Quaternion();

function cubicPoly() {
  let c0 = 0;
  let c1 = 0;
  let c2 = 0;
  let c3 = 0;
  return {
    init(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number) {
      let t1 = (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
      let t2 = (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
      t1 *= dt1;
      t2 *= dt1;
      c0 = x1;
      c1 = t1;
      c2 = -3 * x1 + 3 * x2 - 2 * t1 - t2;
      c3 = 2 * x1 - 2 * x2 + t1 + t2;
    },
    calc(t: number) {
      const t2 = t * t;
      return c0 + c1 * t + c2 * t2 + c3 * t2 * t;
    },
  };
}

function catmullPoint(
  points: THREE.Vector3[],
  u: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const l = points.length;
  const p = (l - 1) * u;
  let intPoint = Math.floor(p);
  let weight = p - intPoint;
  if (weight === 0 && intPoint === l - 1) {
    intPoint = l - 2;
    weight = 1;
  }

  const p1 = points[intPoint];
  const p2 = points[intPoint + 1];
  if (intPoint > 0) {
    _p0.copy(points[intPoint - 1]);
  } else {
    _p0.subVectors(points[0], points[1]).add(points[0]);
  }
  if (intPoint + 2 < l) {
    _p3.copy(points[intPoint + 2]);
  } else {
    _p3.subVectors(points[l - 1], points[l - 2]).add(points[l - 1]);
  }

  let dt0 = Math.pow(_p0.distanceToSquared(p1), ALPHA_POW);
  let dt1 = Math.pow(p1.distanceToSquared(p2), ALPHA_POW);
  let dt2 = Math.pow(p2.distanceToSquared(_p3), ALPHA_POW);
  if (dt1 < 1e-4) dt1 = 1;
  if (dt0 < 1e-4) dt0 = dt1;
  if (dt2 < 1e-4) dt2 = dt1;

  _px.init(_p0.x, p1.x, p2.x, _p3.x, dt0, dt1, dt2);
  _py.init(_p0.y, p1.y, p2.y, _p3.y, dt0, dt1, dt2);
  _pz.init(_p0.z, p1.z, p2.z, _p3.z, dt0, dt1, dt2);
  return out.set(_px.calc(weight), _py.calc(weight), _pz.calc(weight));
}

function rollAt(rolls: number[], u: number): number {
  const n = rolls.length;
  const x = u * (n - 1);
  const i = Math.min(n - 2, Math.floor(x));
  const f = x - i;
  return rolls[i] + (rolls[i + 1] - rolls[i]) * f;
}

export class SplinePath {
  readonly length: number;
  private readonly sArr: Float32Array;
  private readonly frames: PathFrame[];

  constructor(control: FlyerControlPoint[]) {
    if (control.length < 2) {
      throw new Error('SplinePath needs at least 2 control points');
    }
    const pts = control.map((c) => c.pos.clone());
    const rolls = control.map((c) => c.roll);
    const nSeg = pts.length - 1;
    const n = nSeg * SAMPLES_PER_SEGMENT + 1;
    const pos = new Array<THREE.Vector3>(n);
    const roll = new Float32Array(n);
    const sArr = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      pos[i] = catmullPoint(pts, u, new THREE.Vector3());
      roll[i] = rollAt(rolls, u);
      if (i > 0) s += pos[i].distanceTo(pos[i - 1]);
      sArr[i] = s;
    }
    this.length = s;
    this.sArr = sArr;
    this.frames = new Array(n);

    const prevN = WORLD_UP.clone();
    const prevT = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const f = new PathFrame();
      f.p.copy(pos[i]);
      f.s = sArr[i];
      f.roll = roll[i];
      if (i === 0) {
        _tmp.subVectors(pos[1], pos[0]);
      } else if (i === n - 1) {
        _tmp.subVectors(pos[n - 1], pos[n - 2]);
      } else {
        _tmp.subVectors(pos[i + 1], pos[i - 1]);
      }
      if (_tmp.lengthSq() < 1e-10) f.t.copy(prevT);
      else f.t.copy(_tmp).normalize();

      const tDotUp = f.t.dot(WORLD_UP);
      if (Math.abs(tDotUp) > SINGULARITY) {
        _upRef.copy(prevN).addScaledVector(f.t, -prevN.dot(f.t));
        if (_upRef.lengthSq() < 1e-8) {
          _upRef.copy(FALLBACK_UP).addScaledVector(f.t, -f.t.dot(FALLBACK_UP));
        }
        if (_upRef.lengthSq() < 1e-8) _upRef.copy(prevN);
        else _upRef.normalize();
      } else {
        _upRef.copy(WORLD_UP);
      }

      _b0.crossVectors(f.t, _upRef);
      if (_b0.lengthSq() < 1e-8) {
        _b0.crossVectors(f.t, FALLBACK_UP);
      }
      if (_b0.lengthSq() < 1e-8) {
        _b0.set(1, 0, 0);
      } else {
        _b0.normalize();
      }
      _n0.crossVectors(_b0, f.t).normalize();
      if (_n0.dot(prevN) < 0 && Math.abs(tDotUp) > SINGULARITY) {
        _n0.negate();
        _b0.negate();
      }
      prevN.copy(_n0);
      prevT.copy(f.t);

      _q.setFromAxisAngle(f.t, f.roll);
      f.r.copy(_b0).applyQuaternion(_q);
      f.u.copy(_n0).applyQuaternion(_q);
      this.frames[i] = f;
    }
  }

  sample(s: number, out: PathFrame): PathFrame {
    const frames = this.frames;
    const last = frames.length - 1;
    if (s <= 0) return out.copy(frames[0]);
    if (s >= this.length) return out.copy(frames[last]);
    const i = this.findIndex(s);
    const s0 = this.sArr[i];
    const s1 = this.sArr[i + 1];
    const w = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const a = frames[i];
    const b = frames[i + 1];
    out.p.lerpVectors(a.p, b.p, w);
    out.t.copy(a.t).lerp(b.t, w);
    if (out.t.lengthSq() < 1e-10) out.t.copy(a.t);
    else out.t.normalize();
    out.u.copy(a.u).lerp(b.u, w).addScaledVector(out.t, -out.u.dot(out.t));
    if (out.u.lengthSq() < 1e-10) out.u.copy(a.u);
    else out.u.normalize();
    out.r.crossVectors(out.t, out.u);
    if (out.r.lengthSq() < 1e-10) out.r.copy(a.r);
    else out.r.normalize();
    out.u.crossVectors(out.r, out.t).normalize();
    out.roll = a.roll + (b.roll - a.roll) * w;
    out.s = s;
    return out;
  }

  frameAt(s: number, out: PathFrame): PathFrame {
    return this.sample(s, out);
  }

  /**
   * Wide bank-aware strip + rails + chevrons so stills read sweeps/loops.
   * Vertex color shifts toward magenta as |roll| grows.
   */
  makeDebugRibbon(color = 0x66ffaa, width = 2.6): THREE.Group {
    const group = new THREE.Group();
    group.name = 'FlyerDebugRibbon';
    const frames = this.frames;
    const n = frames.length;
    if (n < 2) return group;

    const half = width * 0.5;
    const pos = new Float32Array(n * 6);
    const col = new Float32Array(n * 6);
    const idx: number[] = [];
    const base = new THREE.Color(color);
    const bankC = new THREE.Color(0xff3aa8);
    const tmp = new THREE.Color();
    const left = new Float32Array(n * 3);
    const right = new Float32Array(n * 3);
    const mid = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const f = frames[i];
      tmp.copy(base).lerp(bankC, Math.min(1, Math.abs(f.roll) / 0.7));
      const ox = f.r.x * half;
      const oy = f.r.y * half;
      const oz = f.r.z * half;
      const i6 = i * 6;
      pos[i6] = f.p.x - ox;
      pos[i6 + 1] = f.p.y - oy;
      pos[i6 + 2] = f.p.z - oz;
      pos[i6 + 3] = f.p.x + ox;
      pos[i6 + 4] = f.p.y + oy;
      pos[i6 + 5] = f.p.z + oz;
      col[i6] = col[i6 + 3] = tmp.r;
      col[i6 + 1] = col[i6 + 4] = tmp.g;
      col[i6 + 2] = col[i6 + 5] = tmp.b;
      left[i * 3] = pos[i6];
      left[i * 3 + 1] = pos[i6 + 1];
      left[i * 3 + 2] = pos[i6 + 2];
      right[i * 3] = pos[i6 + 3];
      right[i * 3 + 1] = pos[i6 + 4];
      right[i * 3 + 2] = pos[i6 + 5];
      mid[i * 3] = f.p.x;
      mid[i * 3 + 1] = f.p.y;
      mid[i * 3 + 2] = f.p.z;
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    const strip = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      })
    );
    strip.frustumCulled = false;
    strip.renderOrder = 1;
    group.add(strip);

    const railMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
      fog: false,
      depthTest: true,
    });
    const mkLine = (arr: Float32Array, mat: THREE.LineBasicMaterial) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const line = new THREE.Line(g, mat);
      line.frustumCulled = false;
      line.renderOrder = 2;
      return line;
    };
    group.add(mkLine(left, railMat));
    group.add(mkLine(right, railMat.clone()));
    group.add(
      mkLine(
        mid,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          toneMapped: false,
          fog: false,
        })
      )
    );

    const step = 10;
    const chevPos: number[] = [];
    const chevIdx: number[] = [];
    let baseIdx = 0;
    for (let i = step; i < n - 1; i += step) {
      const f = frames[i];
      const d = 1.35;
      const w = 0.62;
      const p0x = f.p.x + f.t.x * d;
      const p0y = f.p.y + f.t.y * d;
      const p0z = f.p.z + f.t.z * d;
      const p1x = f.p.x - f.r.x * w - f.t.x * d * 0.4;
      const p1y = f.p.y - f.r.y * w - f.t.y * d * 0.4;
      const p1z = f.p.z - f.r.z * w - f.t.z * d * 0.4;
      const p2x = f.p.x + f.r.x * w - f.t.x * d * 0.4;
      const p2y = f.p.y + f.r.y * w - f.t.y * d * 0.4;
      const p2z = f.p.z + f.r.z * w - f.t.z * d * 0.4;
      chevPos.push(p0x, p0y, p0z, p1x, p1y, p1z, p2x, p2y, p2z);
      chevIdx.push(baseIdx, baseIdx + 1, baseIdx + 2);
      baseIdx += 3;
    }
    if (chevPos.length > 0) {
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(chevPos, 3));
      cg.setIndex(chevIdx);
      const chev = new THREE.Mesh(
        cg,
        new THREE.MeshBasicMaterial({
          color: 0xfff6c8,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
          transparent: true,
          opacity: 0.95,
        })
      );
      chev.frustumCulled = false;
      chev.renderOrder = 3;
      group.add(chev);
    }

    const tickPos: number[] = [];
    const tickCol: number[] = [];
    const cU = new THREE.Color(0xffee88);
    const cA = new THREE.Color(color);
    for (let i = 0; i < n; i += 12) {
      const f = frames[i];
      const h = 1.7;
      tickPos.push(f.p.x, f.p.y, f.p.z, f.p.x + f.u.x * h, f.p.y + f.u.y * h, f.p.z + f.u.z * h);
      tickCol.push(cU.r, cU.g, cU.b, cA.r, cA.g, cA.b);
    }
    if (tickPos.length >= 6) {
      const tGeom = new THREE.BufferGeometry();
      tGeom.setAttribute('position', new THREE.Float32BufferAttribute(tickPos, 3));
      tGeom.setAttribute('color', new THREE.Float32BufferAttribute(tickCol, 3));
      const ticks = new THREE.LineSegments(
        tGeom,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          toneMapped: false,
          fog: false,
        })
      );
      ticks.name = 'FlyerRibbonUp';
      ticks.frustumCulled = false;
      ticks.renderOrder = 2;
      group.add(ticks);
    }

    return group;
  }

  private findIndex(s: number): number {
    const arr = this.sArr;
    let lo = 0;
    let hi = arr.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}
