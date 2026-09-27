/**
 * Short between-level camera reels.
 *
 * Sphere frame matches OrbitalCamera.spherePos: yaw 0 sits on +Z, positive yaw
 * swings toward +X, positive pitch raises the camera. The ship always ends at
 * yaw (0.85 + face), pitch 0.28, radiusMul 1 — the combat seat.
 *
 * `frame` places the camera in metres relative to the ship (outward / side / up)
 * so a chase stays readable on every cube size. Null frame uses the sphere.
 * A beat with `cut` holds the previous pose, then snaps.
 */

export type IntroEase = 'smooth' | 'in' | 'out';

export interface IntroFrame {
  /** Metres along the ship-from-origin ray. Negative steps toward the cube. */
  out: number;
  /** Metres to the ship's side. */
  side: number;
  up: number;
}

export interface IntroBeat {
  t: number;
  yaw: number;
  pitch: number;
  radiusMul: number;
  lookY: number;
  /** 0 looks at the cube origin, 1 looks at the ship. */
  lookAt: number;
  fov: number;
  roll: number;
  shake: number;
  shipYaw: number;
  shipPitch: number;
  shipRadiusMul: number;
  lag: number;
  cut?: boolean;
  ease?: IntroEase;
  frame?: IntroFrame;
}

export interface IntroSpan {
  a: IntroBeat;
  b: IntroBeat;
  /** Eased 0..1 from a toward b. 0 holds a (including the hold before a cut). */
  u: number;
  snap: boolean;
}

export interface RolledIntro {
  id: string;
  title: string;
  duration: number;
  /** Absolute combat-seat yaw, including the random face. */
  dockYaw: number;
  span(time: number): IntroSpan;
}

const TAIL: IntroFrame = { out: 8.8, side: 2.4, up: 2.45 };
const FLANK: IntroFrame = { out: 3.2, side: 6.6, up: 1.85 };
const NOSE: IntroFrame = { out: -6.4, side: 2.8, up: 1.55 };

const DOCK_YAW = 0.85;

interface ReelDef {
  id: string;
  title: string;
  beats: IntroBeat[];
}

function beat(p: Partial<IntroBeat> & Pick<IntroBeat, 't' | 'yaw' | 'shipYaw'>): IntroBeat {
  return {
    pitch: 0.36,
    radiusMul: 1.28,
    lookY: 0,
    lookAt: 0.1,
    fov: 55,
    roll: 0,
    shake: 0,
    shipPitch: 0.3,
    shipRadiusMul: 1.04,
    lag: 22,
    ease: 'smooth',
    ...p,
  };
}

function dock(t: number): IntroBeat {
  return beat({
    t,
    yaw: DOCK_YAW,
    pitch: 0.34,
    radiusMul: 1.24,
    lookY: 0,
    lookAt: 0.12,
    fov: 55,
    roll: 0,
    shake: 0,
    shipYaw: DOCK_YAW,
    shipPitch: 0.28,
    shipRadiusMul: 1,
    lag: 16,
    ease: 'out',
    frame: TAIL,
  });
}

const REELS: ReelDef[] = [
  {
    id: 'approach',
    title: 'APPROACH',
    beats: [
      beat({
        t: 0,
        yaw: -1.25,
        pitch: 0.98,
        radiusMul: 1.9,
        fov: 64,
        roll: 0.1,
        lookAt: 0.06,
        shipYaw: -1.85,
        shipPitch: 0.22,
        shipRadiusMul: 1.08,
        lag: 12,
      }),
      beat({
        t: 2.15,
        yaw: 0.05,
        pitch: 0.52,
        radiusMul: 1.28,
        fov: 56,
        roll: -0.06,
        lookAt: 0.18,
        shipYaw: -0.15,
        shipPitch: 0.38,
        ease: 'out',
        lag: 14,
      }),
      beat({
        t: 3.55,
        yaw: 0.55,
        pitch: 0.36,
        radiusMul: 0.58,
        fov: 46,
        lookAt: 0.08,
        shipYaw: 1.35,
        shipPitch: 0.34,
        shipRadiusMul: 1.12,
        ease: 'out',
      }),
      beat({
        t: 4.35,
        yaw: 0.78,
        pitch: 0.32,
        radiusMul: 0.64,
        fov: 48,
        lookAt: 0.1,
        shipYaw: 1.55,
        shipPitch: 0.3,
        shipRadiusMul: 1.08,
      }),
      dock(5.35),
    ],
  },
  {
    id: 'belly',
    title: 'UNDERBELLY',
    beats: [
      beat({
        t: 0,
        yaw: -0.55,
        pitch: -0.5,
        radiusMul: 1.12,
        fov: 58,
        roll: -0.24,
        lookY: 1.4,
        lookAt: 0.06,
        shipYaw: 0.85,
        shipPitch: 0.58,
        shipRadiusMul: 1.22,
        lag: 14,
      }),
      beat({
        t: 1.9,
        yaw: 0.7,
        pitch: -0.46,
        radiusMul: 0.7,
        fov: 46,
        roll: 0.18,
        lookY: 1.1,
        lookAt: 0.08,
        shipYaw: 1.85,
        shipPitch: 0.5,
        shipRadiusMul: 1.2,
        shake: 0.008,
      }),
      beat({
        t: 3.45,
        yaw: 1.25,
        pitch: 0.2,
        radiusMul: 1.32,
        fov: 56,
        roll: -0.04,
        lookY: 0.2,
        shipYaw: 1.05,
        shipPitch: 0.32,
        ease: 'in',
        lag: 16,
      }),
      dock(5.05),
    ],
  },
  {
    id: 'whip',
    title: 'FAST ORBIT',
    beats: [
      beat({
        t: 0,
        yaw: -2.35,
        pitch: 0.34,
        radiusMul: 1.42,
        fov: 66,
        roll: 0.42,
        lookAt: 0.14,
        shipYaw: -1.45,
        shipPitch: 0.3,
        shipRadiusMul: 1.08,
        lag: 28,
      }),
      beat({
        t: 1.05,
        yaw: -1.7,
        pitch: 0.3,
        radiusMul: 1.36,
        fov: 70,
        roll: 0.22,
        shipYaw: -0.85,
        ease: 'in',
        lag: 34,
      }),
      beat({
        t: 2.25,
        yaw: 1.15,
        pitch: 0.18,
        radiusMul: 0.7,
        fov: 68,
        roll: -0.4,
        lookAt: 0.1,
        shipYaw: 0.15,
        shipPitch: 0.36,
        shipRadiusMul: 1.16,
        ease: 'in',
        lag: 40,
        shake: 0.012,
      }),
      beat({
        t: 3.45,
        yaw: 0.7,
        pitch: 0.34,
        radiusMul: 1.18,
        fov: 52,
        roll: 0.05,
        shipYaw: 0.62,
        ease: 'out',
        lag: 16,
      }),
      dock(4.95),
    ],
  },
  {
    id: 'cuts',
    title: 'HARD CUT',
    beats: [
      beat({
        t: 0,
        yaw: -0.9,
        pitch: 0.82,
        radiusMul: 1.95,
        fov: 62,
        roll: 0.05,
        shipYaw: -1.4,
        shipPitch: 0.34,
        shipRadiusMul: 1.12,
        lag: 12,
      }),
      beat({
        t: 1.3,
        yaw: -0.2,
        pitch: 0.64,
        radiusMul: 1.72,
        fov: 60,
        shipYaw: -0.45,
        shipPitch: 0.36,
      }),
      beat({
        t: 1.34,
        yaw: 0.42,
        pitch: 0.42,
        radiusMul: 0.64,
        fov: 50,
        roll: 0.1,
        lookY: 0.4,
        lookAt: 0.12,
        shake: 0.012,
        shipYaw: 1.35,
        shipPitch: 0.34,
        shipRadiusMul: 1.18,
        cut: true,
        lag: 30,
      }),
      beat({
        t: 2.45,
        yaw: 0.7,
        pitch: 0.36,
        radiusMul: 0.7,
        fov: 48,
        roll: -0.08,
        shake: 0.008,
        lookY: 0.2,
        lookAt: 0.14,
        shipYaw: 1.6,
        shipPitch: 0.3,
      }),
      beat({
        t: 2.5,
        yaw: 1.65,
        pitch: 0.92,
        radiusMul: 1.48,
        fov: 54,
        roll: -0.14,
        lookAt: 0.16,
        shipYaw: 0.95,
        shipPitch: 0.34,
        cut: true,
        lag: 18,
      }),
      beat({
        t: 4.05,
        yaw: 0.95,
        pitch: 0.4,
        radiusMul: 1.22,
        fov: 55,
        shipYaw: 0.78,
        shipPitch: 0.3,
        ease: 'out',
      }),
      dock(5.2),
    ],
  },
  {
    id: 'drop',
    title: 'TOP DROP',
    beats: [
      beat({
        t: 0,
        yaw: 0.15,
        pitch: 1.24,
        radiusMul: 0.74,
        fov: 50,
        roll: 0.32,
        lookAt: 0.04,
        shipYaw: -1.15,
        shipPitch: 0.24,
        shipRadiusMul: 1.16,
        lag: 14,
      }),
      beat({
        t: 0.85,
        yaw: 0.4,
        pitch: 1.16,
        radiusMul: 0.7,
        fov: 48,
        roll: 0.18,
        shipYaw: -0.55,
        shipPitch: 0.28,
        shipRadiusMul: 1.12,
      }),
      beat({
        t: 2.85,
        yaw: 1.2,
        pitch: 0.4,
        radiusMul: 1.16,
        fov: 48,
        roll: -0.1,
        lookAt: 0.24,
        shipYaw: 0.35,
        shipPitch: 0.32,
        ease: 'in',
        lag: 20,
      }),
      beat({
        t: 4.15,
        yaw: 0.9,
        pitch: 0.36,
        radiusMul: 1.2,
        fov: 54,
        shipYaw: 0.7,
        shipPitch: 0.29,
        ease: 'out',
      }),
      dock(5.2),
    ],
  },
  {
    id: 'wing',
    title: 'WINGMAN',
    beats: [
      beat({
        t: 0,
        yaw: 0,
        frame: NOSE,
        fov: 48,
        roll: -0.1,
        lookAt: 0.82,
        lookY: 0.1,
        shipYaw: -1.55,
        shipPitch: 0.32,
        shipRadiusMul: 1.06,
        lag: 16,
      }),
      beat({
        t: 1.7,
        yaw: 0,
        frame: { out: 2.4, side: 7.4, up: 1.2 },
        fov: 50,
        roll: 0.14,
        lookAt: 0.78,
        shipYaw: -0.35,
        shipPitch: 0.4,
        shipRadiusMul: 1.04,
        ease: 'smooth',
      }),
      beat({
        t: 3.15,
        yaw: 0,
        frame: { out: 5.5, side: 4.2, up: 2.1 },
        fov: 52,
        roll: -0.04,
        lookAt: 0.48,
        shipYaw: 0.4,
        shipPitch: 0.3,
        ease: 'out',
      }),
      beat({
        t: 4.25,
        yaw: 0,
        frame: TAIL,
        fov: 55,
        lookAt: 0.28,
        shipYaw: 0.72,
        shipPitch: 0.28,
        shipRadiusMul: 1.01,
      }),
      dock(5.25),
    ],
  },
  {
    id: 'reveal',
    title: 'FAR SIDE',
    beats: [
      beat({
        t: 0,
        yaw: -1.15 + Math.PI,
        pitch: 0.22,
        radiusMul: 1.62,
        fov: 60,
        roll: -0.08,
        lookAt: 0.04,
        shipYaw: -1.15,
        shipPitch: 0.3,
        shipRadiusMul: 1.18,
        lag: 13,
      }),
      beat({
        t: 2.6,
        yaw: 0.2,
        pitch: 0.46,
        radiusMul: 0.72,
        fov: 48,
        roll: 0.12,
        lookAt: 0.22,
        shipYaw: 1.45,
        shipPitch: 0.38,
        shipRadiusMul: 1.18,
        ease: 'in',
        lag: 18,
      }),
      beat({
        t: 4.0,
        yaw: 0.55,
        pitch: 0.38,
        radiusMul: 1.02,
        fov: 52,
        lookAt: 0.28,
        shipYaw: 1.35,
        shipPitch: 0.32,
        shipRadiusMul: 1.18,
        ease: 'out',
      }),
      dock(5.15),
    ],
  },
  {
    id: 'slash',
    title: 'LOW SLASH',
    beats: [
      beat({
        t: 0,
        yaw: -1.35,
        pitch: -0.2,
        radiusMul: 0.78,
        fov: 52,
        roll: -0.28,
        lookY: 0.35,
        lookAt: 0.06,
        shipYaw: 0.55,
        shipPitch: 0.52,
        shipRadiusMul: 1.2,
        lag: 18,
      }),
      beat({
        t: 1.65,
        yaw: 0.35,
        pitch: -0.12,
        radiusMul: 0.7,
        fov: 46,
        roll: 0.22,
        lookY: 0.25,
        shipYaw: 1.35,
        shipPitch: 0.44,
        ease: 'smooth',
        shake: 0.006,
      }),
      beat({
        t: 1.7,
        yaw: 1.45,
        pitch: 0.98,
        radiusMul: 1.55,
        fov: 58,
        roll: -0.06,
        lookAt: 0.12,
        shipYaw: 0.85,
        shipPitch: 0.34,
        cut: true,
        lag: 16,
      }),
      beat({
        t: 3.55,
        yaw: 0.95,
        pitch: 0.42,
        radiusMul: 1.24,
        fov: 54,
        shipYaw: 0.78,
        shipPitch: 0.3,
        ease: 'out',
      }),
      dock(4.9),
    ],
  },
  {
    id: 'barrel',
    title: 'BARREL',
    beats: [
      beat({
        t: 0,
        yaw: -1.45,
        pitch: 0.48,
        radiusMul: 1.05,
        fov: 58,
        roll: 0.5,
        lookAt: 0.12,
        shipYaw: -0.55,
        shipPitch: 0.26,
        shipRadiusMul: 1.16,
        lag: 16,
      }),
      beat({
        t: 1.45,
        yaw: -0.2,
        pitch: 0.22,
        radiusMul: 0.68,
        fov: 62,
        roll: -0.52,
        lookAt: 0.1,
        shipYaw: 0.85,
        shipPitch: 0.4,
        shipRadiusMul: 1.18,
        ease: 'smooth',
      }),
      beat({
        t: 2.9,
        yaw: 0.72,
        pitch: 0.4,
        radiusMul: 0.9,
        fov: 50,
        roll: 0.22,
        lookAt: 0.16,
        shipYaw: 0.35,
        shipPitch: 0.3,
        ease: 'in',
      }),
      dock(4.7),
    ],
  },
  {
    id: 'punch',
    title: 'PULL BACK',
    beats: [
      beat({
        t: 0,
        yaw: 0.2,
        pitch: 0.42,
        radiusMul: 0.62,
        fov: 50,
        roll: 0.08,
        lookY: 0.35,
        lookAt: 0.06,
        shake: 0.008,
        shipYaw: 1.75,
        shipPitch: 0.36,
        shipRadiusMul: 1.22,
        lag: 14,
      }),
      beat({
        t: 1.05,
        yaw: 0.48,
        pitch: 0.38,
        radiusMul: 0.68,
        fov: 52,
        roll: -0.06,
        shake: 0.01,
        lookY: 0.2,
        shipYaw: 1.4,
        shipPitch: 0.34,
        shipRadiusMul: 1.14,
      }),
      beat({
        t: 2.7,
        yaw: -0.35,
        pitch: 0.58,
        radiusMul: 1.72,
        fov: 70,
        roll: 0.08,
        lookAt: 0.18,
        shipYaw: 0.55,
        shipPitch: 0.3,
        ease: 'out',
        lag: 20,
      }),
      beat({
        t: 4.05,
        yaw: 0,
        frame: FLANK,
        fov: 54,
        lookAt: 0.55,
        shipYaw: 0.75,
        shipPitch: 0.29,
        shipRadiusMul: 1.02,
        ease: 'out',
      }),
      dock(5.2),
    ],
  },
];

export const INTRO_REEL_IDS: readonly string[] = REELS.map((r) => r.id);

function ease(kind: IntroEase | undefined, u: number): number {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  if (kind === 'in') return t * t * t;
  if (kind === 'out') return 1 - (1 - t) ** 3;
  return t * t * (3 - 2 * t);
}

function reflectYaw(yaw: number): number {
  return DOCK_YAW - (yaw - DOCK_YAW);
}

function cloneBeat(b: IntroBeat): IntroBeat {
  return { ...b, frame: b.frame ? { ...b.frame } : undefined };
}

export function rollIntroReel(opts?: {
  rng?: () => number;
  avoidId?: string | null;
  forceId?: string | null;
}): RolledIntro {
  const rng = opts?.rng ?? Math.random;
  const forced = opts?.forceId ? REELS.find((r) => r.id === opts.forceId) : undefined;
  let pick = forced;
  if (!pick) {
    const pool = REELS.filter((r) => r.id !== opts?.avoidId);
    const bag = pool.length ? pool : REELS;
    pick = bag[Math.floor(rng() * bag.length)] ?? REELS[0];
  }
  const face = rng() * Math.PI * 2;
  const mirror = rng() < 0.5;
  const sideFlip = rng() < 0.5 ? -1 : 1;
  const timeScale = 0.94 + rng() * 0.14;
  const beats = pick.beats.map((src, i) => {
    const b = cloneBeat(src);
    const last = i === pick.beats.length - 1;
    b.t *= timeScale;
    if (mirror) {
      b.yaw = reflectYaw(b.yaw);
      b.shipYaw = reflectYaw(b.shipYaw);
      b.roll = -b.roll;
    }
    b.yaw += face;
    b.shipYaw += face;
    if (!last) {
      b.pitch += (rng() - 0.5) * 0.07;
      b.radiusMul *= 0.97 + rng() * 0.06;
      b.roll += (rng() - 0.5) * 0.06;
      if (b.frame) {
        b.frame.out += (rng() - 0.5) * 0.8;
        b.frame.up += (rng() - 0.5) * 0.5;
        b.frame.side *= sideFlip;
      }
    } else if (b.frame) {
      b.frame.side *= sideFlip;
    }
    return b;
  });
  const duration = beats[beats.length - 1]?.t ?? 5;
  const dockYaw = DOCK_YAW + face;

  return {
    id: pick.id,
    title: pick.title,
    duration,
    dockYaw,
    span(time: number): IntroSpan {
      const last = beats.length - 1;
      const a0 = beats[0];
      const z = beats[last];
      if (!a0 || !z) {
        throw new Error('intro reel has no beats');
      }
      if (time <= a0.t) return { a: a0, b: a0, u: 0, snap: false };
      if (time >= z.t) return { a: z, b: z, u: 1, snap: false };
      let i = 0;
      while (i < last - 1 && time >= beats[i + 1].t) i++;
      const a = beats[i];
      const b = beats[i + 1];
      if (!a || !b) return { a: a0, b: a0, u: 0, snap: false };
      if (b.cut && time < b.t) return { a, b: a, u: 0, snap: false };
      const spanT = Math.max(1e-4, b.t - a.t);
      const u = ease(b.ease, (time - a.t) / spanT);
      const snap = !!a.cut && (time - a.t) / spanT < 0.07;
      return { a, b, u, snap };
    },
  };
}
