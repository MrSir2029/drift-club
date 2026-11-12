import * as THREE from 'three';
import { TRACKS, buildTrack, locate, startSlot, CHECKPOINT_COUNT } from '/tracks.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
const CAR_COLORS = [0xff4d4d, 0xff8a3d, 0xffd23f, 0x7ed957, 0x2ec4b6, 0x3d8bff, 0x8c6bff, 0xff6bcb, 0xf5f0e6, 0x2b2f3a, 0x8b5a2b, 0x9ad0ff];
const COLOR_CSS = CAR_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
const SEND_HZ = 20;

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const fmtTime = (ms) => {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), h = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(h).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// app state
// ---------------------------------------------------------------------------
const app = {
  ws: null,
  myId: 0,
  name: 'Racer',
  color: Math.floor(Math.random() * 12),
  room: null,          // latest room snapshot
  phase: 'home',       // home | lobby | countdown | racing | results
  trackId: 0,
  track: null,
  laps: 3,
  startAt: 0,          // local clock
  finished: false,
  finishTime: 0,
  spectate: false,
  cars: new Map(),     // id -> remote car
  local: null,
  keys: {},
  lastSend: 0,
  nextCpMesh: null,
};

// ---------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ad4f5);
scene.fog = new THREE.Fog(0x8ad4f5, 260, 620);

const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1200);

const hemi = new THREE.HemisphereLight(0xcfeeff, 0x5f9c48, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(80, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
sun.shadow.bias = -0.0008;
scene.add(sun);
scene.add(sun.target);

// ---------------------------------------------------------------------------
// terrain: a low-poly heightfield that rises to meet the road on hills and
// rolls gently further out. Rebuilt for every track.
// ---------------------------------------------------------------------------
const TERRAIN = { size: 1600, seg: 320, heights: null, origin: { x: 0, z: 0 }, cell: 1, mesh: null };
const ROAD_CLEARANCE = 0.3; // ground sits this far under the road so the two never fight
const VERGE = 3;            // width of the skirt that joins the curb to the ground (m)
const VERGE_MAX_DROP = 3;   // past this drop there is no skirt: it's a bridge deck

// Exact height of the rendered terrain at a point: same two triangles per cell
// that PlaneGeometry draws, so wheels sit on the ground you can see.
function terrainHeight(x, z) {
  const T = TERRAIN; if (!T.heights) return 0;
  const n1 = T.seg + 1, H = T.heights;
  const gx = (x - T.origin.x) / T.cell, gz = (z - T.origin.z) / T.cell;
  const i = clamp(Math.floor(gx), 0, T.seg - 1), j = clamp(Math.floor(gz), 0, T.seg - 1);
  const fx = clamp(gx - i, 0, 1), fz = clamp(gz - j, 0, 1);
  const a = H[j * n1 + i], b = H[(j + 1) * n1 + i], c = H[(j + 1) * n1 + i + 1], d = H[j * n1 + i + 1];
  return fx + fz <= 1 ? a + fx * (d - a) + fz * (b - a) : c + (1 - fx) * (b - c) + (1 - fz) * (d - c);
}

// The guarantee that stops the ground poking through the road: every grid
// vertex close enough to share a triangle with any piece of road is held at
// or below that road's own slope plane (minus a clearance). Planes are linear,
// so the flat triangles between such vertices stay under the road as well.
// Where two roads are near each other (the bridge crossing) the lower one wins.
function buildTerrain(track) {
  const T = TERRAIN;
  if (T.mesh) { scene.remove(T.mesh); T.mesh.geometry.dispose(); T.mesh.material.dispose(); T.mesh = null; }
  const { samples, hw } = track;
  const center = track.bounds.getCenter(new THREE.Vector3());
  T.cell = T.size / T.seg;
  T.origin.x = center.x - T.size / 2; T.origin.z = center.z - T.size / 2;
  const n1 = T.seg + 1;
  const H = T.heights = new Float32Array(n1 * n1);
  const R = hw + 2.8 + T.cell * Math.SQRT2, R2 = R * R;

  const buckets = new Map();
  const bkey = (bx, bz) => bx * 8192 + bz;
  for (const s of samples) {
    s.grade = s.t.y / Math.max(0.001, Math.hypot(s.t.x, s.t.z)); // rise per metre along the road
    const k = bkey(Math.floor(s.p.x / R), Math.floor(s.p.z / R));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const coarse = samples.filter((_, i) => i % 4 === 0);
  const noise = (x, z) => Math.sin(x * 0.011 + 0.3) * Math.cos(z * 0.009) * 8 + Math.sin(x * 0.027 + 1.7) * Math.sin(z * 0.023 + 0.4) * 3 + Math.sin(x * 0.06) * Math.cos(z * 0.07) * 0.8;
  const smooth = (t) => t * t * (3 - 2 * t);

  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const x = T.origin.x + i * T.cell, z = T.origin.z + j * T.cell;
    let ceil = Infinity;
    const bx = Math.floor(x / R), bz = Math.floor(z / R);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const list = buckets.get(bkey(bx + ox, bz + oz));
      if (!list) continue;
      for (const s of list) {
        const dx = x - s.p.x, dz = z - s.p.z;
        if (dx * dx + dz * dz > R2) continue;
        const plane = s.p.y + s.grade * (dx * s.th.x + dz * s.th.z);
        if (plane < ceil) ceil = plane;
      }
    }
    if (ceil < Infinity) { H[j * n1 + i] = ceil - ROAD_CLEARANCE; continue; }
    // away from the road: ease from road level out to rolling hills
    let best = Infinity, yN = 0;
    for (const s of coarse) {
      const dx = x - s.p.x, dz = z - s.p.z, d = dx * dx + dz * dz;
      if (d < best) { best = d; yN = s.p.y; }
    }
    const far = smooth(clamp((Math.sqrt(best) - R) / 90, 0, 1));
    H[j * n1 + i] = lerp(yN - ROAD_CLEARANCE - 0.3, noise(x, z), far);
  }

  const geo = new THREE.PlaneGeometry(T.size, T.size, T.seg, T.seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.z);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), lo = new THREE.Color(0x6db85e), hi = new THREE.Color(0x9ad46a), rock = new THREE.Color(0x8f917c);
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const k = j * n1 + i, y = H[k];
    pos.setY(k, y);
    // steep faces (cuttings, embankments) read as rock instead of grass
    const steep = Math.max(
      Math.abs(y - H[j * n1 + Math.min(i + 1, T.seg)]), Math.abs(y - H[j * n1 + Math.max(i - 1, 0)]),
      Math.abs(y - H[Math.min(j + 1, T.seg) * n1 + i]), Math.abs(y - H[Math.max(j - 1, 0) * n1 + i])) / T.cell;
    c.copy(lo).lerp(hi, clamp((y + 2) / 16, 0, 1)).multiplyScalar(0.94 + ((k * 7919) % 13) / 110);
    c.lerp(rock, clamp((steep - 0.55) / 0.6, 0, 1));
    colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // flatShading derives face normals in the shader, so the indexed grid stays small
  T.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  T.mesh.receiveShadow = true;
  scene.add(T.mesh);
}

// is there a lower piece of road passing under this sample? (bridge crossings)
function roadBelow(track, s) {
  const r = track.hw + 3.5, r2 = r * r;
  for (const q of track.samples) {
    if (q.p.y > s.p.y - 3) continue;
    const dx = q.p.x - s.p.x, dz = q.p.z - s.p.z;
    if (dx * dx + dz * dz < r2) return true;
  }
  return false;
}

const worldGroup = new THREE.Group(); // everything that belongs to the current track
scene.add(worldGroup);
const carsGroup = new THREE.Group();
scene.add(carsGroup);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------
// track building
// ---------------------------------------------------------------------------
function flatMesh(positions, colors, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

function pushQuad(pos, col, a, b, c, d, color) {
  // two triangles: a b c, a c d  (counter-clockwise seen from above/outside)
  for (const v of [a, b, c, a, c, d]) pos.push(v.x, v.y, v.z);
  if (col) for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

function buildRibbon(track, offA, offB, colorFn, yLift = 0) {
  const { samples, N } = track;
  const pos = [], col = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const s = samples[i], n = samples[(i + 1) % N];
    const a = s.p.clone().addScaledVector(s.left, offA); a.y += yLift;
    const b = s.p.clone().addScaledVector(s.left, offB); b.y += yLift;
    const c = n.p.clone().addScaledVector(n.left, offB); c.y += yLift;
    const d = n.p.clone().addScaledVector(n.left, offA); d.y += yLift;
    tmp.set(colorFn(i));
    pushQuad(pos, col, a, b, c, d, tmp);
  }
  return { pos, col };
}

let menuOrbit = 0;

function buildWorld(trackId) {
  // clear old
  while (worldGroup.children.length) {
    const o = worldGroup.children.pop();
    o.traverse?.(m => { m.geometry?.dispose?.(); m.material?.map?.dispose?.(); if (m.material?.dispose) m.material.dispose(); });
  }
  occupied.length = 0; anim.length = 0;
  const track = buildTrack(TRACKS[trackId]);
  app.track = track;
  app.trackId = trackId;
  app.nextCpMesh = null; // new gate materials: force the next-gate glow to be re-applied
  const { samples, N, hw, cps } = track;
  buildTerrain(track);

  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // road surface with subtle per-segment shade variation (low-poly feel)
  const gravel = track.surface === 'gravel';
  const roadBase = gravel ? 0xb49c70 : 0x5b6472;
  const road = buildRibbon(track, hw, -hw, (i) => {
    const k = 0.92 + 0.08 * ((i * 7919) % 13) / 13;
    return new THREE.Color(roadBase).multiplyScalar(k);
  }, 0.02);
  // curbs: red / white on tarmac, dark / pale stones on gravel
  const curbA = gravel ? 0x7d6d52 : 0xe6453a, curbB = gravel ? 0xe9dec4 : 0xf6f2e8;
  const curbL = buildRibbon(track, hw + 1.6, hw, (i) => (Math.floor(i / 3) % 2 ? curbA : curbB), 0.03);
  const curbR = buildRibbon(track, -hw, -hw - 1.6, (i) => (Math.floor(i / 3) % 2 ? curbA : curbB), 0.03);
  const roadMesh = flatMesh([...road.pos, ...curbL.pos, ...curbR.pos], [...road.col, ...curbL.col, ...curbR.col], vcMat);
  roadMesh.receiveShadow = true;
  worldGroup.add(roadMesh);

  // centre dashes (tarmac only)
  if (!gravel) {
    const dash = buildRibbon(track, 0.25, -0.25, (i) => (Math.floor(i / 4) % 2 ? 0xf6f2e8 : 0x5b6472), 0.04);
    worldGroup.add(flatMesh(dash.pos, dash.col, vcMat));
  }

  // Road edges. Normally a short verge skirt joins the curb to the ground so
  // the road never reads as a floating sheet. Where the ground falls away
  // (the bridge) the road becomes a thick deck standing on piers instead.
  const DECK = 2.4, EDGE = hw + 1.6;
  const deckPos = [], deckCol = [], vergePos = [], vergeCol = [];
  const sideColor = new THREE.Color(0x7c8696), underColor = new THREE.Color(0x5a6372);
  const vergeColor = new THREE.Color(gravel ? 0x9c8a62 : 0x5fa653);
  const pierGeo = new THREE.BoxGeometry(hw * 1.3, 1, 2.2);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b7484, flatShading: true });
  const edges = samples.map((s) => {
    const L = s.p.clone().addScaledVector(s.left, EDGE), R = s.p.clone().addScaledVector(s.left, -EDGE);
    const Lo = s.p.clone().addScaledVector(s.left, EDGE + VERGE), Ro = s.p.clone().addScaledVector(s.left, -EDGE - VERGE);
    const gL = terrainHeight(Lo.x, Lo.z), gR = terrainHeight(Ro.x, Ro.z);
    Lo.y = Math.min(s.p.y - 0.25, gL - 0.35); Ro.y = Math.min(s.p.y - 0.25, gR - 0.35); // tuck under the grass
    return { L, R, Lo, Ro, dropL: s.p.y - gL, dropR: s.p.y - gR };
  });
  track.vergeDrop = edges.map(e => Math.max(e.dropL, e.dropR));
  const down = (v) => { const c = v.clone(); c.y -= DECK; return c; };
  for (let i = 0; i < N; i++) {
    const s = samples[i], a = edges[i], b = edges[(i + 1) % N];
    const dropL = Math.max(a.dropL, b.dropL), dropR = Math.max(a.dropR, b.dropR);
    if (dropL <= VERGE_MAX_DROP) pushQuad(vergePos, vergeCol, a.Lo, a.L, b.L, b.Lo, vergeColor);
    if (dropR <= VERGE_MAX_DROP) pushQuad(vergePos, vergeCol, a.R, a.Ro, b.Ro, b.R, vergeColor);
    if (dropL > 1 || dropR > 1) {
      const aL0 = down(a.L), aR0 = down(a.R), bL0 = down(b.L), bR0 = down(b.R);
      pushQuad(deckPos, deckCol, a.L, b.L, bL0, aL0, sideColor);    // left wall, faces outward
      pushQuad(deckPos, deckCol, b.R, a.R, aR0, bR0, sideColor);    // right wall, faces outward
      pushQuad(deckPos, deckCol, aL0, bL0, bR0, aR0, underColor);   // underside, faces down
    }
    if (i % 16 === 0) {
      const ground = terrainHeight(s.p.x, s.p.z), gap = s.p.y - ground;
      if (gap > 3.5 && !roadBelow(track, s)) {
        const pier = new THREE.Mesh(pierGeo, pierMat);
        const tall = gap - DECK + 1.5;                 // sunk 1 m into the ground, tucked into the deck
        pier.scale.y = tall;
        pier.position.set(s.p.x, ground - 1 + tall / 2, s.p.z);
        pier.rotation.y = Math.atan2(s.th.x, s.th.z); // wide side across the road
        pier.castShadow = true;
        worldGroup.add(pier);
      }
    }
  }
  if (vergePos.length) {
    const verge = flatMesh(vergePos, vergeCol, vcMat);
    verge.receiveShadow = true;
    worldGroup.add(verge);
  }
  if (deckPos.length) {
    const deck = flatMesh(deckPos, deckCol, vcMat);
    deck.castShadow = true;
    worldGroup.add(deck);
  }
  roadMesh.castShadow = true;

  // start / finish arch
  const s0 = samples[0];
  const arch = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(1.2, 13, 1.2); // runs 4 m into the ground so it never floats
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1d2230, flatShading: true });
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.copy(s0.p).addScaledVector(s0.left, side * (hw + 2.2));
    post.position.y += 2.5;
    post.castShadow = true;
    arch.add(post);
  }
  const bannerTex = makeCheckerTexture();
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.6, 2.2, 1.2), new THREE.MeshLambertMaterial({ map: bannerTex }));
  banner.position.copy(s0.p); banner.position.y += 8.2;
  banner.rotation.y = Math.atan2(s0.th.x, s0.th.z);
  banner.castShadow = true;
  arch.add(banner);
  const line = buildRibbonSegment(track, 0, hw, -hw, 0.05);
  const lineMesh = new THREE.Mesh(line, new THREE.MeshLambertMaterial({ map: bannerTex }));
  arch.add(lineMesh);
  worldGroup.add(arch);

  // checkpoint gates
  track.gateMats = [];
  const gatePostGeo = new THREE.BoxGeometry(0.9, 9, 0.9); // also sunk 4 m
  for (let k = 1; k < cps.length; k++) {
    const s = samples[cps[k]];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffa030, flatShading: true, emissive: 0x000000 });
    track.gateMats.push(mat);
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(gatePostGeo, mat);
      post.position.copy(s.p).addScaledVector(s.left, side * (hw + 2.2));
      post.position.y += 0.5;
      post.castShadow = true;
      worldGroup.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.2, 0.5, 0.5), mat);
    bar.position.copy(s.p); bar.position.y += 5.2;
    bar.rotation.y = Math.atan2(s.th.x, s.th.z);
    worldGroup.add(bar);
  }

  buildProps(track);
  buildScenery(track);
  // menu camera starts over the start line
  menuOrbit = 0;
  return track;
}

function buildRibbonSegment(track, i, offA, offB, lift) {
  const { samples, N } = track;
  const s = samples[i], n = samples[(i + 2) % N];
  const a = s.p.clone().addScaledVector(s.left, offA); a.y += lift;
  const b = s.p.clone().addScaledVector(s.left, offB); b.y += lift;
  const c = n.p.clone().addScaledVector(n.left, offB); c.y += lift;
  const d = n.p.clone().addScaledVector(n.left, offA); d.y += lift;
  const pos = [];
  pushQuad(pos, null, a, b, c, d);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    ctx.fillStyle = (x + y) % 2 ? '#1d2230' : '#f6f2e8';
    ctx.fillRect(x * 8, y * 8, 8, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// keep-out map, solid walls and things that move
// ---------------------------------------------------------------------------
// Everything placed beside the track claims a circle here, so nothing is ever
// dropped on a road or inside something else.
const occupied = [];
const anim = []; // per-frame updaters for the current track: (t, dt) => {}
function claim(x, z, r) { occupied.push({ x, z, r }); }
function roadGap(track, x, z) {
  const S = track.samples;
  let best = Infinity;
  for (let i = 0; i < S.length; i += 2) {
    const dx = S[i].p.x - x, dz = S[i].p.z - z, d = dx * dx + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
function isFree(track, x, z, r, roadMargin) {
  for (const o of occupied) {
    const dx = o.x - x, dz = o.z - z, rr = o.r + r;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return roadGap(track, x, z) >= roadMargin;
}

// a box stretched between two points
const _z = new THREE.Vector3(0, 0, 1);
function strut(a, b, w, h, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(_z, d.normalize());
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Solid walls are flat line segments. The car is treated as a circle: if it
// overlaps a wall it's pushed back out and loses the speed it had into it.
function collideWalls(car) {
  const walls = app.track.walls;
  if (!walls) return 0;
  const R = 1.0;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  let hit = 0;
  // three circles along the car: nose, middle, tail
  for (const off of [2.1, 0, -1.9]) {
    for (const w of walls) {
      if (Math.abs(w.y - car.pos.y) > 3) continue;
      const px = car.pos.x + fx * off, pz = car.pos.z + fz * off;
      const ex = w.bx - w.ax, ez = w.bz - w.az;
      const t = clamp(((px - w.ax) * ex + (pz - w.az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
      const dx = px - (w.ax + ex * t), dz = pz - (w.az + ez * t);
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      car.pos.x += nx * (R - d); car.pos.z += nz * (R - d);
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) {
        car.vx -= 1.2 * vn * nx; car.vz -= 1.2 * vn * nz;   // small bounce
        const scrub = 1 - Math.min(0.35, -vn * 0.03);         // scraping along it costs speed
        car.vx *= scrub; car.vz *= scrub;
        // a hit on the nose or tail swings the car round, away from the wall
        car.yawRate += clamp(off * (fz * nx - fx * nz) * -vn * 0.05, -2, 2);
        hit = Math.max(hit, -vn);
      }
    }
  }
  return hit;
}

// Crowd: every spectator is one instance of a body box and a head box. They
// bob about, and jump when a car comes past.
function makePeople(max, rnd) {
  const shirts = [0xf6f2e8, 0xe6453a, 0x1d2230, 0xffd23f, 0x9ad0ff, 0xff6bcb, 0x7ed957, 0xff8a3d, 0x3d8bff];
  const skins = [0xf1c9a5, 0xd9a577, 0xa8703f, 0x6b4526];
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.85, 0.3), new THREE.MeshLambertMaterial({ flatShading: true }), max);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ flatShading: true }), max);
  bodies.frustumCulled = heads.frustumCulled = false;
  const list = [], col = new THREE.Color(), M = new THREE.Matrix4();
  return {
    add(x, y, z, rot, shirt) {
      if (list.length >= max) return;
      const i = list.length;
      list.push({ x, y, z, rot, ph: rnd() * 6.28, sp: 5 + rnd() * 4, keen: rnd() < 0.2 });
      bodies.setColorAt(i, col.set(shirt ?? shirts[Math.floor(rnd() * shirts.length)]));
      heads.setColorAt(i, col.set(skins[Math.floor(rnd() * skins.length)]));
    },
    finish() {
      bodies.count = heads.count = list.length;
      worldGroup.add(bodies, heads);
      const update = (t) => {
        const car = app.local;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          let amp = p.keen ? 0.2 : 0.03;
          if (car) { const dx = car.pos.x - p.x, dz = car.pos.z - p.z; if (dx * dx + dz * dz < 4900) amp = 0.32; }
          const hop = Math.abs(Math.sin(t * p.sp + p.ph)) * amp;
          M.makeRotationY(p.rot);
          M.setPosition(p.x, p.y + 0.43 + hop, p.z); bodies.setMatrixAt(i, M);
          M.setPosition(p.x, p.y + 1.02 + hop, p.z); heads.setMatrixAt(i, M);
        }
        bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
      };
      update(0);
      anim.push(update);
    },
  };
}

// Flags share one rippling sheet of cloth.
function makeFlags() {
  const geo = new THREE.PlaneGeometry(2.6, 1.5, 8, 2);
  geo.translate(1.3, 0, 0);
  const base = geo.attributes.position.array.slice();
  const poleGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd9dde3, flatShading: true });
  anim.push((t) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 2.4 - t * 8) * 0.14 * x); }
    p.needsUpdate = true;
  });
  return {
    add(x, y, z, color, h = 6) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.scale.y = h; pole.position.set(x, y + h / 2, z); worldGroup.add(pole);
      const flag = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
      flag.position.set(x, y + h - 0.8, z); flag.rotation.y = 0.6; worldGroup.add(flag);
    },
  };
}

// seeded random so everyone sees the same world
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Trackside: grid boxes, barriers, braking boards, marshal posts, billboards,
// grandstands, pits or a rally service park, spectators behind fences, a car
// park. Runs before the scenery so trees keep clear of all of it.
function buildProps(track) {
  const { samples, N, hw } = track;
  const gravel = track.surface === 'gravel';
  const rnd = mulberry32(777 + app.trackId * 31);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const heading = (s) => Math.atan2(s.th.x, s.th.z);
  const wrap = (i) => ((i % N) + N) % N;
  const at = (s, lat) => { const p = s.p.clone().addScaledVector(s.left, lat); p.y = terrainHeight(p.x, p.z); return p; };
  const flat = (i) => track.vergeDrop[wrap(i)] <= VERGE_MAX_DROP;
  const walls = track.walls = [];
  const wall = (a, b) => walls.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, y: (a.y + b.y) / 2 });
  const people = makePeople(1100, rnd);
  const flags = makeFlags();
  const flagCols = [0xe6453a, 0xffd23f, 0x3d8bff, 0xf6f2e8, 0x7ed957, 0xff8a3d];
  const postMat = lam(0x5a6372);

  // how hard the road turns at each sample (sign: + = right-hander)
  const turn = samples.map((a, i) => { const b = samples[(i + 14) % N]; return a.th.x * b.th.z - a.th.z * b.th.x; });

  // Find a stretch of roadside where a len x depth rectangle fits without
  // touching any road or anything already placed. `lat` is where the object's
  // origin sits from the centre line; it reaches `front` toward the road and
  // `back` away from it.
  const fit = (start, len, front, back, lat, sides, range = N >> 1, step = 5) => {
    const halfD = (front + back) / 2, cLat = lat + (back - front) / 2;
    const nu = Math.ceil(len / 4), nv = Math.ceil(halfD * 2 / 4);
    for (let d = 0; d <= range; d += step) for (const dir of d ? [1, -1] : [1]) {
      const i = wrap(Math.round(start) + dir * d), s = samples[i];
      if (!flat(i)) continue;
      for (const side of sides) {
        const cx = s.p.x + s.left.x * side * cLat, cz = s.p.z + s.left.z * side * cLat;
        if (!isFree(track, cx, cz, 2, hw + 3.5)) continue;
        const pts = []; let ok = true, lo = Infinity, hi = -Infinity;
        for (let a = 0; a <= nu && ok; a++) for (let b = 0; b <= nv; b++) {
          const u = -len / 2 + (len * a) / nu, v = -halfD + (halfD * 2 * b) / nv;
          const x = cx + s.th.x * u + s.left.x * v, z = cz + s.th.z * u + s.left.z * v;
          if (!isFree(track, x, z, 2, hw + 3.5)) { ok = false; break; }
          const y = terrainHeight(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y);
          pts.push([x, z]);
        }
        if (!ok || hi - lo > 3) continue;
        for (const [x, z] of pts) claim(x, z, 2.6);
        return { i, s, side, y: hi - 0.1, lo };
      }
    }
    return null;
  };
  // objects are built with their front on local +z = toward the road
  const put = (obj, spot, lat) => {
    const { s, side } = spot;
    obj.position.set(s.p.x + s.left.x * side * lat, spot.y, s.p.z + s.left.z * side * lat);
    obj.rotation.y = heading(s) + (side > 0 ? -1 : 1) * Math.PI / 2;
    worldGroup.add(obj);
    return obj;
  };
  const toWorld = (obj, lx, ly, lz) => {
    const c = Math.cos(obj.rotation.y), sn = Math.sin(obj.rotation.y);
    return V(obj.position.x + lx * c + lz * sn, obj.position.y + ly, obj.position.z - lx * sn + lz * c);
  };
  const wallRect = (obj, x0, x1, z0, z1) => {
    const c = [toWorld(obj, x0, 0, z1), toWorld(obj, x1, 0, z1), toWorld(obj, x1, 0, z0), toWorld(obj, x0, 0, z0)];
    for (let k = 0; k < 4; k++) wall(c[k], c[(k + 1) % 4]);
  };
  const lateral = (s, side, lat, u = 0) => { const p = V(s.p.x + s.left.x * side * lat + s.th.x * u, 0, s.p.z + s.left.z * side * lat + s.th.z * u); p.y = terrainHeight(p.x, p.z); return p; };

  // --- painted grid boxes behind the start line ---
  const paint = [];
  for (let slot = 0; slot < 20; slot++) {
    const { idx } = startSlot(track, slot);
    const s = samples[idx], c = (slot % 2 === 0 ? -1 : 1) * hw * 0.45;
    const f = s.th, l = s.left, y = s.p.y + 0.06;
    const P = (lat, fwd) => new THREE.Vector3(s.p.x + l.x * lat + f.x * fwd, y, s.p.z + l.z * lat + f.z * fwd);
    pushQuad(paint, null, P(c + 1.5, 2.9), P(c - 1.5, 2.9), P(c - 1.5, 2.6), P(c + 1.5, 2.6));
    pushQuad(paint, null, P(c + 1.5, 2.9), P(c + 1.2, 2.9), P(c + 1.2, 1.2), P(c + 1.5, 1.2));
    pushQuad(paint, null, P(c - 1.2, 2.9), P(c - 1.5, 2.9), P(c - 1.5, 1.2), P(c - 1.2, 1.2));
  }
  worldGroup.add(flatMesh(paint, null, new THREE.MeshLambertMaterial({ color: 0xf6f2e8, side: THREE.DoubleSide })));

  // --- grandstands ---
  const standMat = lam(0x3b4250), concrete = lam(0x8d93a0);
  const seatCols = [0xff8a3d, 0x3d8bff, 0xffd23f, 0x7ed957];
  const makeStand = (len) => {
    const stand = new THREE.Group();
    for (let r = 0; r < 5; r++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(len, 1.1 + r * 1.1, 2.2), r ? lam(seatCols[r % 4]) : standMat);
      row.position.set(0, (1.1 + r * 1.1) / 2, -r * 2.2); row.castShadow = true; row.receiveShadow = true; stand.add(row);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 6, 12.4), concrete); base.position.set(0, -3, -4.4); stand.add(base);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.4, 12), standMat); roof.position.set(0, 9, -4.4); roof.castShadow = true; stand.add(roof);
    for (const x of [-len / 2 + 1, 0, len / 2 - 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), standMat); post.position.set(x, 4.5, -9.8); stand.add(post); }
    return stand;
  };
  const addStand = (start, len, sides) => {
    const spot = fit(start, len + 2, 1.4, 10.8, hw + 9.5, sides);
    if (!spot) return null;
    const stand = put(makeStand(len), spot, hw + 9.5);
    wallRect(stand, -len / 2 - 0.5, len / 2 + 0.5, -10.6, 1.2);
    const count = Math.round(len * 3.6);
    for (let k = 0; k < count; k++) {
      const r = 1 + Math.floor(rnd() * 4);
      const p = toWorld(stand, (rnd() - 0.5) * (len - 2), 1.1 + r * 1.1, -r * 2.2 + (rnd() - 0.5) * 1.2);
      people.add(p.x, p.y, p.z, stand.rotation.y);
    }
    [-1, 1].forEach((e, k) => { const p = toWorld(stand, e * (len / 2 + 0.6), 9.2, -4.4); flags.add(p.x, p.y, p.z, flagCols[(k + start) % flagCols.length], 4.5); });
    return spot;
  };
  const mainStand = addStand(24, gravel ? 22 : 44, [1, -1]);
  addStand(N * 0.34, gravel ? 18 : 30, [-1, 1]);
  addStand(N * 0.66, gravel ? 18 : 30, [1, -1]);

  // --- parked cars shared by the car park and the paddock ---
  const parkBody = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.75, 4.2), new THREE.MeshLambertMaterial({ flatShading: true }), 90);
  const parkCab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.6, 2.1), lam(0x26303f), 90);
  parkBody.castShadow = true;
  const parkCols = [0xe6453a, 0xf6f2e8, 0x3d8bff, 0x2b2f3a, 0xb9c0cc, 0xffd23f, 0x2ec4b6, 0x7a4a2a];
  let parked = 0;
  const pm = new THREE.Matrix4(), pcol = new THREE.Color();
  const parkCar = (p, rot) => {
    if (parked >= 90) return;
    pm.makeRotationY(rot); pm.setPosition(p.x, p.y + 0.6, p.z); parkBody.setMatrixAt(parked, pm);
    pm.setPosition(p.x, p.y + 1.25, p.z); parkCab.setMatrixAt(parked, pm);
    parkBody.setColorAt(parked, pcol.set(parkCols[Math.floor(rnd() * parkCols.length)]));
    claim(p.x, p.z, 2.4);
    parked++;
  };
  if (mainStand) {
    const lot = fit(mainStand.i, 40, 0, 17, hw + 26, [mainStand.side], 30, 5);
    if (lot) for (let row = 0; row < 3; row++) for (let c = 0; c < 13; c++) {
      if (rnd() < 0.22) continue;
      parkCar(lateral(lot.s, lot.side, hw + 28.5 + row * 6, -18 + c * 3), heading(lot.s) + (rnd() < 0.5 ? Math.PI : 0));
    }
  }

  // --- tents ---
  const tentGeo = new THREE.ConeGeometry(3.3, 1.7, 4).rotateY(Math.PI / 4);
  const tentLeg = new THREE.BoxGeometry(0.12, 2.4, 0.12);
  const tentCols = [0xf6f2e8, 0xe6453a, 0x3d8bff, 0xffd23f, 0x2ec4b6, 0xff8a3d];
  let tents = 0;
  const addTent = (p, rot) => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(tentGeo, lam(tentCols[tents++ % tentCols.length])); top.position.y = 3.2; top.castShadow = true; g.add(top);
    for (const [x, z] of [[-2.1, -2.1], [2.1, -2.1], [2.1, 2.1], [-2.1, 2.1]]) { const leg = new THREE.Mesh(tentLeg, postMat); leg.position.set(x, 1.2, z); g.add(leg); }
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1), lam(0x7a4a2a)); table.position.set(0, 0.45, -0.8); g.add(table);
    g.position.copy(p); g.rotation.y = rot; worldGroup.add(g);
  };

  // --- pits on a circuit, a service park on a rally stage ---
  if (!gravel) {
    const spot = fit(N - 18, 56, 2.6, 11.8, hw + 8, [-1, 1]);
    if (spot) {
      const pit = new THREE.Group();
      const building = new THREE.Mesh(new THREE.BoxGeometry(52, 5, 9), lam(0xe9e4d8)); building.position.set(0, 2.5, -6); building.castShadow = true; pit.add(building);
      const base = new THREE.Mesh(new THREE.BoxGeometry(54, 6, 14.4), concrete); base.position.set(0, -3.02, -4.4); pit.add(base);
      const roofP = new THREE.Mesh(new THREE.BoxGeometry(54, 0.5, 11), lam(0x1d2230)); roofP.position.set(0, 5.25, -6); pit.add(roofP);
      for (let k = 0; k < 8; k++) { const door = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.4, 0.2), lam(k % 2 ? 0x3b4250 : 0x5a6372)); door.position.set(-22.4 + k * 6.4, 1.7, -1.45); pit.add(door); }
      const pw = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 0.4), lam(0xf6f2e8)); pw.position.set(0, 0.5, 2); pit.add(pw);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(52.1, 0.3, 0.44), lam(0xe6453a)); stripe.position.set(0, 0.85, 2); pit.add(stripe);
      put(pit, spot, hw + 8);
      wallRect(pit, -26.5, 26.5, -10.6, 2.3);
      for (let k = 0; k < 8; k++) for (let j = 0; j < 2; j++) {
        if (rnd() < 0.3) continue;
        const p = toWorld(pit, -22.4 + k * 6.4 + (rnd() - 0.5) * 3, 0, 0.2 + rnd() * 1.1);
        people.add(p.x, p.y, p.z, pit.rotation.y, k % 2 ? 0xe6453a : 0x3d8bff);
      }
      for (let k = 0; k < 5; k++) { const p = toWorld(pit, -24 + k * 12, 5.5, -6); flags.add(p.x, p.y, p.z, flagCols[k % flagCols.length], 4); }
    }
  } else {
    const spot = fit(N - 30, 40, 0, 10, hw + 9, [-1, 1]);
    if (spot) for (let k = 0; k < 6; k++) {
      const u = -16.5 + k * 6.6;
      addTent(lateral(spot.s, spot.side, hw + 12.5, u), heading(spot.s) + (spot.side > 0 ? -1 : 1) * Math.PI / 2);
      parkCar(lateral(spot.s, spot.side, hw + 17.5, u), heading(spot.s) + Math.PI / 2);
      for (let j = 0; j < 3; j++) { const p = lateral(spot.s, spot.side, hw + 9.5 + rnd() * 1.5, u + (rnd() - 0.5) * 5); people.add(p.x, p.y, p.z, Math.atan2(-spot.side * spot.s.left.x, -spot.side * spot.s.left.z)); }
    }
  }

  // --- barriers on the outside of every real corner (solid) ---
  const railMat = lam(0xc9ced6);
  const baleMat = lam(0xd9b752);
  const tyreGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.85, 8);
  const tyreMats = [lam(0xe6453a), lam(0xf6f2e8), lam(0x1d2230)];
  const boardGeo = new THREE.BoxGeometry(1.6, 1.1, 0.12), legGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
  const boardMats = [lam(0xf6f2e8), lam(0xffd23f), lam(0xe6453a)];
  const railPostGeo = new THREE.BoxGeometry(0.2, 1.0, 0.2);
  let n = 0, wasCorner = false, prev = null, firstRail = null, lastRail = null;
  for (let i = 0; i < N; i += 4) {
    const s = samples[i], corner = Math.abs(turn[i]) > 0.22;
    const outside = turn[i] > 0 ? 1 : -1;      // outside of a right-hander is the left side
    let here = null;
    if (corner && flat(i)) {
      const p = at(s, outside * (hw + 5.2));
      if (isFree(track, p.x, p.z, 0.6, hw + 3)) {
        here = { p, outside, i };
        if (!firstRail) firstRail = here;
        lastRail = here;
        if (!gravel) { const post = new THREE.Mesh(railPostGeo, postMat); post.position.set(p.x, p.y + 0.4, p.z); worldGroup.add(post); }
        if (!gravel && Math.abs(turn[i]) > 0.5 && i % 8 === 0) {
          const q = at(s, outside * (hw + 4.1));
          for (let h = 0; h < 2; h++) {
            const t = new THREE.Mesh(tyreGeo, tyreMats[(n + h) % 3]);
            t.position.set(q.x, q.y + 0.43 + h * 0.85, q.z); t.castShadow = true; worldGroup.add(t);
          }
          n++;
        }
      }
    }
    // join this barrier post to the last one so the rail has no gaps or overlaps
    if (here && prev && prev.outside === here.outside && here.i - prev.i === 4) {
      const a = prev.p.clone(), b = here.p.clone();
      const rail = gravel ? strut(V(a.x, a.y + 0.45, a.z), V(b.x, b.y + 0.45, b.z), 1.0, 0.9, baleMat) : strut(V(a.x, a.y + 0.78, a.z), V(b.x, b.y + 0.78, b.z), 0.25, 0.5, railMat);
      rail.castShadow = true; worldGroup.add(rail);
      wall(a, b);
    }
    prev = here;
    // three boards counting down to a corner that follows a straight
    if (corner && !wasCorner) {
      [60, 40, 20].forEach((back, k) => {
        const bi = wrap(i - back), b = samples[bi];
        if (Math.abs(turn[bi]) > 0.12 || !flat(bi)) return;
        const p = at(b, outside * (hw + 4));
        if (!isFree(track, p.x, p.z, 0.8, hw + 2.5)) return;
        const board = new THREE.Mesh(boardGeo, boardMats[k]);
        board.position.set(p.x, p.y + 1.7, p.z); board.rotation.y = heading(b); board.castShadow = true; worldGroup.add(board);
        const leg = new THREE.Mesh(legGeo, postMat); leg.position.set(p.x, p.y + 0.6, p.z); worldGroup.add(leg);
      });
      // marshal post on the inside of the corner, waving a flag as you arrive
      const mi = wrap(i - 6), msamp = samples[mi], mp = at(msamp, -outside * (hw + 6.5));
      if (flat(mi) && isFree(track, mp.x, mp.z, 2, hw + 4)) {
        claim(mp.x, mp.z, 2);
        const g = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 2.4), lam(0xff8a3d)); deck.position.y = 1.0; deck.castShadow = true; g.add(deck);
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), postMat); leg.position.set(x, 0.1, z); g.add(leg); }
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.12), lam(0xf6f2e8)); back.position.set(0, 1.7, -1.15); g.add(back);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.34), lam(0xff6a1a)); body.position.set(0, 1.58, 0.2); g.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lam(0xf1c9a5)); head.position.set(0, 2.2, 0.2); g.add(head);
        const arm = new THREE.Group(); arm.position.set(0.3, 1.9, 0.3);
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), postMat); stick.position.y = 0.65; arm.add(stick);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.04), lam(n % 2 ? 0xffd23f : 0x3d8bff)); cloth.position.set(0.48, 1.0, 0); arm.add(cloth);
        g.add(arm);
        g.position.copy(mp);
        g.rotation.y = Math.atan2(outside * msamp.left.x, outside * msamp.left.z); // facing the road
        worldGroup.add(g);
        const ph = rnd() * 6;
        anim.push((t) => {
          const car = app.local;
          const near = car && (car.pos.x - mp.x) ** 2 + (car.pos.z - mp.z) ** 2 < 14000;
          arm.rotation.z = near ? Math.sin(t * 7 + ph) * 0.75 : -0.9 + Math.sin(t * 1.3 + ph) * 0.06;
        });
      }
    }
    wasCorner = corner;
  }

  // --- billboards and light poles along the straights ---
  const adColors = [0xff8a3d, 0x3d8bff, 0x7ed957, 0xffd23f, 0x8c6bff, 0x2ec4b6];
  let bb = 0;
  for (let i = 60; i < N - 40; i += 46) {
    if (Math.abs(turn[i]) > 0.15 || !flat(i)) continue;
    const s = samples[i], side = bb % 2 ? 1 : -1, p = at(s, side * (hw + 12));
    const rot = heading(s) + Math.PI / 2 + 0.5 * side; // long side along the road, angled toward oncoming cars
    const ex = Math.cos(rot) * 5, ez = -Math.sin(rot) * 5;
    if (![-1, 0, 1].every(e => isFree(track, p.x + ex * e, p.z + ez * e, 1.5, hw + 5))) continue;
    for (const e of [-1, 0, 1]) claim(p.x + ex * e, p.z + ez * e, 2.6);
    const grp = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.3), lam(adColors[bb % adColors.length]));
    panel.position.y = 4; panel.castShadow = true; grp.add(panel);
    const band = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.7, 0.34), lam(0x1d2230)); band.position.y = 4; grp.add(band);
    for (const x of [-4, 4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, 0.3), postMat); leg.position.set(x, 0, 0); grp.add(leg); }
    grp.position.copy(p);
    grp.rotation.y = rot;
    worldGroup.add(grp);
    const pole = at(s, -side * (hw + 6));
    if (!gravel && isFree(track, pole.x, pole.z, 1, hw + 3)) {
      claim(pole.x, pole.z, 1);
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 13, 0.3), postMat); mast.position.set(pole.x, pole.y + 3.5, pole.z); mast.castShadow = true; worldGroup.add(mast);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.2), lam(0xf6f2e8)); lamp.position.set(pole.x, pole.y + 10, pole.z); lamp.rotation.y = heading(s) + Math.PI / 2; worldGroup.add(lamp);
    }
    bb++;
  }

  // --- spectators behind a fence all the way round, some with a tent or flag ---
  const fenceMat = lam(0xf6f2e8);
  for (let i = 40, k = 0; i < N - 20; i += 30, k++) {
    const pref = k % 2 ? 1 : -1;
    const spot = fit(i, 13, 0, 5, hw + 8, [pref, -pref], 8, 4);
    if (!spot) continue;
    const { s, side } = spot;
    const face = Math.atan2(-side * s.left.x, -side * s.left.z);
    const a = lateral(s, side, hw + 7.4, -6.5), b = lateral(s, side, hw + 7.4, 6.5);
    for (const h of [0.55, 1.05]) worldGroup.add(strut(V(a.x, a.y + h, a.z), V(b.x, b.y + h, b.z), 0.08, 0.1, fenceMat));
    for (let j = 0; j <= 4; j++) { const q = lateral(s, side, hw + 7.4, -6.5 + j * 3.25); const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), fenceMat); post.position.set(q.x, q.y + 0.55, q.z); worldGroup.add(post); }
    wall(a, b);
    const extra = k % 3;
    const count = 5 + Math.floor(rnd() * 9);
    for (let j = 0; j < count; j++) {
      const p = lateral(s, side, hw + 8.2 + rnd() * (extra === 0 ? 1.4 : 3.6), -6 + rnd() * 12);
      people.add(p.x, p.y, p.z, face + (rnd() - 0.5) * 0.6);
    }
    if (extra === 0) addTent(lateral(s, side, hw + 12.4, (rnd() - 0.5) * 4), face);
    if (extra === 1) { const p = lateral(s, side, hw + 12, 5); flags.add(p.x, p.y, p.z, flagCols[k % flagCols.length], 7); }
  }

  // flags either side of the start line
  for (const side of [1, -1]) for (const u of [-9, 9]) {
    const p = lateral(samples[0], side, hw + 4.4, u);
    if (isFree(track, p.x, p.z, 0.5, hw + 3)) flags.add(p.x, p.y, p.z, flagCols[(u > 0 ? 0 : 1) + (side > 0 ? 0 : 2)], 8);
  }

  parkBody.count = parkCab.count = parked;
  worldGroup.add(parkBody, parkCab);
  people.finish();
}

// Countryside and sky: trees, bushes, rocks, a farm, sheep, hay bales, wind
// turbines, mountains, drifting clouds, hot-air balloons, birds, a helicopter.
function buildScenery(track) {
  const rnd = mulberry32(1234 + app.trackId * 99);
  const { hw, bounds } = track;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.z) * 0.9 + 140;
  const pick = (r, margin, tries = 80) => {
    for (let k = 0; k < tries; k++) {
      const x = center.x + (rnd() - 0.5) * spread, z = center.z + (rnd() - 0.5) * spread;
      if (isFree(track, x, z, r, margin)) return V(x, terrainHeight(x, z), z);
    }
    return null;
  };

  // wind turbines
  const towerGeo = new THREE.CylinderGeometry(0.5, 1.1, 30, 6), bladeGeo = new THREE.BoxGeometry(0.7, 12, 0.18).translate(0, 6.4, 0);
  const white = lam(0xf1f0ea);
  for (let k = 0; k < 4; k++) {
    const p = pick(8, hw + 55);
    if (!p) continue;
    claim(p.x, p.z, 8);
    const g = new THREE.Group();
    const tower = new THREE.Mesh(towerGeo, white); tower.position.y = 14; tower.castShadow = true; g.add(tower);
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 3), white); nacelle.position.set(0, 29.4, 0.4); g.add(nacelle);
    const rotor = new THREE.Group(); rotor.position.set(0, 29.4, 2.1);
    for (let b = 0; b < 3; b++) { const blade = new THREE.Mesh(bladeGeo, white); blade.rotation.z = (b * Math.PI * 2) / 3; rotor.add(blade); }
    g.add(rotor);
    g.position.copy(p); g.rotation.y = 0.6; worldGroup.add(g);
    const sp = 0.9 + rnd() * 0.5, ph = rnd() * 6;
    anim.push((t) => { rotor.rotation.z = t * sp + ph; });
  }

  // a farm: house, barn, silo
  const farm = pick(16, hw + 38);
  if (farm) {
    claim(farm.x, farm.z, 16);
    const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2);
    const g = new THREE.Group();
    const building = (w, h, d, wallCol, roofCol, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h + 4, d), lam(wallCol)); b.position.set(x, h / 2 - 2, z); b.castShadow = true; g.add(b);
      const r = new THREE.Mesh(roofGeo, lam(roofCol)); r.scale.set(w + 0.8, d * 0.34, d * 0.62); r.position.set(x, h + d * 0.17, z); r.castShadow = true; g.add(r);
    };
    building(9, 4, 7, 0xf1e9d6, 0x9c3b2e, -6, 0);
    building(12, 5.5, 8, 0xb8483a, 0x3b4250, 7, 2);
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 13, 8), lam(0xc9ced6)); silo.position.set(15, 4.5, -3); silo.castShadow = true; g.add(silo);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 8), lam(0x8d93a0)); cap.position.set(15, 11.8, -3); g.add(cap);
    g.position.copy(farm); g.rotation.y = rnd() * 6; worldGroup.add(g);
  }

  // sheep and hay bales in the fields
  const wool = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), lam(0xf4f1e6), 60);
  const faces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.36, 0.4), lam(0x2b2f3a), 60);
  wool.castShadow = true;
  const sheep = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  for (let f = 0; f < 5; f++) {
    const c = pick(9, hw + 16);
    if (!c) continue;
    claim(c.x, c.z, 4);
    const count = 7 + Math.floor(rnd() * 6);
    for (let k = 0; k < count && sheep.length < 60; k++) {
      const a = rnd() * 6.28, r = 1.5 + rnd() * 8;
      sheep.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, rot: rnd() * 6.28, ph: rnd() * 6.28, graze: rnd() < 0.6 });
    }
  }
  const sheepUpdate = (t) => {
    sheep.forEach((s, i) => {
      const y = terrainHeight(s.x, s.z);
      E.set(0, s.rot, 0); Q.setFromEuler(E);
      M.compose(V(s.x, y + 0.55, s.z), Q, V(1, 0.85, 1.35)); wool.setMatrixAt(i, M);
      const dip = s.graze ? 0.22 + 0.2 * Math.sin(t * 1.4 + s.ph) : 0;   // heads go down to graze
      M.compose(V(s.x + Math.sin(s.rot) * 0.85, y + 0.78 - dip, s.z + Math.cos(s.rot) * 0.85), Q, V(1, 1, 1)); faces.setMatrixAt(i, M);
    });
    wool.instanceMatrix.needsUpdate = faces.instanceMatrix.needsUpdate = true;
  };
  wool.count = faces.count = sheep.length;
  wool.frustumCulled = faces.frustumCulled = false;
  sheepUpdate(0); anim.push(sheepUpdate);
  worldGroup.add(wool, faces);

  const bales = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 9).rotateZ(Math.PI / 2), lam(0xd9b752), 40);
  bales.castShadow = true;
  let nb = 0;
  for (let f = 0; f < 5; f++) {
    const c = pick(8, hw + 14);
    if (!c) continue;
    for (let k = 0; k < 8; k++) {
      const x = c.x + (rnd() - 0.5) * 22, z = c.z + (rnd() - 0.5) * 22;
      if (!isFree(track, x, z, 1.2, hw + 9)) continue;
      claim(x, z, 1.2);
      M.makeRotationY(rnd() * 3.14); M.setPosition(x, terrainHeight(x, z) + 0.85, z); bales.setMatrixAt(nb++, M);
    }
  }
  bales.count = nb; worldGroup.add(bales);

  // trees: conifers and round broadleaf ones
  const TREES = 300, ROUND = 130;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
  const trunkMat = lam(0x7a4a2a);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES + ROUND);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 6), new THREE.MeshLambertMaterial({ flatShading: true }), TREES);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.4, 0), new THREE.MeshLambertMaterial({ flatShading: true }), ROUND);
  trunks.castShadow = canopies.castShadow = crowns.castShadow = true;
  const m = new THREE.Matrix4();
  const greens = [0x3f9a4a, 0x55b35a, 0x2f8a52, 0x6cc46a, 0x3b8f3f], warm = [0x6cc46a, 0x86c95a, 0xa7c957, 0x4fae54, 0xd9a441];
  let placed = 0, nc = 0, nr = 0, tries = 0;
  while (placed < TREES + ROUND && tries++ < 6000) {
    const x = center.x + (rnd() - 0.5) * spread;
    const z = center.z + (rnd() - 0.5) * spread;
    if (!isFree(track, x, z, 2.5, hw + 9)) continue;
    const sc = 0.7 + rnd() * 0.9;
    const gy = terrainHeight(x, z);
    m.makeScale(sc, sc, sc); m.setPosition(x, gy + 1.5 * sc, z);
    trunks.setMatrixAt(placed, m);
    if (nc < TREES && (nr >= ROUND || rnd() < 0.7)) {
      m.makeRotationY(rnd() * Math.PI); m.scale(V(sc, sc, sc)); m.setPosition(x, gy + 7 * sc, z);
      canopies.setMatrixAt(nc, m);
      canopies.setColorAt(nc++, new THREE.Color(greens[Math.floor(rnd() * greens.length)]));
    } else {
      m.makeRotationY(rnd() * Math.PI); m.scale(V(sc, sc * 0.9, sc)); m.setPosition(x, gy + 5.2 * sc, z);
      crowns.setMatrixAt(nr, m);
      crowns.setColorAt(nr++, new THREE.Color(warm[Math.floor(rnd() * warm.length)]));
    }
    placed++;
  }
  trunks.count = placed; canopies.count = nc; crowns.count = nr;
  worldGroup.add(trunks, canopies, crowns);

  // bushes and rocks
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 260);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 120);
  bushes.castShadow = rocks.castShadow = true;
  const scatter = (mesh, count, colors, smin, smax, sink) => {
    let put = 0, t2 = 0;
    while (put < count && t2++ < count * 20) {
      const x = center.x + (rnd() - 0.5) * (spread + 60), z = center.z + (rnd() - 0.5) * (spread + 60);
      if (!isFree(track, x, z, 1.5, hw + 7)) continue;
      const sc = smin + rnd() * (smax - smin);
      E.set(rnd() * 3, rnd() * 3, rnd() * 3); Q.setFromEuler(E);
      M.compose(V(x, terrainHeight(x, z) + sc * sink, z), Q, V(sc * (0.8 + rnd() * 0.6), sc * 0.7, sc));
      mesh.setMatrixAt(put, M); mesh.setColorAt(put, new THREE.Color(colors[Math.floor(rnd() * colors.length)]));
      put++;
    }
    mesh.count = put; worldGroup.add(mesh);
  };
  scatter(bushes, 260, [0x4fae54, 0x3f9a4a, 0x6cc46a, 0x86c95a], 0.8, 1.9, 0.35);
  scatter(rocks, 120, [0x8f917c, 0xa3a59a, 0x7c8696], 0.6, 2.4, 0.2);

  // distant mountains
  const hillMat = lam(0x6fb963);
  const hillGeo = new THREE.ConeGeometry(1, 1, 7);
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const r = spread * 0.75 + 120 + rnd() * 160;
    const h = 40 + rnd() * 70, w = 90 + rnd() * 120;
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(w, h, w);
    hill.position.set(center.x + Math.cos(ang) * r, h / 2 - 2, center.z + Math.sin(ang) * r);
    hill.rotation.y = rnd() * Math.PI;
    worldGroup.add(hill);
  }

  // clouds, drifting on the wind
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8f96, flatShading: true }); // lit from within so the grass doesn't tint them green
  const cloudGeo = new THREE.DodecahedronGeometry(1, 0);
  const clouds = [], reach = spread * 0.75;
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.set(10 + rnd() * 10, 5 + rnd() * 4, 8 + rnd() * 6);
      puff.position.set(k * 12 - n * 5, rnd() * 3, rnd() * 4);
      g.add(puff);
    }
    g.position.set(center.x + (rnd() - 0.5) * reach * 2, 90 + rnd() * 30, center.z + (rnd() - 0.5) * reach * 2);
    worldGroup.add(g); clouds.push(g);
  }
  anim.push((t, dt) => { for (const c of clouds) { c.position.x += dt * 3; if (c.position.x > center.x + reach) c.position.x -= reach * 2; } });

  // hot-air balloons
  const balloonCols = [[0xe6453a, 0xffd23f], [0x3d8bff, 0xf6f2e8], [0x8c6bff, 0xff8a3d]];
  balloonCols.forEach(([c1, c2], k) => {
    const g = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), lam(c1)); env.scale.y = 1.2; g.add(env);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 2.6, 8), lam(c2)); g.add(band);
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(4.2, 5, 8, 1, true), lam(c1)); skirt.rotation.x = Math.PI; skirt.position.y = -8.2; g.add(skirt);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), lam(0x7a4a2a)); basket.position.y = -12.5; g.add(basket);
    worldGroup.add(g);
    const a0 = rnd() * 6.28, r = spread * (0.2 + 0.12 * k), h = 55 + k * 14, ph = rnd() * 6;
    anim.push((t) => {
      const a = a0 + t * 0.012 * (k % 2 ? -1 : 1);
      g.position.set(center.x + Math.cos(a) * r, h + Math.sin(t * 0.4 + ph) * 3, center.z + Math.sin(a) * r);
    });
  });

  // birds in loose V formations
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.35, 0, 0, -0.35, 1.1, 0.3, -0.1, 0, 0, 0.35, -1.1, 0.3, -0.1, 0, 0, -0.35], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2f3a, side: THREE.DoubleSide });
  for (let f = 0; f < 3; f++) {
    const flock = new THREE.Group(), birds = [];
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Mesh(birdGeo, birdMat);
      const row = Math.ceil(k / 2), sd = k % 2 ? 1 : -1;
      b.position.set(sd * row * 1.8, (rnd() - 0.5) * 0.8, -row * 1.6);
      b.userData.ph = rnd() * 6;
      flock.add(b); birds.push(b);
    }
    worldGroup.add(flock);
    const cx = center.x + (rnd() - 0.5) * spread * 0.5, cz = center.z + (rnd() - 0.5) * spread * 0.5;
    const r = 60 + rnd() * 70, h = 28 + rnd() * 22, sp = (0.1 + rnd() * 0.08) * (f % 2 ? 1 : -1), a0 = rnd() * 6.28;
    anim.push((t) => {
      const a = a0 + t * sp;
      flock.position.set(cx + Math.cos(a) * r, h + Math.sin(t * 0.3 + f) * 4, cz + Math.sin(a) * r);
      flock.rotation.y = Math.atan2(-Math.sin(a) * sp, Math.cos(a) * sp);
      for (const b of birds) b.scale.y = Math.sin(t * 9 + b.userData.ph) * 1.6;
    });
  }

  // a helicopter filming the race
  {
    const g = new THREE.Group();
    const body = new THREE.Mesh(taperBox(2, 2, 4.2, [0.7, 0.75, -0.1], [0.6, 0.6, 0.2]), lam(0xf6f2e8)); body.castShadow = true; g.add(body);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.2), lam(0x26303f)); glass.position.set(0, 0.25, 1.7); g.add(glass);
    const tail = new THREE.Mesh(taperBox(0.6, 0.6, 4.6, null, [0.4, 0.5, 0.25]), lam(0xe6453a)); tail.position.set(0, 0.5, -4.2); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), lam(0xe6453a)); fin.position.set(0, 1.3, -6.2); g.add(fin);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 0.5), lam(0x1d2230)); rotor.position.y = 1.35; g.add(rotor);
    const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 10), lam(0x1d2230)); rotor.add(rotor2);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.25), lam(0x1d2230)); tailRotor.position.set(0.25, 1.3, -6.2); g.add(tailRotor);
    for (const sx of [-1, 1]) { const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), lam(0x1d2230)); skid.position.set(sx * 0.9, -1.4, 0.2); g.add(skid); }
    worldGroup.add(g);
    const r = Math.max(size.x, size.z) * 0.32 + 30;
    anim.push((t) => {
      const a = t * 0.11;
      g.position.set(center.x + Math.cos(a) * r, 48 + Math.sin(t * 0.5) * 3, center.z + Math.sin(a) * r);
      g.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0);
      g.rotateZ(-0.18); g.rotateX(0.1);
      rotor.rotation.y = t * 22; tailRotor.rotation.x = t * 30;
    });
  }
}

// ---------------------------------------------------------------------------
// cars
// ---------------------------------------------------------------------------
// Low-poly cars built from tapered blocks. Two classes: an open-wheel single
// seater and a rally hatchback. Both face +z.
function taperBox(w, h, d, front, rear) {
  // front / rear = [widthScale, heightScale, yShift] applied to the +z / -z face
  const geo = new THREE.BoxGeometry(w, h, d);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const f = p.getZ(i) > 0 ? front : rear;
    if (!f) continue;
    p.setX(i, p.getX(i) * f[0]);
    p.setY(i, p.getY(i) * f[1] + (f[2] || 0));
  }
  geo.computeVertexNormals();
  return geo;
}

// Six-sided solid from 8 corners: bottom front-left, front-right, rear-right,
// rear-left, then the same four on top.
function hexa(c) {
  const v = c.map(p => new THREE.Vector3(p[0], p[1], p[2])), pos = [];
  for (const [a, b, cc, d] of [[4, 5, 6, 7], [0, 3, 2, 1], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]) pushQuad(pos, null, v[a], v[b], v[cc], v[d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// symmetric slab: half-widths at the bottom and top, and where the front and rear faces sit at each height
const slab = (wB, wT, y0, y1, zfB, zfT, zrT, zrB) => hexa([[-wB, y0, zfB], [wB, y0, zfB], [wB, y0, zrB], [-wB, y0, zrB], [-wT, y1, zfT], [wT, y1, zfT], [wT, y1, zrT], [-wT, y1, zrT]]);

function makeCarMesh(colorIdx, name, isMe, cls = app.carClass) {
  const g = new THREE.Group();
  const color = CAR_COLORS[colorIdx] ?? CAR_COLORS[0];
  const lightCar = colorIdx === 8 || colorIdx === 2 || colorIdx === 11;
  const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const K = {
    g, lightCar,
    body: L(color), accent: L(lightCar ? 0x1d2230 : 0xf6f2e8), dark: L(0x1d2230), carbon: L(0x2b303b),
    tyre: L(0x15181f), rim: L(0xb9c0cc), glass: L(0x24303f), flap: L(0xb3261e),
    helmet: L(lightCar ? 0xff8a3d : 0xffd23f),
    brake: new THREE.MeshLambertMaterial({ color: 0x6a1212, emissive: 0x000000, flatShading: true }),
    lamp: new THREE.MeshLambertMaterial({ color: 0xfff6cf, emissive: 0x6b6440, flatShading: true }),
  };
  K.add = (geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m;
  };
  K.box = (w, h, d, mat, x, y, z, shadow = true) => K.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);
  K.rod = (a, b, th, mat) => { const m = strut(V(...a), V(...b), th, th, mat); g.add(m); return m; };

  const wheelSpec = cls === 'rally' ? buildRallyBody(K) : buildOpenBody(K);

  const wheels = [];
  for (const [x, z, w, r] of wheelSpec.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), K.tyre);
    mesh.castShadow = true;
    if (wheelSpec.band) { // thin coloured compound stripe on the sidewall
      mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, w + 0.012, 12).rotateZ(Math.PI / 2), wheelSpec.band));
      mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, w + 0.018, 12).rotateZ(Math.PI / 2), K.tyre));
    }
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.024, 5).rotateZ(Math.PI / 2), wheelSpec.rim)); // 5 sides so you can see it spin
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, w + 0.06, 6).rotateZ(Math.PI / 2), wheelSpec.hub));
    pivot.add(mesh);
    g.add(pivot);
    wheels.push({ pivot, mesh, front: z > 0 });
  }

  let label = null;
  if (!isMe) {
    label = makeLabel(name, COLOR_CSS[colorIdx]);
    label.position.y = cls === 'rally' ? 2.8 : 2.5;
    g.add(label);
  }
  return { group: g, wheels, label, bodyMat: K.body, brakeMat: K.brake, cls };
}

// Open-wheel single seater: stepped floor, slim monocoque running into a
// drooping nose, three-element front wing, undercut sidepods, airbox and
// engine cover with a fin, halo, wishbone suspension, rear wing on swan necks.
function buildOpenBody(K) {
  const { add, box, rod, body, accent, dark, carbon } = K;
  // floor, edge wings and diffuser
  add(taperBox(1.56, 0.05, 3.9, [0.42, 1, 0], null), carbon, 0, 0.14, 0.05);
  box(1.86, 0.04, 1.9, carbon, 0, 0.15, -0.75);
  add(taperBox(1.5, 0.2, 0.55, null, [1, 1.7, 0.1]), carbon, 0, 0.27, -2.1);
  // monocoque into the nose
  add(taperBox(0.78, 0.56, 2.3, [0.6, 0.58, -0.05], null), body, 0, 0.5, 0.85);
  add(taperBox(0.468, 0.325, 1.25, [0.45, 0.42, -0.1], null), body, 0, 0.45, 2.62);
  add(taperBox(0.21, 0.137, 0.22, [0.7, 0.7, -0.01], null), dark, 0, 0.35, 3.36);
  box(0.3, 0.02, 0.6, accent, 0, 0.552, 2.45, false).rotation.x = 0.156;   // nose band
  // front wing
  box(2.0, 0.045, 0.5, carbon, 0, 0.15, 3.15);
  for (const sx of [-1, 1]) {
    box(0.78, 0.04, 0.3, body, sx * 0.6, 0.24, 3.02).rotation.x = -0.3;
    box(0.78, 0.035, 0.22, accent, sx * 0.6, 0.33, 2.9).rotation.x = -0.45;
    add(taperBox(0.05, 0.3, 0.62, [1, 0.6, -0.05], null), body, sx * 1.0, 0.27, 3.12);
    box(0.05, 0.16, 0.2, dark, sx * 0.09, 0.25, 3.18, false);              // wing pylons under the nose
  }
  // sidepods, intakes, floor fences
  for (const sx of [-1, 1]) {
    add(taperBox(0.62, 0.44, 2.2, null, [0.35, 0.5, -0.1]), body, sx * 0.7, 0.45, -0.75);
    box(0.46, 0.24, 0.05, dark, sx * 0.72, 0.5, 0.36, false);
    box(0.3, 0.02, 1.1, accent, sx * 0.7, 0.632, -0.25, false).rotation.x = -0.095;
    box(0.04, 0.26, 0.55, carbon, sx * 0.62, 0.33, 0.8, false);
    box(0.12, 0.2, 0.7, body, sx * 0.3, 0.84, -0.02, false);               // cockpit sides
    box(0.16, 0.09, 0.06, accent, sx * 0.56, 0.92, 0.7, false);            // mirror
    rod([sx * 0.3, 0.72, 0.7], [sx * 0.52, 0.9, 0.7], 0.035, dark);
  }
  // engine cover, airbox, fin, camera
  add(taperBox(0.56, 0.66, 2.1, null, [0.28, 0.3, -0.18]), body, 0, 0.72, -1.15);
  add(taperBox(0.34, 0.32, 0.75, null, [0.6, 0.5, -0.06]), body, 0, 1.2, -0.45);
  box(0.24, 0.2, 0.04, dark, 0, 1.22, -0.07, false);
  box(0.08, 0.07, 0.24, dark, 0, 1.4, -0.3, false);
  add(taperBox(0.035, 0.46, 1.25, null, [1, 0.3, -0.16]), body, 0, 1.06, -1.45);
  box(0.2, 0.02, 0.9, accent, 0, 1.0, -1.2, false).rotation.x = -0.2;
  // cockpit: opening, helmet, visor, halo
  box(0.5, 0.05, 0.8, dark, 0, 0.765, 0.2, false);
  const helmet = add(new THREE.IcosahedronGeometry(0.21, 1), K.helmet, 0, 0.98, 0.1);
  helmet.scale.set(1, 1, 1.1);
  box(0.3, 0.09, 0.14, dark, 0, 1.0, 0.27, false);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 5, 12, Math.PI), dark);
  halo.rotation.x = -Math.PI / 2; halo.rotation.z = Math.PI / 2; halo.position.set(0, 1.16, 0.12); K.g.add(halo);
  rod([0, 0.7, 0.6], [0, 1.16, 0.5], 0.06, dark);
  for (const sx of [-1, 1]) rod([sx * 0.4, 1.16, 0.12], [sx * 0.33, 0.92, -0.25], 0.06, dark);
  // rear wing: two elements, endplates, beam wing, swan-neck pylons
  box(1.5, 0.05, 0.5, carbon, 0, 1.2, -2.25);
  box(1.5, 0.045, 0.3, body, 0, 1.36, -2.4).rotation.x = 0.4;
  box(1.4, 0.04, 0.28, carbon, 0, 0.72, -2.2);
  for (const sx of [-1, 1]) {
    box(0.045, 0.78, 0.85, body, sx * 0.77, 1.0, -2.25);
    box(0.05, 0.2, 0.86, accent, sx * 0.772, 1.29, -2.25, false);
    rod([sx * 0.13, 0.6, -1.9], [sx * 0.13, 1.2, -2.2], 0.06, dark);
  }
  box(0.2, 0.16, 0.4, carbon, 0, 0.48, -2.25);
  box(0.14, 0.2, 0.06, K.brake, 0, 0.5, -2.47, false);                      // rain / brake light

  // wishbones, pushrods and driveshafts
  const wheels = [[-0.92, 1.75, 0.36, 0.42], [0.92, 1.75, 0.36, 0.42], [-0.9, -1.6, 0.46, 0.44], [0.9, -1.6, 0.46, 0.44]];
  for (const [x, z, , r] of wheels) {
    const sx = Math.sign(x), front = z > 0, ix = sx * (front ? 0.22 : 0.16), hx = x - sx * 0.2;
    for (const [iy, hy] of [[front ? 0.6 : 0.62, r + 0.15], [0.3, r - 0.16]]) {
      rod([ix, iy, z + 0.38], [hx, hy, z], 0.035, dark);
      rod([ix, iy, z - 0.38], [hx, hy, z], 0.035, dark);
    }
    rod([ix, front ? 0.62 : 0.5, z + (front ? 0.12 : 0)], [hx, r - (front ? 0.14 : 0), z], 0.04, carbon);
  }
  return { wheels, rim: K.rim, hub: body, band: K.helmet };
}

// Rally hatchback: tall ride height, sloping bonnet with a lamp pod, raked
// glasshouse, roof scoop, flared arches, mud flaps and a big rear wing.
function buildRallyBody(K) {
  const { add, box, rod, body, accent, dark, carbon, glass } = K;
  // sills and lower body
  add(slab(0.88, 0.93, 0.3, 0.62, 2.0, 2.1, -2.06, -1.96), body, 0, 0, 0);
  // upper body behind the bonnet
  add(slab(0.93, 0.89, 0.62, 0.98, 0.75, 0.75, -2.0, -2.06), body, 0, 0, 0);
  // bonnet, dropping toward the nose
  add(hexa([[-0.93, 0.62, 2.1], [0.93, 0.62, 2.1], [0.93, 0.62, 0.75], [-0.93, 0.62, 0.75], [-0.84, 0.8, 2.02], [0.84, 0.8, 2.02], [0.89, 0.98, 0.75], [-0.89, 0.98, 0.75]]), body, 0, 0, 0);
  box(0.5, 0.03, 0.9, dark, 0, 0.905, 1.35, false).rotation.x = 0.14;       // bonnet vent
  // glasshouse, roof and pillars
  add(slab(0.85, 0.69, 0.98, 1.44, 0.86, 0.16, -1.36, -1.96), glass, 0, 0, 0);
  add(slab(0.71, 0.69, 1.44, 1.5, 0.22, 0.12, -1.34, -1.42), body, 0, 0, 0);
  for (const sx of [-1, 1]) {
    rod([sx * 0.85, 0.98, 0.86], [sx * 0.69, 1.46, 0.16], 0.09, body);
    rod([sx * 0.86, 0.98, -0.45], [sx * 0.7, 1.46, -0.5], 0.1, body);
    rod([sx * 0.85, 0.98, -1.96], [sx * 0.69, 1.46, -1.36], 0.1, body);
  }
  add(taperBox(0.4, 0.13, 0.5, null, [0.8, 0.4, -0.03]), dark, 0, 1.56, -0.1);  // roof scoop
  rod([0.3, 1.5, -0.9], [0.3, 1.95, -1.15], 0.025, dark);                       // aerial
  // nose: bumper, grille, splitter, headlights, lamp pod
  box(1.86, 0.3, 0.2, dark, 0, 0.44, 2.08);
  box(1.1, 0.14, 0.06, carbon, 0, 0.64, 2.12, false);
  box(1.92, 0.05, 0.42, carbon, 0, 0.28, 2.1);
  for (const sx of [-1, 1]) box(0.36, 0.13, 0.08, K.lamp, sx * 0.6, 0.72, 2.07, false);
  box(0.96, 0.17, 0.14, dark, 0, 0.87, 1.99);
  for (const x of [-0.34, -0.115, 0.115, 0.34]) add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8).rotateX(Math.PI / 2), K.lamp, x, 0.875, 2.07, false);
  // tail: bumper, lights, exhaust
  box(1.84, 0.24, 0.18, dark, 0, 0.42, -2.0);
  for (const sx of [-1, 1]) box(0.34, 0.13, 0.06, K.brake, sx * 0.58, 0.84, -2.07, false);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6).rotateX(Math.PI / 2), carbon, 0.45, 0.32, -2.1, false);
  // big rear wing
  box(1.72, 0.05, 0.44, carbon, 0, 1.56, -1.98);
  box(1.72, 0.04, 0.2, accent, 0, 1.65, -2.14, false).rotation.x = 0.5;
  for (const sx of [-1, 1]) {
    box(0.05, 0.34, 0.56, body, sx * 0.86, 1.52, -1.98);
    rod([sx * 0.45, 1.3, -1.62], [sx * 0.45, 1.55, -1.92], 0.07, dark);
  }
  // sides: stripe, door plate, mirrors, arches, mud flaps
  const wheels = [[-0.86, 1.32, 0.28, 0.37], [0.86, 1.32, 0.28, 0.37], [-0.86, -1.3, 0.28, 0.37], [0.86, -1.3, 0.28, 0.37]];
  for (const sx of [-1, 1]) {
    box(0.02, 0.13, 2.7, accent, sx * 0.925, 0.7, -0.3, false);
    box(0.02, 0.36, 0.44, K.lightCar ? dark : accent, sx * 0.93, 0.8, -0.05, false);
    box(0.14, 0.1, 0.1, dark, sx * 0.99, 1.04, 0.62, false);
  }
  for (const [x, z] of wheels) {
    const sx = Math.sign(x);
    add(taperBox(0.16, 0.16, 1.05, [1, 0.5, -0.05], [1, 0.5, -0.05]), body, sx * 0.94, 0.8, z);  // flared arch
    box(0.3, 0.3, 0.03, K.flap, x, 0.27, z - 0.46, false);                    // mud flap
  }
  box(1.5, 0.05, 1.2, carbon, 0, 0.27, 1.2);                                     // sump guard
  return { wheels, rim: K.lightCar ? K.rim : K.accent, hub: dark, band: null };
}

function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '900 34px "Segoe UI", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = Math.min(240, ctx.measureText(text).width + 28);
  ctx.fillStyle = '#1d2230';
  roundRect(ctx, 128 - w / 2, 8, w, 48, 14); ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, 128 - w / 2 + 3, 11, w - 6, 42, 11); ctx.fill();
  ctx.fillStyle = '#1d2230';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(6, 1.5, 1);
  sp.renderOrder = 5;
  return sp;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function clearCars() {
  for (const c of app.cars.values()) carsGroup.remove(c.mesh.group);
  app.cars.clear();
  if (app.local) carsGroup.remove(app.local.mesh.group);
  app.local = null;
}

function spawnLocal(slot) {
  const { pos, heading, idx } = startSlot(app.track, slot);
  const mesh = makeCarMesh(app.color, app.name, true);
  const car = {
    pos, h: heading, speed: 0, vx: 0, vz: 0, yawRate: 0, steerAngle: 0, ax: 0, slip: 0, vy: 0, airborne: false,
    idx, lastIdx: idx, onTrack: true, nextCp: 1, lap: 1, lastCpIdx: 0, fellTimer: 0,
    offTrackTimer: 0, mesh, pitch: 0, roll: 0, wheelSpin: 0,
  };
  mesh.group.position.copy(pos);
  mesh.group.rotation.y = heading;
  carsGroup.add(mesh.group);
  app.local = car;
}

function ensureRemote(p) {
  let c = app.cars.get(p.id);
  if (c) return c;
  const mesh = makeCarMesh(p.color, p.name, false);
  c = { id: p.id, name: p.name, color: p.color, mesh, a: null, b: null, lap: 1, cp: 1, pr: 0, finished: false, place: 0, wheelSpin: 0 };
  mesh.group.visible = false;
  carsGroup.add(mesh.group);
  app.cars.set(p.id, c);
  return c;
}

// ---------------------------------------------------------------------------
// dust & tyre smoke
// ---------------------------------------------------------------------------
const DUST_N = 160;
const dustGeo = new THREE.DodecahedronGeometry(0.35, 0);
const dustPools = {};
for (const [kind, color] of [['dust', 0xcdbb8e], ['smoke', 0xdde1e6]]) {
  const mesh = new THREE.InstancedMesh(dustGeo, new THREE.MeshLambertMaterial({ color, flatShading: true }), DUST_N);
  mesh.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < DUST_N; i++) mesh.setMatrixAt(i, zero);
  scene.add(mesh);
  dustPools[kind] = { mesh, parts: Array.from({ length: DUST_N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1 })), next: 0 };
}
function emitDust(car, amount, kind) {
  const pool = dustPools[kind];
  const n = Math.min(3, Math.ceil(amount * 2.5));
  const fx = Math.sin(car.h), fz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h);
  for (let i = 0; i < n; i++) {
    const p = pool.parts[pool.next]; pool.next = (pool.next + 1) % DUST_N;
    const side = Math.random() < 0.5 ? 1 : -1;
    p.x = car.pos.x - fx * 1.4 + lx * side * 1.0; p.y = car.pos.y + 0.3; p.z = car.pos.z - fz * 1.4 + lz * side * 1.0;
    p.vx = -car.vx * 0.12 + (Math.random() - 0.5) * 2; p.vy = 1.5 + Math.random() * 2; p.vz = -car.vz * 0.12 + (Math.random() - 0.5) * 2;
    p.max = 0.4 + Math.random() * 0.4 + amount * 0.3; p.life = p.max; p.s = 0.3 + amount * 0.5;
  }
}
const dustM = new THREE.Matrix4();
function updateDust(dt) {
  for (const pool of Object.values(dustPools)) {
    pool.parts.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 1.5 * dt;
      const t = Math.max(0, p.life / p.max);
      const s = p.life <= 0 ? 0 : p.s * (0.4 + (1 - t) * 1.2) * Math.min(1, t * 4);
      dustM.makeScale(s, s, s); dustM.setPosition(p.x, p.y, p.z);
      pool.mesh.setMatrixAt(i, dustM);
    });
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
}

// players in start order: qualifying grid first (if one was set), then everyone else
function gridOrder(grid) {
  const players = app.room?.players || [];
  const g = grid || [];
  const pos = (p) => { const i = g.indexOf(p.id); return i < 0 ? 1000 + players.indexOf(p) : i; };
  return [...players].sort((a, b) => pos(a) - pos(b));
}

// park everyone on the grid for the lobby view
function layoutLobbyCars() {
  if (!app.room || !app.track) return;
  clearCars();
  gridOrder(app.room.grid).forEach((p, i) => {
    const { pos, heading } = startSlot(app.track, i);
    if (p.id === app.myId) {
      spawnLocal(i);
    } else {
      const c = ensureRemote(p);
      c.mesh.group.position.copy(pos);
      c.mesh.group.rotation.y = heading;
      c.mesh.group.visible = true;
    }
  });
}

// ---------------------------------------------------------------------------
// physics
// ---------------------------------------------------------------------------
const fwd = new THREE.Vector3();

// Driving model. A two-axle "bicycle" car: the body has a forward speed, a
// sideways speed and a yaw rate. Each axle makes sideways force from its slip
// angle (the angle between where the tyre points and where it's actually
// going). Force rises with slip angle, peaks, then falls off, which is why a
// car that's pushed too hard slides instead of turning harder. Throttle and
// brake shift weight between axles, so flooring it in a corner unloads the
// front (understeer) and lifting off or braking loads it (the nose tucks in).
// The rear axle drives the car, so too much throttle spins the rears and the
// tail comes round. The handbrake kills rear grip for rally-style flicks.
const CAR_CLASSES = { open: {
  label: 'Open seater',
  eye: [0, 1.22, 0.62],                     // cockpit camera, just ahead of the halo strut
  gears: [11, 18, 26, 34, 42, 50, 62],      // top speed of each gear, m/s
  engine: [75, 620],                        // engine note: idle Hz, rev range Hz
  grip: { tarmac: 1, gravel: 0.9, grass: 0.95 },
  mass: 900,         // kg, open-wheeler with driver
  a: 1.45, b: 1.55,  // distance from centre of mass to front / rear axle (m)
  h: 0.33,           // centre of mass height (m), drives weight transfer
  inertia: 1400,     // yaw inertia (kg m^2)
  power: 210000,     // W, engine power at the wheels
  maxDrive: 8000,    // N, torque limit at low speed
  topSpeed: 60,      // m/s, soft rev limiter (~215 km/h)
  reverseSpeed: 9,   // m/s
  brakeForce: 34000, // N, full pedal (ABS below keeps it within grip)
  brakeFront: 0.6,
  dragCoef: 0.55,    // N per (m/s)^2, wings are draggy
  downforce: 3.8,    // N per (m/s)^2, wings push the car into the road at speed
  downFront: 0.45,   // share of downforce on the front axle
  maxSteerLow: 0.45, // rad at standstill
  maxSteerHigh: 0.09,// rad at top speed
  gravity: 9.81,
}, rally: {
  // Heavier, taller and softer, with almost no downforce: slower on tarmac,
  // but its tyres bite on gravel and grass where the single seater skates.
  label: 'Rally',
  eye: [0.3, 1.32, 0.42],                   // driver's seat, close to the windscreen
  gears: [9, 15, 22, 30, 38, 46, 54],
  engine: [52, 430],
  grip: { tarmac: 0.9, gravel: 1.22, grass: 1.25 },
  mass: 1250,
  a: 1.2, b: 1.35,
  h: 0.5,
  inertia: 1900,
  power: 235000,
  maxDrive: 10500,
  topSpeed: 52,
  reverseSpeed: 9,
  brakeForce: 30000,
  brakeFront: 0.6,
  dragCoef: 0.8,
  downforce: 0.9,
  downFront: 0.45,
  maxSteerLow: 0.55,
  maxSteerHigh: 0.12,
  gravity: 9.81,
} };
let CAR = CAR_CLASSES.open;
app.carClass = 'open';
// Surface grip: mu is peak grip, B/C shape the slip curve (B = how sharp the
// peak, C = how much force survives past it), roll = rolling resistance.
const SURFACES = {
  tarmac: { mu: 1.30, B: 9.0, C: 1.65, roll: 0.015 },
  gravel: { mu: 0.95, B: 6.5, C: 1.35, roll: 0.04 },
  grass:  { mu: 0.78, B: 5.5, C: 1.4, roll: 0.07 },
  air:    { mu: 0.0,  B: 1.0, C: 1.0,  roll: 0.0 },
};
const PHYS = { maxSpeed: CAR.topSpeed, gravity: 32 }; // used by camera / airborne code
for (const c of Object.values(CAR_CLASSES)) {
  c.surf = {};
  for (const [name, sf] of Object.entries(SURFACES)) c.surf[name] = { ...sf, mu: sf.mu * (c.grip[name] ?? 1) };
}
function setCarClass(cls) {
  if (!CAR_CLASSES[cls]) cls = 'open';
  app.carClass = cls;
  CAR = CAR_CLASSES[cls];
  PHYS.maxSpeed = CAR.topSpeed;
  cockpitEye.set(...CAR.eye);
  audio.gear = 0;
}

function tyreForce(surf, Fz, alpha) {
  return -surf.mu * Fz * Math.sin(surf.C * Math.atan(surf.B * alpha));
}

function respawn(car) {
  const s = app.track.samples[car.lastCpIdx];
  car.pos.copy(s.p); car.pos.y += 0.3;
  car.h = Math.atan2(s.th.x, s.th.z);
  car.vx = 0; car.vz = 0; car.speed = 0; car.yawRate = 0; car.steerAngle = 0; car.ax = 0;
  car.vy = 0; car.airborne = false;
  car.idx = car.lastIdx = car.lastCpIdx;
  car.fellTimer = 0; car.offTrackTimer = 0;
  car.onTrack = true;
}

function stepLocal(car, dt, canDrive) {
  const k = app.keys;
  const throttle = canDrive && (k.ArrowUp || k.KeyW) ? 1 : 0;
  const brake = canDrive && (k.ArrowDown || k.KeyS) ? 1 : 0;
  const steerIn = canDrive ? ((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0) : 0;
  const handbrake = canDrive && !!k.Space;

  // ---- where are we on the track ----
  const loc = locate(app.track, car.pos, car.idx, 30) || locate(app.track, car.pos, -1);
  let onTrack = false, trackY = 0, slopeAlong = 0;
  if (loc && Math.abs(loc.lateral) <= app.track.hw + 1.6 && Math.abs(loc.along) < 2.5 && Math.abs(loc.y - car.pos.y) < 3.5) {
    onTrack = true; trackY = loc.y;
    car.lastIdx = car.idx; car.idx = loc.i;
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    slopeAlong = loc.s.t.y * (fx * loc.s.th.x + fz * loc.s.th.z);
  } else if (loc) {
    car.lastIdx = car.idx = loc.i;
  }
  // off the road, read the slope of the ground under the car so it climbs,
  // rolls downhill and tilts with the terrain instead of skating over it
  let sideSlope = 0;
  if (!onTrack) {
    const fx = Math.sin(car.h), fz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h);
    const hF = terrainHeight(car.pos.x + fx * 1.5, car.pos.z + fz * 1.5), hB = terrainHeight(car.pos.x - fx * 1.5, car.pos.z - fz * 1.5);
    const hL = terrainHeight(car.pos.x + lx, car.pos.z + lz), hR = terrainHeight(car.pos.x - lx, car.pos.z - lz);
    slopeAlong = clamp((hF - hB) / 3, -0.6, 0.6);
    sideSlope = clamp((hL - hR) / 2, -0.6, 0.6);
  }
  car.onTrack = onTrack;
  car.surfaceName = car.airborne ? 'air' : onTrack ? app.track.surface : 'grass';
  const surf = CAR.surf[car.surfaceName];

  // ---- local velocity ----
  const fx = Math.sin(car.h), fz = Math.cos(car.h);   // forward
  const lx = Math.cos(car.h), lz = -Math.sin(car.h);  // left
  let vLong = car.vx * fx + car.vz * fz;
  let vLat = car.vx * lx + car.vz * lz;
  const speedAbs = Math.abs(vLong);

  // ---- steering: less lock at speed, quick to centre ----
  // steering lock shrinks with speed so full lock asks for a bit more than the
  // tyres' peak slip angle: enough to provoke a slide, not enough to just plough
  const gripAccel = (surf.mu || 1.3) * (CAR.gravity + CAR.downforce * speedAbs * speedAbs / CAR.mass);
  const maxSteer = clamp(1.7 * gripAccel * (CAR.a + CAR.b) / Math.max(speedAbs, 1) ** 2, CAR.maxSteerHigh, CAR.maxSteerLow);
  const steerTarget = steerIn * maxSteer;
  const rate = steerIn === 0 ? 12 : 7;
  car.steerAngle = lerp(car.steerAngle, steerTarget, 1 - Math.exp(-dt * rate));
  const delta = car.steerAngle;

  // ---- substep the tyre model for stability ----
  const SUB = 3;
  const h = dt / SUB;
  const m = CAR.mass, g = CAR.gravity, L = CAR.a + CAR.b;
  let yawRate = car.yawRate;
  let spinning = false, locked = false, sliding = 0;
  for (let s = 0; s < SUB; s++) {
    const sgn = vLong >= 0 ? 1 : -1;
    const sa = Math.max(Math.abs(vLong), 0.8);

    // axle loads: static weight, weight transfer from last step's acceleration,
    // and aerodynamic downforce that grows with the square of speed
    const dW = m * car.ax * CAR.h / L;
    const aero = car.airborne ? 0 : CAR.downforce * vLong * vLong;
    const Fzf = Math.max(0.15 * m * g, m * g * CAR.b / L - dW + aero * CAR.downFront);
    const Fzr = Math.max(0.15 * m * g, m * g * CAR.a / L + dW + aero * (1 - CAR.downFront));

    // slip angles
    const alphaF = Math.atan2(vLat + yawRate * CAR.a, sa) - delta * sgn;
    const alphaR = Math.atan2(vLat - yawRate * CAR.b, sa);

    // longitudinal forces
    let Fdrive = 0;
    if (throttle) {
      if (vLong > -0.5) {
        const powerLimited = CAR.power / Math.max(speedAbs, 4);
        Fdrive = Math.min(CAR.maxDrive, powerLimited) * clamp((CAR.topSpeed - vLong) / 6, 0, 1);
      }
    }
    let FbrakeF = 0, FbrakeR = 0, Freverse = 0;
    if (brake) {
      if (vLong > 0.6) {
        FbrakeF = -CAR.brakeForce * CAR.brakeFront;
        FbrakeR = -CAR.brakeForce * (1 - CAR.brakeFront);
      } else {
        Freverse = -4000 * clamp((CAR.reverseSpeed + vLong) / 3, 0, 1); // reverse gear
      }
    }
    if (handbrake) FbrakeR += -6000 * sgn;

    // combined grip per axle: one budget (mu * load) shared between pushing
    // forward and holding the corner. Ask for more than that and both shrink,
    // which is how flooring it mid-corner turns into a slide.
    const capF = surf.mu * Fzf, capR = surf.mu * Fzr;
    // all-wheel drive like a rally car: 40% of the push comes from the front
    // axle. Traction control keeps each axle under 85% of its grip, since a
    // key can't feather the throttle the way a foot can.
    let FdF = Math.min(Fdrive * 0.4, capF * 0.85), FdR = Math.min(Fdrive * 0.6, capR * 0.85);
    if (FdF + FdR < Fdrive * 0.98) spinning = true;
    // ABS with a front-biased balance. The fronts brake close to their limit
    // (a little less while steering, so the car still turns in); the rears are
    // held to 60% so they always keep sideways grip. That makes hard braking
    // push the nose wide rather than swap ends, which is what you want with
    // an on/off brake key.
    const frontLimit = capF * (0.94 - 0.3 * Math.abs(steerIn)), rearLimit = capR * 0.6;
    if (FbrakeF < -frontLimit) FbrakeF = -frontLimit;
    if (FbrakeR < -rearLimit) FbrakeR = -rearLimit;
    let FxF = FbrakeF + FdF, FxR = FdR + FbrakeR + Freverse;
    let FyF = tyreForce(surf, Fzf, alphaF);
    let FyR = tyreForce(surf, Fzr, alphaR);
    if (handbrake) { FyR *= 0.25; locked = true; } // locked rears can't hold the corner
    const totF = Math.hypot(FxF, FyF), totR = Math.hypot(FxR, FyR);
    if (totF > capF) { const s = capF / totF; FxF *= s; FyF *= s * 0.92; }
    if (totR > capR) { const s = capR / totR; FxR *= s; FyR *= s * 0.92; }

    // resistances and gravity along the slope
    const Froll = -surf.roll * m * g * clamp(vLong / 2, -1, 1);
    const Fdrag = -CAR.dragCoef * vLong * Math.abs(vLong);
    const Fslope = -m * g * slopeAlong * (car.airborne ? 0 : 1);

    // front axle forces act along the steered wheels
    const cd = Math.cos(delta), sd = Math.sin(delta);
    const Fx = FxF * cd - FyF * sd + FxR + Froll + Fdrag + Fslope;
    const Fy = FyF * cd + FxF * sd + FyR - (car.airborne ? 0 : m * g * sideSlope * 0.6); // slide downhill on a side slope
    const ax = Fx / m, ay = Fy / m;
    const torque = (FyF * cd + FxF * sd) * CAR.a - FyR * CAR.b;
    let yawAcc = torque / CAR.inertia - yawRate * 1.0; // aero/caster damping

    // body frame velocities (centripetal terms keep speed consistent while yawing)
    vLong += (ax + yawRate * vLat) * h;
    vLat += (ay - yawRate * vLong) * h;
    yawRate += yawAcc * h;
    car.ax = ax;

    // low speed: blend toward simple "wheels roll where they point" so the
    // tyre model doesn't jitter at a standstill
    const kin = clamp(1 - Math.hypot(vLong, vLat) / 4, 0, 1);
    if (kin > 0) {
      const kinYaw = vLong * Math.tan(delta) / L;
      yawRate = lerp(yawRate, kinYaw, kin * 0.7);
      vLat *= 1 - kin * 0.35;
    }
    sliding = Math.max(sliding, Math.abs(alphaR), Math.abs(alphaF) * 0.7);
  }
  car.yawRate = yawRate;
  car.spinning = spinning; car.locked = locked; car.slip = sliding;
  car.h += yawRate * dt;

  // back to world velocity and move
  const fx2 = Math.sin(car.h), fz2 = Math.cos(car.h);
  const lx2 = Math.cos(car.h), lz2 = -Math.sin(car.h);
  car.vx = fx2 * vLong + lx2 * vLat;
  car.vz = fz2 * vLong + lz2 * vLat;
  car.speed = vLong;
  const steps = clamp(Math.ceil(Math.hypot(car.vx, car.vz) * dt / 0.8), 1, 5);
  let bump = 0;
  for (let k = 0; k < steps; k++) {
    car.pos.x += car.vx * dt / steps;
    car.pos.z += car.vz * dt / steps;
    bump = Math.max(bump, collideWalls(car));
  }
  if (bump > 0) {
    car.speed = car.vx * fx2 + car.vz * fz2;
    car.yawRate *= 0.8;
    if (bump > 3 && performance.now() - (car.lastBump || 0) > 250) { car.lastBump = performance.now(); beep(70 + Math.random() * 30, 0.16, Math.min(0.35, bump * 0.03)); }
  }

  // ---- vertical ----
  // off the road the car rides the terrain; across the verge skirt it eases
  // from road height down to the grass, matching what's drawn
  let groundY = terrainHeight(car.pos.x, car.pos.z);
  if (!onTrack && loc && Math.abs(loc.along) < 2.5 && Math.abs(loc.y - car.pos.y) < 3.5 && (app.track.vergeDrop?.[loc.i] ?? 99) <= VERGE_MAX_DROP) {
    const over = Math.abs(loc.lateral) - (app.track.hw + 1.6);
    if (over < VERGE) groundY = Math.max(groundY, lerp(loc.y, groundY, clamp(over / VERGE, 0, 1)));
  }
  const targetY = onTrack ? trackY : groundY;
  if (car.airborne) {
    car.vy -= PHYS.gravity * dt;
    car.pos.y += car.vy * dt;
    if (car.pos.y <= targetY) { car.pos.y = targetY; car.vy = 0; car.airborne = false; }
  } else if (car.pos.y > targetY + (onTrack ? 0.9 : 1.6)) {
    car.airborne = true; car.vy = Math.max(0, -slopeAlong * vLong * 0.5);
  } else {
    car.pos.y = lerp(car.pos.y, targetY, 1 - Math.exp(-dt * 20));
  }

  // ---- off-track bookkeeping ----
  // no automatic respawn: you drive back on, or press R yourself
  car.offTrackTimer = onTrack ? 0 : car.offTrackTimer + dt;

  // ---- checkpoints & laps ----
  if (onTrack && app.phase === 'racing' && !app.finished) {
    const N = app.track.N;
    const d = (car.idx - car.lastIdx + N) % N;
    if (d > 0 && d < N / 2) {
      const cpIdx = app.track.cps[car.nextCp];
      const dc = (cpIdx - car.lastIdx + N) % N;
      if (dc > 0 && dc <= d) {
        car.lastCpIdx = cpIdx;
        if (car.nextCp === 0) {
          const nowP = performance.now();
          const lapTime = nowP - (car.lapStart || raceStartPerf());
          car.lapStart = nowP;
          if (!app.bestLap || lapTime < app.bestLap) app.bestLap = lapTime;
          car.lap++;
          if (app.mode === 'quali') { send({ t: 'lap', time: Math.round(lapTime) }); raceToast(`Lap  ${fmtTime(lapTime)}${lapTime === app.bestLap ? '  ★ best' : ''}`, 2500); }
          else if (car.lap > app.laps) finishRace();
          else raceToast(`Lap ${car.lap - 1}  ${fmtTime(lapTime)}${lapTime === app.bestLap && car.lap > 2 ? '  ★ best' : ''}`, 2200);
        }
        car.nextCp = (car.nextCp + 1) % CHECKPOINT_COUNT;
      }
    }
  }

  // ---- visuals: pitch with slope and acceleration, roll with cornering ----
  const slopePitch = onTrack ? -Math.atan2(loc.s.t.y, 1) * (fx2 * loc.s.th.x + fz2 * loc.s.th.z) : car.airborne ? 0 : -Math.atan(slopeAlong);
  const latAcc = (car.vx * lx2 + car.vz * lz2 - vLat) / Math.max(dt, 0.001);
  car.pitch = lerp(car.pitch, slopePitch - car.ax * 0.012, 1 - Math.exp(-dt * 8));
  car.roll = lerp(car.roll, clamp(-(yawRate * vLong) * 0.012, -0.12, 0.12) + (car.airborne ? 0 : Math.atan(sideSlope)), 1 - Math.exp(-dt * 8));
  void latAcc;
  const gm = car.mesh.group;
  gm.position.copy(car.pos);
  gm.rotation.set(0, 0, 0);
  gm.rotateY(car.h); gm.rotateX(car.pitch); gm.rotateZ(car.roll);
  car.wheelSpin += (spinning ? vLong + 12 : vLong) * dt / 0.42;
  for (const w of car.mesh.wheels) {
    w.mesh.rotation.x = car.wheelSpin;
    if (w.front) w.pivot.rotation.y = car.steerAngle;
  }
  car.braking = brake && vLong > 0.6;
  car.mesh.brakeMat.emissive.setHex(car.braking ? 0xff2020 : 0x000000);

  // dust / smoke when sliding or spinning
  if (!car.airborne && speedAbs > 4) {
    const loose = car.surfaceName === 'gravel' || car.surfaceName === 'grass';
    // tarmac tyres peak around 0.16 rad of slip, so only smoke well past that
    const slideAmt = clamp((car.slip - (loose ? 0.14 : 0.24)) / 0.3, 0, 1);
    const amount = Math.max(slideAmt, spinning ? 0.8 : 0, locked ? 0.6 : 0, loose ? clamp(speedAbs / 40, 0, 0.5) : 0);
    if (amount > 0.05) emitDust(car, amount, loose ? 'dust' : 'smoke');
  }
}

function stepRemotes(now, dt) {
  for (const c of app.cars.values()) {
    if (!c.a) continue;
    const g = c.mesh.group;
    let x, y, z, h, v;
    if (c.b) {
      const span = Math.max(1, c.b.t - c.a.t);
      const t = clamp((now - 100 - c.a.t) / span, 0, 1.25);
      x = lerp(c.a.x, c.b.x, t); y = lerp(c.a.y, c.b.y, t); z = lerp(c.a.z, c.b.z, t);
      h = lerpAngle(c.a.h, c.b.h, t); v = lerp(c.a.v, c.b.v, t);
    } else { ({ x, y, z, h, v } = c.a); }
    g.position.set(x, y, z);
    g.rotation.set(0, h, 0);
    g.visible = true;
    c.wheelSpin += v * dt / 0.42;
    for (const w of c.mesh.wheels) w.mesh.rotation.x = c.wheelSpin;
    c.mesh.brakeMat.emissive.setHex((c.b || c.a).b ? 0xff2020 : 0x000000);
  }
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const cockpitEye = new THREE.Vector3(0, 1.22, 0.62); // just ahead of the halo strut so nothing blocks the view
const faceForward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // cameras look down -z, the car drives toward +z
try { app.camMode = localStorage.getItem('dc-cam') === 'cockpit' ? 'cockpit' : 'chase'; } catch { app.camMode = 'chase'; }
const camPos = new THREE.Vector3();
let camInit = false;

function updateCamera(dt) {
  if (app.phase === 'home' || app.phase === 'lobby' || !app.local) {
    // slow orbit around the track for the menus
    menuOrbit += dt * 0.08;
    const b = app.track.bounds;
    const c = b.getCenter(new THREE.Vector3());
    const r = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.62 + 40;
    camPos.set(c.x + Math.cos(menuOrbit) * r, 95 + Math.sin(menuOrbit * 0.7) * 12, c.z + Math.sin(menuOrbit) * r);
    camera.position.lerp(camPos, camInit ? 1 - Math.exp(-dt * 2) : 1);
    camera.lookAt(c.x, 0, c.z);
    camera.fov = lerp(camera.fov, 55, 0.1);
    camera.updateProjectionMatrix();
    camInit = true;
    return;
  }
  const car = app.local;
  sun.position.set(car.pos.x + 80, car.pos.y + 140, car.pos.z + 60);
  sun.target.position.copy(car.pos);
  if (app.camMode === 'cockpit') {
    // driver's eye: just above the helmet, locked to the car so it pitches and rolls with it
    const g = car.mesh.group;
    g.updateMatrixWorld();
    camera.position.copy(cockpitEye).applyMatrix4(g.matrixWorld);
    camera.quaternion.copy(g.quaternion).multiply(faceForward);
    const k = clamp(Math.abs(car.speed) / PHYS.maxSpeed, 0, 1);
    camera.fov = lerp(camera.fov, 78 + k * 12, 1 - Math.exp(-dt * 4));
    camera.near = 0.12;
    camera.updateProjectionMatrix();
    camInit = false; // so the chase camera snaps into place when you switch back
    return;
  }
  camera.near = 0.5;
  // look half-way between where the nose points and where the car is actually
  // going, so a slide reads as the car rotating under the camera
  let dirx = Math.sin(car.h), dirz = Math.cos(car.h);
  const vmag = Math.hypot(car.vx, car.vz);
  if (vmag > 3 && car.speed > 0) {
    dirx = lerp(dirx, car.vx / vmag, 0.5); dirz = lerp(dirz, car.vz / vmag, 0.5);
    const n = Math.hypot(dirx, dirz); dirx /= n; dirz /= n;
  }
  fwd.set(dirx, 0, dirz);
  const speedK = clamp(Math.abs(car.speed) / PHYS.maxSpeed, 0, 1);
  camPos.copy(car.pos).addScaledVector(fwd, -(9 + speedK * 3)).add(new THREE.Vector3(0, 4.2 + speedK * 0.8, 0));
  // keep the camera from sinking into hills behind the car
  const back = locate(app.track, camPos, car.idx, 20);
  if (back && Math.abs(back.lateral) < app.track.hw + 2) camPos.y = Math.max(camPos.y, back.y + 3.5);
  camPos.y = Math.max(camPos.y, terrainHeight(camPos.x, camPos.z) + 2.5);
  camera.position.lerp(camPos, camInit ? 1 - Math.exp(-dt * 7) : 1);
  camTarget.copy(car.pos).addScaledVector(fwd, 5).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(camTarget);
  camera.fov = lerp(camera.fov, 68 + speedK * 16, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
  camInit = true;
}

// ---------------------------------------------------------------------------
// networking
// ---------------------------------------------------------------------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);
  app.ws = ws;
  ws.onopen = () => { $('#btn-create').disabled = false; $('#btn-join').disabled = false; };
  ws.onclose = () => {
    toast('Connection lost. Reconnecting…');
    $('#btn-create').disabled = true; $('#btn-join').disabled = true;
    setTimeout(connect, 1500);
    if (app.phase !== 'home') goHome();
  };
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    handle(msg);
  };
}

function send(msg) {
  if (app.ws && app.ws.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify(msg));
}

function handle(msg) {
  switch (msg.t) {
    case 'error': toast(msg.msg); break;
    case 'joined':
      app.myId = msg.id;
      history.replaceState(null, '', `/?room=${msg.code}`);
      break;
    case 'room':
      app.room = msg;
      app.laps = msg.laps;
      if ((msg.car || 'open') !== app.carClass && app.phase !== 'countdown' && app.phase !== 'racing') setCarClass(msg.car);
      if (app.phase === 'home' || app.phase === 'results' || app.phase === 'lobby') {
        if (msg.phase === 'lobby') {
          if (app.trackId !== msg.trackId || !app.track) buildWorld(msg.trackId);
          showLobby();
          layoutLobbyCars();
        }
      } else {
        // racing: drop cars that left
        for (const id of [...app.cars.keys()]) {
          if (!msg.players.some(p => p.id === id)) { carsGroup.remove(app.cars.get(id).mesh.group); app.cars.delete(id); }
        }
      }
      renderLobby();
      break;
    case 'left':
      if (app.cars.has(msg.id)) { carsGroup.remove(app.cars.get(msg.id).mesh.group); app.cars.delete(msg.id); }
      break;
    case 'start': beginRace(msg); break;
    case 'states':
      for (const s of msg.s) {
        if (s.id === app.myId) continue;
        const p = app.room?.players.find(p => p.id === s.id);
        if (!p) continue;
        const c = ensureRemote(p);
        c.a = c.b || { ...s, t: performance.now() };
        c.b = { ...s, t: performance.now() };
        if (!c.a) c.a = c.b;
        c.lap = s.lap; c.cp = s.cp; c.pr = s.pr;
      }
      break;
    case 'finished': {
      if (msg.id === app.myId) {
        app.myPlace = msg.place;
        raceToast(`You finished ${ordinal(msg.place)}!  ${fmtTime(msg.time)}`, 4000);
      } else {
        const c = app.cars.get(msg.id);
        if (c) { c.finished = true; c.place = msg.place; c.time = msg.time; }
        const p = app.room?.players.find(p => p.id === msg.id);
        if (p && !app.finished) raceToast(`${p.name} finished ${ordinal(msg.place)}`, 1800);
      }
      break;
    }
    case 'best': app.bests?.set(msg.id, msg.time); break;
    case 'results': showResults(msg.results, !!msg.quali); break;
  }
}

// ---------------------------------------------------------------------------
// race flow
// ---------------------------------------------------------------------------
function beginRace(msg) {
  const offset = msg.now - Date.now();
  app.startAt = msg.startAt - offset;
  app.laps = msg.laps;
  app.finished = false;
  app.spectate = !!msg.spectate;
  app.mode = msg.mode === 'quali' ? 'quali' : 'race';
  app.endAt = (msg.endAt || 0) - offset;
  app.myPlace = 0;
  app.bests = new Map();
  if (app.trackId !== msg.trackId || !app.track) buildWorld(msg.trackId);
  setCarClass(msg.car);
  clearCars();
  const slot = Math.max(0, gridOrder(msg.grid).findIndex(p => p.id === app.myId));
  spawnLocal(slot);
  for (const p of app.room.players) if (p.id !== app.myId) ensureRemote(p);
  app.phase = 'countdown';
  app.bestLap = 0;
  app.litCount = -1;
  $('#lights').querySelectorAll('span').forEach(s => s.classList.remove('on'));
  $('#countdown').classList.add('hidden');
  camInit = false;
  initAudio();
  document.activeElement?.blur?.(); // so Space doesn't re-click the start button
  showScreen('race');
  $('#results').classList.add('hidden');
  $('#hud-laps').textContent = app.mode === 'quali' ? '∞' : app.laps;
  $('#btn-endq').classList.toggle('hidden', !(app.mode === 'quali' && app.room?.hostId === app.myId));
  if (app.mode === 'quali') raceToast('Qualifying: fastest lap sets the grid', 3500);
  if (app.spectate) { app.finished = true; raceToast('Race in progress — you can drive around, next race counts', 4000); }
}

function finishRace() {
  app.finished = true;
  app.finishTime = performance.now() - raceStartPerf();
  send({ t: 'finish', time: Math.round(app.finishTime) });
}

function raceStartPerf() {
  // startAt is on Date.now() clock; convert to performance.now() clock
  return performance.now() - (Date.now() - app.startAt);
}

function showResults(results, quali) {
  app.phase = 'results';
  app.finished = true;
  if (quali) app.finishTime = 0;
  $('#results-title').textContent = quali ? 'Qualifying — this is the grid for the next race' : 'Results';
  $('#btn-endq').classList.add('hidden');
  const list = $('#results-list');
  list.innerHTML = '';
  results.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === 0 && r.time != null) li.classList.add('first');
    if (r.id === app.myId) li.classList.add('me');
    li.innerHTML = `<span class="place">${r.time == null ? '–' : i + 1}</span><span class="dot" style="background:${COLOR_CSS[r.color]}"></span><span>${esc(r.name)}</span><span class="time">${r.time == null ? (quali ? 'no time' : 'DNF') : fmtTime(r.time)}</span>`;
    list.appendChild(li);
  });
  const isHost = app.room?.hostId === app.myId;
  $('#btn-lobby').classList.toggle('hidden', !isHost);
  $('#results-wait').classList.toggle('hidden', isHost);
  $('#results').classList.remove('hidden');
}

let toastTimer = 0;
function raceToast(text, ms = 1500) {
  const el = $('#toast-race');
  el.textContent = text; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
let toastTimer2 = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text; el.classList.remove('hidden');
  clearTimeout(toastTimer2);
  toastTimer2 = setTimeout(() => el.classList.add('hidden'), 3000);
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
function showScreen(name) {
  for (const s of ['home', 'lobby', 'race']) $(`#screen-${s}`).classList.toggle('hidden', s !== name);
}

const inRace = () => app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results';
function setMenu(open) {
  app.menuOpen = open;
  if (open) app.keys = {};
  $('#pause').classList.toggle('hidden', !open);
}
function toggleCamera() {
  app.camMode = app.camMode === 'cockpit' ? 'chase' : 'cockpit';
  try { localStorage.setItem('dc-cam', app.camMode); } catch {}
  $('#btn-cam').textContent = app.camMode === 'cockpit' ? 'Camera: cockpit' : 'Camera: chase';
  if (inRace()) raceToast(app.camMode === 'cockpit' ? 'Cockpit camera' : 'Chase camera', 1200);
}

function goHome() {
  setMenu(false);
  $('#results').classList.add('hidden');
  $('#lights').classList.add('hidden');
  $('#countdown').classList.add('hidden');
  app.phase = 'home';
  app.room = null;
  clearCars();
  history.replaceState(null, '', '/');
  showScreen('home');
}

function showLobby() {
  setMenu(false);
  app.phase = 'lobby';
  showScreen('lobby');
  $('#results').classList.add('hidden');
}

function renderLobby() {
  const r = app.room;
  if (!r) return;
  $('#lobby-code').textContent = r.code;
  $('#player-count').textContent = r.players.length;
  const list = $('#player-list');
  list.innerHTML = '';
  gridOrder(r.grid).forEach((p, gi) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (p.id === r.hostId ? ' host' : '') + (p.id === app.myId ? ' me' : '');
    chip.innerHTML = `<span class="dot" style="background:${COLOR_CSS[p.color]}"></span>${r.grid ? `<span class="gridpos">P${gi + 1}</span>` : ''}${esc(p.name)}`;
    list.appendChild(chip);
  });
  const isHost = r.hostId === app.myId;
  $('#btn-start').classList.toggle('hidden', !isHost);
  $('#btn-quali').classList.toggle('hidden', !isHost);
  $('#wait-host').classList.toggle('hidden', isHost);
  $('#track-list').classList.toggle('locked', !isHost);
  $('#track-hint').textContent = isHost ? '— you pick' : '— host picks';
  document.querySelectorAll('.trackcard').forEach((el, i) => el.classList.toggle('on', i === r.trackId));
  $('#car-list').classList.toggle('locked', !isHost);
  document.querySelectorAll('.carpick').forEach((el) => el.classList.toggle('on', el.dataset.car === (r.car || 'open')));
}

function buildTrackCards() {
  const list = $('#track-list');
  TRACKS.forEach((def, i) => {
    const card = document.createElement('button');
    card.className = 'trackcard';
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 120;
    drawTrackPreview(cv, buildTrack(def));
    card.appendChild(cv);
    card.insertAdjacentHTML('beforeend', `<div class="tname">${def.name}</div><div class="tblurb">${def.blurb}</div>`);
    card.addEventListener('click', () => {
      if (app.room?.hostId !== app.myId) return;
      send({ t: 'track', trackId: i });
    });
    list.appendChild(card);
  });
}

function drawTrackPreview(cv, track) {
  const ctx = cv.getContext('2d');
  const b = track.bounds;
  const w = b.max.x - b.min.x, h = b.max.z - b.min.z;
  const sc = Math.min((cv.width - 24) / w, (cv.height - 24) / h);
  const ox = (cv.width - w * sc) / 2 - b.min.x * sc, oz = (cv.height - h * sc) / 2 - b.min.z * sc;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  track.samples.forEach((s, i) => { const x = s.p.x * sc + ox, y = s.p.z * sc + oz; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = '#5b6472'; ctx.lineWidth = 6; ctx.stroke();
  const s0 = track.samples[0];
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(s0.p.x * sc + ox, s0.p.z * sc + oz, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function buildSwatches() {
  const el = $('#colors');
  COLOR_CSS.forEach((css, i) => {
    const s = document.createElement('div');
    s.className = 'swatch' + (i === app.color ? ' on' : '');
    s.style.background = css;
    s.title = `Colour ${i + 1}`;
    s.addEventListener('click', () => {
      app.color = i;
      document.querySelectorAll('.swatch').forEach((x, j) => x.classList.toggle('on', j === i));
      try { localStorage.setItem('dc-color', String(i)); } catch {}
    });
    el.appendChild(s);
  });
}

function readName() {
  const n = $('#name').value.replace(/[^A-Za-z0-9 _\-]/g, '').trim().slice(0, 12) || 'Racer';
  try { localStorage.setItem('dc-name', n); } catch {}
  return n;
}

function wireUI() {
  try {
    const n = localStorage.getItem('dc-name'); if (n) $('#name').value = n;
    const c = localStorage.getItem('dc-color'); if (c != null && CAR_COLORS[+c]) app.color = +c;
  } catch {}
  buildSwatches();
  buildTrackCards();

  const params = new URLSearchParams(location.search);
  const codeFromUrl = (params.get('room') || location.pathname.slice(1)).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (codeFromUrl.length === 4) { $('#code').value = codeFromUrl; $('#code').focus(); }

  $('#btn-create').addEventListener('click', () => {
    app.name = readName();
    send({ t: 'create', name: app.name, color: app.color });
  });
  const join = () => {
    const code = $('#code').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) return toast('Room codes are 4 letters.');
    app.name = readName();
    send({ t: 'join', code, name: app.name, color: app.color });
  };
  $('#btn-join').addEventListener('click', join);
  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-create').click(); });

  $('#btn-copy').addEventListener('click', async () => {
    const url = `${location.origin}/?room=${app.room.code}`;
    try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); }
    catch { prompt('Copy this link:', url); }
  });
  document.querySelectorAll('.carpick').forEach((el) => el.addEventListener('click', () => {
    if (app.room?.hostId === app.myId) send({ t: 'car', car: el.dataset.car });
  }));
  $('#btn-start').addEventListener('click', () => { initAudio(); send({ t: 'start', mode: 'race' }); });
  $('#btn-quali').addEventListener('click', () => { initAudio(); send({ t: 'start', mode: 'quali' }); });
  $('#btn-endq').addEventListener('click', (e) => { e.currentTarget.blur(); send({ t: 'endquali' }); });
  $('#btn-leave').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-resume').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(false); });
  $('#btn-quit').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-cam').addEventListener('click', (e) => { e.currentTarget.blur(); toggleCamera(); });
  $('#btn-cam').textContent = app.camMode === 'cockpit' ? 'Camera: cockpit' : 'Camera: chase';
  $('#btn-menu').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(true); });
  $('#btn-lobby').addEventListener('click', () => send({ t: 'lobby' }));
  $('#btn-sound').addEventListener('click', (e) => { initAudio(); setSound(!audio.on); e.currentTarget.blur(); });
  $('#btn-sound').textContent = audio.on ? 'Sound on' : 'Sound off';
  for (const id of ['#btn-create', '#btn-join']) $(id).addEventListener('click', initAudio);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!e.repeat) initAudio();
    if (e.code === 'KeyM' && !e.repeat) setSound(!audio.on);
    if (e.code === 'KeyC' && !e.repeat) toggleCamera();
    if (e.code === 'Escape' && !e.repeat && inRace()) { setMenu(!app.menuOpen); return; }
    if (app.menuOpen) return;
    app.keys[e.code] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyR' && app.local && (app.phase === 'racing' || app.phase === 'results')) respawn(app.local);
  });
  window.addEventListener('keyup', (e) => { app.keys[e.code] = false; });
  window.addEventListener('blur', () => { app.keys = {}; });
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
const mm = $('#minimap');
const mmCtx = mm.getContext('2d');
let mmPath = null;

function standingsOrder() {
  const N = app.track.N;
  const entries = [];
  if (app.local) {
    entries.push({ id: app.myId, name: app.name, color: app.color, finished: app.finished && !app.spectate, place: app.myPlace || 0, lap: app.local.lap, key: (app.local.lap - 1) * N + app.local.idx, me: true });
  }
  for (const p of app.room?.players || []) {
    if (p.id === app.myId) continue;
    const c = app.cars.get(p.id);
    entries.push({ id: p.id, name: p.name, color: p.color, finished: !!c?.finished, place: c?.place || 0, lap: c?.lap || 1, key: c ? (c.lap - 1) * N + c.pr * N : -1, me: false });
  }
  if (app.mode === 'quali') {
    for (const e of entries) { e.best = e.me ? (app.bestLap || null) : (app.bests?.get(e.id) ?? null); e.finished = false; }
    return entries.sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  }
  entries.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) return a.place - b.place;
    return b.key - a.key;
  });
  return entries;
}

let hudTick = 0;
function updateHud(now) {
  const car = app.local;
  if (!car) return;
  $('#hud-speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
  if (app.phase === 'countdown') {
    // F1 start: five red lights come on one by one, then all go out
    const left = app.startAt - Date.now();
    const lights = $('#lights');
    lights.classList.remove('hidden');
    const lit = left > 0 ? clamp(Math.floor((4000 - left) / 650), 0, 5) : 0;
    if (lit !== app.litCount) {
      app.litCount = lit;
      lights.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < lit));
      if (lit > 0) beep(520, 0.18, 0.2);
    }
    if (left <= 0) {
      app.phase = 'racing';
      car.lapStart = performance.now();
      beep(1040, 0.6, 0.25);
      const el = $('#countdown');
      el.textContent = 'GO!'; el.classList.remove('hidden'); el.classList.add('go');
      setTimeout(() => { el.classList.add('hidden'); lights.classList.add('hidden'); }, 900);
    }
  }
  $('#hud-best').textContent = app.bestLap ? fmtTime(app.bestLap) : '--';
  if (app.phase === 'racing' || app.phase === 'results') {
    const t = app.mode === 'quali' ? (app.phase === 'results' ? 0 : Math.max(0, app.endAt - Date.now())) : app.finished && !app.spectate ? app.finishTime : Math.max(0, now - raceStartPerf());
    $('#hud-time').textContent = fmtTime(t);
  }
  $('#hud-lap').textContent = app.mode === 'quali' ? car.lap : Math.min(car.lap, app.laps);
  $('#respawn-tip').classList.toggle('hidden', car.onTrack || app.phase === 'countdown');

  if (++hudTick % 6 === 0) {
    const order = standingsOrder();
    const myIdx = order.findIndex(e => e.me);
    if (app.finished && !app.spectate) {
      const me = order[myIdx];
      $('#hud-pos').textContent = me.place || myIdx + 1;
    } else $('#hud-pos').textContent = myIdx + 1;
    $('#hud-pos-of').textContent = '/' + order.length;
    const st = $('#standings');
    st.innerHTML = order.slice(0, 20).map((e, i) =>
      `<div class="standing${e.me ? ' me' : ''}${e.finished ? ' done' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS[e.color]}"></span><span>${esc(e.name)}</span><span class="lap">${app.mode === 'quali' ? (e.best ? fmtTime(e.best) : '--') : e.finished ? 'FIN' : 'L' + Math.min(e.lap, app.laps)}</span></div>`
    ).join('');
  }

  // glow the next gate
  const gates = app.track.gateMats;
  const nextGate = car.nextCp - 1;
  if (app.nextCpMesh !== nextGate) {
    gates.forEach((m, i) => { m.emissive.setHex(i === nextGate ? 0xff6a00 : 0x000000); m.color.setHex(i === nextGate ? 0xffc14a : 0xffa030); });
    app.nextCpMesh = nextGate;
  }

  drawMinimap();
}

function drawMinimap() {
  const b = app.track.bounds;
  const w = b.max.x - b.min.x, h = b.max.z - b.min.z;
  const sc = Math.min((mm.width - 30) / w, (mm.height - 30) / h);
  const ox = (mm.width - w * sc) / 2 - b.min.x * sc, oz = (mm.height - h * sc) / 2 - b.min.z * sc;
  mmCtx.clearRect(0, 0, mm.width, mm.height);
  if (!mmPath || mmPath.track !== app.track) {
    const p = new Path2D();
    app.track.samples.forEach((s, i) => { const x = s.p.x * sc + ox, y = s.p.z * sc + oz; i ? p.lineTo(x, y) : p.moveTo(x, y); });
    p.closePath();
    mmPath = { track: app.track, path: p };
  }
  mmCtx.lineJoin = mmCtx.lineCap = 'round';
  mmCtx.strokeStyle = '#1d2230'; mmCtx.lineWidth = 9; mmCtx.stroke(mmPath.path);
  mmCtx.strokeStyle = '#cfd6e0'; mmCtx.lineWidth = 5; mmCtx.stroke(mmPath.path);
  const dot = (x, z, css, r) => {
    mmCtx.beginPath(); mmCtx.arc(x * sc + ox, z * sc + oz, r, 0, Math.PI * 2);
    mmCtx.fillStyle = css; mmCtx.fill(); mmCtx.strokeStyle = '#1d2230'; mmCtx.lineWidth = 2; mmCtx.stroke();
  };
  for (const c of app.cars.values()) if (c.mesh.group.visible) dot(c.mesh.group.position.x, c.mesh.group.position.z, COLOR_CSS[c.color], 4);
  if (app.local) dot(app.local.pos.x, app.local.pos.z, COLOR_CSS[app.color], 6);
}

// ---------------------------------------------------------------------------
// sound: a synthesised engine (two oscillators through a low-pass filter,
// pitched by simulated gears), tyre screech and gravel rumble from filtered
// noise, and start-light beeps. Nothing is loaded from anywhere.
// ---------------------------------------------------------------------------
const audio = { ctx: null, nodes: null, on: true, gear: 0, rpm: 0 };
try { audio.on = localStorage.getItem('dc-sound') !== 'off'; } catch {}

function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = new AC();
  const master = c.createGain(); master.gain.value = audio.on ? 0.6 : 0; master.connect(c.destination);
  const eng = c.createGain(); eng.gain.value = 0;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 2;
  eng.connect(lp).connect(master);
  const o1 = c.createOscillator(); o1.type = 'sawtooth';
  const o2 = c.createOscillator(); o2.type = 'square';
  const g2 = c.createGain(); g2.gain.value = 0.3;
  o1.connect(eng); o2.connect(g2).connect(eng); o1.start(); o2.start();
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const nz = c.createBufferSource(); nz.buffer = buf; nz.loop = true; nz.start();
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 5;
  const gS = c.createGain(); gS.gain.value = 0; nz.connect(bp).connect(gS).connect(master);
  const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 260;
  const gG = c.createGain(); gG.gain.value = 0; nz.connect(lp2).connect(gG).connect(master);
  audio.ctx = c; audio.nodes = { master, eng, lp, o1, o2, gS, gG };
}
function setSound(on) {
  audio.on = on;
  try { localStorage.setItem('dc-sound', on ? 'on' : 'off'); } catch {}
  if (audio.nodes) audio.nodes.master.gain.setTargetAtTime(on ? 0.6 : 0, audio.ctx.currentTime, 0.05);
  $('#btn-sound').textContent = on ? 'Sound on' : 'Sound off';
}
function beep(freq, dur, vol = 0.25) {
  if (!audio.ctx || !audio.on) return;
  const c = audio.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = 'square'; o.frequency.value = freq;
  o.connect(g).connect(audio.nodes.master);
  const t = c.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t); o.stop(t + dur);
}
function updateAudio(car, dt) {
  if (!audio.nodes) return;
  const n = audio.nodes, t = audio.ctx.currentTime;
  const v = Math.max(0, car.speed);
  const GEARS = CAR.gears;
  let g = Math.min(audio.gear, GEARS.length - 1);
  if (v > GEARS[g] && g < GEARS.length - 1) g++;
  else if (g > 0 && v < GEARS[g - 1] * 0.86) g--;
  audio.gear = g;
  const lo = g ? GEARS[g - 1] : 0, hi = GEARS[g];
  const throttle = (app.keys.KeyW || app.keys.ArrowUp) && app.phase !== 'countdown' ? 1 : 0;
  let rpm = 0.25 + 0.75 * clamp((v - lo) / (hi - lo), 0, 1);
  if (v < 1.5) rpm = 0.16 + (app.keys.KeyW || app.keys.ArrowUp ? 0.5 : 0) * (0.6 + 0.4 * Math.sin(t * 18)); // blipping on the grid
  if (car.spinning) rpm = Math.min(1, rpm + 0.2);
  audio.rpm = lerp(audio.rpm, rpm, 1 - Math.exp(-dt * 10));
  const f = CAR.engine[0] + audio.rpm * CAR.engine[1];
  n.o1.frequency.setTargetAtTime(f, t, 0.02);
  n.o2.frequency.setTargetAtTime(f * 1.5, t, 0.02);
  n.lp.frequency.setTargetAtTime(600 + audio.rpm * 4200, t, 0.05);
  n.eng.gain.setTargetAtTime(0.09 + throttle * 0.1 + audio.rpm * 0.07, t, 0.05);
  const screech = car.surfaceName === 'tarmac' ? clamp((car.slip - 0.12) / 0.3, 0, 1) * clamp(v / 8, 0, 1) : 0;
  n.gS.gain.setTargetAtTime(screech * 0.22, t, 0.05);
  const loose = car.surfaceName === 'gravel' || car.surfaceName === 'grass' ? clamp(v / 30, 0, 1) : 0;
  n.gG.gain.setTargetAtTime(loose * 0.4, t, 0.08);
}
function quietAudio() {
  if (!audio.nodes) return;
  const t = audio.ctx.currentTime;
  audio.nodes.eng.gain.setTargetAtTime(0, t, 0.2);
  audio.nodes.gS.gain.setTargetAtTime(0, t, 0.1);
  audio.nodes.gG.gain.setTargetAtTime(0, t, 0.1);
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (app.local && (app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results')) {
    const canDrive = !app.menuOpen && (app.phase === 'racing' || (app.phase === 'results' && app.finished));
    stepLocal(app.local, dt, canDrive);
    stepRemotes(now, dt);
    updateHud(now);
    updateAudio(app.local, dt);
    if (now - app.lastSend > 1000 / SEND_HZ && app.phase !== 'results') {
      app.lastSend = now;
      const c = app.local;
      send({ t: 'state', x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), h: +c.h.toFixed(3), v: +c.speed.toFixed(1), lap: c.lap, cp: c.nextCp, pr: c.idx / app.track.N, b: c.braking ? 1 : 0 });
    }
  }
  if (!app.local || app.phase === 'home' || app.phase === 'lobby') quietAudio();
  for (const f of anim) f(now / 1000, dt);
  updateDust(dt);
  updateCamera(dt);
  app.camHook?.(camera); // debugging: lets the console place the camera
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
buildWorld(0);
wireUI();
window.__dc = app; // handy for poking at the game from the console
$('#btn-create').disabled = true; $('#btn-join').disabled = true;
connect();
requestAnimationFrame(frame);
