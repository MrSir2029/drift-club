// Track definitions and the geometry helper that turns a handful of control
// points into a smooth closed road with sampled centerline data.
import * as THREE from 'three';

export const TRACKS = [
  {
    name: 'Queens Park GP',
    local: 'queens', // which real place it takes after (buildLocal in game.js)
    was: 'Meadow GP', // its old name, shown under the new one in the lobby
    short: 'Queens Park', // where there's no room for the whole name (the leaderboard's tabs)
    blurb: 'Fast sweepers, a chicane and two hairpins. Start here.',
    width: 16,
    points: [
      [0, 0, 0], [70, 0, 0], [130, 0, 10], [165, 2, 45], [150, 4, 90], [105, 4, 95],
      [85, 2, 60], [50, 0, 70], [40, 0, 115], [75, 0, 150], [60, 0, 190], [5, 0, 195],
      [-25, 2, 150], [-70, 3, 140], [-110, 2, 105], [-95, 0, 55], [-120, 0, 15], [-80, 0, -10],
    ],
  },
  {
    name: 'Centennial Park Raceway',
    local: 'centennial',
    was: 'Pinewood',
    short: 'Centennial',
    blurb: 'A fast road through tall pines, under a rock arch.',
    width: 15,
    surface: 'gravel',
    theme: 'forest',
    jumps: [{ at: 0.093, h: 1.6 }, { at: 0.18, h: 1.5 }], // the only stretches with a straight run-up and landing
    arch: 0.215,                                                                 // a stone arch over the road
    points: [
      [0, 0, 0], [80, 0, -10], [150, 8, -40], [205, 18, 0], [215, 22, 60], [170, 16, 90],
      [140, 8, 55], [95, 6, 70], [90, 12, 125], [130, 18, 165], [100, 20, 205], [40, 14, 190],
      [20, 8, 140], [-35, 12, 120], [-85, 16, 150], [-130, 10, 110], [-100, 4, 55], [-125, 0, 5], [-75, 0, -15],
    ],
  },
  {
    name: 'Thredbo Alpine Circuit',
    local: 'thredbo',
    was: 'Frost Pass',
    short: 'Thredbo',
    blurb: 'Snowy figure-eight with a bridge over the straight.',
    theme: 'snow',
    goalFar: true, // 9LAT2 sits out near the edge of the map...
    roam: 260,     // ...which runs much further out than the others
    width: 15,
    points: [
      [-25, 0, -20], [0, 0, 0], [75, 0, 60], [130, 0, 70], [175, 0, 35], [150, 0, -10],
      [175, 0, -55], [130, 0, -85], [75, 0, -60], [0, 13, 0], [-75, 13, 60], [-125, 12, 85],
      [-170, 9, 50], [-145, 6, 5], [-175, 3, -45], [-130, 0, -80], [-75, 0, -60],
    ],
  },
  {
    name: 'Pinto Speedway', // (the owner's name for it; it was Mount Panorama Circuit, and Switchback before that)
    local: 'panorama',
    was: 'Mount Panorama',
    short: 'Pinto',
    blurb: 'Tight and technical, under the floodlights at night.',
    theme: 'night',
    width: 14,
    points: [
      [0, 0, 0], [60, 0, 0], [95, 1, 25], [95, 3, 65], [60, 4, 80], [60, 5, 120],
      [100, 5, 140], [150, 3, 125], [170, 2, 160], [140, 1, 200], [80, 0, 195], [30, 0, 170],
      [-10, 2, 190], [-55, 3, 170], [-50, 4, 120], [-90, 3, 100], [-110, 1, 55], [-70, 0, 35], [-60, 0, -5],
    ],
  },
  {
    name: 'Noosa Heads Circuit',
    local: 'noosa',
    was: 'Palm Bay',
    short: 'Noosa Heads',
    blurb: 'Up the cliffs, round the lighthouse, over the bridge and back through the palms.',
    theme: 'beach',
    v: 2, // the layout: a new one starts its leaderboard again (server/core.js)
    width: 15,
    // the sea: everything more than shore metres from the road and beyond the
    // line through the start straight (z < -from), so the headland stays land
    sea: { level: -1.2, shore: 38, from: 10 },
    points: [
      [0, 0, 0], [60, 0, 0], [105, 0, 0], [125, 1, -15], [125, 4, -55], [140, 9, -90],
      [125, 14, -125], [104, 18, -150], [92, 19, -166], [78, 18, -152], [62, 16, -110], [55, 13, -60],
      [52, 11, -25], [50, 10, 0], [48, 9, 30], [35, 7, 65], [-5, 6, 85], [-40, 8, 70],
      [-75, 6, 95], [-110, 4, 80], [-120, 2, 40], [-95, 1, 20], [-60, 0, 0],
    ],
  },
  {
    name: 'Sydney CBD Street Circuit',
    local: 'sydney',
    was: 'Neon City',
    short: 'Sydney CBD',
    blurb: 'A street circuit at night: a hairpin, a flyover and a chicane between the walls.',
    theme: 'city',
    v: 2,
    width: 13,
    scale: 1.7,
    walls: true, // concrete barriers along both sides, with gaps for the side streets
    points: [
      [-40, 0, 0], [157, 0, 0], [162.7, 0, 2.3], [165, 0, 8], [165, 0, 12], [162.7, 0, 17.7],
      [157, 0, 20], [119, 0, 20], [112.6, 0, 22.6], [110, 0, 29], [110, 0, 69], [106.8, 0, 76.8],
      [99, 0, 80], [61, 0, 80], [46, 0, 77.1], [32.4, 0, 70.1], [22, 4, 62], [17, 8, 35],
      [17, 9, 15], [17, 9, -10], [18, 6, -35], [19.3, 0, -53], [17.2, 0, -59.4], [11, 0, -62],
      [-49, 0, -62], [-54.5, 0, -60.8], [-59.4, 0, -57.9], [-66.3, 0, -51.4], [-70, 0, -50], [-73.7, 0, -51.4],
      [-81.3, 0, -58.6], [-85.4, 0, -61], [-90, 0, -62], [-121, 0, -62], [-127.4, 0, -59.4], [-130, 0, -53],
      [-130, 0, -9], [-127.4, 0, -2.6], [-121, 0, 0],
    ],
  },
  {
    name: 'Rose Bay Harbour Circuit',
    local: 'rosebay',
    short: 'Rose Bay',
    fresh: true,   // 'New track' on its card in the lobby
    blurb: 'Monaco on Sydney Harbour: along the quay, up Heartbreak Hill, two hairpins, down past the shops and through the tunnel.',
    theme: 'beach',
    urban: true,   // only the landmarks that fit in a town, and none inside the walled-in middle
    suburbs: true, // its own hills all round, with houses and towers on them, in place of the usual bare ones
    width: 13,
    scale: 1,
    // the harbour: water right up to the sea wall along the quay (z < 0), none inland. `quay`: the track's own
    // scenery builds the waterfront (and its guard rail), so none of the usual trackside furniture goes near the water
    sea: { level: -1.2, shore: 6, from: -20, base: 6.5, hills: 0.5, sand: 0.2, fade: 0.5, clear: true, quay: true },
    // the tunnel under the hotel, and the lookout beside the hill down: nothing else gets built on them
    blocks: [[-240, -20, -158, 60], [-330, -60, -229, 140]],
    points: [
      [24, 0, 0], [80, 0, 0], [120, 0, -1.4], [160, 0, -4.6], [218, 0, -11.5], [234, 0, -6.8], [241.4, 0.5, 8],
      [243.5, 3, 40], [250, 6, 79], [262, 9, 112], [270, 12, 141], [271, 15, 175], [266, 18, 206], [254.5, 19, 228], [232, 19, 238],
      [170, 18.5, 242.5], [120, 18, 244], [70, 17.5, 243], [-23, 16, 237], [-35.7, 15.5, 231.2], [-41, 14.5, 218.5], [-35.7, 13.5, 205.8], [-23, 13, 200],
      [53, 11, 200], [65.7, 10.5, 194.7], [71, 9.5, 182], [65.7, 8.5, 169.3], [53, 8, 164],
      [-20, 6.5, 161], [-80, 5, 159.5], [-140, 4, 160.7], [-189, 3, 162.8], [-207.4, 2.6, 156], [-215, 2.2, 138],
      [-215, 1, 90], [-215, 0, 38], [-203.9, 0, 11.1], [-177, 0, 0], [-150, 0, 0],
      [-130, 0, -1], [-118, 0, -7], [-108, 0, -13.5], [-90, 0, -13.5], [-80, 0, -7], [-68, 0, -1], [-54, 0, 0], [0, 0, 0], [12, 0, 0],
    ],
  },
  {
    name: 'Westfield Mall Circuit',
    local: 'westfield',
    short: 'Westfield',
    fresh: true,
    blurb: 'Off the rooftop car park, down the ramp, along Oxford Street to the hairpin at the bus stop, then flat out through the shops and round the food court.',
    v: 2, // the layout: a new one starts its leaderboard again (server/core.js)
    theme: 'mall',
    urban: true,
    bare: true,       // no grandstands, pits or paddock: it's a shopping centre
    width: 14,
    scale: 1,
    deckAbove: 1.5,   // road higher than this stands on piers (the car park roof and its ramps): the ground stays flat under it
    // the car park and the mall, as [x0, z0, x1, z1]: nothing else gets built on them. Then the median between
    // Oxford Street's two carriageways (from inside the hairpin to where the legs part), and the bridge over the street
    blocks: [[-205, 50, 175, 215], [-215, -215, 185, -40], [-24, -3.2, 128, 3.2], [26, -40, 54, 50]],
    // Oxford Street, and the view up the ramp to the Harbour Bridge: no landmark lands on them
    streets: [[-700, -20, 700, 20], [-330, 215, -50, 420]],
    // the car park's flat roof, as [x0, z0, x1, z1, height]: cars up there drive on it
    roofs: [[-176, 50, 146, 160, 9.7], [-205, 160, 175, 215, 9.7]],
    // a sponsor's bridge over each carriageway of Oxford Street, side by side so the two read as one across the
    // whole street, as [x, z] (the nearest point of the lap to each): the usual rules find no room at Westfield
    sponsorBridges: [[99, 13], [99, -13]],
    points: [
      [-60, 10, 190], [-20, 10, 190], [60, 10, 190], [118, 10, 190], [138, 10, 190], [146.4, 10, 188.3], [153.6, 10, 183.6], [158.3, 10, 176.4],
      [160, 10, 168], [160, 10, 160], [160, 9.3, 150], [160, 5, 100], [160, 0.7, 50], [160, 0, 40],
      // left onto Oxford Street, along it under the bridge, round the hairpin at the 333's stop, back under the bridge, and left in through the doors
      [157.9, 0, 29.7], [152.1, 0, 20.9], [143.3, 0, 15.1], [133, 0, 13], [110, 0, 13], [60, 0, 13], [10, 0, 13], [-6, 0, 14], [-20, 0, 15],
      [-30.6, 0, 10.6], [-35, 0, 0], [-30.6, 0, -10.6], [-20, 0, -15], [-6, 0, -14], [10, 0, -13], [60, 0, -13], [110, 0, -13], [133, 0, -13],
      [143.3, 0, -15.1], [152.1, 0, -20.9], [157.9, 0, -29.7], [160, 0, -40],
      [160, 0, -65], [160, 0, -85], [158.1, 0, -94.6], [152.7, 0, -102.7], [144.6, 0, -108.1], [135, 0, -110], [115, 0, -110], [95, 0, -110],
      [72, 0, -106], [52, 0, -96.5], [32, 0, -88], [10, 0, -85], [-12, 0, -88], [-32, 0, -96.5], [-52, 0, -106], [-75, 0, -110],
      [-98, 0, -110], [-118, 0, -110], [-126.4, 0, -111.7], [-133.6, 0, -116.4], [-138.3, 0, -123.6], [-140, 0, -132], [-140, 0, -150], [-140, 0, -170],
      [-141.9, 0, -179.6], [-147.3, 0, -187.7], [-155.4, 0, -193.1], [-165, 0, -195], [-174.6, 0, -193.1], [-182.7, 0, -187.7], [-188.1, 0, -179.6], [-190, 0, -170],
      [-190, 0, -150], [-190, 0, -65], [-190, 0, -20], [-190, 0, 28], [-190, 0, 40], [-190, 0.7, 50], [-190, 5, 100], [-190, 9.3, 150],
      [-190, 10, 160], [-190, 10, 168], [-188.3, 10, 176.4], [-183.6, 10, 183.6], [-176.4, 10, 188.3], [-168, 10, 190], [-148, 10, 190], [-100, 10, 190],
    ],
  },
];

export const CHECKPOINT_COUNT = 6;

const UP = new THREE.Vector3(0, 1, 0);

export function buildTrack(def) {
  const k = def.scale || 1.6; // tracks are authored small, then scaled up for longer laps
  const pts = def.points.map(p => new THREE.Vector3(p[0] * k, p[1], p[2] * k));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
  const length = curve.getLength();
  const N = Math.max(200, Math.round(length / 1.5));
  const raw = curve.getSpacedPoints(N); // N+1 points, last == first
  raw.pop();
  // Jumps: a ramp up to a sharp crest, then a shorter, steeper drop. At speed
  // the ground falls away faster than gravity can follow and the car flies.
  const step = length / N;
  for (const j of def.jumps || []) {
    const c = Math.round(j.at * N), up = 14, down = 9;
    for (let k = -Math.ceil(up / step); k <= Math.ceil(down / step); k++) {
      const d = k * step, lift = d <= 0 ? j.h * (1 + d / up) : j.h * (1 - d / down);
      if (lift > 0) raw[(c + k + N) % N].y += lift;
    }
  }

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

  return { def, name: def.name, surface: def.surface || 'tarmac', theme: def.theme || 'meadow', N, samples, hw: def.width / 2, cps, bounds: box, length };
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
  // height along the road: between this sample and the next if the point is
  // ahead of it, or the previous one if it's behind. (Always using the next
  // segment ran the far side of a crest backwards, so the road seemed to rise
  // past the top of a ramp and threw cars into the air.)
  const o = samples[(best + (along >= 0 ? 1 : N - 1)) % N];
  const seg = Math.max(0.001, Math.hypot(o.p.x - s.p.x, o.p.z - s.p.z));
  const y = s.p.y + (o.p.y - s.p.y) * (Math.abs(along) / seg);
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
