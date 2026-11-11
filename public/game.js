import * as THREE from 'three';
import { TRACKS, buildTrack, locate, startSlot, CHECKPOINT_COUNT } from '/tracks.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
const CAR_COLORS = [0xff4d4d, 0xff8a3d, 0xffd23f, 0x7ed957, 0x2ec4b6, 0x3d8bff, 0x8c6bff, 0xff6bcb, 0xf5f0e6, 0x2b2f3a, 0x8b5a2b, 0x9ad0ff];
const COLOR_CSS = CAR_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
const SEND_HZ = 20;
const PHYS = {
  accel: 26, maxSpeed: 48, reverseMax: 14, brake: 50,
  roadDrag: 0.32, grassDrag: 2.6, grassMax: 16,
  turn: 2.4, gravity: 32,
};

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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 2400, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0x7fc86a })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

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
    o.traverse?.(m => { m.geometry?.dispose?.(); if (m.material?.dispose) m.material.dispose(); });
  }
  const track = buildTrack(TRACKS[trackId]);
  app.track = track;
  app.trackId = trackId;
  const { samples, N, hw, cps } = track;

  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // road surface with subtle per-segment shade variation (low-poly feel)
  const road = buildRibbon(track, hw, -hw, (i) => {
    const k = 0.92 + 0.08 * ((i * 7919) % 13) / 13;
    return new THREE.Color(0x5b6472).multiplyScalar(k);
  }, 0.02);
  // curbs: red / white alternating
  const curbL = buildRibbon(track, hw + 1.6, hw, (i) => (Math.floor(i / 3) % 2 ? 0xe6453a : 0xf6f2e8), 0.03);
  const curbR = buildRibbon(track, -hw, -hw - 1.6, (i) => (Math.floor(i / 3) % 2 ? 0xe6453a : 0xf6f2e8), 0.03);
  const roadMesh = flatMesh([...road.pos, ...curbL.pos, ...curbR.pos], [...road.col, ...curbL.col, ...curbR.col], vcMat);
  roadMesh.receiveShadow = true;
  worldGroup.add(roadMesh);

  // centre dashes
  const dash = buildRibbon(track, 0.25, -0.25, (i) => (Math.floor(i / 4) % 2 ? 0xf6f2e8 : 0x5b6472), 0.04);
  worldGroup.add(flatMesh(dash.pos, dash.col, vcMat));

  // elevated sections become a thick deck (sides + underside) on pillars
  const DECK = 2.4;
  const deckPos = [], deckCol = [];
  const sideColor = new THREE.Color(0x7c8696);
  const underColor = new THREE.Color(0x5a6372);
  const pillarGeo = new THREE.BoxGeometry(2.6, 1, 2.6);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x6b7484, flatShading: true });
  for (let i = 0; i < N; i++) {
    const s = samples[i], n = samples[(i + 1) % N];
    if (s.p.y < 0.25 && n.p.y < 0.25) continue;
    const off = hw + 1.6;
    const aL = s.p.clone().addScaledVector(s.left, off), aR = s.p.clone().addScaledVector(s.left, -off);
    const bL = n.p.clone().addScaledVector(n.left, off), bR = n.p.clone().addScaledVector(n.left, -off);
    const down = (v) => { const c = v.clone(); c.y -= DECK; return c; };
    const aL0 = down(aL), aR0 = down(aR), bL0 = down(bL), bR0 = down(bR);
    pushQuad(deckPos, deckCol, aL, bL, bL0, aL0, sideColor);   // left wall, faces outward
    pushQuad(deckPos, deckCol, bR, aR, aR0, bR0, sideColor);   // right wall, faces outward
    pushQuad(deckPos, deckCol, aL0, bL0, bR0, aR0, underColor); // underside, faces down
    if (i % 16 === 0 && s.p.y > 2.4) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.scale.y = s.p.y - DECK + 0.3;
      pillar.position.set(s.p.x, (s.p.y - DECK + 0.3) / 2 - 0.3, s.p.z);
      pillar.castShadow = true;
      worldGroup.add(pillar);
    }
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
  const postGeo = new THREE.BoxGeometry(1.2, 9, 1.2);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x1d2230, flatShading: true });
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.copy(s0.p).addScaledVector(s0.left, side * (hw + 2.2));
    post.position.y += 4.5;
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
  const gatePostGeo = new THREE.BoxGeometry(0.9, 5, 0.9);
  for (let k = 1; k < cps.length; k++) {
    const s = samples[cps[k]];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffa030, flatShading: true, emissive: 0x000000 });
    track.gateMats.push(mat);
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(gatePostGeo, mat);
      post.position.copy(s.p).addScaledVector(s.left, side * (hw + 2.2));
      post.position.y += 2.5;
      post.castShadow = true;
      worldGroup.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.2, 0.5, 0.5), mat);
    bar.position.copy(s.p); bar.position.y += 5.2;
    bar.rotation.y = Math.atan2(s.th.x, s.th.z);
    worldGroup.add(bar);
  }

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

// seeded random so everyone sees the same forest
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildScenery(track) {
  const rnd = mulberry32(1234 + app.trackId * 99);
  const { samples, hw, bounds } = track;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.z) * 0.9 + 140;

  const nearRoad = (x, z, margin) => {
    for (let i = 0; i < samples.length; i += 3) {
      const s = samples[i];
      const dx = s.p.x - x, dz = s.p.z - z;
      if (dx * dx + dz * dz < margin * margin) return true;
    }
    return false;
  };

  // trees
  const TREES = 320;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
  const canopyGeo = new THREE.ConeGeometry(3.2, 8, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a4a2a, flatShading: true });
  const canopyMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREES);
  trunks.castShadow = canopies.castShadow = true;
  const m = new THREE.Matrix4();
  const greens = [0x3f9a4a, 0x55b35a, 0x2f8a52, 0x6cc46a, 0x3b8f3f];
  let placed = 0, tries = 0;
  while (placed < TREES && tries++ < 5000) {
    const x = center.x + (rnd() - 0.5) * spread;
    const z = center.z + (rnd() - 0.5) * spread;
    if (nearRoad(x, z, hw + 9)) continue;
    const sc = 0.7 + rnd() * 0.9;
    m.makeScale(sc, sc, sc); m.setPosition(x, 1.5 * sc, z);
    trunks.setMatrixAt(placed, m);
    m.makeRotationY(rnd() * Math.PI); m.scale(new THREE.Vector3(sc, sc, sc)); m.setPosition(x, (3 + 4) * sc, z);
    canopies.setMatrixAt(placed, m);
    canopies.setColorAt(placed, new THREE.Color(greens[Math.floor(rnd() * greens.length)]));
    placed++;
  }
  trunks.count = canopies.count = placed;
  worldGroup.add(trunks, canopies);

  // distant hills
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6fb963, flatShading: true });
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

  // clouds
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  const cloudGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const n = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const puff = new THREE.Mesh(cloudGeo, cloudMat);
      puff.scale.set(10 + rnd() * 10, 5 + rnd() * 4, 8 + rnd() * 6);
      puff.position.set(k * 12 - n * 5, rnd() * 3, rnd() * 4);
      g.add(puff);
    }
    g.position.set(center.x + (rnd() - 0.5) * spread * 1.4, 90 + rnd() * 30, center.z + (rnd() - 0.5) * spread * 1.4);
    worldGroup.add(g);
  }
}

// ---------------------------------------------------------------------------
// cars
// ---------------------------------------------------------------------------
function makeCarMesh(colorIdx, name, isMe) {
  const g = new THREE.Group();
  const color = CAR_COLORS[colorIdx] ?? CAR_COLORS[0];
  const bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d2230, flatShading: true });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9ad8ff, flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.2), bodyMat);
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.2), bodyMat);
  nose.position.set(0, 0.55, 2.5); nose.castShadow = true; g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.9), glassMat);
  cabin.position.set(0, 1.45, -0.2); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 1.5), bodyMat);
  roof.position.set(0, 1.85, -0.2); g.add(roof);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 0.6), darkMat);
  wing.position.set(0, 1.5, -2.0); wing.castShadow = true; g.add(wing);
  for (const sx of [-0.8, 0.8]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.3), darkMat);
    strut.position.set(sx, 1.2, -2.0); g.add(strut);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.5, 8);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-1.05, 1.4], [1.05, 1.4], [-1.05, -1.4], [1.05, -1.4]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, z);
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.castShadow = true;
    pivot.add(w);
    g.add(pivot);
    wheels.push({ pivot, mesh: w, front: z > 0 });
  }

  let label = null;
  if (!isMe) {
    label = makeLabel(name, COLOR_CSS[colorIdx]);
    label.position.y = 3.4;
    g.add(label);
  }
  return { group: g, wheels, label, bodyMat };
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
    pos, h: heading, speed: 0, steer: 0, vy: 0, airborne: false,
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

// park everyone on the grid for the lobby view
function layoutLobbyCars() {
  if (!app.room || !app.track) return;
  clearCars();
  app.room.players.forEach((p, i) => {
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

function respawn(car) {
  const s = app.track.samples[car.lastCpIdx];
  car.pos.copy(s.p); car.pos.y += 0.3;
  car.h = Math.atan2(s.th.x, s.th.z);
  car.speed = 0; car.vy = 0; car.airborne = false;
  car.idx = car.lastIdx = car.lastCpIdx;
  car.fellTimer = 0; car.offTrackTimer = 0;
  car.onTrack = true;
}

function stepLocal(car, dt, canDrive) {
  const k = app.keys;
  const throttle = canDrive && (k.ArrowUp || k.KeyW) ? 1 : 0;
  const brake = canDrive && (k.ArrowDown || k.KeyS) ? 1 : 0;
  const steerIn = canDrive ? ((k.ArrowLeft || k.KeyA) ? 1 : 0) - ((k.ArrowRight || k.KeyD) ? 1 : 0) : 0;

  car.steer = lerp(car.steer, steerIn, 1 - Math.exp(-dt * 10));

  // locate on track
  const loc = locate(app.track, car.pos, car.idx, 30) || locate(app.track, car.pos, -1);
  let onTrack = false, trackY = 0, slope = 0;
  if (loc && Math.abs(loc.lateral) <= app.track.hw + 1.6 && Math.abs(loc.along) < 2.5 && Math.abs(loc.y - car.pos.y) < 3.5) {
    onTrack = true; trackY = loc.y;
    car.lastIdx = car.idx; car.idx = loc.i;
    fwd.set(Math.sin(car.h), 0, Math.cos(car.h));
    slope = loc.s.t.y * (fwd.x * loc.s.th.x + fwd.z * loc.s.th.z);
  } else if (loc) {
    // off the road: keep following the nearest sample so the search window
    // tracks the car, but don't let grass driving count as lap progress
    car.lastIdx = car.idx = loc.i;
  }
  car.onTrack = onTrack;

  // longitudinal
  const maxSpeed = onTrack ? PHYS.maxSpeed : PHYS.grassMax;
  if (throttle) car.speed += PHYS.accel * (onTrack ? 1 : 0.45) * dt;
  if (brake) {
    if (car.speed > 0.5) car.speed -= PHYS.brake * dt;
    else car.speed -= PHYS.accel * 0.5 * dt;
  }
  const drag = onTrack ? PHYS.roadDrag : PHYS.grassDrag;
  car.speed -= car.speed * drag * dt;
  car.speed -= slope * 14 * dt; // hills slow you down going up, speed you up going down
  car.speed = clamp(car.speed, -PHYS.reverseMax, maxSpeed + (car.speed > maxSpeed ? 0 : 0));
  if (car.speed > maxSpeed) car.speed = lerp(car.speed, maxSpeed, 1 - Math.exp(-dt * 3));

  // steering: no turning when stopped, less twitchy at high speed
  const sv = clamp(car.speed / 10, -1, 1);
  const yaw = car.steer * PHYS.turn * sv * (1 - 0.4 * clamp(Math.abs(car.speed) / PHYS.maxSpeed, 0, 1));
  if (!car.airborne) car.h += yaw * dt;

  fwd.set(Math.sin(car.h), 0, Math.cos(car.h));
  car.pos.addScaledVector(fwd, car.speed * dt);

  // vertical
  const targetY = onTrack ? trackY : 0;
  if (car.airborne) {
    car.vy -= PHYS.gravity * dt;
    car.pos.y += car.vy * dt;
    if (car.pos.y <= targetY) { car.pos.y = targetY; car.vy = 0; car.airborne = false; }
  } else if (car.pos.y > targetY + 0.9) {
    car.airborne = true; car.vy = 0;
  } else {
    car.pos.y = lerp(car.pos.y, targetY, 1 - Math.exp(-dt * 20));
  }

  // off-track bookkeeping
  if (!onTrack) {
    car.offTrackTimer += dt;
    if (!car.airborne && car.pos.y < 0.5 && app.track.samples[car.lastCpIdx].p.y > 2.5) car.fellTimer += dt; // under a bridge
    else car.fellTimer = 0;
    if (car.fellTimer > 1.2 || car.offTrackTimer > 6) respawn(car);
  } else { car.offTrackTimer = 0; car.fellTimer = 0; }

  // checkpoints & laps
  if (onTrack && app.phase === 'racing' && !app.finished) {
    const N = app.track.N;
    const d = (car.idx - car.lastIdx + N) % N;
    if (d > 0 && d < N / 2) {
      const cpIdx = app.track.cps[car.nextCp];
      const dc = (cpIdx - car.lastIdx + N) % N;
      if (dc > 0 && dc <= d) {
        car.lastCpIdx = cpIdx;
        if (car.nextCp === 0) {
          car.lap++;
          if (car.lap > app.laps) finishRace();
          else raceToast(`Lap ${car.lap}`);
        }
        car.nextCp = (car.nextCp + 1) % CHECKPOINT_COUNT;
      }
    }
  }

  // visuals
  const targetPitch = loc && onTrack ? -Math.atan2(loc.s.t.y, 1) * (fwd.x * loc.s.th.x + fwd.z * loc.s.th.z) : 0;
  car.pitch = lerp(car.pitch, targetPitch, 1 - Math.exp(-dt * 8));
  car.roll = lerp(car.roll, -car.steer * 0.12 * clamp(car.speed / PHYS.maxSpeed, 0, 1), 1 - Math.exp(-dt * 8));
  const g = car.mesh.group;
  g.position.copy(car.pos);
  g.rotation.set(0, 0, 0);
  g.rotateY(car.h); g.rotateX(car.pitch); g.rotateZ(car.roll);
  car.wheelSpin += car.speed * dt / 0.48;
  for (const w of car.mesh.wheels) {
    w.mesh.rotation.x = car.wheelSpin;
    if (w.front) w.pivot.rotation.y = car.steer * 0.45;
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
    c.wheelSpin += v * dt / 0.48;
    for (const w of c.mesh.wheels) w.mesh.rotation.x = c.wheelSpin;
  }
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
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
  fwd.set(Math.sin(car.h), 0, Math.cos(car.h));
  const speedK = clamp(Math.abs(car.speed) / PHYS.maxSpeed, 0, 1);
  camPos.copy(car.pos).addScaledVector(fwd, -(9 + speedK * 3)).add(new THREE.Vector3(0, 4.2 + speedK * 0.8, 0));
  // keep the camera from sinking into hills behind the car
  const back = locate(app.track, camPos, car.idx, 20);
  if (back && Math.abs(back.lateral) < app.track.hw + 2) camPos.y = Math.max(camPos.y, back.y + 3.5);
  camera.position.lerp(camPos, camInit ? 1 - Math.exp(-dt * 7) : 1);
  camTarget.copy(car.pos).addScaledVector(fwd, 5).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(camTarget);
  camera.fov = lerp(camera.fov, 68 + speedK * 16, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
  camInit = true;

  sun.position.set(car.pos.x + 80, car.pos.y + 140, car.pos.z + 60);
  sun.target.position.copy(car.pos);
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
    case 'results': showResults(msg.results); break;
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
  if (app.trackId !== msg.trackId || !app.track) buildWorld(msg.trackId);
  clearCars();
  const slot = Math.max(0, app.room.players.findIndex(p => p.id === app.myId));
  spawnLocal(slot);
  for (const p of app.room.players) if (p.id !== app.myId) ensureRemote(p);
  app.phase = 'countdown';
  camInit = false;
  showScreen('race');
  $('#results').classList.add('hidden');
  $('#hud-laps').textContent = app.laps;
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

function showResults(results) {
  app.phase = 'results';
  const list = $('#results-list');
  list.innerHTML = '';
  results.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === 0 && r.time != null) li.classList.add('first');
    if (r.id === app.myId) li.classList.add('me');
    li.innerHTML = `<span class="place">${r.time == null ? '–' : i + 1}</span><span class="dot" style="background:${COLOR_CSS[r.color]}"></span><span>${esc(r.name)}</span><span class="time">${r.time == null ? 'DNF' : fmtTime(r.time)}</span>`;
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

function goHome() {
  app.phase = 'home';
  app.room = null;
  clearCars();
  history.replaceState(null, '', '/');
  showScreen('home');
}

function showLobby() {
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
  for (const p of r.players) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (p.id === r.hostId ? ' host' : '') + (p.id === app.myId ? ' me' : '');
    chip.innerHTML = `<span class="dot" style="background:${COLOR_CSS[p.color]}"></span>${esc(p.name)}`;
    list.appendChild(chip);
  }
  const isHost = r.hostId === app.myId;
  $('#btn-start').classList.toggle('hidden', !isHost);
  $('#wait-host').classList.toggle('hidden', isHost);
  $('#track-list').classList.toggle('locked', !isHost);
  $('#track-hint').textContent = isHost ? '— you pick' : '— host picks';
  document.querySelectorAll('.trackcard').forEach((el, i) => el.classList.toggle('on', i === r.trackId));
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
  $('#btn-start').addEventListener('click', () => send({ t: 'start' }));
  $('#btn-leave').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-lobby').addEventListener('click', () => send({ t: 'lobby' }));

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
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
    const left = app.startAt - Date.now();
    const el = $('#countdown');
    el.classList.remove('hidden');
    const n = Math.ceil(left / 1000);
    const txt = n > 3 ? '' : n > 0 ? String(n) : 'GO!';
    if (el.textContent !== txt) { el.textContent = txt; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    el.classList.toggle('go', n <= 0);
    if (left <= 0) {
      app.phase = 'racing';
      setTimeout(() => el.classList.add('hidden'), 700);
    }
  }
  if (app.phase === 'racing' || app.phase === 'results') {
    const t = app.finished && !app.spectate ? app.finishTime : Math.max(0, now - raceStartPerf());
    $('#hud-time').textContent = fmtTime(t);
  }
  $('#hud-lap').textContent = Math.min(car.lap, app.laps);
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
      `<div class="standing${e.me ? ' me' : ''}${e.finished ? ' done' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS[e.color]}"></span><span>${esc(e.name)}</span><span class="lap">${e.finished ? 'FIN' : 'L' + Math.min(e.lap, app.laps)}</span></div>`
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
// main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (app.local && (app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results')) {
    const canDrive = app.phase === 'racing' || (app.phase === 'results' && app.finished);
    stepLocal(app.local, dt, canDrive);
    stepRemotes(now, dt);
    updateHud(now);
    if (now - app.lastSend > 1000 / SEND_HZ && app.phase !== 'results') {
      app.lastSend = now;
      const c = app.local;
      send({ t: 'state', x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), h: +c.h.toFixed(3), v: +c.speed.toFixed(1), lap: c.lap, cp: c.nextCp, pr: c.idx / app.track.N });
    }
  }
  updateCamera(dt);
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
