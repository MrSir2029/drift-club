// Track definitions and the geometry helper that turns a handful of control
// points into a smooth closed road with sampled centerline data.
import * as THREE from 'three';

export const TRACKS = [
  {
    name: 'Meadow Loop',
    blurb: 'Flat and friendly. Learn the handling here.',
    width: 16,
    points: [
      [0, 0, 0], [100, 0, 0], [160, 0, 35], [150, 0, 100], [85, 0, 120],
      [40, 0, 80], [-20, 0, 100], [-85, 0, 70], [-100, 0, 15], [-70, 0, -5],
    ],
  },
  {
    name: 'Ridge Run',
    blurb: 'Gravel rally stage over the hills. Slide it.',
    width: 15,
    surface: 'gravel',
    points: [
      [0, 0, 0], [85, 0, -10], [155, 9, -45], [205, 18, 5], [185, 15, 75],
      [115, 6, 95], [45, 12, 125], [-40, 14, 85], [-90, 5, 30], [-75, 0, -8],
    ],
  },
  {
    name: 'Overpass',
    blurb: 'A figure-eight with a bridge over the straight.',
    width: 15,
    pillars: true,
    points: [
      [-25, 0, -20], [0, 0, 0], [75, 0, 60], [140, 0, 40], [140, 0, -40],
      [75, 0, -60], [0, 13, 0], [-75, 13, 60], [-140, 11, 40], [-140, 4, -40], [-75, 0, -60],
    ],
  },
];

export const CHECKPOINT_COUNT = 6;

const UP = new THREE.Vector3(0, 1, 0);

export function buildTrack(def) {
  const k = def.scale || 1.35; // tracks are authored small, then scaled up for longer laps
  const pts = def.points.map(p => new THREE.Vector3(p[0] * k, p[1], p[2] * k));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const N = Math.max(200, Math.round(length / 1.5));
  const raw = curve.getSpacedPoints(N); // N+1 points, last == first
  raw.pop();

  const samples = [];
  for (let i = 0; i < N; i++) {
    const p = raw[i];
    const prev = raw[(i - 1 + N) % N];
    const next = raw[(i + 1) % N];
    const t = next.clone().sub(prev).normalize();
    const th = new THREE.Vector3(t.x, 0, t.z).normalize();
    const left = new THREE.Vector3().crossVectors(UP, th).normalize();
    samples.push({ p, t, th, left, i });
  }

  const cps = [];
  for (let k = 0; k < CHECKPOINT_COUNT; k++) cps.push(Math.round((k * N) / CHECKPOINT_COUNT) % N);

  const box = new THREE.Box3();
  for (const s of samples) box.expandByPoint(s.p);

  return { def, name: def.name, surface: def.surface || 'tarmac', N, samples, hw: def.width / 2, cps, bounds: box, length };
}

// Find the sample nearest to a world position. `hint` narrows the search to a
// window around a known index so a bridge never snaps to the road beneath it.
export function locate(track, pos, hint, windowSize = 40) {
  const { samples, N } = track;
  let best = -1, bestD = Infinity;
  const check = (i) => {
    const s = samples[i];
    if (Math.abs(s.p.y - pos.y) > 4) return;
    const dx = pos.x - s.p.x, dz = pos.z - s.p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint >= 0) {
    for (let k = -windowSize; k <= windowSize; k++) check((hint + k + N) % N);
  } else {
    for (let i = 0; i < N; i++) check(i);
  }
  if (best < 0) return null;
  const s = samples[best];
  const dx = pos.x - s.p.x, dz = pos.z - s.p.z;
  const lateral = dx * s.left.x + dz * s.left.z;
  const along = dx * s.th.x + dz * s.th.z;
  const n = samples[(best + 1) % N];
  const seg = Math.max(0.001, Math.hypot(n.p.x - s.p.x, n.p.z - s.p.z));
  const y = s.p.y + (n.p.y - s.p.y) * (along / seg);
  return { i: best, lateral, along, y, s, dist: Math.sqrt(bestD) };
}

export function startSlot(track, slot) {
  const { samples, N, hw } = track;
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const idx = (N - 4 - row * 4 + N) % N;
  const s = samples[idx];
  const lat = (col === 0 ? -1 : 1) * hw * 0.45;
  const pos = s.p.clone().addScaledVector(s.left, lat);
  pos.y += 0.05;
  return { pos, heading: Math.atan2(s.th.x, s.th.z), idx };
}
