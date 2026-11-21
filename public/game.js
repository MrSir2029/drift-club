import * as THREE from 'three';
import { TRACKS, buildTrack, locate, startSlot, CHECKPOINT_COUNT } from '/tracks.js';
import { UPDATES } from '/updates.js';

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
const CAR_COLORS = [0xff4d4d, 0xff8a3d, 0xffd23f, 0x7ed957, 0x2ec4b6, 0x3d8bff, 0x8c6bff, 0xff6bcb, 0xf5f0e6, 0x2b2f3a, 0x8b5a2b, 0x9ad0ff, 0x13806a]; // the last one is the secret racing green livery (LIVERY_HASH)
const COLOR_CSS = CAR_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
const SEND_HZ = 30; // positions a second (sent two at a time when the server asks: see 'joined')
// Each track's look. The meadow is the default; the desert turns the grass to
// sand and red rock, the trees to cacti and the green hills to mesas; snow
// gives white ground, snowy pines, white mountains, snowmen and falling snow;
// the forest is dark green, thick with pines, with ferns and mossy rocks.
const THEMES = {
  meadow: { sky: 0x8ad4f5, skyLight: 0xcfeeff, bounce: 0x5f9c48, lo: 0x6db85e, hi: 0x9ad46a, rock: 0x8f917c, verge: 0x5fa653, gravelVerge: 0x9c8a62, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0x6fb963, noise: 1 },
  night: { sky: 0x0b1430, skyLight: 0x5b6b9c, bounce: 0x151b2c, lo: 0x4f8a4a, hi: 0x6aa35a, rock: 0x6b6f7c, verge: 0x4f8a4a, gravelVerge: 0x6b5d45, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0x1c2638, noise: 1, night: true, hemiI: 0.95, sunI: 0.7, sunColor: 0xa9c0ff },
  snow: { sky: 0xc8d6e4, skyLight: 0xeef4ff, bounce: 0xb9c6d3, lo: 0xdce3ea, hi: 0xeef2f6, rock: 0x7d8794, verge: 0xe2e8ee, gravelVerge: 0xe2e8ee, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0xe8eef4, noise: 1.6 },
  forest: { sky: 0xa9d3c4, skyLight: 0xdcefe4, bounce: 0x3f6b3a, lo: 0x4a8442, hi: 0x6a9c4e, rock: 0x7d8173, verge: 0x467c3e, gravelVerge: 0x8a7a58, road: 0x9c8462, curbs: [0x6d5a40, 0xe2d7bd], hills: 0x2f5e3a, noise: 1.8 },
  desert: { sky: 0xf0d3a2, skyLight: 0xffe9c9, bounce: 0xc8955a, lo: 0xd8a466, hi: 0xeac58b, rock: 0xa9563a, verge: 0xc99a62, gravelVerge: 0xc99a62, road: 0x96694a, curbs: [0x7a4a32, 0xe0c9a0], hills: 0xc0683f, noise: 2.2 },
};
// Typed on the keyboard by the host in the lobby, this opens the secrets
// panel (and typing it again hides it). Letters and numbers only; change it
// to anything you like.
const SECRET_CODE = '9LAT2';
// The rally car is hidden too: a host types this in the lobby to show it (and
// again to hide it). This browser remembers.
const RALLY_CODE = 'RALLY';
// A code typed on the home screen shows a secret colour: a detailed racing
// green livery (colour 12). Again to hide it. Only a hash of the code is kept
// here, so it can't be read out of the page. This browser remembers.
const LIVERY_HASH = 1676705160, LIVERY_LEN = 11;
const hashCode = (s) => { let h = 5381; for (const ch of s) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return h; };
const LIVERY = 12;
// The sponsor lettering on that livery. Made-up names: no real brands.
const SPONSORS = { pods: 'DRIFT CLUB', cover: '9MILE', wing: '9LAT2' };
// Paint and lettering laid flat on the car's blocks, so nothing pokes out of
// the bodywork or sinks into it. q = four corners as someone looking at it
// sees them: bottom-left, bottom-right, top-right, top-left. Paint sits 3 mm off
// the surface, and lettering 3 mm further out, so lettering on paint (DRIFT CLUB
// on the black) is never half hidden by it; lettering gets a canvas the shape of its patch.
const textMats = new Map(); // lettering, shared between cars with the same words
function paintQuad(g, q, mat, text, ink = '#f2f5f0') {
  const n = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[3], q[0])).normalize();
  const p = q.map(v => v.clone().addScaledVector(n, text ? 0.006 : 0.003)), order = [0, 1, 2, 0, 2, 3];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap(i => p[i].toArray()), 3));
  if (text) {
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(order.flatMap(i => [[0, 0], [1, 0], [1, 1], [0, 1]][i]), 2));
    const aspect = q[0].distanceTo(q[1]) / q[0].distanceTo(q[3]), cw = Math.min(2048, Math.max(64, Math.round(128 * aspect)));
    const key = `${text}|${ink}|${cw}`;
    mat = textMats.get(key);
    if (!mat) {
      const c = document.createElement('canvas'); c.height = 128; c.width = cw;
      const x = c.getContext('2d');
      let size = 108;
      do { x.font = `900 ${size}px "Segoe UI", Arial, sans-serif`; size -= 4; } while (x.measureText(text).width > c.width * 0.94 && size > 16);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ink; x.fillText(text, c.width / 2, 70);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false });
      mat.userData.keep = true;
      textMats.set(key, mat);
    }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  g.add(m);
  return m;
}
// On the outside face (the +x or -x side) of a tapered block. spec = [w, h, d,
// front, rear, x, y, z]: the block as built by taperBox and placed by K.add (x
// measured out from the middle). a runs from the back (0) to the front (1); b
// from the bottom (0) to the top (1), or for lettering, actual heights.
function onPanel(g, spec, sx, a0, a1, b0, b1, mat, text, ink) {
  const [w, h, d, front, rear, px, py, pz] = spec, F = front || [1, 1, 0], R = rear || [1, 1, 0];
  const s = (k, a) => (R[k] || 0) + ((F[k] || 0) - (R[k] || 0)) * a;
  // b0 or b1 can be [at a0, at a1], for a line that sweeps up or down along the panel
  const bAt = (b, a) => (Array.isArray(b) ? b[0] + (b[1] - b[0]) * (a - a0) / (a1 - a0) : b);
  const pt = (a, b) => { b = bAt(b, a); return new THREE.Vector3(sx * (px + (w / 2) * s(0, a)), text ? b : py + (b - 0.5) * h * s(1, a) + s(2, a), pz - d / 2 + d * a); };
  // seen from the right-hand side the front is on the left; from the left-hand side, on the right
  const q = sx > 0 ? [pt(a1, b0), pt(a0, b0), pt(a0, b1), pt(a1, b1)] : [pt(a0, b0), pt(a1, b0), pt(a1, b1), pt(a0, b1)];
  return paintQuad(g, q, mat, text, ink);
}
// On the top face of a block: a from back to front, c across it from -1 (the
// -x edge) to +1. Lettering reads from in front of the car (like a nose
// number), or with driver set, from the cockpit.
function onTop(g, spec, a0, a1, c0, c1, mat, text, ink, driver) {
  const [w, h, d, front, rear, px, py, pz] = spec, F = front || [1, 1, 0], R = rear || [1, 1, 0];
  const s = (k, a) => (R[k] || 0) + ((F[k] || 0) - (R[k] || 0)) * a;
  const pt = (a, c) => new THREE.Vector3(px + c * (w / 2) * s(0, a), py + 0.5 * h * s(1, a) + s(2, a), pz - d / 2 + d * a);
  if (c0 > c1) [c0, c1] = [c1, c0]; // either way round: it always faces up
  const q = driver ? [pt(a0, c1), pt(a0, c0), pt(a1, c0), pt(a1, c1)] : [pt(a1, c0), pt(a1, c1), pt(a0, c1), pt(a0, c0)];
  return paintQuad(g, q, mat, text, ink);
}

// Every open seater wears a livery painted onto its panels (these specs are
// buildOpenBody's sidepods, tub, nose, engine cover, airbox and endplates):
// the car's colour on top, black underneath, a pinstripe in a colour that
// stands out against it, DRIFT CLUB on the sidepods, and the driver's race
// number (random, handed out by the server) on the engine cover and once on top,
// facing the driver. The secret livery adds its sponsors and lime trim.
const POD = [0.62, 0.44, 1.45, null, [0.35, 0.5, -0.028], 0.7, 0.45, -0.375];
const TUB = [0.78, 0.56, 2.3, [0.6, 0.58, -0.05], null, 0, 0.5, 0.85];
const NOSE = [0.468, 0.325, 1.25, [0.45, 0.42, -0.1], null, 0, 0.45, 2.62];
const COVER = [0.56, 0.66, 2.1, null, [0.28, 0.3, -0.18], 0, 0.72, -1.15];
const PLATE = [0.045, 0.22, 0.85, null, null, 0.6, 1.35, -2.25];
const AIRBOX = [0.34, 0.32, 0.75, null, [0.6, 0.5, -0.06], 0, 1.2, -0.45];
const FRONT_PLATE = [0.05, 0.3, 0.62, [1, 0.6, -0.05], null, 1.0, 0.27, 3.12];
// the pinstripe for each car colour (CAR_COLORS order)
// (pairs real teams have raced: red and white, papaya and navy, black and gold,
// powder blue and navy with orange tyres and helmet, like the old Gulf colours)
const STRIPES = [0xffffff, 0x1d2b5c, 0x1d2230, 0x1d2b5c, 0xff8a3d, 0xff8a3d, 0xffd23f, 0xffffff, 0xe6453a, 0xd9b44a, 0xf3e3c3, 0x1d2b5c];
// only if the server didn't give one (an older server): one from the name
function raceNumber(name) { let h = 7; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 2 + (h % 98); }
function paintLivery(K, g, colorIdx, name, raceNum) {
  const secret = K.livery;
  const stripe = K.stripe;
  const ink = K.lightCar ? '#1d2230' : '#f2f5f0'; // lettering on the car's own colour
  const num = secret ? '18' : String(raceNum ?? raceNumber(name));
  const patches = [], lettering = (m) => patches.push(m);
  for (const sx of [-1, 1]) {
    if (secret) {
      // green on top, black underneath, a level lime line (like the real car)
      onPanel(g, POD, sx, 0, 1, 0, 0.47, K.carbon);            // black lower sidepods
      onPanel(g, COVER, sx, 0, 1, 0, 0.42, K.carbon);          // and engine cover
      onPanel(g, POD, sx, 0.01, 0.99, 0.47, 0.53, stripe);     // the pinstripe along each sidepod,
      onPanel(g, COVER, sx, 0, 0.56, 0.42, 0.47, stripe);      // on back along the engine cover,
      onPanel(g, TUB, sx, 0.29, 1, 0.7, 0.76, stripe);         // forward down the tub
      onPanel(g, NOSE, sx, 0, 0.9, 0.7, 0.77, stripe);         // and along the nose
    } else {
      // Like a modern F1 car: the colour sweeps back from the nose and black
      // takes over towards the back, with one pinstripe riding the split from
      // the nose tip, low along the tub, up the sidepods and the engine cover.
      onPanel(g, NOSE, sx, 0, 0.9, 0.3, 0.365, stripe);
      onPanel(g, TUB, sx, 0.29, 1, 0.3, 0.365, stripe);
      onPanel(g, POD, sx, 0, 1, 0, [0.88, 0.36], K.carbon);
      onPanel(g, POD, sx, 0, 1, [0.88, 0.36], [0.95, 0.43], stripe);
      onPanel(g, COVER, sx, 0, 0.524, 0, [0.88, 0.21], K.carbon);
      onPanel(g, COVER, sx, 0, 0.524, [0.88, 0.21], [0.95, 0.28], stripe);
      onPanel(g, PLATE, sx, 0, 1, 0, 1, K.carbon);              // black rear wing endplates
    }
    onPanel(g, FRONT_PLATE, sx, 0, 1, 0.82, 0.93, stripe);   // the same colour on the front wing endplates
    K.box(0.48, 0.022, 0.06, stripe, sx * 0.72, 0.631, 0.36, false); // and on each sidepod intake
    // what you see from the cockpit: pinstripes down both top edges of the tub and nose
    onTop(g, TUB, 0.4, 1, sx * 0.72, sx * 0.86, stripe);
    onTop(g, NOSE, 0, 0.96, sx * 0.72, sx * 0.86, stripe); // (meeting the tub's without a step)
    if (secret) {
      lettering(onPanel(g, POD, sx, 0.34, 0.92, 0.287, 0.418, null, SPONSORS.pods)); // white on the black
      onPanel(g, AIRBOX, sx, 0, 1, 0, 1, K.carbon);          // black airbox sides
      lettering(onPanel(g, COVER, sx, 0.58, 0.85, 0.748, 0.875, null, SPONSORS.cover));
      lettering(onPanel(g, PLATE, sx, 0.06, 0.94, 1.27, 1.43, null, SPONSORS.wing));
      lettering(onPanel(g, NOSE, sx, 0.12, 0.6, 0.345, 0.41, null, SPONSORS.pods));
    } else {
      lettering(onPanel(g, POD, sx, 0.25, 0.72, 0.3, 0.42, null, SPONSORS.pods));  // DRIFT CLUB on the black
      lettering(onPanel(g, PLATE, sx, 0.06, 0.94, 1.27, 1.43, null, SPONSORS.pods)); // and big on the rear wing endplates
      lettering(onPanel(g, COVER, sx, 0.6, 0.85, 0.745, 0.88, null, num, ink)); // the race number on the engine cover
    }
  }
  // the driver's name on each sidepod, up at the front in the car's colour (on the
  // secret livery, above its level lime line), clear of the black and the intake
  if (name) for (const sx of [-1, 1]) lettering(onPanel(g, POD, sx, 0.55, 0.97, 0.505, 0.6, null, name.toUpperCase(), ink));
  lettering(onTop(g, TUB, 0.8, 0.96, -0.55, 0.55, null, num, ink, true)); // and the one number on top: on the tub, facing the driver
  // Lettering with the same texture (both sides' DRIFT CLUB, say) becomes one
  // mesh, so a car costs as few draw calls as possible.
  const byMat = new Map();
  for (const m of patches) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
  K.decalMeshes = [];
  for (const [mat, list] of byMat) {
    let mesh = list[0];
    if (list.length > 1) {
      const pos = [], uv = [];
      for (const m of list) { pos.push(...m.geometry.attributes.position.array); uv.push(...m.geometry.attributes.uv.array); g.remove(m); m.geometry.dispose(); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      mesh = new THREE.Mesh(geo, mat); mesh.castShadow = false; g.add(mesh);
    }
    (K.decals ??= []).push(mat); K.decalMeshes.push(mesh);
  }
}
// Feedback: the link to a Google Form (or any page) where players can send
// feedback. The Feedback buttons (home screen and Esc menu) stay hidden while
// this is empty.
const FEEDBACK_URL = '';
// Tips for guests in the lobby while they wait for the host: a random one
// each time, and clicking it shows another.
const TIPS = [
  'Do your homework first!',
  'Thank Darren for the driving physics.',
  'Accelerating while throttling is a bad idea',
  'H.I.N.T is an acronym',
  'The handbrake (space bar) and brake (S) are different things!',
  'The adjective agrees with the verb it describes in gender, number, and case',
  'Missed a gate? Follow the yellow banner back, or press R.',
  'Brake in a straight line, then turn in.',
  'Every lap counts for the leaderboard, even in Polytrack mode.',
  'Computer can handle it? Try Settings → Graphics → Max.',
  'Play some house music and chill',
];
let lastTip = -1;
function showTip() {
  let i;
  do i = Math.floor(Math.random() * TIPS.length); while (i === lastTip && TIPS.length > 1);
  lastTip = i;
  $('#tip-text').textContent = TIPS[i];
}
const LIGHTS_MS = 4000; // the start lights take the 4 s countdown

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

// expanded map (landmarks, stars, blimp): off unless the player turns it on
// Settings defaults changed to high graphics with the expanded map (and its
// Easter eggs) on: forget older saved choices once, so everyone starts from the
// new defaults. Players can still change them in Settings afterwards.
try {
  const d = localStorage.getItem('dc-defaults');
  if (d !== '2' && d !== '3') localStorage.removeItem('dc-gfx'); // graphics back to high
  if (d !== '3') localStorage.removeItem('dc-map');                // expanded map & Easter eggs back on
  localStorage.setItem('dc-defaults', '3');
} catch {}
try { app.expanded = localStorage.getItem('dc-map') !== 'off'; } catch { app.expanded = true; }

// landmarks you've driven to, remembered between visits
app.found = new Set();
try { for (const k of JSON.parse(localStorage.getItem('dc-found') || '[]')) app.found.add(String(k)); } catch {}

// ---------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------
const canvas = $('#view');
// Edge smoothing (multisampling) is only left off on the low setting: without
// it, distant edges turn into jagged staircases. It's fixed when the page
// loads, so changing to or from low takes full effect after a reload.
const savedGfx = (() => { try { return localStorage.getItem('dc-gfx'); } catch { return null; } })();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: savedGfx !== 'low', powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ad4f5);
scene.fog = new THREE.Fog(0x8ad4f5, 260, 620);

const camera = new THREE.PerspectiveCamera(70, 1, 0.5, 1200);

const hemi = new THREE.HemisphereLight(0xcfeeff, 0x5f9c48, 1.4);
scene.add(hemi);
hemi.layers.enable(1); // the cockpit pass draws layer 1 only, and needs light too
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(80, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 400;
sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110;
sun.shadow.bias = -0.0008;
scene.add(sun);
sun.layers.enable(1);
scene.add(sun.target);

// ---------------------------------------------------------------------------
// terrain: a low-poly heightfield that rises to meet the road on hills and
// rolls gently further out. Rebuilt for every track.
// ---------------------------------------------------------------------------
const TERRAIN = { size: 1600, seg: 320, heights: null, origin: { x: 0, z: 0 }, cell: 1, mesh: null };
const ROAD_CLEARANCE = 0.3; // ground sits this far under the road so the two never fight
const ROAD_LIFT = 0.02;      // the road surface is drawn this far above its centre line
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
  const amp = track.look?.noise ?? 1; // the desert's hills roll bigger
  const noise = (x, z) => (Math.sin(x * 0.011 + 0.3) * Math.cos(z * 0.009) * 8 + Math.sin(x * 0.027 + 1.7) * Math.sin(z * 0.023 + 0.4) * 3 + Math.sin(x * 0.06) * Math.cos(z * 0.07) * 0.8) * amp;
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

  // Places worth driving to. Each gets a patch of ground levelled for it (the
  // lake gets a shallow bowl as well), well away from the road so the
  // guarantee above still holds.
  const lim = track.limit, sites = track.sites = {}, taken = [];
  const srnd = mulberry32(555 + app.trackId * 13);
  const level = (cx, cz, r, y, fall = 14) => {
    const i0 = Math.max(0, Math.floor((cx - r - fall - T.origin.x) / T.cell)), i1 = Math.min(T.seg, Math.ceil((cx + r + fall - T.origin.x) / T.cell));
    const j0 = Math.max(0, Math.floor((cz - r - fall - T.origin.z) / T.cell)), j1 = Math.min(T.seg, Math.ceil((cz + r + fall - T.origin.z) / T.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(T.origin.x + i * T.cell - cx, T.origin.z + j * T.cell - cz);
      const w = smooth(clamp((r + fall - d) / fall, 0, 1));
      if (w > 0) H[j * n1 + i] = lerp(H[j * n1 + i], y, w);
    }
  };
  for (const [name, r, mode] of [['lake', 30, ''], ['lat9', 18, track.def.goalFar ? 'remote' : 'far'], ['castle', 23, 'high'], ['fair', 27, 'near'], ['village', 31, ''], ['stones', 12, ''], ['camp', 13, ''], ['windmill', 9, ''], ['mast', 7, 'high']]) {
    let best = null;
    for (let k = 0; k < (mode === 'remote' ? 300 : 140); k++) {
      // 9LAT2 ('far' and 'remote') looks only in the outer ring of the map
      const a = srnd() * 6.2832, d = (mode === 'remote' || mode === 'far' ? 0.72 + 0.28 * srnd() : Math.sqrt(srnd())) * (lim.r - r - 24);
      const x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
      const gap = roadGap(track, x, z);
      if (gap < hw + r + 26 || taken.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 26)) continue;
      const y = terrainHeight(x, z);
      // 9LAT2 hides: as far from every road as the map allows, down in low
      // ground, so you won't spot it from the track. (Same candidates and random
      // numbers as before, so every other landmark stays where it was.)
      const score = mode === 'high' ? y : mode === 'near' ? -gap : mode === 'far' || mode === 'remote' ? gap - 3 * y : 0;
      if (!best || score > best.score) best = { x, z, y, r, score };
      if (!mode) break;
    }
    if (!best) continue;
    taken.push(best); sites[name] = best;
  }
  // Everyone picks the same spots (the 9LAT2 building has to be in the same
  // place for every player), but the ground is only shaped for what this
  // player will build: the expanded map is a per-player setting.
  for (const [name, st] of Object.entries(sites)) {
    if (name !== 'lat9' && !track.expanded) continue;
    level(st.x, st.z, st.r, st.y);
    if (name === 'lake') {
      for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
        const d = Math.hypot(T.origin.x + i * T.cell - st.x, T.origin.z + j * T.cell - st.z);
        if (d < st.r) H[j * n1 + i] -= 1.3 * smooth(clamp((st.r - d) / 10, 0, 1));
      }
      track.lake = { x: st.x, z: st.z, r: st.r, level: st.y - 0.45 };
    }
  }

  // The ground carries on past the edge of this square, out to the horizon:
  // the outer 60 m eases to one level, and flat ground of the same colour
  // carries on from there (see below).
  let edgeSum = 0, edgeN = 0;
  for (let i = 0; i <= T.seg; i++) for (const j of [0, T.seg]) { edgeSum += H[j * n1 + i] + H[i * n1 + j]; edgeN += 2; }
  const edgeY = edgeSum / edgeN, band = Math.round(60 / T.cell);
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const e = Math.min(i, j, T.seg - i, T.seg - j);
    if (e < band) { const k = j * n1 + i, f = smooth(e / band); H[k] = edgeY + (H[k] - edgeY) * f; }
  }
  T.edgeY = edgeY;
  const geo = new THREE.PlaneGeometry(T.size, T.size, T.seg, T.seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center.x, 0, center.z);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const look = track.look || THEMES.meadow;
  const c = new THREE.Color(), lo = new THREE.Color(look.lo), hi = new THREE.Color(look.hi), rock = new THREE.Color(look.rock);
  track.lake ??= null;
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const k = j * n1 + i, y = H[k];
    pos.setY(k, y);
    // steep faces (cuttings, embankments) read as rock instead of grass
    const steep = Math.max(
      Math.abs(y - H[j * n1 + Math.min(i + 1, T.seg)]), Math.abs(y - H[j * n1 + Math.max(i - 1, 0)]),
      Math.abs(y - H[Math.min(j + 1, T.seg) * n1 + i]), Math.abs(y - H[Math.max(j - 1, 0) * n1 + i])) / T.cell;
    // broad, gentle variation; a random shade per point turned into speckle in the distance
    c.copy(lo).lerp(hi, clamp((y + 2) / 16, 0, 1)).multiplyScalar(0.96 + 0.05 * Math.sin(pos.getX(k) * 0.021 + 1.3) * Math.cos(pos.getZ(k) * 0.017));
    c.lerp(rock, clamp((steep - 0.55) / 0.6, 0, 1));
    if (track.lake && y < track.lake.level + 0.25 && (pos.getX(k) - track.lake.x) ** 2 + (pos.getZ(k) - track.lake.z) ** 2 < 1100) c.set(0xd9c48a); // sandy lake bed
    colors[k * 3] = c.r; colors[k * 3 + 1] = c.g; colors[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // flatShading derives face normals in the shader, so the indexed grid stays small
  T.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  T.mesh.receiveShadow = true;
  scene.add(T.mesh);
  // flat ground from the edge of the square out to the horizon: four strips round it
  if (T.far) { scene.remove(T.far); T.far.geometry.dispose(); T.far.material.dispose(); }
  const W = 12000, h = T.size / 2, strips = [[-W, -W, W, -h], [-W, h, W, W], [-W, -h, -h, h], [h, -h, W, h]];
  const fp = [];
  for (const [x0, z0, x1, z1] of strips) fp.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.computeVertexNormals();
  fg.translate(center.x, edgeY, center.z);
  T.far = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: new THREE.Color(look.lo).lerp(new THREE.Color(look.hi), clamp((edgeY + 2) / 16, 0, 1)).multiplyScalar(0.96) }));
  T.far.receiveShadow = true;
  scene.add(T.far);
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

// Graphics quality. On "auto" the game watches its own frame rate and steps
// the detail down until it runs smoothly, which matters a lot on school
// laptops: a choppy picture feels exactly like network lag.
// px caps the pixel ratio: most laptops run Windows at 125% or 150% scaling,
// so anything under 1.25 draws fewer pixels than the screen has and the
// browser stretches it, which turns distant detail to mush.
const GFX_LEVELS = [
  { px: 2, shadows: true, far: 1500, near: 600 }, // high: clear to the far side of the map, hazy hills on the horizon
  { px: 1.5, shadows: true, far: 1100, near: 380 },
  { px: 1.25, shadows: false, far: 560 },  // medium: sharp, but no shadows
  { px: 1, shadows: false, far: 460 },     // low
  { px: 0.8, shadows: false, far: 380 },   // auto's last resort
];
// Max: no limits. Drawn at twice the screen's resolution or more (smooth edges
// however far away), almost no haze, sharper shadows over a wider area, and
// crowds drawn however far away they are. Level -1.
const GFX_MAX = { px: 'max', shadows: true, far: 4200, near: 2200, big: true };
const GFX_FIXED = { max: -1, high: 0, medium: 2, low: 3 }; // which detail level each fixed setting uses
const gfx = { mode: 'high', level: 0, acc: 0, frames: 0, slow: 0, fast: 0, hold: 0, trial: null, floor: 4 };
try { const m = localStorage.getItem('dc-gfx'); if (m === 'max' || m === 'auto' || m === 'high' || m === 'medium' || m === 'low') gfx.mode = m; } catch {}
function applyGfx(level) {
  gfx.level = level;
  const L = level < 0 ? GFX_MAX : GFX_LEVELS[level];
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(L.px === 'max' ? Math.max(2, dpr) : Math.min(dpr, L.px));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  sun.castShadow = L.shadows;
  // max: a bigger, sharper shadow map over a wider area round the car
  const S = L.big ? 190 : 110, size = L.big ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -S; sun.shadow.camera.right = sun.shadow.camera.top = S;
    sun.shadow.camera.updateProjectionMatrix();
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.fog.far = L.far; scene.fog.near = L.near ?? L.far * 0.3; // far detail fades into the haze instead of ending
  camera.far = Math.max(1200, L.far + 300); camera.updateProjectionMatrix();
  gfx.crowdFar2 = L.big ? Infinity : level === 0 ? 450 * 450 : 220 * 220; // past this a spectator is a pixel or two
}
function setGfxMode(mode) {
  gfx.mode = mode;
  try { localStorage.setItem('dc-gfx', mode); } catch {}
  gfx.slow = gfx.fast = gfx.acc = gfx.frames = 0;
  gfx.trial = null; gfx.floor = GFX_LEVELS.length - 1;
  applyGfx(mode in GFX_FIXED ? GFX_FIXED[mode] : Math.max(0, Math.min(gfx.level, 1)));
  renderSettings();
}
function renderSettings() {
  document.querySelectorAll('#seg-gfx button').forEach(b => b.classList.toggle('on', b.dataset.v === gfx.mode));
  document.querySelectorAll('#seg-map button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === app.expanded));
  document.querySelectorAll('#seg-sound button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === audio.on));
  const pct = Math.round(audio.vol * 100);
  $('#vol').value = pct; $('#vol-val').textContent = pct + '%';
}
function setExpanded(on) {
  if (on !== app.expanded) {
    app.expanded = on;
    try { localStorage.setItem('dc-map', on ? 'on' : 'off'); } catch {}
    if (app.phase === 'home' || app.phase === 'lobby') {
      buildWorld(app.trackId);
      if (app.phase === 'lobby') layoutLobbyCars();
    } else $('#map-note').textContent = 'This changes from the next race.';
  }
  renderSettings();
}
function watchFrameRate(ms, now) {
  if (gfx.mode !== 'auto' || ms > 1500 || now < gfx.hold) return; // ignore tab switches and the moment a track loads
  gfx.acc += Math.min(ms, 300); gfx.frames++;
  if (gfx.acc < 1500) return;
  const avg = gfx.acc / gfx.frames;
  gfx.acc = gfx.frames = 0;
  if (gfx.trial) {
    // Did the last step down actually help? If not, the graphics aren't what's
    // slow (it's the processor, or a power-saving screen): undo it and stop
    // lowering, instead of making everything blurry for nothing.
    if (avg > gfx.trial.avg * 0.85) { gfx.floor = gfx.trial.from; applyGfx(gfx.trial.from); gfx.hold = now + 1500; }
    gfx.trial = null; gfx.slow = gfx.fast = 0;
    return;
  }
  if (avg > 24) {
    gfx.fast = 0;
    if (++gfx.slow >= 2 && gfx.level < gfx.floor) {
      if (now - (gfx.upAt || -1e9) < 15000) gfx.noUpUntil = now + 120000; // the last step up was too much: stay down a while
      gfx.trial = { avg, from: gfx.level }; applyGfx(gfx.level + 1); gfx.hold = now + 1500; gfx.slow = 0;
    }
  } else if (avg < 18.5) {
    // running smoothly (55+ fps): step the detail back up. (It used to wait for
    // 83 fps, which a 60 Hz screen never shows, so the game stayed blurry.)
    gfx.slow = 0;
    if (++gfx.fast >= 6 && gfx.level > 0 && now > (gfx.noUpUntil || 0)) { applyGfx(gfx.level - 1); gfx.fast = 0; gfx.upAt = now; gfx.hold = now + 4000; }
  } else gfx.slow = gfx.fast = 0;
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
applyGfx(GFX_FIXED[gfx.mode] ?? 0);
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

// Drawing a few big meshes is far cheaper than thousands of little ones, and
// on school laptops that per-object cost, not the graphics setting, is what
// makes the game choppy. This bakes every plain mesh under `root` (lit,
// untextured, opaque) into one vertex-coloured mesh per kind of material, in
// root's own space. Anything marked userData.dyn (it moves) and any material
// in `skip` (it changes, like a gate that glows) is left as it is.
const mergedMats = new Map();
function mergedMat(side, emissive) {
  const k = side + ':' + emissive;
  let m = mergedMats.get(k);
  if (!m) mergedMats.set(k, m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side, emissive }));
  m.userData.keep = true; // shared: never disposed with a track or a car
  return m;
}
const _mm = new THREE.Matrix4();
function mergeStatic(root, skip) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const victims = [];
  const ok = (m) => m.isMesh && !m.isInstancedMesh && !Array.isArray(m.material) && m.material.isMeshLambertMaterial
    && !m.material.map && !m.material.transparent && !(skip && skip.has(m.material));
  const walk = (o) => { for (const c of o.children) { if (c.userData.dyn) continue; if (ok(c)) victims.push(c); walk(c); } };
  walk(root);
  if (victims.length < 2) return;
  const buckets = new Map();
  for (const m of victims) {
    const mat = m.material, em = mat.emissive.getHex();
    const key = mat.side + '|' + em + '|' + (m.receiveShadow ? 1 : 0);
    let b = buckets.get(key);
    if (!b) buckets.set(key, b = { list: [], n: 0, cast: false, receive: m.receiveShadow, side: mat.side, em });
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(_mm.multiplyMatrices(inv, m.matrixWorld));
    b.list.push({ g, mat }); b.n += g.attributes.position.count; b.cast ||= m.castShadow;
  }
  for (const b of buckets.values()) {
    const P = new Float32Array(b.n * 3), N = new Float32Array(b.n * 3), C = new Float32Array(b.n * 3);
    let o = 0;
    for (const { g, mat } of b.list) {
      const pa = g.attributes.position, na = g.attributes.normal, ca = mat.vertexColors ? g.attributes.color : null, c = mat.color, n = pa.count;
      for (let i = 0; i < n; i++) {
        const k = (o + i) * 3;
        P[k] = pa.getX(i); P[k + 1] = pa.getY(i); P[k + 2] = pa.getZ(i);
        N[k] = na.getX(i); N[k + 1] = na.getY(i); N[k + 2] = na.getZ(i);
        C[k] = c.r * (ca ? ca.getX(i) : 1); C[k + 1] = c.g * (ca ? ca.getY(i) : 1); C[k + 2] = c.b * (ca ? ca.getZ(i) : 1);
      }
      o += n; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mergedMat(b.side, b.em));
    mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
    root.add(mesh);
  }
  const gone = new Set(victims);
  for (const m of victims) {
    const p = m.parent;
    if (!p) continue;
    for (const c of [...m.children]) if (!gone.has(c)) p.attach(c);
    p.remove(m);
  }
  // drop the groups that are now empty
  const prune = (o) => { for (const c of [...o.children]) { prune(c); if (c.isGroup && !c.children.length && !c.userData.dyn) o.remove(c); } };
  prune(root);
}

function disposeTree(o) {
  o.traverse((m) => {
    m.geometry?.dispose?.();
    if (m.isInstancedMesh) m.dispose();
    const mt = m.material;
    if (mt && !mt.userData?.keep) { mt.map?.dispose?.(); mt.dispose?.(); }
  });
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

// Pinewood is a gravel rally stage with two jumps, made for the rally car. In
// any other car (the open seater, the Camry) it's tarmac and the jumps are
// smoothed out: on gravel the open seater was quicker across the grass.
function trackDef(trackId, car) {
  const def = TRACKS[trackId];
  return def.surface === 'gravel' && car !== 'rally' ? { ...def, surface: 'tarmac', jumps: [] } : def;
}
const trackVariant = (trackId, car) => (TRACKS[trackId].surface === 'gravel' && car === 'rally' ? 'rally' : 'road');
// does the world need building again for this track and car?
const worldStale = (trackId, car) => app.trackId !== trackId || !app.track || app.track.expanded !== app.expanded || app.track.variant !== trackVariant(trackId, car || 'open');
function buildWorld(trackId, car = app.worldCar || 'open') {
  // clear old
  while (worldGroup.children.length) disposeTree(worldGroup.children.pop());
  occupied.length = 0; anim.length = 0;
  gfx.hold = performance.now() + 3000;
  app.worldCar = car;
  const track = buildTrack(trackDef(trackId, car));
  track.variant = trackVariant(trackId, car);
  app.track = track;
  app.trackId = trackId;
  track.expanded = app.expanded;
  app.nextCpMesh = null; // new gate materials: force the next-gate glow to be re-applied
  const { samples, N, hw, cps } = track;
  const look = track.look = THEMES[track.theme] || THEMES.meadow;
  scene.background.set(look.sky); scene.fog.color.set(look.sky);
  hemi.color.set(look.skyLight); hemi.groundColor.set(look.bounce);
  hemi.intensity = look.hemiI ?? 1.4; sun.intensity = look.sunI ?? 2.6; sun.color.set(look.sunColor ?? 0xfff4e0); // the night is lit by a dim blue moon
  // the edge of the map: a circle that clears the whole track with room to roam
  {
    const c = track.bounds.getCenter(new THREE.Vector3());
    let far = 0;
    for (const s of samples) far = Math.max(far, Math.hypot(s.p.x - c.x, s.p.z - c.z));
    track.limit = { x: c.x, z: c.z, r: Math.min(far + (track.def.roam || 80), TERRAIN.size / 2 - 60) }; // roam: how far the map runs past the track
  }
  track.walls = [];  // solid line segments
  track.solids = []; // solid circles: trees, posts, rocks, towers
  track.lake = null;
  track.goal = null;
  buildTerrain(track);
  for (const st of Object.values(track.sites)) claim(st.x, st.z, st.r + 3);

  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  // road surface with subtle per-segment shade variation (low-poly feel)
  const gravel = track.surface === 'gravel';
  const roadBase = gravel ? look.road : 0x5b6472;
  const road = buildRibbon(track, hw, -hw, (i) => {
    const k = 0.92 + 0.08 * ((i * 7919) % 13) / 13;
    return new THREE.Color(roadBase).multiplyScalar(k);
  }, 0.02);
  // curbs: red / white on tarmac, dark / pale stones on gravel
  const curbA = gravel ? look.curbs[0] : 0xe6453a, curbB = gravel ? look.curbs[1] : 0xf6f2e8;
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
  const vergeColor = new THREE.Color(gravel ? look.gravelVerge : look.verge);
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
  const railMat = new THREE.MeshLambertMaterial({ color: 0xc9ced6, flatShading: true }), railPost = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  const railing = (p, q, i) => {
    track.walls.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: (p.y + q.y) / 2 });
    for (const h of [0.55, 1.0]) worldGroup.add(strut(V(p.x, p.y + h, p.z), V(q.x, q.y + h, q.z), 0.12, 0.12, railMat));
    if (i % 3 === 0) { const post = new THREE.Mesh(railPost, railMat); post.position.set(p.x, p.y + 0.55, p.z); worldGroup.add(post); }
  };
  for (let i = 0; i < N; i++) {
    const s = samples[i], a = edges[i], b = edges[(i + 1) % N];
    const dropL = Math.max(a.dropL, b.dropL), dropR = Math.max(a.dropR, b.dropR);
    if (dropL <= VERGE_MAX_DROP) pushQuad(vergePos, vergeCol, a.Lo, a.L, b.L, b.Lo, vergeColor);
    if (dropR <= VERGE_MAX_DROP) pushQuad(vergePos, vergeCol, a.R, a.Ro, b.Ro, b.R, vergeColor);
    // where there's a drop instead (the bridge), a solid railing along the edge
    if (dropL > VERGE_MAX_DROP) railing(a.L, b.L, i);
    if (dropR > VERGE_MAX_DROP) railing(a.R, b.R, i);
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
    track.solids.push({ x: post.position.x, z: post.position.z, r: 0.8, y: s0.p.y });
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
      track.solids.push({ x: post.position.x, z: post.position.z, r: 0.65, y: s.p.y });
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.2, 0.5, 0.5), mat);
    bar.position.copy(s.p); bar.position.y += 5.2;
    bar.rotation.y = Math.atan2(s.th.x, s.th.z);
    worldGroup.add(bar);
  }

  buildProps(track);
  buildLandmarks(track);
  buildBoundary(track);
  buildScenery(track);
  if (look.night) buildNight(track);
  buildHelicopter(track);
  mergeStatic(worldGroup, new Set(track.gateMats)); // gates stay apart: the next one glows
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

// Solid things are flat line segments (barriers, fences, buildings), circles
// (trees, posts, rocks, towers) and the ring round the edge of the map. The
// car is treated as three circles, nose, middle and tail: any that overlaps
// something solid is pushed back out, and the car loses the speed it had
// going into it.
function collideWalls(car) {
  const T = app.track, walls = T.walls, solids = T.solids, lim = T.limit;
  const R = 1.0;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  let hit = 0, off = 0;
  const push = (nx, nz, depth) => {
    car.pos.x += nx * depth; car.pos.z += nz * depth;
    const vn = car.vx * nx + car.vz * nz;
    if (vn >= 0) return;
    car.vx -= 1.2 * vn * nx; car.vz -= 1.2 * vn * nz;   // small bounce
    const scrub = 1 - Math.min(0.35, -vn * 0.03);         // scraping along it costs speed
    car.vx *= scrub; car.vz *= scrub;
    // a hit on the nose or tail swings the car round, away from whatever it hit
    car.yawRate += clamp(off * (fz * nx - fx * nz) * -vn * 0.05, -2, 2);
    hit = Math.max(hit, -vn);
  };
  for (off of [2.1, 0, -1.9]) {
    for (const w of walls) {
      if (Math.abs(w.y - car.pos.y) > 3) continue;
      const px = car.pos.x + fx * off, pz = car.pos.z + fz * off;
      const ex = w.bx - w.ax, ez = w.bz - w.az;
      const t = clamp(((px - w.ax) * ex + (pz - w.az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
      const dx = px - (w.ax + ex * t), dz = pz - (w.az + ez * t);
      const d2 = dx * dx + dz * dz;
      if (d2 >= R * R || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      push(dx / d, dz / d, R - d);
    }
    for (const o of solids) {
      const rr = o.r + R, dx = car.pos.x + fx * off - o.x;
      if (dx > rr || dx < -rr) continue;
      const dz = car.pos.z + fz * off - o.z, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6 || Math.abs(o.y - car.pos.y) > 4) continue;
      const d = Math.sqrt(d2);
      push(dx / d, dz / d, rr - d);
    }
    if (lim) {
      const dx = car.pos.x + fx * off - lim.x, dz = car.pos.z + fz * off - lim.z, d = Math.hypot(dx, dz);
      if (d > lim.r - R) push(-dx / d, -dz / d, d - (lim.r - R));
    }
  }
  return hit;
}

// Car against car. Each player's game only moves their own car: it treats the
// others (three circles each, where they're drawn on this screen) as moving
// obstacles, steps out of any overlap and takes half the knock. The other
// player's game does the same from its side, so both cars react.
function collideCars(car) {
  if ((app.phase !== 'racing' && app.phase !== 'results') || app.spectate) return 0; // a spectator drives through everyone
  const R = 0.95, offs = [1.7, 0, -1.6], fx = Math.sin(car.h), fz = Math.cos(car.h);
  let hit = 0;
  for (const c of app.cars.values()) {
    if (!c.shown || c.spec) continue; // and everyone drives through a spectator
    const ddx = car.pos.x - c.sx, ddz = car.pos.z - c.sz;
    if (ddx * ddx + ddz * ddz > 36 || Math.abs(car.pos.y - c.sy) > 2.5) continue;
    const ox = Math.sin(c.sh), oz = Math.cos(c.sh);
    for (const a of offs) for (const b of offs) {
      const dx = car.pos.x + fx * a - (c.sx + ox * b), dz = car.pos.z + fz * a - (c.sz + oz * b), d2 = dx * dx + dz * dz;
      // the knock is felt a touch before the bodies meet: the other car stops
      // itself at the surface on its own screen, so it never quite overlaps here
      if (d2 >= (2 * R + 0.4) ** 2 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      if (d < 2 * R) { car.pos.x += nx * (2 * R - d) * 0.6; car.pos.z += nz * (2 * R - d) * 0.6; }
      const vn = (car.vx - (c.svx || 0)) * nx + (car.vz - (c.svz || 0)) * nz;
      if (vn >= 0) continue;
      car.vx -= 0.7 * vn * nx; car.vz -= 0.7 * vn * nz;
      car.yawRate += clamp(a * (fz * nx - fx * nz) * -vn * 0.04, -1.5, 1.5); // a knock on the nose or tail turns the car
      hit = Math.max(hit, -vn);
    }
  }
  return hit;
}

// Qualifying ghost: your best lap so far, replayed as a see-through car that
// sets off each time you start a new lap.
function updateGhost(now) {
  const car = app.local, lap = app.ghostLap;
  const on = car && lap && app.mode === 'quali' && app.phase === 'racing';
  app.ghostOn = false; // set below once the ghost has a place on the lap (the minimap shows it then)
  if (!on) { if (app.ghost) app.ghost.group.visible = false; app.ghostDelta = null; return; }
  if (!app.ghost) {
    app.ghost = makeCarMesh(app.color, '', true, app.carClass, false, raceNumberOf(app.myId));
    app.ghost.group.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.45; m.material.color?.setHex(0xbfe4ff); m.material.depthWrite = false; m.castShadow = false; } });
    carsGroup.add(app.ghost.group);
  }
  const t = now - car.lapStart, g = app.ghost.group;
  // the gap: how long the ghost took to reach the point you're at now, against
  // your own time so far this lap (negative: you're ahead)
  let j = app.dI || 0;
  if (j >= lap.length || lap[j].i > car.idx + 30) j = 0;
  while (j < lap.length - 2 && lap[j + 1].i <= car.idx) j++;
  app.dI = j;
  const pa = lap[j], pb = lap[j + 1];
  if (pa && pb && pb.i > pa.i && car.lap > 1) app.ghostDelta = (t - lerp(pa.t, pb.t, clamp((car.idx - pa.i) / (pb.i - pa.i), 0, 1))) / 1000;
  else app.ghostDelta = null;
  let i = app.ghostI || 0;
  if (i >= lap.length || lap[i].t > t) i = 0;
  while (i < lap.length - 2 && lap[i + 1].t <= t) i++;
  app.ghostI = i;
  const a = lap[i], b = lap[i + 1];
  if (!b || t > lap[lap.length - 1].t) { g.visible = false; return; }
  const u = clamp((t - a.t) / (b.t - a.t), 0, 1);
  g.position.set(lerp(a.x, b.x, u), lerp(a.y, b.y, u), lerp(a.z, b.z, u));
  g.rotation.set(0, lerpAngle(a.h, b.h, u), 0);
  app.ghostOn = true;
  g.visible = (g.position.x - car.pos.x) ** 2 + (g.position.z - car.pos.z) ** 2 > 9; // not when it's sitting on top of you
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
      let tick = 0;
      const update = (t) => {
        if (gfx.level >= 2 && tick++ % 3) return; // low detail: the crowd moves at a third of the rate
        const car = app.local, cam = camera.position;
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if ((cam.x - p.x) ** 2 + (cam.z - p.z) ** 2 > (gfx.crowdFar2 ?? 48400)) { // far off a spectator is a pixel or two and only sparkles (max draws them anyway)
            M.makeScale(0, 0, 0); bodies.setMatrixAt(i, M); heads.setMatrixAt(i, M); continue;
          }
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

// Flags share one rippling sheet of cloth, drawn as a single instanced mesh.
function makeFlags(max = 40) {
  const geo = new THREE.PlaneGeometry(2.6, 1.5, 8, 2);
  geo.translate(1.3, 0, 0);
  const base = geo.attributes.position.array.slice();
  const poleGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xd9dde3, flatShading: true });
  const cloth = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, flatShading: true }), max);
  cloth.count = 0; cloth.visible = false; cloth.frustumCulled = false; cloth.userData.dyn = true;
  worldGroup.add(cloth);
  const M = new THREE.Matrix4(), C = new THREE.Color();
  anim.push((t) => {
    if (!cloth.count) return;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 2.4 - t * 8) * 0.14 * x); }
    p.needsUpdate = true;
  });
  return {
    add(x, y, z, color, h = 6) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.scale.y = h; pole.position.set(x, y + h / 2, z); worldGroup.add(pole);
      if (cloth.count >= max) return;
      M.makeRotationY(0.6); M.setPosition(x, y + h - 0.8, z);
      cloth.setMatrixAt(cloth.count, M); cloth.setColorAt(cloth.count, C.set(color));
      cloth.count++; cloth.visible = true;
      cloth.instanceMatrix.needsUpdate = true; cloth.instanceColor.needsUpdate = true;
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
  const walls = track.walls;
  if (track.def.arch != null) {
    // a natural stone arch the road runs under
    const s = samples[Math.round(track.def.arch * N) % N], H = 11, off = hw + 5;
    const red = lam(0xb5603c), dark = lam(0x9c4f32);
    const tops = [1, -1].map((side) => {
      const x = s.p.x + s.left.x * side * off, z = s.p.z + s.left.z * side * off, y = terrainHeight(x, z);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.2, H + 3, 7), red);
      pillar.position.set(x, y + (H + 3) / 2 - 3, z); pillar.castShadow = true; worldGroup.add(pillar);
      track.solids.push({ x, z, r: 3.0, y }); claim(x, z, 4.5);
      return V(x, y + H - 0.6, z);
    });
    let prev = tops[0];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, p = tops[0].clone().lerp(tops[1], t); p.y += Math.sin(Math.PI * t) * 3.5;
      const seg = strut(prev, p, 3.2, 2.6, k % 2 ? red : dark); seg.castShadow = true; worldGroup.add(seg);
      prev = p;
    }
  }
  const solid = (p, r) => track.solids.push({ x: p.x, z: p.z, r, y: p.y });
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
    solid(p, 1.7);
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
    solid(p, 2.3);
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
        solid(p, 0.3);
      });
      // marshal post on the inside of the corner, waving a flag as you arrive
      const mi = wrap(i - 6), msamp = samples[mi], mp = at(msamp, -outside * (hw + 6.5));
      if (flat(mi) && isFree(track, mp.x, mp.z, 2, hw + 4)) {
        claim(mp.x, mp.z, 2);
        solid(mp, 1.5);
        const g = new THREE.Group();
        const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 2.4), lam(0xff8a3d)); deck.position.y = 1.0; deck.castShadow = true; g.add(deck);
        for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), postMat); leg.position.set(x, 0.1, z); g.add(leg); }
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.12), lam(0xf6f2e8)); back.position.set(0, 1.7, -1.15); g.add(back);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.34), lam(0xff6a1a)); body.position.set(0, 1.58, 0.2); g.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), lam(0xf1c9a5)); head.position.set(0, 2.2, 0.2); g.add(head);
        const arm = new THREE.Group(); arm.position.set(0.3, 1.9, 0.3);
        const stick = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.06), postMat); stick.position.y = 0.65; arm.add(stick);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.04), lam(n % 2 ? 0xffd23f : 0x3d8bff)); cloth.position.set(0.48, 1.0, 0); arm.add(cloth);
        arm.userData.dyn = true; mergeStatic(arm);
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
    for (const e of [-0.8, 0.8]) solid({ x: p.x + ex * e, z: p.z + ez * e, y: p.y }, 0.45);
    const pole = at(s, -side * (hw + 6));
    if (!gravel && isFree(track, pole.x, pole.z, 1, hw + 3)) {
      claim(pole.x, pole.z, 1);
      solid(pole, 0.45);
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

// The ring round the edge of the map: a dry-stone wall you can see coming.
// The collision itself is the circle in track.limit.
function buildBoundary(track) {
  const lim = track.limit, SEG = 220, pos = [], col = [];
  const shade = new THREE.Color();
  const ring = [];
  for (let k = 0; k < SEG; k++) {
    const a = (k / SEG) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    const xi = lim.x + cx * lim.r, zi = lim.z + cz * lim.r, xo = lim.x + cx * (lim.r + 1.1), zo = lim.z + cz * (lim.r + 1.1);
    const g = Math.max(terrainHeight(xi, zi), terrainHeight(xo, zo));
    ring.push({ i0: V(xi, g - 3, zi), i1: V(xi, g + 1.7, zi), o0: V(xo, g - 3, zo), o1: V(xo, g + 1.7, zo) });
  }
  for (let k = 0; k < SEG; k++) {
    const a = ring[k], b = ring[(k + 1) % SEG];
    shade.set(k % 2 ? 0xa3a195 : 0x8f8d80).multiplyScalar(0.92 + ((k * 7919) % 11) / 90);
    pushQuad(pos, col, a.i1, a.i0, b.i0, b.i1, shade);   // inner face
    pushQuad(pos, col, a.o0, a.o1, b.o1, b.o0, shade);   // outer face
    shade.multiplyScalar(1.12);
    pushQuad(pos, col, a.o1, a.i1, b.i1, b.o1, shade);   // top
  }
  const mesh = flatMesh(pos, col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  worldGroup.add(mesh);
}

function updateFoundHud() {
  const finds = app.track?.finds || [];
  const el = $('#found');
  el.classList.toggle('hidden', !finds.length);
  el.textContent = `★ ${finds.filter(f => f.found).length}/${finds.length} landmarks`;
}

// Places to find away from the circuit: a lake, a castle, a fairground, a
// village, a stone circle, a campsite, a windmill, a radio mast, and a blimp
// overhead. Everything here is solid, and each place hides a gold star.
function buildLandmarks(track) {
  const S = track.sites || {};
  const rnd = mulberry32(4242 + app.trackId * 17);
  const mats = new Map();
  const lam = (c) => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
  const flags = makeFlags();
  const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2);
  // a group standing on a site; w() turns a spot inside it into world x, z
  const start = (site, rot) => {
    const g = new THREE.Group(); g.position.set(site.x, site.y, site.z); g.rotation.y = rot; worldGroup.add(g);
    const c = Math.cos(rot), sn = Math.sin(rot);
    g.userData.w = (lx, lz) => [site.x + lx * c + lz * sn, site.z - lx * sn + lz * c];
    g.userData.y = site.y;
    return g;
  };
  const add = (g, geo, color, x, y, z, shadow = true) => { const m = new THREE.Mesh(geo, lam(color)); m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m; };
  const box = (g, w, h, d, color, x, y, z) => add(g, new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const cyl = (g, r0, r1, h, seg, color, x, y, z) => add(g, new THREE.CylinderGeometry(r0, r1, h, seg), color, x, y, z);
  const circ = (g, lx, lz, r) => { const [x, z] = g.userData.w(lx, lz); track.solids.push({ x, z, r, y: g.userData.y }); };
  const line = (g, x0, z0, x1, z1) => { const a = g.userData.w(x0, z0), b = g.userData.w(x1, z1); track.walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y: g.userData.y }); };
  // solid rectangle w x d centred on (cx, cz), turned by ry
  const rect = (g, cx, cz, w, d, ry = 0) => {
    const c = Math.cos(ry), sn = Math.sin(ry);
    const pts = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]].map(([x, z]) => [cx + x * c + z * sn, cz - x * sn + z * c]);
    for (let k = 0; k < 4; k++) line(g, pts[k][0], pts[k][1], pts[(k + 1) % 4][0], pts[(k + 1) % 4][1]);
  };
  const house = (g, w, h, d, wallCol, roofCol, x, z, ry = 0) => {
    const hg = new THREE.Group(); hg.position.set(x, 0, z); hg.rotation.y = ry; g.add(hg);
    box(hg, w, h + 3, d, wallCol, 0, h / 2 - 1.5, 0);
    add(hg, roofGeo, roofCol, 0, h + d * 0.17, 0).scale.set(w + 0.8, d * 0.34, d * 0.62);
    rect(g, x, z, w, d, ry);
    return hg;
  };
  const person = (g, x, z, shirt) => { box(g, 0.46, 0.85, 0.3, shirt, x, 0.43, z); box(g, 0.3, 0.3, 0.3, 0xe0b48a, x, 1.02, z); };

  const full = track.expanded;
  const finds = track.finds = [];
  const starGeo = new THREE.OctahedronGeometry(1.1, 0);
  const starMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0xb87a00, flatShading: true });
  const star = (name, g, lx, lz, lift = 2) => {
    const [x, z] = g.userData.w(lx, lz), key = app.trackId + ':' + name;
    const m = new THREE.Mesh(starGeo, starMat);
    m.position.set(x, g.userData.y + lift, z); m.scale.set(1, 1.5, 0.5); m.userData.dyn = true;
    const f = { name, key, x, z, y: g.userData.y, m, found: app.found.has(key) };
    m.visible = !f.found;
    worldGroup.add(m); finds.push(f);
  };

  // ---- lake: jetty, rowing boat, two sailing boats, ducks ----
  if (S.lake && track.lake) {
    const L = track.lake, rot = rnd() * 6.28, g = start({ x: L.x, y: L.level, z: L.z }, rot);
    const water = new THREE.Mesh(new THREE.CircleGeometry(L.r + 1, 30).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial(track.theme === 'snow' ? { color: 0xcfe8f5, transparent: true, opacity: 0.95 } : { color: 0x3aa0d8, transparent: true, opacity: 0.8 }));
    water.receiveShadow = true; g.add(water);
    box(g, 2.4, 0.25, 14, 0x9a6a3c, 0, 0.55, L.r - 9);                       // jetty runs in from the shore
    for (const z of [L.r - 15, L.r - 10, L.r - 5]) for (const x of [-1, 1]) box(g, 0.3, 2.4, 0.3, 0x7a4a2a, x, -0.3, z);
    rect(g, 0, L.r - 9, 2.4, 14);
    const row = add(g, taperBox(1.3, 0.55, 3.2, [0.3, 1, 0], [0.7, 1, 0]), 0xe6453a, 2.4, 0.15, L.r - 14); row.rotation.y = 0.3;
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, -1.2, 0, 0.9, 1.5, 0, 5.2, -1.0], 3));
    sailGeo.computeVertexNormals();
    const boats = [[0xf6f2e8, 0xe6453a, 10, 0.16], [0x3d8bff, 0xf6f2e8, 17, -0.11]].map(([hull, sail, r, sp]) => {
      const b = new THREE.Group();
      add(b, taperBox(1.7, 0.8, 4.4, [0.25, 1, 0], [0.75, 1, 0]), hull, 0, 0.2, 0);
      box(b, 0.14, 5.4, 0.14, 0x7a4a2a, 0, 2.9, -1.1);
      b.add(new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: sail, side: THREE.DoubleSide, flatShading: true })));
      g.add(b); b.userData.dyn = true; mergeStatic(b);
      return { b, r, sp, ph: rnd() * 6 };
    });
    const ducks = Array.from({ length: 6 }, () => ({ m: box(g, 0.35, 0.3, 0.55, 0xf6f2e8, 0, 0.12, 0), a: rnd() * 6.28, r: 4 + rnd() * 3, sp: 0.2 + rnd() * 0.25, cx: (rnd() - 0.5) * 14, cz: (rnd() - 0.5) * 14 }));
    for (const d of ducks) d.m.userData.dyn = true;
    water.userData.dyn = true;
    anim.push((t) => {
      water.position.y = Math.sin(t * 0.8) * 0.04;
      for (const o of boats) {
        const a = o.ph + t * o.sp;
        o.b.position.set(Math.cos(a) * o.r, Math.sin(t * 1.3 + o.ph) * 0.08, Math.sin(a) * o.r);
        o.b.rotation.set(Math.sin(t * 1.1 + o.ph) * 0.05, Math.atan2(-Math.sin(a) * o.sp, Math.cos(a) * o.sp), Math.sin(t * 0.9 + o.ph) * 0.07);
      }
      for (const d of ducks) { const a = d.a + t * d.sp; d.m.position.set(d.cx + Math.cos(a) * d.r, 0.12, d.cz + Math.sin(a) * d.r); d.m.rotation.y = -a; }
    });
    star('Lake', g, 0, -4, 2.4);
  }

  // ---- 9LAT2: a brick classroom block with its name on the roof. In the
  // "Race to 9LAT2" mode the pad outside its door is the finish. ----
  if (S.lat9) {
    const st = S.lat9, lim = track.limit;
    const g = start(st, Math.atan2(lim.x - st.x, lim.z - st.z)); // front door faces the middle of the map
    box(g, 20, 10, 11, 0xb8553f, 0, 2, 0);
    box(g, 20.8, 0.5, 11.8, 0x3b4250, 0, 7.25, 0);
    box(g, 20.1, 0.5, 11.1, 0xe9e4d8, 0, 3.4, 0);
    for (const y of [1.9, 5.2]) for (let k = 0; k < 6; k++) { const x = -8 + k * 3.2; if (y < 3 && Math.abs(x) < 2) continue; box(g, 1.9, 1.6, 0.14, 0x9ad0ff, x, y, 5.5); }
    box(g, 2.8, 3, 0.16, 0x26303f, 0, 1.5, 5.5); box(g, 4.4, 0.25, 2.2, 0x3b4250, 0, 3.25, 6.4);
    for (const x of [-2, 2]) box(g, 0.2, 3.2, 0.2, 0x3b4250, x, 1.6, 7.3);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#1d2230'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#ffd23f'; ctx.fillRect(8, 8, 496, 112);
    ctx.fillStyle = '#1d2230'; ctx.font = '900 100px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('9LAT2', 256, 68);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshBasicMaterial({ map: tex }); // fades into the haze like everything else: you have to get close
    for (const [w, h, y, z, ry] of [[10, 2.5, 9.4, 0.12, 0], [10, 2.5, 9.4, -0.12, Math.PI], [5.2, 1.3, 4.35, 5.6, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat); m.position.set(0, y, z); m.rotation.y = ry; g.add(m); }
    for (const x of [-4.4, 4.4]) box(g, 0.25, 2.2, 0.25, 0x3b4250, x, 8.3, 0);
    for (const x of [-7, 7]) { box(g, 2.6, 0.2, 0.7, 0x7a4a2a, x, 0.55, 8); box(g, 2.2, 0.5, 0.2, 0x5a6372, x, 0.25, 8); }
    rect(g, 0, 0, 20, 11);
    const [gx, gz] = g.userData.w(0, 13);
    track.goal = { x: gx, z: gz, y: st.y, r: 5.5 };
    // finish pad and a beam of light you can steer by, shown only in that mode
    const fx = new THREE.Group(); fx.position.set(0, 0, 13); g.add(fx); fx.userData.dyn = true;
    const pad = new THREE.Mesh(new THREE.RingGeometry(3.6, 5.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f })); pad.position.y = 0.12; fx.add(pad);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 160, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, fog: false })); beam.position.y = 80; fx.add(beam);
    anim.push((t) => { fx.visible = app.mode === 'dash' && inRace(); beam.material.opacity = 0.26 + Math.sin(t * 3) * 0.08; });
  }

  // ---- castle on the highest ground: drive in through the gate ----
  if (full && S.castle) {
    const g = start(S.castle, rnd() * 6.28), stone = 0xa9a79a, dark = 0x8d8c80, W = 13;
    box(g, 1.6, 9, 2 * W, stone, -W, 1.5, 0); box(g, 1.6, 9, 2 * W, stone, W, 1.5, 0);
    box(g, 2 * W, 9, 1.6, stone, 0, 1.5, -W);
    for (const sx of [-1, 1]) box(g, 10, 9, 1.6, stone, sx * 8, 1.5, W);        // front wall, with a 6 m gateway
    box(g, 6, 2.2, 1.8, dark, 0, 5.4, W);                                         // lintel over the gate
    line(g, -W, -W, -W, W); line(g, W, -W, W, W); line(g, -W, -W, W, -W);
    line(g, -W, W, -3, W); line(g, 3, W, W, W);
    for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W]]) {
      cyl(g, 3, 3.3, 14, 8, stone, x, 4, z); cyl(g, 3.6, 3.6, 1.4, 8, dark, x, 11.6, z);
      circ(g, x, z, 3.4);
    }
    box(g, 9, 15, 8, stone, 0, 4.5, -7); box(g, 10, 1.4, 9, dark, 0, 12.6, -7);  // the keep
    for (const x of [-3.6, 0, 3.6]) box(g, 1.6, 1.2, 9.2, dark, x, 13.8, -7);
    box(g, 2, 3, 0.2, 0x3b2a1a, 0, 1.5, -2.95);
    rect(g, 0, -7, 9, 8);
    for (const [x, z, h, c] of [[-W, W, 12.3, 0xe6453a], [W, W, 12.3, 0xffd23f], [0, -7, 14.4, 0x3d8bff]]) { const [wx, wz] = g.userData.w(x, z); flags.add(wx, S.castle.y + h, wz, c, 5); }
    star('Castle', g, 0, 5);
  }

  // ---- fairground: big wheel, carousel, big top, stalls ----
  if (full && S.fair) {
    const g = start(S.fair, rnd() * 6.28);
    const steel = lam(0xd9dde3), HUB = 15, RAD = 12, cols = [0xe6453a, 0xffd23f, 0x3d8bff, 0x7ed957, 0xff8a3d, 0x8c6bff];
    for (const z of [-2.2, 2.2]) for (const x of [-6.5, 6.5]) { const m = strut(V(x, -1, z), V(0, HUB, z), 0.5, 0.5, steel); m.castShadow = true; g.add(m); circ(g, x * 0.92, z, 0.8); }
    const wheel = new THREE.Group(); wheel.position.set(0, HUB, 0); g.add(wheel); wheel.userData.dyn = true;
    const pods = [];
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * 6.2832, a1 = ((k + 1) / 12) * 6.2832;
      for (const z of [-1.3, 1.3]) {
        wheel.add(strut(V(Math.cos(a0) * RAD, Math.sin(a0) * RAD, z), V(Math.cos(a1) * RAD, Math.sin(a1) * RAD, z), 0.3, 0.3, steel));
        wheel.add(strut(V(0, 0, z), V(Math.cos(a0) * RAD, Math.sin(a0) * RAD, z), 0.16, 0.16, steel));
      }
      const pod = new THREE.Group(); pod.position.set(Math.cos(a0) * RAD, Math.sin(a0) * RAD, 0);
      box(pod, 1.9, 1.5, 2.2, cols[k % 6], 0, -1.5, 0); box(pod, 2.2, 0.2, 2.5, 0xf6f2e8, 0, -0.6, 0);
      wheel.add(pod); pods.push(pod); pod.userData.dyn = true; mergeStatic(pod);
    }
    cyl(wheel, 0.9, 0.9, 5.2, 8, 0xe6453a, 0, 0, 0).rotation.x = Math.PI / 2;
    mergeStatic(wheel);
    // carousel
    const car = new THREE.Group(); car.position.set(-15, 0, 7); g.add(car);
    cyl(car, 5.2, 5.2, 0.6, 12, 0xe6453a, 0, 0.3, 0);
    const spin = new THREE.Group(); car.add(spin); spin.userData.dyn = true;
    add(spin, new THREE.ConeGeometry(5.8, 2.6, 12), 0xffd23f, 0, 6.3, 0); cyl(spin, 5.8, 5.8, 0.6, 12, 0xe6453a, 0, 4.8, 0); cyl(spin, 0.5, 0.5, 5, 6, 0xf6f2e8, 0, 2.6, 0);
    const horses = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.2832, x = Math.cos(a) * 3.9, z = Math.sin(a) * 3.9;
      cyl(spin, 0.07, 0.07, 4.2, 4, 0xd9dde3, x, 2.6, z);
      const h = box(spin, 0.5, 0.9, 1.5, cols[k % 6], x, 1.6, z); h.rotation.y = -a; h.userData.dyn = true; horses.push(h);
    }
    mergeStatic(spin);
    circ(g, -15, 7, 5.4);
    // big top
    cyl(g, 7.4, 7.4, 3.4, 12, 0xe6453a, 11, 1.2, -13); add(g, new THREE.ConeGeometry(8, 6, 12), 0xf6f2e8, 11, 5.9, -13);
    circ(g, 11, -13, 7.6);
    { const [wx, wz] = g.userData.w(11, -13); flags.add(wx, S.fair.y + 8.6, wz, 0xffd23f, 4); }
    // stalls
    [[-6, -15, 0x3d8bff], [0, -18, 0x7ed957], [-13, -9, 0xff8a3d]].forEach(([x, z, c]) => {
      box(g, 3.4, 1.1, 2.2, 0xf6f2e8, x, 0.55, z);
      add(g, new THREE.ConeGeometry(3, 1.6, 4).rotateY(Math.PI / 4), c, x, 3.6, z);
      for (const [dx, dz] of [[-1.7, -1.2], [1.7, -1.2], [1.7, 1.2], [-1.7, 1.2]]) box(g, 0.12, 2.9, 0.12, 0x5a6372, x + dx, 1.45, z + dz);
      person(g, x, z - 0.2, c); circ(g, x, z, 2);
    });
    for (let k = 0; k < 9; k++) person(g, -6 + rnd() * 16, -4 + rnd() * 12, cols[k % 6]);
    anim.push((t) => {
      wheel.rotation.z = t * 0.22;
      for (const p of pods) p.rotation.z = -wheel.rotation.z;   // the pods hang level
      spin.rotation.y = t * 0.7;
      horses.forEach((h, k) => { h.position.y = 1.6 + Math.sin(t * 2.4 + k * 1.6) * 0.45; });
    });
    star('Fairground', g, 0, 8);
  }

  // ---- village: houses round a green, a church, a well ----
  if (full && S.village) {
    const g = start(S.village, rnd() * 6.28);
    const wallCols = [0xf1e9d6, 0xe8d3b0, 0xd9c9b8, 0xf6f2e8, 0xc9b79a], roofCols = [0x9c3b2e, 0x7a4a2a, 0x3b4250, 0xb8483a];
    for (let k = 0; k < 7; k++) {
      const a = 0.82 + k * 0.78, R = 20.5 + (k % 2) * 3, x = Math.cos(a) * R, z = Math.sin(a) * R, ry = Math.atan2(-x, -z);
      const w = 6 + rnd() * 2.5, d = 5.5 + rnd() * 1.5, h = 3.6 + rnd() * 1.4;
      const hg = house(g, w, h, d, wallCols[k % 5], roofCols[k % 4], x, z, ry);
      box(hg, 1.1, 2, 0.15, 0x7a4a2a, 0, 1, d / 2 + 0.03);
      for (const sx of [-1, 1]) box(hg, 1, 1, 0.12, 0x9ad0ff, sx * w * 0.3, 1.9, d / 2 + 0.03);
      box(hg, 0.8, 2, 0.8, 0x8d8c80, w * 0.28, h + d * 0.25, -d * 0.12);
    }
    // church: nave with the ridge running along it, tower and spire at the west end
    const ch = house(g, 14, 6, 7, 0xf6f2e8, 0x3b4250, 22, 0, Math.PI / 2);
    box(ch, 4.2, 17, 4.2, 0xf6f2e8, -8.6, 5.5, 0);
    add(ch, new THREE.ConeGeometry(3.3, 7, 4).rotateY(Math.PI / 4), 0x3b4250, -8.6, 17.5, 0);
    box(ch, 0.15, 2.4, 1.4, 0x7a4a2a, -10.75, 1.2, 0);
    for (const x of [-3, 1, 5]) for (const sz of [-1, 1]) box(ch, 1, 2.4, 0.12, 0x9ad0ff, x, 3.4, sz * 3.53);
    rect(g, 22, 8.6, 4.2, 4.2);
    // the green: well, lamps, a few villagers
    cyl(g, 1.3, 1.3, 1, 8, 0x8d8c80, 0, 0.5, 0);
    for (const x of [-1, 1]) box(g, 0.16, 2.2, 0.16, 0x7a4a2a, x, 1.6, 0);
    add(g, roofGeo, 0x9c3b2e, 0, 2.9, 0).scale.set(3, 0.7, 1.4);
    circ(g, 0, 0, 1.5);
    for (const [x, z] of [[7, 7], [-7, 7], [-7, -7], [7, -7]]) { box(g, 0.2, 4, 0.2, 0x3b4250, x, 2, z); box(g, 0.6, 0.6, 0.6, 0xffe9a8, x, 4.2, z); circ(g, x, z, 0.35); }
    for (let k = 0; k < 8; k++) person(g, (rnd() - 0.5) * 20, (rnd() - 0.5) * 20, [0xe6453a, 0x3d8bff, 0xffd23f, 0x7ed957][k % 4]);
    star('Village', g, -4, 3);
  }

  // ---- stone circle ----
  if (full && S.stones) {
    const g = start(S.stones, rnd() * 6.28), top = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * 6.2832, x = Math.cos(a) * 8.5, z = Math.sin(a) * 8.5, h = 3.6 + rnd() * 1.2;
      const m = box(g, 1.5, h + 2, 1, k % 3 ? 0x9a9a8c : 0x86867a, x, h / 2 - 1, z);
      m.rotation.set((rnd() - 0.5) * 0.12, -a + Math.PI / 2, (rnd() - 0.5) * 0.12);
      circ(g, x, z, 0.95); top.push([x, h, z]);
    }
    for (const k of [0, 3, 6]) {
      const a = top[k], b = top[k + 1], y = Math.min(a[1], b[1]) + 0.35;
      const m = strut(V(a[0], y, a[2]), V(b[0], y, b[2]), 1.1, 0.7, lam(0x86867a)); m.scale.z = 1.25; m.castShadow = true; g.add(m);
    }
    box(g, 2.6, 1.6, 1.4, 0x86867a, 0, 0.3, -1.5); circ(g, 0, -1.5, 1.4);
    star('Stone circle', g, 0, 3);
  }

  // ---- campsite: tents, a camper van, a fire that flickers and smokes ----
  if (full && S.camp) {
    const g = start(S.camp, rnd() * 6.28);
    [[-5, -4, 0.5, 0xff8a3d], [5, -5, -0.4, 0x3d8bff], [6.5, 3, -1.9, 0x7ed957]].forEach(([x, z, ry, c]) => {
      const t = add(g, roofGeo, c, x, 0.85, z); t.scale.set(3.6, 1.7, 2.3); t.rotation.y = ry; circ(g, x, z, 1.7);
    });
    const van = new THREE.Group(); van.position.set(-6.5, 0, 4.5); van.rotation.y = 0.9; g.add(van);
    box(van, 2.1, 1.9, 5, 0xf6f2e8, 0, 1.45, 0); box(van, 2.12, 0.5, 5.02, 0x2ec4b6, 0, 1.1, 0); box(van, 1.9, 0.7, 0.1, 0x26303f, 0, 1.9, 2.5);
    for (const [x, z] of [[-1, 1.6], [1, 1.6], [-1, -1.6], [1, -1.6]]) cyl(van, 0.42, 0.42, 0.3, 8, 0x1d2230, x, 0.42, z).rotation.z = Math.PI / 2;
    rect(g, -6.5, 4.5, 2.1, 5, 0.9);
    for (let k = 0; k < 7; k++) { const a = k * 0.9; add(g, new THREE.DodecahedronGeometry(0.32, 0), 0x8f917c, Math.cos(a) * 1.1, 0.15, Math.sin(a) * 1.1, false); }
    for (const [x, z, ry] of [[0, 2.6, 0], [-2.5, -0.8, 1.1], [2.5, -0.8, -1.1]]) cyl(g, 0.3, 0.3, 2.2, 6, 0x7a4a2a, x, 0.3, z).rotation.set(0, ry, Math.PI / 2);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 5), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); fire.position.y = 0.8; g.add(fire);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 5), new THREE.MeshBasicMaterial({ color: 0xffe066 })); core.position.y = 0.65; g.add(core);
    const smokeMat = new THREE.MeshLambertMaterial({ color: 0xb9bcc0, transparent: true, opacity: 0.55, flatShading: true });
    const puffs = Array.from({ length: 6 }, (_, k) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), smokeMat); g.add(m); return { m, ph: k / 6 }; });
    circ(g, 0, 0, 1.2);
    person(g, 0, 2.1, 0xe6453a); person(g, -2.1, -0.5, 0xffd23f);
    anim.push((t) => {
      fire.scale.set(1 + Math.sin(t * 17) * 0.12, 1 + Math.sin(t * 23 + 1) * 0.22, 1 + Math.cos(t * 19) * 0.12);
      core.scale.y = 1 + Math.sin(t * 29) * 0.25;
      for (const p of puffs) { const u = (t * 0.22 + p.ph) % 1; p.m.position.set(u * u * 2.2, 1.6 + u * 9, Math.sin(u * 5 + p.ph * 9) * 0.5); p.m.scale.setScalar((0.5 + u * 2.2) * (1 - u * 0.5)); }
    });
    star('Campsite', g, 2.6, 2.6, 1.9);
  }

  // ---- windmill ----
  if (full && S.windmill) {
    const g = start(S.windmill, rnd() * 6.28);
    cyl(g, 2.3, 3.6, 13, 8, 0xf1e9d6, 0, 5, 0);
    add(g, new THREE.ConeGeometry(2.9, 3, 8), 0x7a4a2a, 0, 13, 0);
    box(g, 1.3, 2.2, 0.2, 0x7a4a2a, 0, 1.1, 3.45);
    const sails = new THREE.Group(); sails.position.set(0, 11, 2.9); g.add(sails); sails.userData.dyn = true;
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; sails.add(arm);
      box(arm, 0.22, 8.4, 0.22, 0x7a4a2a, 0, 4.2, 0); box(arm, 1.6, 6.4, 0.08, 0xf6f2e8, 0.9, 5, 0);
    }
    mergeStatic(sails);
    circ(g, 0, 0, 3.7);
    anim.push((t) => { sails.rotation.z = t * 0.55; });
    star('Windmill', g, 0, 7.5);
  }

  // ---- radio mast with a blinking light ----
  if (full && S.mast) {
    const g = start(S.mast, 0);
    for (let k = 0; k < 6; k++) cyl(g, 1.5 - (k + 1) * 0.2, 1.5 - k * 0.2, 7, 4, k % 2 ? 0xf6f2e8 : 0xe6453a, 0, 3.5 + k * 7, 0);
    for (const [x, z] of [[1, 0], [-0.5, 0.87], [-0.5, -0.87]]) { const m = strut(V(x * 12, 0, z * 12), V(0, 30, 0), 0.07, 0.07, lam(0x5a6372)); g.add(m); }
    box(g, 2.6, 2.6, 3.4, 0x8d93a0, 3.4, 1.3, 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); lamp.position.y = 42.6; g.add(lamp);
    circ(g, 0, 0, 1.7); circ(g, 3.4, 0, 2.1);
    anim.push((t) => { lamp.visible = t % 1.6 < 0.8; });
    star('Radio mast', g, -4, 0);
  }

  // ---- a blimp doing slow laps of the whole map ----
  if (full) {
    const g = new THREE.Group(), lim = track.limit;
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), lam(0xf6f2e8)); hull.scale.set(6.5, 6.5, 21); g.add(hull);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ff8a3d'; ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#1d2230'; ctx.font = '900 68px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DRIFT CLUB', 256, 52);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.2), new THREE.MeshBasicMaterial({ map: tex })); b.position.set(sx * 6.62, 0, 0); b.rotation.y = sx * Math.PI / 2; g.add(b); }
    box(g, 2.2, 1.6, 6, 0x3b4250, 0, -6.8, 2);
    for (const [w, h, x, y] of [[0.3, 7, 0, 3.5], [0.3, 7, 0, -3.5], [7, 0.3, 3.5, 0], [7, 0.3, -3.5, 0]]) box(g, w, h, 5, 0xe6453a, x, y, -17);
    g.userData.dyn = true; mergeStatic(g);
    worldGroup.add(g);
    const r = lim.r * 0.62, a0 = rnd() * 6.28;
    anim.push((t) => {
      const a = a0 + t * 0.022;
      g.position.set(lim.x + Math.cos(a) * r, 78 + Math.sin(t * 0.25) * 3, lim.z + Math.sin(a) * r);
      g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
    });
  }

  // stars spin until someone drives through them
  anim.push((t) => {
    const car = app.local, live = car && (app.phase === 'racing' || app.phase === 'results');
    for (const f of finds) {
      if (f.found) continue;
      f.m.rotation.y = t * 2.2; f.m.position.y += Math.sin(t * 3) * 0.004;
      if (live && (car.pos.x - f.x) ** 2 + (car.pos.z - f.z) ** 2 < 14 && Math.abs(car.pos.y - f.y) < 5) {
        f.found = true; f.m.visible = false; app.found.add(f.key);
        try { localStorage.setItem('dc-found', JSON.stringify([...app.found])); } catch {}
        beep(880, 0.12, 0.2); setTimeout(() => beep(1320, 0.3, 0.2), 110);
        raceToast(`★ ${f.name} found — ${finds.filter(x => x.found).length} of ${finds.length}`, 2600);
        updateFoundHud();
      }
    }
  });
  updateFoundHud();
}

// A TV helicopter. In a race it shadows the leader, circling low overhead; the
// rest of the time it follows you, or tours the circuit while you're in the menus.
function buildHelicopter(track) {
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const g = new THREE.Group(), dark = lam(0x1d2230), red = lam(0xe6453a);
  const body = new THREE.Mesh(taperBox(2, 2, 4.2, [0.7, 0.75, -0.1], [0.6, 0.6, 0.2]), lam(0xf6f2e8)); body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.2), lam(0x26303f)); glass.position.set(0, 0.25, 1.7); g.add(glass);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.4, 3.2), red); stripe.position.set(0, -0.2, -0.2); g.add(stripe);
  const tail = new THREE.Mesh(taperBox(0.6, 0.6, 4.6, null, [0.4, 0.5, 0.25]), red); tail.position.set(0, 0.5, -4.2); tail.castShadow = true; g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.9), red); fin.position.set(0, 1.3, -6.2); g.add(fin);
  const mastM = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), dark); mastM.position.y = 1.15; g.add(mastM);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.08, 0.5), dark); rotor.position.y = 1.4; g.add(rotor);
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 10.5), dark));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.3, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d2230, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })); disc.position.y = 1.42; g.add(disc);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8, 0.25), dark); tailRotor.position.set(0.25, 1.3, -6.2); g.add(tailRotor);
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), dark); skid.position.set(sx * 0.9, -1.4, 0.2); g.add(skid);
    for (const z of [-0.8, 1.1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), dark); leg.position.set(sx * 0.9, -1.15, z); g.add(leg); }
  }
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), dark); cam.position.set(0, -1.05, 1.9); g.add(cam); // the camera pod under the nose
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); beacon.position.set(0, -1.1, -1.2); g.add(beacon);
  rotor.userData.dyn = tailRotor.userData.dyn = g.userData.dyn = true;
  mergeStatic(g);
  g.scale.setScalar(1.35);
  worldGroup.add(g);

  const { samples, N } = track;
  const pos = new THREE.Vector3(), vel = new THREE.Vector3();
  let started = false, heading = 0, bank = 0, orbit = 0, tour = 0, leadId = 0, tick = 0;
  app.heli = pos;
  anim.push((t, dt) => {
    // what are we filming?
    let tx, ty, tz;
    const car = app.local;
    if (car && (app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results')) {
      if (tick++ % 30 === 0) { const lead = app.mode !== 'quali' ? standingsOrder().find(e => !e.finished) : null; leadId = lead && !lead.me ? lead.id : 0; }
      const other = leadId && app.cars.get(leadId);
      const p = other?.shown ? other.mesh.group.position : car.pos;
      tx = p.x; ty = p.y; tz = p.z;
    } else {
      tour = (tour + Math.max(0, dt) * 22) % N;
      const s = samples[Math.floor(tour)].p;
      tx = s.x; ty = s.y; tz = s.z;
    }
    // aim for a point circling the target, then fly there on a soft spring
    orbit += dt * 0.3;
    const wx = tx + Math.cos(orbit) * 24, wz = tz + Math.sin(orbit) * 24;
    const wy = Math.max(ty, terrainHeight(wx, wz)) + 18 + Math.sin(t * 0.6) * 1.5;
    if (!started || (wx - pos.x) ** 2 + (wz - pos.z) ** 2 > 250000) { pos.set(wx, wy + 25, wz); vel.set(0, 0, 0); started = true; }
    vel.x += ((wx - pos.x) * 1.4 - vel.x * 2.2) * dt; vel.y += ((wy - pos.y) * 2 - vel.y * 2.6) * dt; vel.z += ((wz - pos.z) * 1.4 - vel.z * 2.2) * dt;
    pos.addScaledVector(vel, dt);
    const sp = Math.hypot(vel.x, vel.z);
    const want = sp > 5 ? Math.atan2(vel.x, vel.z) : Math.atan2(tx - pos.x, tz - pos.z); // nose into the wind, or at the car when hovering
    const prev = heading;
    heading = lerpAngle(heading, want, 1 - Math.exp(-dt * 2.2));
    bank = lerp(bank, clamp(-(heading - prev) / Math.max(dt, 0.001) * 0.35, -0.5, 0.5), 1 - Math.exp(-dt * 3));
    g.position.copy(pos);
    g.rotation.set(0, 0, 0);
    g.rotateY(heading); g.rotateX(clamp(sp * 0.011, 0, 0.32)); g.rotateZ(bank);
    rotor.rotation.y = t * 24; tailRotor.rotation.x = t * 34;
    beacon.visible = t % 1.1 < 0.14;
  });
}

// A soft round glow, white with a fading edge, used for pools of light.
function glowTexture(w, h, cx, cy, r) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lightMat = (map, color, opacity) => new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

// Night: floodlights along the track, each throwing a pool of light on the
// road (built to follow the road's shape), and stars and a moon overhead.
// Car headlights are added with each car.
function buildNight(track) {
  const { samples, N, hw } = track;
  const steel = new THREE.MeshLambertMaterial({ color: 0x8d93a0, flatShading: true });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), 80);
  heads.userData.dyn = true; heads.frustumCulled = false;
  const M = new THREE.Matrix4(), pos = [], uv = [], R = 13, W = hw + 1.6;
  let n = 0;
  for (let i = 0, k = 0; i < N && n < 80; i += 30, k++) {
    if (track.vergeDrop[i] > VERGE_MAX_DROP) continue;
    const s = samples[i], side = k % 2 ? 1 : -1, off = hw + 4.5;
    const x = s.p.x + s.left.x * side * off, z = s.p.z + s.left.z * side * off;
    if (!isFree(track, x, z, 0.6, hw + 3)) continue;
    const y = terrainHeight(x, z);
    claim(x, z, 1); track.solids.push({ x, z, r: 0.35, y });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 11, 0.3), steel); mast.position.set(x, y + 4.5, z); mast.castShadow = true; worldGroup.add(mast);
    const tip = V(s.p.x + s.left.x * side * (off - 3.2), y + 9.6, s.p.z + s.left.z * side * (off - 3.2));
    worldGroup.add(strut(V(x, y + 9.6, z), tip, 0.2, 0.2, steel));
    M.makeRotationY(Math.atan2(s.th.x, s.th.z)); M.setPosition(tip.x, tip.y - 0.25, tip.z); heads.setMatrixAt(n++, M);
    // the pool: the stretch of road under the lamp, mapped onto a round glow
    const step = R / 6.5;
    for (let j = -9; j < 9; j++) {
      const a = samples[(i + j + N) % N], b = samples[(i + j + 1 + N) % N];
      for (let l = 0; l < 4; l++) {
        const hi = W - l * (W / 2), lo = hi - W / 2;
        const P = (q, lat) => [q.p.x + q.left.x * lat, q.p.y + 0.07, q.p.z + q.left.z * lat];
        const U = (jj, lat) => [0.5 + lat / (2 * R), 0.5 + (jj * 1.5) / (2 * R)];
        const quad = [[a, hi, j], [a, lo, j], [b, lo, j + 1], [b, hi, j + 1]];
        for (const t of [0, 1, 2, 0, 2, 3]) { const [q, lat, jj] = quad[t]; pos.push(...P(q, lat)); uv.push(...U(jj, lat)); }
      }
    }
    void step;
  }
  heads.count = n; worldGroup.add(heads);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const pools = new THREE.Mesh(pg, lightMat(glowTexture(128, 128, 64, 64, 64), 0xffd9a0, 0.6));
  pools.userData.dyn = true; pools.renderOrder = 1; worldGroup.add(pools);
  // stars and a moon, carried along with the camera so they stay in the sky
  const sky = new THREE.Group(); sky.userData.dyn = true; worldGroup.add(sky);
  const rnd = mulberry32(99), P = [];
  for (let k = 0; k < 900; k++) {
    const a = rnd() * 6.2832, e = Math.asin(0.05 + rnd() * 0.95);
    P.push(Math.cos(a) * Math.cos(e) * 700, Math.sin(e) * 700, Math.sin(a) * Math.cos(e) * 700);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
  stars.frustumCulled = false; sky.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1de, fog: false }));
  moon.position.set(260, 380, -520); sky.add(moon);
  anim.push(() => sky.position.copy(camera.position));

  // road studs: glowing red down the left edge, white down the right
  const studs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.ceil(N / 6) * 2);
  studs.userData.dyn = true; studs.frustumCulled = false;
  const red = new THREE.Color(0xff3b30), white = new THREE.Color(0xfff6d0);
  let m = 0;
  for (let i = 0; i < N; i += 6) for (const side of [1, -1]) {
    const q = samples[i];
    M.makeRotationY(Math.atan2(q.th.x, q.th.z)); M.setPosition(q.p.x + q.left.x * side * (hw - 0.4), q.p.y + 0.05, q.p.z + q.left.z * side * (hw - 0.4));
    studs.setMatrixAt(m, M); studs.setColorAt(m++, side > 0 ? red : white);
  }
  studs.count = m; worldGroup.add(studs);

  // two searchlights by the start line, sweeping the sky
  const s0 = samples[0], beamMat = new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beamGeo = new THREE.CylinderGeometry(10, 0.7, 240, 14, 1, true).translate(0, 120, 0); // narrow at the lamp, spreading up into the sky
  for (const side of [1, -1]) {
    const x = s0.p.x + s0.left.x * side * 45, z = s0.p.z + s0.left.z * side * 45, y = terrainHeight(x, z);
    const spin = new THREE.Group(); spin.position.set(x, y, z); spin.userData.dyn = true;
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.rotation.z = 0.42; beam.renderOrder = 2; spin.add(beam);
    worldGroup.add(spin);
    anim.push((t) => { spin.rotation.y = t * 0.35 * side + side; beam.rotation.z = 0.32 + Math.sin(t * 0.5 + side) * 0.14; });
  }

  // fireworks: a burst somewhere over the track every second or two
  const FW = 6, PER = 70, fwN = FW * PER, fwP = new Float32Array(fwN * 3), fwC = new Float32Array(fwN * 3), fwV = new Float32Array(fwN * 3);
  const bursts = Array.from({ length: FW }, () => ({ age: 99, life: 2, col: new THREE.Color() }));
  const fwg = new THREE.BufferGeometry();
  fwg.setAttribute('position', new THREE.BufferAttribute(fwP, 3)); fwg.setAttribute('color', new THREE.BufferAttribute(fwC, 3));
  const fw = new THREE.Points(fwg, new THREE.PointsMaterial({ size: 2.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  fw.frustumCulled = false; fw.userData.dyn = true; worldGroup.add(fw);
  const fwCols = [0xff4d6d, 0xffd23f, 0x5ad1ff, 0x7ed957, 0xff8a3d, 0xd98bff];
  let nextBurst = 0, slot = 0;
  anim.push((t, dt) => {
    if (t > nextBurst) {
      nextBurst = t + 0.7 + Math.random() * 1.6;
      const b = bursts[slot], q = samples[Math.floor(Math.random() * N)], off = (Math.random() < 0.5 ? -1 : 1) * (25 + Math.random() * 50);
      const cx = q.p.x + q.left.x * off, cz = q.p.z + q.left.z * off, cy = q.p.y + 38 + Math.random() * 32;
      b.age = 0; b.life = 1.6 + Math.random() * 0.8; b.col.setHex(fwCols[Math.floor(Math.random() * fwCols.length)]);
      const sp = 16 + Math.random() * 10;
      for (let j = 0; j < PER; j++) {
        const i = (slot * PER + j) * 3, u = Math.random() * 2 - 1, a = Math.random() * 6.2832, r = Math.sqrt(1 - u * u), v = sp * (0.75 + Math.random() * 0.25);
        fwP[i] = cx; fwP[i + 1] = cy; fwP[i + 2] = cz;
        fwV[i] = Math.cos(a) * r * v; fwV[i + 1] = u * v; fwV[i + 2] = Math.sin(a) * r * v;
      }
      slot = (slot + 1) % FW;
    }
    for (let b = 0; b < FW; b++) {
      const B = bursts[b];
      if (B.age > B.life) continue;
      B.age += dt;
      const fade = Math.max(0, 1 - B.age / B.life) ** 1.5, drag = Math.exp(-dt * 1.6);
      for (let j = 0; j < PER; j++) {
        const i = (b * PER + j) * 3;
        fwV[i] *= drag; fwV[i + 1] = fwV[i + 1] * drag - 7 * dt; fwV[i + 2] *= drag;
        fwP[i] += fwV[i] * dt; fwP[i + 1] += fwV[i + 1] * dt; fwP[i + 2] += fwV[i + 2] * dt;
        fwC[i] = B.col.r * fade; fwC[i + 1] = B.col.g * fade; fwC[i + 2] = B.col.b * fade;
      }
    }
    fwg.attributes.position.needsUpdate = true; fwg.attributes.color.needsUpdate = true;
  });
}

// Countryside and sky: trees, bushes, rocks, a farm, sheep, hay bales, wind
// turbines, mountains, drifting clouds, hot-air balloons, birds.
function buildScenery(track) {
  const rnd = mulberry32(1234 + app.trackId * 99);
  const desert = track.theme === 'desert', snow = track.theme === 'snow', forest = track.theme === 'forest';
  const { hw, bounds } = track;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const spread = Math.max(size.x, size.z) * 0.9 + 140;
  const lim = track.limit, solids = track.solids;
  // a random spot inside the map edge
  const randIn = (pad) => { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * (lim.r - pad); return [lim.x + Math.cos(a) * d, lim.z + Math.sin(a) * d]; };
  const pick = (r, margin, tries = 80) => {
    for (let k = 0; k < tries; k++) {
      const [x, z] = randIn(r + 6);
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
    solids.push({ x: p.x, z: p.z, r: 1.3, y: p.y });
    const g = new THREE.Group();
    const tower = new THREE.Mesh(towerGeo, white); tower.position.y = 14; tower.castShadow = true; g.add(tower);
    const nacelle = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 3), white); nacelle.position.set(0, 29.4, 0.4); g.add(nacelle);
    const rotor = new THREE.Group(); rotor.position.set(0, 29.4, 2.1);
    for (let b = 0; b < 3; b++) { const blade = new THREE.Mesh(bladeGeo, white); blade.rotation.z = (b * Math.PI * 2) / 3; rotor.add(blade); }
    rotor.userData.dyn = true; mergeStatic(rotor);
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
    const cf = Math.cos(g.rotation.y), sf = Math.sin(g.rotation.y);
    for (const [lx, lz, r] of [[-8.3, 0, 3.4], [-3.7, 0, 3.4], [3.4, 2, 3.9], [7, 2, 3.9], [10.6, 2, 3.9], [15, -3, 2.3]]) solids.push({ x: farm.x + lx * cf + lz * sf, z: farm.z - lx * sf + lz * cf, r, y: farm.y });
  }

  // sheep and hay bales in the fields
  const wool = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), lam(0xf4f1e6), 60);
  const faces = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.36, 0.4), lam(0x2b2f3a), 60);
  wool.castShadow = true;
  const sheep = [], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  for (let f = 0; f < (desert || snow || forest ? 0 : 5); f++) { // no sheep in the desert, the snow or the forest
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
  for (let f = 0; f < (desert || snow || forest ? 0 : 5); f++) { // or hay
    const c = pick(8, hw + 14);
    if (!c) continue;
    for (let k = 0; k < 8; k++) {
      const x = c.x + (rnd() - 0.5) * 22, z = c.z + (rnd() - 0.5) * 22;
      if (!isFree(track, x, z, 1.2, hw + 9)) continue;
      claim(x, z, 1.2);
      solids.push({ x, z, r: 0.95, y: terrainHeight(x, z) });
      M.makeRotationY(rnd() * 3.14); M.setPosition(x, terrainHeight(x, z) + 0.85, z); bales.setMatrixAt(nb++, M);
    }
  }
  bales.count = nb; worldGroup.add(bales);

  if (desert) {
    // saguaro cacti: a trunk and two arms, built once and drawn as instances
    const part = new THREE.Group(), green = lam(0x5b8a3a);
    const piece = (geo, x, y, z) => { const q = new THREE.Mesh(geo, green); q.position.set(x, y, z); part.add(q); };
    piece(new THREE.CylinderGeometry(0.42, 0.48, 6, 7), 0, 3, 0);
    piece(new THREE.SphereGeometry(0.42, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6, 0);
    piece(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 6).rotateZ(Math.PI / 2), 0.75, 2.8, 0);
    piece(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 6), 1.2, 3.7, 0);
    piece(new THREE.CylinderGeometry(0.26, 0.26, 0.9, 6).rotateZ(Math.PI / 2), -0.7, 3.6, 0);
    piece(new THREE.CylinderGeometry(0.26, 0.26, 1.6, 6), -1.1, 4.3, 0);
    mergeStatic(part);
    const cacti = new THREE.InstancedMesh(part.children[0].geometry, mergedMat(THREE.FrontSide, 0), 260);
    cacti.castShadow = true;
    const m = new THREE.Matrix4();
    let nc = 0, tries = 0;
    while (nc < 260 && tries++ < 5000) {
      const [x, z] = randIn(5);
      if (!isFree(track, x, z, 2, hw + 9)) continue;
      const sc = 0.7 + rnd() * 0.7, gy = terrainHeight(x, z);
      solids.push({ x, z, r: 0.5 * sc, y: gy });
      m.makeRotationY(rnd() * 6.28); m.scale(V(sc, sc, sc)); m.setPosition(x, gy - 0.2, z);
      cacti.setMatrixAt(nc++, m);
    }
    cacti.count = nc; worldGroup.add(cacti);
    // hoodoos: tall rock spires with a darker cap
    const rockCols = [0xb5603c, 0xc97a4c, 0xa95a38];
    for (let k = 0; k < 34; k++) {
      const p = pick(4, hw + 14);
      if (!p) continue;
      claim(p.x, p.z, 4);
      const h = 5 + rnd() * 9, r = 1.2 + rnd() * 1.4;
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, h, 6), lam(rockCols[k % 3]));
      spire.position.set(p.x, p.y + h / 2 - 0.5, p.z); spire.rotation.y = rnd() * 3; spire.castShadow = true; worldGroup.add(spire);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.7, 0.8 + rnd() * 0.6, 6), lam(0x8f4a30));
      cap.position.set(p.x, p.y + h - 0.2, p.z); cap.castShadow = true; worldGroup.add(cap);
      solids.push({ x: p.x, z: p.z, r: r * 0.9, y: p.y });
    }
    // boulders piled round the edge of the map instead of a forest
    const outer = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(3, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 300);
    for (let k = 0; k < 300; k++) {
      const a = (k / 300) * 6.2832 + rnd() * 0.02, d = lim.r + 4 + rnd() * rnd() * 60, sc = 1 + rnd() * 1.6;
      const x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
      E.set(rnd() * 3, rnd() * 3, rnd() * 3); Q.setFromEuler(E);
      M.compose(V(x, terrainHeight(x, z) + sc, z), Q, V(sc * (1 + rnd()), sc * (0.8 + rnd() * 1.4), sc * (1 + rnd())));
      outer.setMatrixAt(k, M); outer.setColorAt(k, new THREE.Color(rockCols[k % 3]).multiplyScalar(0.9));
    }
    worldGroup.add(outer);
  } else {
  // trees: conifers and round broadleaf ones
  const areaK = clamp((lim.r / 360) ** 2, 1, 2.5); // a bigger map gets more trees, so it isn't bare
  // only pines in the snow; the forest is thick with them, a few broadleaf trees among them
  const TREES = Math.round((snow || forest ? 520 : 380) * areaK), ROUND = snow ? 0 : Math.round((forest ? 60 : 170) * areaK);
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
  const trunkMat = lam(0x7a4a2a);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES + ROUND);
  const canopies = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 6), new THREE.MeshLambertMaterial({ flatShading: true }), TREES);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.4, 0), new THREE.MeshLambertMaterial({ flatShading: true }), ROUND);
  trunks.castShadow = canopies.castShadow = crowns.castShadow = true;
  const caps = snow ? new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 3.4, 6), lam(0xf4f7fa), TREES) : null;
  if (caps) caps.castShadow = true;
  const m = new THREE.Matrix4();
  const greens = snow || forest ? [0x2f6b4a, 0x3a7a55, 0x2c5e43, 0x356f4c, 0x2a5a41] : [0x3f9a4a, 0x55b35a, 0x2f8a52, 0x6cc46a, 0x3b8f3f], warm = [0x6cc46a, 0x86c95a, 0xa7c957, 0x4fae54, 0xd9a441];
  let placed = 0, nc = 0, nr = 0, tries = 0;
  while (placed < TREES + ROUND && tries++ < 6000 * areaK) {
    const [x, z] = randIn(5);
    const sc = 0.7 + rnd() * 0.9;
    if (!isFree(track, x, z, 2.2 * sc, hw + 9)) continue;
    claim(x, z, 2.2 * sc); // trees keep clear of each other, and bushes and rocks keep clear of them
    const gy = terrainHeight(x, z);
    solids.push({ x, z, r: 0.65 * sc, y: gy }); // the trunk is solid, the leaves aren't
    m.makeScale(sc, sc, sc); m.setPosition(x, gy + 1.5 * sc, z);
    trunks.setMatrixAt(placed, m);
    if (nc < TREES && (nr >= ROUND || rnd() < 0.7)) {
      m.makeRotationY(rnd() * Math.PI); m.scale(V(sc, sc, sc)); m.setPosition(x, gy + 7 * sc, z);
      canopies.setMatrixAt(nc, m);
      if (caps) { m.setPosition(x, gy + 9.3 * sc, z); caps.setMatrixAt(nc, m); } // snow on the top of each pine
      canopies.setColorAt(nc++, new THREE.Color(greens[Math.floor(rnd() * greens.length)]));
    } else {
      m.makeRotationY(rnd() * Math.PI); m.scale(V(sc, sc * 0.9, sc)); m.setPosition(x, gy + 5.2 * sc, z);
      crowns.setMatrixAt(nr, m);
      crowns.setColorAt(nr++, new THREE.Color(warm[Math.floor(rnd() * warm.length)]));
    }
    placed++;
  }
  trunks.count = placed; canopies.count = nc; crowns.count = nr;
  if (caps) { caps.count = nc; worldGroup.add(caps); }
  worldGroup.add(trunks, canopies, crowns);

  // thick forest beyond the wall, so the edge of the map reads as an edge
  const outer = new THREE.InstancedMesh(new THREE.ConeGeometry(3.4, 9, 6), new THREE.MeshLambertMaterial({ flatShading: true }), 360);
  for (let k = 0; k < 360; k++) {
    const a = (k / 360) * 6.2832 + rnd() * 0.02, d = lim.r + 5 + rnd() * rnd() * 70, sc = 1.2 + rnd() * 1.3;
    const x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
    m.makeRotationY(rnd() * 3); m.scale(V(sc, sc, sc)); m.setPosition(x, terrainHeight(x, z) + 4.2 * sc, z);
    outer.setMatrixAt(k, m); outer.setColorAt(k, snow ? new THREE.Color(0xcfdcd6).multiplyScalar(0.8 + rnd() * 0.15) : new THREE.Color(greens[Math.floor(rnd() * 3)]).multiplyScalar(0.85)); // frosted in the snow
  }
  worldGroup.add(outer);
  }

  // bushes and rocks
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 340); // room for the forest's undergrowth
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), 140);
  bushes.castShadow = rocks.castShadow = true;
  const scatter = (mesh, count, colors, smin, smax, sink, hard) => {
    let put = 0, t2 = 0;
    while (put < count && t2++ < count * 20) {
      const [x, z] = randIn(3);
      const sc = smin + rnd() * (smax - smin);
      if (!isFree(track, x, z, sc, hw + 7)) continue;
      claim(x, z, sc);
      if (hard && sc > 1.2) solids.push({ x, z, r: sc * 0.7, y: terrainHeight(x, z) }); // big rocks are solid, pebbles aren't
      E.set(rnd() * 3, rnd() * 3, rnd() * 3); Q.setFromEuler(E);
      M.compose(V(x, terrainHeight(x, z) + sc * sink, z), Q, V(sc * (0.8 + rnd() * 0.6), sc * 0.7, sc));
      mesh.setMatrixAt(put, M); mesh.setColorAt(put, new THREE.Color(colors[Math.floor(rnd() * colors.length)]));
      put++;
    }
    mesh.count = put; worldGroup.add(mesh);
  };
  if (desert) {
    scatter(bushes, 260, [0xa38a52, 0x8c7a45, 0x7d8a4a, 0x9a9a5a], 0.5, 1.2, 0.35); // dry scrub
    scatter(rocks, 120, [0xb5603c, 0xc97a4c, 0xa95a38, 0xd09060], 0.7, 3.2, 0.25, true);
  } else if (forest) {
    scatter(bushes, 340, [0x3f7a3a, 0x2f6a35, 0x4f8a45, 0x5f8a3a], 0.8, 1.9, 0.35); // ferns and undergrowth
    scatter(rocks, 140, [0x7d8173, 0x6f7a66, 0x8a8f80, 0x6a7a5a], 0.6, 2.6, 0.2, true); // mossy rocks
  } else if (snow) {
    scatter(bushes, 260, [0xdfe7ee, 0xc9d6cf, 0xb7c7bd], 0.7, 1.6, 0.35); // shrubs under snow
    scatter(rocks, 120, [0x7d8794, 0x8f99a5, 0x6b7480], 0.6, 2.6, 0.2, true);
  } else {
    scatter(bushes, 260, [0x4fae54, 0x3f9a4a, 0x6cc46a, 0x86c95a], 0.8, 1.9, 0.35);
    scatter(rocks, 120, [0x8f917c, 0xa3a59a, 0x7c8696], 0.6, 2.4, 0.2, true);
  }

  // distant mountains
  const hillMat = lam(track.look.hills);
  const hillGeo = desert ? new THREE.CylinderGeometry(0.7, 1, 1, 7) : new THREE.ConeGeometry(1, 1, 7); // flat-topped mesas in the desert
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const r = spread * 0.75 + 120 + rnd() * 160;
    const h = (40 + rnd() * 70) * (snow ? 1.5 : 1), w = 90 + rnd() * 120; // taller, alpine, in the snow
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(w, h, w);
    hill.position.set(center.x + Math.cos(ang) * r, h / 2 - 2, center.z + Math.sin(ang) * r);
    hill.rotation.y = rnd() * Math.PI;
    worldGroup.add(hill);
  }
  // and bigger ones far off on the horizon: hazy on high, clear on max
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + rnd() * 0.25;
    const r = 1300 + rnd() * 900;
    const h = (130 + rnd() * 190) * (snow ? 1.4 : 1), w = 320 + rnd() * 320;
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(w, h, w);
    hill.position.set(center.x + Math.cos(ang) * r, (TERRAIN.edgeY || 0) + h / 2 - 4, center.z + Math.sin(ang) * r);
    hill.rotation.y = rnd() * Math.PI;
    worldGroup.add(hill);
  }

  if (snow) {
    // snowmen dotted about, and snow falling round wherever the camera is
    const white = lam(0xf4f7fa), coal = lam(0x1d2230), carrot = lam(0xff8a3d);
    for (let k = 0; k < 24; k++) {
      const p = pick(2, hw + 10);
      if (!p) continue;
      claim(p.x, p.z, 2); track.solids.push({ x: p.x, z: p.z, r: 0.9, y: p.y });
      const g = new THREE.Group(); g.position.copy(p); g.rotation.y = rnd() * 6.28; worldGroup.add(g);
      for (const [r, y] of [[0.9, 0.7], [0.65, 1.75], [0.45, 2.5]]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), white); b.position.y = y; b.castShadow = true; g.add(b); }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 5).rotateX(Math.PI / 2), carrot); nose.position.set(0, 2.5, 0.6); g.add(nose);
      for (const sx of [-0.15, 0.15]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.05), coal); e.position.set(sx, 2.65, 0.4); g.add(e); }
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 8), coal); hat.position.y = 3.05; g.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 8), coal); brim.position.y = 2.85; g.add(brim);
    }
    const FL = 700;
    const flakes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }), FL);
    flakes.frustumCulled = false; flakes.userData.dyn = true; worldGroup.add(flakes);
    const fl = Array.from({ length: FL }, () => ({ x: rnd() * 60, y: rnd() * 30, z: rnd() * 60, s: 1.2 + rnd() * 1.2, w: rnd() * 6 }));
    const FM = new THREE.Matrix4();
    anim.push((t) => {
      const c = camera.position;
      for (let i = 0; i < FL; i++) {
        const f = fl[i];
        const x = c.x + ((((f.x + Math.sin(t * 0.7 + f.w) * 0.8 - c.x) % 60) + 60) % 60) - 30;
        const z = c.z + ((((f.z - c.z) % 60) + 60) % 60) - 30;
        const y = c.y - 8 + ((((f.y - t * f.s) % 30) + 30) % 30);
        FM.makeTranslation(x, y, z); flakes.setMatrixAt(i, FM);
      }
      flakes.instanceMatrix.needsUpdate = true;
    });
  }

  // clouds, drifting on the wind
  const cloudMat = track.look.night ? new THREE.MeshLambertMaterial({ color: 0x2a3350, emissive: 0x0d1220, flatShading: true }) : new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8f96, flatShading: true }); // lit from within so the grass doesn't tint them green
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
    g.userData.dyn = true; mergeStatic(g);
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
    g.userData.dyn = true; mergeStatic(g);
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
    flock.userData.dyn = true;
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

// A lamp lying on a sloped panel of the body. In side view the panel runs from
// (y0, z0) up to (y1, z1); the lamp stands `out` proud of it and is sunk `inn`
// into it, so it looks attached however steeply the panel is raked. dir is +1
// on the front of the car, -1 on the back.
function faceLamp(K, mat, x, hw, y0, z0, y1, z1, dir, out = 0.015, inn = 0.04) {
  const dy = y1 - y0, dz = z1 - z0, l = Math.hypot(dy, dz);
  let ny = -dz / l, nz = dy / l;
  if (Math.sign(nz) !== dir) { ny = -ny; nz = -nz; }
  const P = (y, z, k) => [y + ny * k, z + nz * k];
  const b0 = P(y0, z0, out), b1 = P(y0, z0, -inn), t0 = P(y1, z1, out), t1 = P(y1, z1, -inn);
  const [bf, br, tf, tr] = dir > 0 ? [b0, b1, t0, t1] : [b1, b0, t1, t0]; // hexa wants the larger-z side first
  return K.add(hexa([[x - hw, bf[0], bf[1]], [x + hw, bf[0], bf[1]], [x + hw, br[0], br[1]], [x - hw, br[0], br[1]],
    [x - hw, tf[0], tf[1]], [x + hw, tf[0], tf[1]], [x + hw, tr[0], tr[1]], [x - hw, tr[0], tr[1]]]), mat, 0, 0, 0, false);
}

// num: the race number the server gave the driver (see addPlayer in server/core.js)
const raceNumberOf = (id) => app.room?.players.find(p => p.id === id)?.num;
function makeCarMesh(colorIdx, name, isMe, cls = app.carClass, cockpit = false, num = null) {
  const g = new THREE.Group();
  const color = CAR_COLORS[colorIdx] ?? CAR_COLORS[0];
  const lightCar = colorIdx === 8 || colorIdx === 2 || colorIdx === 11;
  const livery = colorIdx === LIVERY; // racing green with lime trim
  const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const K = {
    g, lightCar, livery,
    body: L(color), accent: L(livery ? 0x16191f : lightCar ? 0x1d2230 : 0xf6f2e8), dark: L(0x1d2230), carbon: L(0x2b303b),
    tyre: L(0x15181f), rim: L(livery ? 0x1d2230 : 0xb9c0cc), glass: L(0x24303f), flap: L(0xb3261e),
    helmet: L(livery ? 0xd8e81c : lightCar ? 0xff8a3d : 0xffd23f), stripe: L(livery ? 0xc6f432 : STRIPES[colorIdx] ?? 0xffffff),
    brake: new THREE.MeshLambertMaterial({ color: 0x6a1212, emissive: 0x000000, flatShading: true }),
    lamp: new THREE.MeshLambertMaterial({ color: 0xfff6cf, emissive: 0x6b6440, flatShading: true }),
  };
  // the plate on top of the nose: white (the accent already is, on most cars),
  // dark on the cream car, black on the secret livery
  K.noseBand = lightCar && colorIdx !== 8 ? L(0xf6f2e8) : K.accent;
  K.add = (geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m;
  };
  K.box = (w, h, d, mat, x, y, z, shadow = true) => K.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);
  K.rod = (a, b, th, mat) => { const m = strut(V(...a), V(...b), th, th, mat); g.add(m); return m; };

  const wheelSpec = cls === 'rally' ? buildRallyBody(K) : cls === 'camry' ? buildCamryBody(K) : buildOpenBody(K);
  if (cls !== 'rally' && cls !== 'camry') paintLivery(K, g, colorIdx, name, num);
  mergeStatic(g, new Set([K.brake, ...(K.decals || [])])); // ~70 parts into one; the brake lights (and any lettering) stay apart
  const inside = cockpit && (cls === 'rally' || cls === 'camry') ? buildInterior(g, cls) : null;
  // The body leans on its springs about a point at hub height; the wheels and
  // the name tag are added after this, so they stay level with the road.
  const leanY = CAR_CLASSES[cls]?.leanY ?? 0.4;
  const lean = new THREE.Group(), inner = new THREE.Group();
  lean.position.y = leanY; inner.position.y = -leanY; lean.add(inner);
  for (const c of [...g.children]) inner.add(c);
  g.add(lean);

  const wheels = [];
  for (const [x, z, w, r] of wheelSpec.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const mesh = new THREE.Group(), tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2), K.tyre);
    tyre.castShadow = true; mesh.add(tyre);
    if (wheelSpec.band) { // thin coloured compound stripe on the sidewall
      mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, w + 0.012, 12).rotateZ(Math.PI / 2), wheelSpec.band));
      mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, w + 0.018, 12).rotateZ(Math.PI / 2), K.tyre));
    }
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.024, 5).rotateZ(Math.PI / 2), wheelSpec.rim)); // 5 sides so you can see it spin
    mesh.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, w + 0.06, 6).rotateZ(Math.PI / 2), wheelSpec.hub));
    mergeStatic(mesh);
    pivot.add(mesh);
    g.add(pivot);
    wheels.push({ pivot, mesh, front: z > 0 });
  }

  let label = null;
  if (!isMe) {
    label = makeLabel(name, COLOR_CSS[colorIdx]);
    label.position.y = cls === 'rally' ? 2.8 : cls === 'camry' ? 2.7 : 2.5;
    g.add(label);
  }
  return { group: g, wheels, label, bodyMat: K.body, brakeMat: K.brake, cls, interior: inside?.group, steer: inside?.steer, lean, decals: K.decalMeshes || null };
}

// Open-wheel single seater: stepped floor, slim monocoque running into a
// drooping nose, three-element front wing, undercut sidepods, airbox and
// engine cover with a fin, wishbone suspension, rear wing on swan necks.
function buildOpenBody(K) {
  const { add, box, rod, body, accent, dark, carbon } = K;
  // floor, edge wings and diffuser
  add(taperBox(1.3, 0.05, 3.9, [0.5, 1, 0], null), carbon, 0, 0.14, 0.05);
  box(1.86, 0.04, 1.4, carbon, 0, 0.15, -0.5);
  add(taperBox(1.28, 0.2, 0.55, null, [1, 1.7, 0.1]), carbon, 0, 0.27, -2.1);
  // monocoque into the nose
  add(taperBox(0.78, 0.56, 2.3, [0.6, 0.58, -0.05], null), body, 0, 0.5, 0.85);
  add(taperBox(0.468, 0.325, 1.25, [0.45, 0.42, -0.1], null), body, 0, 0.45, 2.62);
  add(taperBox(0.21, 0.137, 0.22, [0.7, 0.7, -0.01], null), K.livery ? dark : K.stripe, 0, 0.35, 3.36); // nose tip, in the stripe colour
  // a plate on top of the nose, tapering with it between the two pinstripes
  add(taperBox(0.28, 0.02, 0.6, [0.7, 1, 0], null), K.noseBand, 0, 0.552, 2.45, false).rotation.x = 0.156;
  // front wing
  box(2.0, 0.045, 0.5, carbon, 0, 0.15, 3.15);
  for (const sx of [-1, 1]) {
    box(0.78, 0.04, 0.3, K.livery ? carbon : body, sx * 0.6, 0.24, 3.02).rotation.x = -0.3;
    box(0.78, 0.035, 0.22, accent, sx * 0.6, 0.33, 2.9).rotation.x = -0.45;
    add(taperBox(0.05, 0.3, 0.62, [1, 0.6, -0.05], null), body, sx * 1.0, 0.27, 3.12);
    box(0.05, 0.16, 0.2, dark, sx * 0.09, 0.25, 3.18, false);              // wing pylons under the nose
  }
  // sidepods, intakes, floor fences
  for (const sx of [-1, 1]) {
    add(taperBox(0.62, 0.44, 1.45, null, [0.35, 0.5, -0.028]), body, sx * 0.7, 0.45, -0.375);
    box(0.46, 0.24, 0.05, dark, sx * 0.72, 0.5, 0.36, false);
    box(0.22, 0.02, 1.1, accent, sx * 0.7, 0.632, -0.25, false).rotation.x = -0.095;
    box(0.04, 0.26, 0.55, carbon, sx * 0.62, 0.33, 0.8, false);
    box(0.12, 0.2, 0.7, body, sx * 0.3, 0.84, -0.02, false);               // cockpit sides
    box(0.16, 0.09, 0.06, accent, sx * 0.56, 0.92, 0.7, false);            // mirror
    rod([sx * 0.3, 0.72, 0.7], [sx * 0.52, 0.9, 0.7], 0.035, dark);
  }
  // engine cover, airbox, fin, camera
  add(taperBox(0.56, 0.66, 2.1, null, [0.28, 0.3, -0.18]), body, 0, 0.72, -1.15);
  add(taperBox(0.34, 0.32, 0.75, null, [0.6, 0.5, -0.06]), body, 0, 1.2, -0.45);
  box(0.24, 0.2, 0.04, dark, 0, 1.22, -0.07, false);
  box(0.08, 0.07, 0.24, K.stripe, 0, 1.4, -0.3, false);                    // camera, in the stripe colour
  add(taperBox(0.035, 0.46, 1.25, null, [1, 0.3, -0.16]), body, 0, 1.06, -1.45);
  box(0.2, 0.02, 0.9, accent, 0, 1.0, -1.2, false).rotation.x = -0.2;
  // cockpit: opening, helmet, visor
  box(0.5, 0.05, 0.8, dark, 0, 0.765, 0.2, false);
  const helmet = add(new THREE.IcosahedronGeometry(0.21, 1), K.helmet, 0, 0.98, 0.1);
  helmet.scale.set(1, 1, 1.1);
  box(0.3, 0.09, 0.14, dark, 0, 1.0, 0.27, false);
  // rear wing: two elements, endplates, beam wing, swan-neck pylons
  // (the endplates sit inboard of the rear tyres, which they used to cut into,
  // and each is two stacked blocks of colour rather than a stripe laid over
  // the plate, which flickered)
  box(1.16, 0.05, 0.5, carbon, 0, 1.2, -2.25);
  box(1.16, 0.045, 0.3, K.livery ? carbon : body, 0, 1.36, -2.4).rotation.x = 0.4;
  box(1.16, 0.04, 0.28, carbon, 0, 0.72, -2.2);
  for (const sx of [-1, 1]) {
    box(0.045, 0.62, 0.85, body, sx * 0.6, 0.93, -2.25);
    box(0.045, 0.22, 0.85, accent, sx * 0.6, 1.35, -2.25);
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
  return { wheels, rim: K.rim, hub: K.livery ? dark : body, band: K.helmet };
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
  box(1.1, 0.14, 0.12, carbon, 0, 0.64, 2.08, false);
  box(1.92, 0.05, 0.42, carbon, 0, 0.28, 2.1);
  for (const sx of [-1, 1]) faceLamp(K, K.lamp, sx * 0.6, 0.18, 0.645, 2.0889, 0.775, 2.0311, 1); // on the raked nose
  box(0.96, 0.17, 0.14, dark, 0, 0.87, 1.99);
  for (const x of [-0.34, -0.115, 0.115, 0.34]) add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8).rotateX(Math.PI / 2), K.lamp, x, 0.875, 2.07, false);
  // tail: bumper, lights, exhaust
  box(1.84, 0.24, 0.18, dark, 0, 0.42, -2.0);
  for (const sx of [-1, 1]) faceLamp(K, K.brake, sx * 0.58, 0.17, 0.78, -2.0333, 0.9, -2.0133, -1);
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
    rod([sx * 0.83, 1.0, 0.64], [sx * 0.92, 1.05, 0.61], 0.04, dark);                       // mirror arm, out of the door
    box(0.13, 0.1, 0.12, dark, sx * 0.97, 1.06, 0.6, false);
  }
  for (const [x, z] of wheels) {
    const sx = Math.sign(x);
    add(taperBox(0.16, 0.16, 1.05, [1, 0.5, -0.05], [1, 0.5, -0.05]), body, sx * 0.94, 0.8, z);  // flared arch
    box(0.3, 0.3, 0.03, K.flap, x, 0.27, z - 0.46, false);                    // mud flap
  }
  box(1.5, 0.05, 1.2, carbon, 0, 0.27, 1.2);                                     // sump guard
  return { wheels, rim: K.lightCar ? K.rim : K.accent, hub: dark, band: null };
}

// Family saloon: three boxes (bonnet, cabin, boot), chrome grille, hubcaps.
function buildCamryBody(K) {
  const { add, box, rod, body, dark, glass } = K;
  add(slab(0.9, 0.92, 0.26, 0.7, 2.32, 2.38, -2.38, -2.32), body, 0, 0, 0);              // lower body, bumper to bumper
  add(slab(0.92, 0.88, 0.7, 0.9, 2.38, 2.2, 0.95, 0.95), body, 0, 0, 0);                  // bonnet
  add(slab(0.92, 0.9, 0.7, 0.96, 0.95, 0.95, -1.35, -1.35), body, 0, 0, 0);               // doors up to the window line
  add(slab(0.92, 0.88, 0.7, 0.96, -1.35, -1.35, -2.26, -2.38), body, 0, 0, 0);            // boot
  add(slab(0.86, 0.7, 0.94, 1.43, 0.95, 0.3, -1.0, -1.72), glass, 0, 0, 0);               // glasshouse
  add(slab(0.72, 0.7, 1.43, 1.48, 0.36, 0.28, -0.96, -1.04), body, 0, 0, 0);              // roof
  for (const sx of [-1, 1]) {
    rod([sx * 0.86, 0.95, 0.95], [sx * 0.7, 1.45, 0.3], 0.08, body);
    rod([sx * 0.87, 0.95, -0.2], [sx * 0.71, 1.45, -0.3], 0.09, body);
    rod([sx * 0.86, 0.95, -1.72], [sx * 0.7, 1.45, -1.0], 0.09, body);
    faceLamp(K, K.lamp, sx * 0.6, 0.17, 0.71, 2.371, 0.85, 2.245, 1);                      // headlights, on the raked nose
    faceLamp(K, K.brake, sx * 0.6, 0.2, 0.74, -2.3615, 0.86, -2.306, -1);                  // tail lights
    rod([sx * 0.83, 0.98, 0.78], [sx * 0.92, 1.01, 0.75], 0.04, body);                     // mirrors, on arms out of the doors
    box(0.15, 0.1, 0.12, body, sx * 0.97, 1.02, 0.74, false);
    for (const z of [0.2, -0.75]) box(0.03, 0.04, 0.2, K.rim, sx * 0.925, 0.84, z, false); // door handles
    box(0.02, 0.05, 3.3, dark, sx * 0.925, 0.48, -0.05, false);                            // rubbing strip
  }
  faceLamp(K, K.rim, 0, 0.42, 0.5, 2.3527, 0.66, 2.3745, 1, 0.02, 0.04);                 // chrome grille, below the nose
  box(0.86, 0.04, 0.07, dark, 0, 0.58, 2.389, false);
  box(1.5, 0.12, 0.08, dark, 0, 0.4, 2.36, false);                                         // lower intake
  box(0.5, 0.13, 0.03, K.accent, 0, 0.52, -2.37, false);                                   // number plate
  box(0.16, 0.05, 0.03, K.rim, 0, 0.84, -2.325, false);                                    // badge
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6).rotateX(Math.PI / 2), dark, -0.5, 0.3, -2.36, false);
  rod([-0.45, 1.47, -0.9], [-0.45, 1.75, -1.1], 0.02, dark);                               // aerial
  const wheels = [[-0.84, 1.45, 0.24, 0.34], [0.84, 1.45, 0.24, 0.34], [-0.84, -1.45, 0.24, 0.34], [0.84, -1.45, 0.24, 0.34]];
  return { wheels, rim: K.rim, hub: K.rim, band: null };
}

// What you see from the driver's seat of the closed cars: dashboard with
// dials, steering wheel on its column, rear-view mirror, roof lining, door
// panels, and a screen in the Camry. Only built for your own car, and only
// shown in cockpit view; from outside it would all be behind the tinted
// glass anyway.
function buildInterior(car, cls) {
  const rally = cls === 'rally';
  const g = new THREE.Group(); g.userData.dyn = true; g.visible = false; car.add(g);
  const mats = new Map();
  const L = (c) => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
  const box = (w, h, d, c, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c)); m.position.set(x, y, z); parent.add(m); return m; };
  const tube = (a, b, c, th = 0.045) => g.add(strut(V(...a), V(...b), th, th, L(c)));
  const DX = -0.36; // the driver sits on the right
  const trim = rally ? 0x2b2f3a : 0x3a3f4a;
  const top = rally ? 1.01 : 0.99;     // top of the dashboard
  const front = rally ? 0.8 : 0.88;    // where it meets the windscreen
  const back = rally ? 0.3 : 0.32;     // its face, just in front of the steering wheel
  const sill = rally ? 0.995 : 0.965;  // tops of the doors, along the bottom of the side windows
  const rear = rally ? -1.6 : -1.3;    // back of the cabin
  const mid = (front + rear) / 2, len = front - rear;
  // dashboard, floor, door panels and the console between the seats
  box(1.64, top - 0.55, front - back, trim, 0, (top + 0.55) / 2, (front + back) / 2);
  box(1.6, 0.03, len, 0x24272f, 0, 0.32, mid);
  for (const sx of [-1, 1]) box(0.14, sill - 0.32, len, trim, sx * 0.81, (sill + 0.32) / 2, mid);
  box(0.24, 0.3, 0.9, trim, 0, 0.47, back - 0.45);
  // instruments set into the face of the dash, where you see them through
  // the top of the steering wheel
  const iy = rally ? 0.93 : 0.925;
  box(0.44, 0.16, 0.02, 0x1d2230, DX, iy, back - 0.01);
  for (const dx of [-0.11, 0.11]) {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), L(0xe9e4d8));
    dial.rotation.x = Math.PI / 2; dial.position.set(DX + dx, iy, back - 0.025); g.add(dial);
    box(0.012, 0.045, 0.01, 0xe6453a, DX + dx, iy + 0.01, back - 0.038).rotation.z = 0.7; // needle
  }
  // rear-view mirror hanging from the top of the windscreen
  const my = rally ? 1.36 : 1.35, mz = rally ? 0.2 : 0.3;
  box(0.24, 0.06, 0.03, 0x1d2230, 0, my, mz);
  box(0.02, 0.06, 0.02, 0x1d2230, 0, my + 0.05, mz + 0.01);
  // roof lining: unlit, because the light from below is grass green and
  // turned the ceiling green
  const lining = new THREE.Mesh(new THREE.BoxGeometry(rally ? 1.34 : 1.36, 0.04, rally ? 1.52 : 1.3), new THREE.MeshBasicMaterial({ color: rally ? 0x30343e : 0x9e978a }));
  lining.position.set(0, rally ? 1.42 : 1.41, rally ? -0.6 : -0.35); g.add(lining);
  if (!rally) {
    box(0.2, 0.11, 0.02, 0x2a4a7a, 0, top + 0.05, back + 0.18).rotation.x = -0.5; // touch screen
  }
  // steering wheel, tilted toward the driver; the inner group turns with the front wheels
  const wz = rally ? 0.02 : 0.06, wy = 0.96, r = rally ? 0.18 : 0.17;
  tube([DX, wy - 0.02, wz + 0.04], [DX, wy - 0.15, back + 0.03], 0x2b2f3a, 0.11); // column cover, angling down into the dash
  const tilt = new THREE.Group(); tilt.position.set(DX, wy, wz); tilt.rotation.x = -0.35; g.add(tilt);
  const steer = new THREE.Group(); steer.userData.dyn = true; tilt.add(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.024, 6, 20), L(0x1d2230)));
  for (const a of [0, Math.PI, -Math.PI / 2]) { // three spokes: left, right, down
    const sp = box(r, 0.032, 0.02, 0x5a6372, Math.cos(a) * r / 2, Math.sin(a) * r / 2, 0, steer); sp.rotation.z = a;
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), L(rally ? 0xe6453a : 0xb9c0cc));
  hub.rotation.x = Math.PI / 2; steer.add(hub);
  mergeStatic(g); mergeStatic(steer);
  // All of this is drawn last, over everything else (see renderFrame): the
  // car's body is a solid block up to the windows, so drawn along with the
  // rest of the scene, the dash and the bottom of the wheel were buried in it.
  g.traverse((o) => o.layers.set(1));
  return { group: g, steer };
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
  for (const c of app.cars.values()) { carsGroup.remove(c.mesh.group); disposeTree(c.mesh.group); }
  app.cars.clear();
  if (app.local) { carsGroup.remove(app.local.mesh.group); disposeTree(app.local.mesh.group); }
  app.local = null;
  if (app.ghost) { carsGroup.remove(app.ghost.group); disposeTree(app.ghost.group); app.ghost = null; }
}

function spawnLocal(slot) {
  const { pos, heading, idx } = startSlot(app.track, slot);
  const mesh = makeCarMesh(app.color, app.name, true, app.carClass, true, raceNumberOf(app.myId));
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
  const mesh = makeCarMesh(p.color, p.name, false, app.carClass, false, p.num);
  // spec: joined a race part-way through and is only driving around until the
  // next one, so their car is see-through and nobody can hit it
  const spec = !!p.spec && app.mode !== 'quali';
  c = { id: p.id, name: p.name, color: p.color, mesh, spec, buf: [], minCur: Infinity, minPrev: Infinity, winStart: -Infinity, off: 0, jit: 0, lap: 1, cp: 1, pr: 0, finished: false, place: 0, wheelSpin: 0 };
  if (spec) mesh.group.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.35; m.material.depthWrite = false; m.castShadow = false; } });
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
for (const [kind, color] of [['dust', 0xcdbb8e], ['smoke', 0xdde1e6], ['spray', 0xe4f4ff]]) {
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

// players in start order: a grid first (if the server sent one), then everyone else
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
// tail comes round. The handbrake kills rear grip for rally-style flicks,
// except on the open seater (hardHandbrake), where it pulls the car up hard.
const CAR_CLASSES = { open: {
  label: 'Open seater',
  eye: [0, 1.22, 0.62],                     // cockpit camera, just above and ahead of the driver's helmet
  ckFov: 78, ckFovAdd: 12, ckPitch: 1, ckRoll: 1, // cockpit view angle (plus more at speed), and how much of the body's pitch and roll the camera follows
  gears: [11, 18, 26, 34, 42, 50, 62],      // top speed of each gear, m/s
  engine: [75, 620],                        // engine note: idle Hz, rev range Hz
  grip: { tarmac: 1, gravel: 0.9, grass: 0.95 },
  mass: 900,         // kg, open-wheeler with driver
  a: 1.45, b: 1.55,  // distance from centre of mass to front / rear axle (m)
  h: 0.33,           // centre of mass height (m), drives weight transfer
  inertia: 1150,     // yaw inertia (kg m^2): light and low, so it changes direction quickly
  power: 210000,     // W, engine power at the wheels
  maxDrive: 8000,    // N, torque limit at low speed
  topSpeed: 60,      // m/s, soft rev limiter (~215 km/h)
  reverseSpeed: 10.5, // m/s (about 38 km/h)
  brakeForce: 34000, // N, full pedal (ABS below keeps it within grip)
  hardHandbrake: true, // handbrake stops the car hard and only steps the tail out a little
  hbRearGrip: 0.72,  // sideways grip the rears keep under the handbrake (0.25 for the others)
  dive: 0.003,       // how far the body pitches per m/s^2 of braking or acceleration
  maxDive: 0.025,    // rad: most it pitches (any more and the front wing would touch the road)
  rollGain: 0.004,   // how far it rolls per m/s^2 of cornering
  maxRoll: 0.03,     // rad
  leanY: 0.35,       // height the body leans about (the wheels stay level with the road)
  brakeFront: 0.6,
  dragCoef: 0.55,    // N per (m/s)^2, wings are draggy
  downforce: 3.8,    // N per (m/s)^2, wings push the car into the road at speed
  downFront: 0.45,   // share of downforce on the front axle
  maxSteerLow: 0.45, // rad at standstill
  maxSteerHigh: 0.1, // rad at top speed
  latGrip: 1.35,     // sideways grip on top of the surface's (1 for the others): corners much harder; braking and traction unchanged
  latGripRear: 1.5,  // a little more at the back, so the tail stays planted when you flick it left and right
  steerGain: 2.0,    // how much lock it asks for at speed (1.7 for the others)
  steerRate: 12,     // how fast the wheels turn when you steer (7 for the others)
  yawDamp: 0.8,      // how much it resists rotating (1 for the others)
  gravity: 9.81,
}, rally: {
  // Heavier, taller and softer, with almost no downforce: slower on tarmac,
  // but its tyres bite on gravel and grass where the single seater skates.
  label: 'Rally',
  eye: [-0.36, 1.22, -0.55],                // driver's seat (right-hand drive), behind the wheel
  ckFov: 60, ckFovAdd: 8, ckPitch: 0.5, ckRoll: 0.35, ckTilt: -0.07, // looks a few degrees down: less roof, more wheel
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
  reverseSpeed: 10.5,
  brakeForce: 30000,
  dive: 0.007, maxDive: 0.06, rollGain: 0.008, maxRoll: 0.08, leanY: 0.45,
  brakeFront: 0.6,
  dragCoef: 0.8,
  downforce: 0.9,
  downFront: 0.45,
  maxSteerLow: 0.55,
  maxSteerHigh: 0.12,
  gravity: 9.81,
}, camry: {
  // A sensible family saloon doing something it was never meant to do: soft,
  // heavy, modest power, ordinary tyres. Everyone has the same one.
  label: 'Toyota Camry',
  eye: [-0.36, 1.21, -0.45],
  ckFov: 60, ckFovAdd: 8, ckPitch: 0.5, ckRoll: 0.35, ckTilt: -0.07, // looks a few degrees down: less roof, more wheel
  gears: [8, 14, 20, 27, 34, 41, 47],
  engine: [45, 330],
  grip: { tarmac: 0.84, gravel: 0.88, grass: 0.9 },
  mass: 1500,
  a: 1.25, b: 1.5,
  h: 0.55,
  inertia: 2400,
  power: 140000,
  maxDrive: 6800,
  topSpeed: 46,
  reverseSpeed: 9.5,
  brakeForce: 25000,
  dive: 0.009, maxDive: 0.06, rollGain: 0.01, maxRoll: 0.1, leanY: 0.45,
  brakeFront: 0.65,
  dragCoef: 0.6,
  downforce: 0.3,
  downFront: 0.5,
  maxSteerLow: 0.55,
  maxSteerHigh: 0.1,
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
  app.camMode = camFor(cls);
  const b = document.querySelector('#btn-cam'); if (b) b.textContent = app.camMode === 'cockpit' ? 'Camera: cockpit' : 'Camera: chase';
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
  car.missedGate = false;
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
    const fx = Math.sin(car.h), fz = Math.cos(car.h);
    slopeAlong = loc.s.t.y * (fx * loc.s.th.x + fz * loc.s.th.z);
  }
  if (loc) { car.lastIdx = car.idx; car.idx = loc.i; } // on the road or off it, for the gates
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
  // Holding brake stops the car and holds it for a moment, brake lights on;
  // keep holding and it reverses. (It used to slip straight into reverse, so
  // the brake lights went out the moment the car slowed to a stop.)
  car.stopTime = brake && vLong <= 0.6 ? (car.stopTime || 0) + dt : 0;
  const reversing = car.stopTime > 0.6;

  // ---- steering: less lock at speed, quick to centre ----
  // steering lock shrinks with speed so full lock asks for a bit more than the
  // tyres' peak slip angle: enough to provoke a slide, not enough to just plough
  const gripAccel = (surf.mu || 1.3) * (CAR.latGrip || 1) * (CAR.gravity + CAR.downforce * speedAbs * speedAbs / CAR.mass);
  const maxSteer = clamp((CAR.steerGain || 1.7) * gripAccel * (CAR.a + CAR.b) / Math.max(speedAbs, 1) ** 2, CAR.maxSteerHigh, CAR.maxSteerLow);
  const steerTarget = steerIn * maxSteer;
  const rate = steerIn === 0 ? 12 : CAR.steerRate || 7;
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
      // the engine pushes forward whichever way the car is rolling, so going
      // from reverse back to forward is quick (it used to do nothing until the
      // car had coasted to a stop on its own)
      const powerLimited = CAR.power / Math.max(speedAbs, 4);
      Fdrive = Math.min(CAR.maxDrive, powerLimited) * clamp((CAR.topSpeed - vLong) / 6, 0, 1);
    }
    let FbrakeF = 0, FbrakeR = 0, Freverse = 0;
    if (brake) {
      if (vLong > 0.6) {
        FbrakeF = -CAR.brakeForce * CAR.brakeFront;
        FbrakeR = -CAR.brakeForce * (1 - CAR.brakeFront);
      } else if (reversing) {
        Freverse = -4600 * clamp((CAR.reverseSpeed + vLong) / 3, 0, 1); // reverse gear
      }
    }
    if (handbrake && !CAR.hardHandbrake) FbrakeR += -6000 * sgn;

    // combined grip per axle: one budget (mu * load) shared between pushing
    // forward and holding the corner. Ask for more than that and both shrink,
    // which is how flooring it mid-corner turns into a slide.
    const capF = surf.mu * Fzf, capR = surf.mu * Fzr;
    // The open seater's handbrake locks the rears and pulls the car up hard,
    // the fronts helping, while the tail only steps out a little.
    if (handbrake && CAR.hardHandbrake && Math.abs(vLong) > 0.5) { FbrakeF -= CAR.brakeForce * 0.35 * sgn; FbrakeR -= capR * 0.5 * sgn; }
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
    // latGrip widens the grip budget sideways only (an ellipse), so cornering
    // grip can go up without changing braking or traction
    const lg = CAR.latGrip || 1, lgR = CAR.latGripRear || lg;
    let FyF = tyreForce(surf, Fzf, alphaF) * lg;
    let FyR = tyreForce(surf, Fzr, alphaR) * lgR;
    if (handbrake) { FyR *= CAR.hbRearGrip ?? 0.25; locked = true; } // locked rears can't hold the corner
    const totF = Math.hypot(FxF, FyF / lg), totR = Math.hypot(FxR, FyR / lgR);
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
    let yawAcc = torque / CAR.inertia - yawRate * (CAR.yawDamp ?? 1); // aero/caster damping

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
  if (((brake && !reversing) || (handbrake && CAR.hardHandbrake)) && Math.abs(vLong) < 0.6) vLong = 0; // held at a stop
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
  bump = Math.max(bump, collideCars(car));
  if (bump > 0) {
    car.speed = car.vx * fx2 + car.vz * fz2;
    car.yawRate *= 0.8;
    if (bump > 3 && performance.now() - (car.lastBump || 0) > 250) { car.lastBump = performance.now(); beep(70 + Math.random() * 30, 0.16, Math.min(0.35, bump * 0.03)); }
  }

  // ---- wading through the lake: heavy drag and a lot of spray ----
  const lake = app.track.lake;
  car.inWater = !!lake && !car.airborne && (car.pos.x - lake.x) ** 2 + (car.pos.z - lake.z) ** 2 < lake.r * lake.r && car.pos.y < lake.level - 0.12;
  if (car.inWater) {
    const drag = Math.exp(-dt * 1.3);
    car.vx *= drag; car.vz *= drag;
    if (speedAbs > 2) { const y = car.pos.y; car.pos.y = lake.level; emitDust(car, clamp(speedAbs / 14, 0.3, 1), 'spray'); car.pos.y = y; }
  }

  // ---- vertical ----
  // Where is the surface under the car now that it has moved? (Reading it
  // from where the car was at the start of the frame left it a frame behind.)
  // Off the road the car rides the terrain; across the verge skirt it eases
  // from road height down to the grass, matching what's drawn.
  const vloc = locate(app.track, car.pos, car.idx, 30);
  const onRoadNow = !!vloc && Math.abs(vloc.lateral) <= app.track.hw + 1.6 && Math.abs(vloc.along) < 2.5 && Math.abs(vloc.y - car.pos.y) < 3.5;
  let groundY = terrainHeight(car.pos.x, car.pos.z);
  if (!onRoadNow && vloc && Math.abs(vloc.along) < 2.5 && Math.abs(vloc.y - car.pos.y) < 3.5 && (app.track.vergeDrop?.[vloc.i] ?? 99) <= VERGE_MAX_DROP) {
    const over = Math.abs(vloc.lateral) - (app.track.hw + 1.6);
    if (over < VERGE) groundY = Math.max(groundY, lerp(vloc.y, groundY, clamp(over / VERGE, 0, 1)));
  }
  const targetY = onRoadNow ? vloc.y + ROAD_LIFT : groundY;
  if (car.airborne) {
    car.vy -= PHYS.gravity * dt;
    car.pos.y += car.vy * dt;
    if (car.pos.y <= targetY) { car.pos.y = targetY; car.vy = 0; car.airborne = false; car.landedAt = performance.now(); }
  } else {
    // The wheels follow the surface exactly. (The old smoothing lagged behind
    // it, which sank cars up to 30 cm into the road going uphill and floated
    // them going down.) The car only leaves the ground where it drops away
    // faster than gravity could pull the car after it: a ledge, the edge of
    // the bridge, a sharp crest.
    const fallTo = car.pos.y + car.vy * dt - 0.5 * PHYS.gravity * dt * dt;
    if (targetY < fallTo - (onRoadNow ? 0.06 : 0.45)) { // the road is smooth except at jumps, so a small margin there
      car.airborne = true; car.pos.y = fallTo; car.vy -= PHYS.gravity * dt;
    } else {
      const ny = targetY - car.pos.y > 0.6 ? lerp(car.pos.y, targetY, 1 - Math.exp(-dt * 25)) : targetY; // a big step up still eases
      car.vy = dt > 1e-4 ? clamp((ny - car.pos.y) / dt, -30, 9) : 0; // a ramp can't throw a car up faster than this
      car.pos.y = ny;
    }
  }

  // ---- off-track bookkeeping ----
  // no automatic respawn: you drive back on, or press R yourself
  car.offTrackTimer = onTrack ? 0 : car.offTrackTimer + dt;

  // ---- checkpoints & laps ----
  const goal = app.track.goal;
  if (app.mode === 'dash') {
    if (goal && app.phase === 'racing' && !app.finished && (car.pos.x - goal.x) ** 2 + (car.pos.z - goal.z) ** 2 < goal.r * goal.r) finishRace();
  } else if (loc && app.phase === 'racing' && !app.finished) {
    const N = app.track.N;
    const d = (car.idx - car.lastIdx + N) % N;
    // A gate counts when you go through it: between its posts, or just
    // outside them (a wheel on the grass or a slide wide still counts), moving
    // along the road a normal step. It used to need the middle of the car on
    // the tarmac, so running a little wide at a gate missed it without anyone
    // noticing. A shortcut that leaves the road and skips a gate still doesn't count.
    // (Just after landing from a jump the step can be the length of the flight:
    // high in the air the car may not have been placed on the road at all.)
    const maxStep = performance.now() - (car.landedAt || 0) < 300 ? 45 : 8;
    if (d > 0 && d <= maxStep && Math.abs(loc.lateral) <= app.track.hw + 3.5 && Math.abs(loc.y - car.pos.y) < 8) {
      const cpIdx = app.track.cps[car.nextCp];
      const dc = (cpIdx - car.lastIdx + N) % N;
      if (dc > 0 && dc <= d) {
        car.lastCpIdx = cpIdx;
        car.missedGate = false;
        if (car.nextCp === 0) {
          const nowP = performance.now();
          const lapTime = nowP - (car.lapStart || raceStartPerf());
          car.lapStart = nowP;
          if (!app.bestLap || lapTime < app.bestLap) app.bestLap = lapTime;
          app.myLaps.push(lapTime);
          if (lapTime === app.bestLap) app.ghostLap = app.rec;
          app.rec = []; app.recFrom = nowP; app.dI = 0;
          car.lap++;
          send({ t: 'lap', time: Math.round(lapTime) }); // for the leaderboard (and the best laps, in Polytrack mode)
          notePersonalBest(lapTime);
          if (app.mode === 'quali') raceToast(`Lap  ${fmtTime(lapTime)}${lapTime === app.bestLap ? '  ★ best' : ''}`, 2500);
          else if (car.lap > app.laps) finishRace();
          else raceToast(`Lap ${car.lap - 1}  ${fmtTime(lapTime)}${lapTime === app.bestLap && car.lap > 2 ? '  ★ best' : ''}`, 2200);
        }
        car.nextCp = (car.nextCp + 1) % CHECKPOINT_COUNT;
      }
    }
    // gone well past the next gate without going through it? The warning
    // stays up until you go back through it, or press R.
    const past = (car.idx - app.track.cps[car.nextCp] + N) % N;
    if (past > 12 && past < N * 0.6) car.missedGate = true;
  } else car.missedGate = false;

  // ---- visuals: pitch with slope and acceleration, roll with cornering ----
  // The chassis lies along the ground under it, so the wheels stay on the
  // surface. The body leans on its springs about hub height: nose down under
  // braking, squatting under power, and outwards in corners. (Tilting the
  // whole car about the ground used to push the nose and the wheels on one
  // side into the road, and it leaned into corners rather than out.)
  const sl = onRoadNow ? vloc.s : null;
  const groundPitch = car.airborne ? 0 : sl ? -Math.atan2(sl.t.y, 1) * (fx2 * sl.th.x + fz2 * sl.th.z) : -Math.atan(slopeAlong);
  const groundRoll = car.airborne || onRoadNow ? 0 : Math.atan(sideSlope);
  const gk = 1 - Math.exp(-dt * (car.airborne ? 3 : 25)), lk = 1 - Math.exp(-dt * 8);
  car.gPitch = lerp(car.gPitch || 0, groundPitch, gk);
  car.gRoll = lerp(car.gRoll || 0, groundRoll, gk);
  car.lPitch = lerp(car.lPitch || 0, clamp(-car.ax * CAR.dive, -CAR.maxDive, CAR.maxDive), lk);
  car.lRoll = lerp(car.lRoll || 0, clamp(yawRate * vLong * CAR.rollGain, -CAR.maxRoll, CAR.maxRoll), lk);
  car.pitch = car.gPitch + car.lPitch; car.roll = car.gRoll + car.lRoll;
  const gm = car.mesh.group;
  gm.position.copy(car.pos);
  gm.rotation.set(0, 0, 0);
  gm.rotateY(car.h); gm.rotateX(car.gPitch); gm.rotateZ(car.gRoll);
  car.mesh.lean.rotation.set(car.lPitch, 0, car.lRoll);
  car.wheelSpin += (spinning ? vLong + 12 : vLong) * dt / 0.42;
  for (const w of car.mesh.wheels) {
    w.mesh.rotation.x = car.wheelSpin;
    if (w.front) w.pivot.rotation.y = car.steerAngle;
  }
  if (car.mesh.steer) car.mesh.steer.rotation.z = -car.steerAngle * 5; // steering wheel: about 5 turns of the wheel per turn of the tyres
  car.braking = !!brake && !reversing;
  car.mesh.brakeMat.emissive.setHex(car.braking ? 0xff2020 : 0x000000);

  // dust / smoke when sliding or spinning
  if (!car.airborne && speedAbs > 4 && !car.inWater) {
    const loose = car.surfaceName === 'gravel' || car.surfaceName === 'grass';
    // tarmac tyres peak around 0.16 rad of slip, so only smoke well past that
    const slideAmt = clamp((car.slip - (loose ? 0.14 : 0.24)) / 0.3, 0, 1);
    const amount = Math.max(slideAmt, spinning ? 0.8 : 0, locked ? 0.6 : 0, loose ? clamp(speedAbs / 40, 0, 0.5) : 0);
    if (amount > 0.05) emitDust(car, amount, loose ? (app.track.theme === 'snow' && car.surfaceName === 'grass' ? 'spray' : 'dust') : 'smoke'); // snow sprays white
  }
}

// Other players' cars. Every position a player sends is stamped with their own
// clock. We work out how that clock lines up with ours (the quickest packet
// seen lately is the best guess), then draw each car a little in the past so
// there are always two real positions either side of the moment being drawn.
// The curve between them uses the car's velocity, so it bends through corners
// instead of cutting them. How far in the past adapts to how bumpy the
// connection is: smooth connections get ~60 ms, rough ones more.
function pushRemoteState(c, s, recv) {
  const t = s[1], buf = c.buf, newest = buf[buf.length - 1];
  if (newest && t <= newest.t) {
    if (newest.t - t < 5000) return;          // duplicate or out of order
    buf.length = 0; c.play = undefined; c.minCur = c.minPrev = Infinity; c.winStart = -Infinity;
  }
  buf.push({ t, x: s[2], y: s[3], z: s[4], h: s[5], vx: s[6], vz: s[7], yaw: s[8], pitch: s[9], roll: s[10], b: s[14] & 1, lp: s[15] || 0, lr: s[16] || 0 });
  if (buf.length > 40) buf.shift();
  c.lap = s[11]; c.cp = s[12]; c.pr = s[13];
  const d = recv - t;
  if (!(recv - c.winStart < 2000)) { c.minPrev = c.minCur; c.minCur = d; c.winStart = recv; }
  else if (d < c.minCur) c.minCur = d;
  c.off = Math.min(c.minPrev, c.minCur);
  c.jit = Math.max(c.jit, d - c.off);
}

function stepRemotes(now, dt) {
  const dtms = dt * 1000;
  for (const c of app.cars.values()) {
    // lettering on a car more than 60 m away can't be read: don't draw it
    const dec = c.mesh.decals;
    if (dec) { const far = c.mesh.group.position.distanceToSquared(camera.position) > 3600; if (far !== c.decalsFar) { c.decalsFar = far; for (const d of dec) d.visible = !far; } }
    const buf = c.buf;
    if (!buf.length) continue;
    c.jit *= Math.exp(-dt / 5);
    const delay = clamp(1000 / SEND_HZ + 12 + c.jit * 1.2, 55, 400);
    const target = now - c.off - delay;
    if (c.play === undefined || Math.abs(target - c.play) > 400) c.play = target;
    else c.play += dtms + clamp(target - c.play - dtms, -dtms * 0.08, dtms * 0.08); // speed up or slow down by up to 8%, never jump
    const tp = c.play;
    let i = buf.length - 1;
    while (i > 0 && buf[i].t > tp) i--;
    const a = buf[i], b = buf[i + 1];
    let x = a.x, y = a.y, z = a.z, h = a.h, pitch = a.pitch, roll = a.roll, lp = a.lp, lr = a.lr, vx = a.vx, vz = a.vz;
    if (tp > a.t && b) {
      const span = b.t - a.t, u = (tp - a.t) / span;
      if (span < 400) {
        const u2 = u * u, u3 = u2 * u, k = span / 1000;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, h11 = u3 - u2;
        x = h00 * a.x + h10 * k * a.vx + h01 * b.x + h11 * k * b.vx;
        z = h00 * a.z + h10 * k * a.vz + h01 * b.z + h11 * k * b.vz;
      } else { x = lerp(a.x, b.x, u); z = lerp(a.z, b.z, u); }
      y = lerp(a.y, b.y, u); h = lerpAngle(a.h, b.h, u);
      pitch = lerp(a.pitch, b.pitch, u); roll = lerp(a.roll, b.roll, u); lp = lerp(a.lp, b.lp, u); lr = lerp(a.lr, b.lr, u);
      vx = lerp(a.vx, b.vx, u); vz = lerp(a.vz, b.vz, u);
    } else if (tp > a.t) {
      // nothing newer has arrived yet: carry on along the last known heading for a moment
      const e = Math.min((tp - a.t) / 1000, 0.25);
      x += a.vx * e; z += a.vz * e; h += a.yaw * e;
    }
    // a light filter on top hides whatever small corrections are left
    const g = c.mesh.group;
    if (c.shown && (x - c.sx) ** 2 + (z - c.sz) ** 2 < 144) {
      const k = 1 - Math.exp(-dt * 30);
      c.sx = lerp(c.sx, x, k); c.sy = lerp(c.sy, y, k); c.sz = lerp(c.sz, z, k); c.sh = lerpAngle(c.sh, h, k);
    } else { c.sx = x; c.sy = y; c.sz = z; c.sh = h; c.shown = true; }
    g.position.set(c.sx, c.sy, c.sz);
    g.rotation.set(0, 0, 0);
    g.rotateY(c.sh); g.rotateX(pitch); g.rotateZ(roll);
    c.mesh.lean.rotation.set(lp, 0, lr);
    g.visible = true;
    c.svx = vx; c.svz = vz;
    c.wheelSpin += (vx * Math.sin(h) + vz * Math.cos(h)) * dt / 0.42;
    for (const w of c.mesh.wheels) w.mesh.rotation.x = c.wheelSpin;
    c.mesh.brakeMat.emissive.setHex(buf[buf.length - 1].b ? 0xff2020 : 0x000000);
  }
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------
const camTarget = new THREE.Vector3();
const cockpitEye = new THREE.Vector3(0, 1.22, 0.62); // just above and ahead of the driver's helmet
const faceForward = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI); // cameras look down -z, the car drives toward +z
// Every race starts in the car's own view: the cockpit in the open seater,
// outside behind the car in the others. C switches for the rest of that race.
const CAM_DEFAULT = { open: 'cockpit', rally: 'chase', camry: 'chase' };
const camFor = (cls) => CAM_DEFAULT[cls] || 'chase';
app.camMode = camFor('open');
const camPos = new THREE.Vector3();
const _ce = new THREE.Euler(), _cq = new THREE.Quaternion();
let camInit = false;

function updateCamera(dt) {
  if (podium) return; // the podium has the camera (updatePodium)
  if (app.phase === 'home' || app.phase === 'lobby' || !app.local) {
    // slow orbit around the track for the menus
    app.inCockpit = false;
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
  app.inCockpit = false;
  const car = app.local;
  if (car.mesh.interior) car.mesh.interior.visible = app.camMode === 'cockpit';
  sun.position.set(car.pos.x + 80, car.pos.y + 140, car.pos.z + 60);
  sun.target.position.copy(car.pos);
  if (app.camMode === 'cockpit') {
    // the driver's eye, carried by the car. The closed cars only follow part
    // of the body's pitch and roll, the way your head keeps itself level.
    _ce.set(car.gPitch + car.lPitch * CAR.ckPitch, car.h, car.gRoll + car.lRoll * CAR.ckRoll, 'YXZ');
    _cq.setFromEuler(_ce);
    camera.position.copy(cockpitEye).applyQuaternion(_cq).add(car.pos);
    camera.quaternion.copy(_cq).multiply(faceForward);
    if (CAR.ckTilt) camera.rotateX(CAR.ckTilt);
    app.inCockpit = true;
    const k = clamp(Math.abs(car.speed) / PHYS.maxSpeed, 0, 1);
    camera.fov = lerp(camera.fov, CAR.ckFov + k * CAR.ckFovAdd, 1 - Math.exp(-dt * 4));
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
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  app.ws = ws;
  ws.onopen = () => {
    $('#btn-create').disabled = false; $('#btn-join').disabled = false;
    // our copy of the leaderboard: fills it back in if the server has restarted
    const seed = JSON.stringify({ t: 'lbseed', boards: app.lbKeep });
    if (seed.length > 30 && seed.length < 12000) ws.send(seed);
  };
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

// Free hosting puts a server to sleep when no web requests arrive for a while,
// and game traffic on the open socket doesn't count. A tiny request every few
// minutes while you're in a room keeps it awake until the session is over.
setInterval(() => { if (app.room) fetch('/healthz', { cache: 'no-store' }).catch(() => {}); }, 240000);
// A heartbeat, so the server can tell a quiet player in the lobby from one
// whose connection has died.
setInterval(() => send({ t: 'hb' }), 25000);

function send(msg) {
  if (app.ws && app.ws.readyState === WebSocket.OPEN) app.ws.send(JSON.stringify(msg));
}

function handle(msg) {
  switch (msg.t) {
    case 'error': toast(msg.msg); break;
    case 'joined':
      app.myId = msg.id;
      if (typeof msg.name === 'string' && msg.name !== app.name) {
        app.name = msg.name; $('#name').value = msg.name;
        try { localStorage.setItem('dc-name', msg.name); } catch {}
        toast(`That name isn't allowed, so you're racing as ${msg.name}.`);
      }
      app.pairStates = !!msg.pair; // the server wants positions two at a time (Cloudflare)
      history.replaceState(null, '', `/?room=${msg.code}`);
      break;
    case 'room':
      app.room = msg;
      app.laps = msg.laps;
      // Polytrack mode has no time limit, so whoever is host now can end it
      if ((app.phase === 'racing' || app.phase === 'countdown') && app.mode === 'quali') $('#btn-endq').classList.toggle('hidden', msg.hostId !== app.myId);
      if ((msg.car || 'open') !== app.carClass && app.phase !== 'countdown' && app.phase !== 'racing') setCarClass(msg.car);
      if (app.phase === 'home' || app.phase === 'results' || app.phase === 'lobby') {
        if (msg.phase === 'lobby') {
          if (worldStale(msg.trackId, msg.car)) buildWorld(msg.trackId, msg.car || 'open');
          showLobby();
          layoutLobbyCars();
        }
        else if (app.phase === 'home') toast('Joined! A session is just finishing — the lobby opens in a moment.');
        else if (app.phase === 'results') resultsButtons();
      } else {
        // racing: drop cars that left
        for (const id of [...app.cars.keys()]) {
          if (!msg.players.some(p => p.id === id)) { const g = app.cars.get(id).mesh.group; carsGroup.remove(g); disposeTree(g); app.cars.delete(id); }
        }
      }
      renderLobby();
      break;
    case 'left':
      if (app.cars.has(msg.id)) { const g = app.cars.get(msg.id).mesh.group; carsGroup.remove(g); disposeTree(g); app.cars.delete(msg.id); }
      break;
    case 'start': beginRace(msg); break;
    case 's': {
      const recv = performance.now();
      for (const s of msg.s) {
        if (s[0] === app.myId) continue;
        let c = app.cars.get(s[0]);
        if (!c) {
          const p = app.room?.players.find(p => p.id === s[0]);
          if (!p) continue;
          c = ensureRemote(p);
        }
        pushRemoteState(c, s, recv);
      }
      break;
    }
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
    case 'lbs': app.boards = msg.boards && typeof msg.boards === 'object' ? msg.boards : {}; keepBoards(app.boards); boardsChanged(); break;
    case 'lb': if (typeof msg.k === 'string') { app.boards[msg.k] = Array.isArray(msg.list) ? msg.list : []; keepBoards({ [msg.k]: app.boards[msg.k] }); boardsChanged(msg.k); } break;
    case 'record': {
      const where = TRACKS[msg.track]?.name || 'this track';
      if (msg.id === app.myId) raceToast(msg.place === 1 ? `New track record! ${fmtTime(msg.time)}` : `#${msg.place} on the ${where} leaderboard! ${fmtTime(msg.time)}`, 3500);
      else if (msg.place === 1) raceToast(`${msg.name} set a new track record: ${fmtTime(msg.time)}`, 3000);
      break;
    }
    case 'results': showResults(msg.results, !!msg.quali, msg.mode === 'dash'); break;
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
  app.mode = msg.mode === 'quali' ? 'quali' : msg.mode === 'dash' && app.track?.goal !== undefined ? 'dash' : 'race';
  app.myPlace = 0;
  app.bests = new Map();
  app.myLaps = [];
  app.rec = []; app.ghostLap = null; app.recFrom = null; app.dI = 0; app.ghostDelta = null;
  app.joinedRaceAt = performance.now();
  $('#hud-time-label').textContent = 'Time';
  if (worldStale(msg.trackId, msg.car)) buildWorld(msg.trackId, msg.car || 'open');
  setCarClass(msg.car);
  clearCars();
  // A new race: everyone in the room is in it. (Only someone joining part-way
  // through, who gets msg.spectate, keeps the others' spectator flags.)
  if (!msg.spectate) for (const p of app.room.players) delete p.spec;
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
  const dash = app.mode === 'dash';
  $('#hud-lap-label').textContent = dash ? 'To go' : 'Lap';
  $('#hud-laps').parentElement.style.display = dash ? 'none' : '';
  $('#dash-nav').classList.toggle('hidden', !dash);
  if (dash) raceToast('Race to 9LAT2 — follow the arrow, first one there wins', 4000);
  $('#btn-endq').classList.toggle('hidden', !(app.mode === 'quali' && app.room?.hostId === app.myId));
  if (app.mode === 'quali') raceToast('Polytrack mode: free laps, no time limit. Race your ghost!', 3500);
  if (app.spectate) { app.finished = true; raceToast('Race in progress — you can drive around, next race counts', 4000); }
}

// ---- leaderboard: the best laps on each track, in any car (see server/core.js) ----
// A copy is kept in this browser, so a server that has restarted gets its
// boards back from returning players. Your own best laps are kept here too.
app.boards = {};
app.pbs = {};
try { const b = JSON.parse(localStorage.getItem('dc-lb') || '{}'); if (b && typeof b === 'object' && !Array.isArray(b)) app.boards = b; } catch {}
try { const b = JSON.parse(localStorage.getItem('dc-pb') || '{}'); if (b && typeof b === 'object' && !Array.isArray(b)) app.pbs = b; } catch {}
// Everything this browser has seen on the boards, kept apart from what's on
// show: it's what gets handed back on connecting, and a server that has just
// restarted with empty boards can't wipe it.
app.lbKeep = {};
try { const b = JSON.parse(localStorage.getItem('dc-lb-keep') || 'null'); app.lbKeep = b && typeof b === 'object' && !Array.isArray(b) ? b : { ...app.boards }; } catch {}
function keepBoards(boards) {
  for (const [k, list] of Object.entries(boards || {})) {
    if (!Array.isArray(list)) continue;
    const best = new Map();
    for (const e of [...(app.lbKeep[k] || []), ...list]) {
      if (!e || typeof e.n !== 'string' || !(e.ms > 0) || typeof e.s !== 'string') continue;
      const low = e.n.toLowerCase(), had = best.get(low);
      if (!had || e.ms < had.ms) best.set(low, e);
    }
    app.lbKeep[k] = [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, 10);
  }
  try { localStorage.setItem('dc-lb-keep', JSON.stringify(app.lbKeep)); } catch {}
}
// personal bests from v2.5 were kept per car ('track:car'): keep the best one for each track
for (const [k, ms] of Object.entries(app.pbs)) {
  const m = /^(\d+):/.exec(k);
  if (!m) continue;
  delete app.pbs[k];
  if (ms > 0 && !(app.pbs[m[1]] <= ms)) app.pbs[m[1]] = ms;
}
const CAR_NAMES = { open: 'Open seater', rally: 'Rally', camry: 'Camry' };
const board = { track: 0 };
const boardList = (t) => { const l = app.boards[String(t)]; return Array.isArray(l) ? l.filter(e => e && typeof e.n === 'string' && e.ms > 0) : []; };
function boardsChanged(key) {
  try { localStorage.setItem('dc-lb', JSON.stringify(app.boards)); } catch {}
  if (!$('#board').classList.contains('hidden') && (!key || key === String(board.track))) renderBoard();
  renderRecord();
}
function notePersonalBest(lapTime) {
  const k = String(app.trackId), ms = Math.round(lapTime);
  if (app.pbs[k] && app.pbs[k] <= ms) return;
  app.pbs[k] = ms;
  try { localStorage.setItem('dc-pb', JSON.stringify(app.pbs)); } catch {}
}
function openBoard(track) {
  if (track != null) board.track = track;
  $('#board').classList.remove('hidden');
  renderBoard();
}
function renderBoard() {
  $('#board-tracks').innerHTML = TRACKS.map((t, i) => `<button data-t="${i}" class="${i === board.track ? 'on' : ''}">${esc(t.name)}</button>`).join('');
  const list = boardList(board.track);
  const me = (app.room ? app.name : $('#name').value.replace(/[^A-Za-z0-9 _\-]/g, '').trim().slice(0, 12) || 'Racer').toLowerCase();
  $('#board-list').innerHTML = list.length
    ? list.map((e, i) => `<li class="${e.n.toLowerCase() === me ? 'me' : ''} ${i === 0 ? 'first' : ''}"><span class="place">${i + 1}</span><span class="name">${esc(e.n)}</span><span class="car">${CAR_NAMES[e.c] || ''}</span><span class="time">${fmtTime(e.ms)}</span></li>`).join('')
    : '<li class="empty">No laps yet. Set the first one!</li>';
  const pb = app.pbs[String(board.track)];
  $('#board-pb').textContent = pb ? `Your best here: ${fmtTime(pb)}` : '';
}
// the record for the track picked in the lobby
function renderRecord() {
  const r = app.room, el = $('#track-record');
  if (!el) return;
  const best = r && boardList(r.trackId)[0];
  el.textContent = best ? `Lap time record ${fmtTime(best.ms)} by ${best.n}${CAR_NAMES[best.c] ? ` (${CAR_NAMES[best.c]})` : ''}` : '';
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

function showResults(results, quali, dash) {
  app.phase = 'results';
  app.finished = true;
  if (quali) app.finishTime = 0;
  $('#results-title').textContent = quali ? 'Polytrack mode — best laps' : dash ? 'Race to 9LAT2 — results' : 'Race results';
  $('#btn-endq').classList.add('hidden');
  const list = $('#results-list');
  list.innerHTML = '';
  const top = results[0]?.time;
  results.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === 0 && r.time != null) li.classList.add('first');
    if (r.id === app.myId) li.classList.add('me');
    const gap = r.time == null || i === 0 || top == null ? '' : '+' + ((r.time - top) / 1000).toFixed(2);
    li.innerHTML = `<span class="place">${r.time == null ? '–' : i + 1}</span><span class="dot" style="background:${COLOR_CSS[r.color]}"></span><span class="name">${esc(r.name)}</span><span class="gap">${gap}</span><span class="time">${r.time == null ? (quali ? 'no time' : 'DNF') : fmtTime(r.time)}</span>`;
    list.appendChild(li);
  });
  // your own line: where you ended up, and every lap you set
  const mine = results.findIndex(r => r.id === app.myId), me = results[mine];
  let sub = '';
  if (me && me.time != null) sub = quali ? `Your best lap ${fmtTime(me.time)} — ${ordinal(mine + 1)} fastest` : `You finished ${ordinal(mine + 1)} — ${fmtTime(me.time)}`;
  else if (me) sub = quali ? 'No lap time set' : app.spectate ? 'You joined part-way through' : 'Did not finish';
  $('#results-sub').textContent = sub;
  const laps = app.myLaps || [], best = Math.min(...laps);
  $('#results-laps').innerHTML = laps.length ? '<span class="lbl">Your laps</span>' + laps.map((t, i) => `<span class="lap${t === best ? ' best' : ''}">L${i + 1} ${fmtTime(t)}</span>`).join('') : '';
  resultsButtons();
  // after a race: the top three on the podium first, then the results
  const podiumTop = quali ? [] : results.filter(r => r.time != null).slice(0, 3);
  if (podiumTop.length) startPodium(podiumTop, dash, () => $('#results').classList.remove('hidden'));
  else $('#results').classList.remove('hidden');
}

// ---- podium: the top three on gold, silver and bronze steps just past the
// finish line, confetti falling and the camera swinging round them. Any key
// or click skips to the results. ----
let podium = null;
function plate(text, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '900 104px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 12; ctx.strokeStyle = '#1d2230'; ctx.strokeText(text, 64, 70); ctx.fillStyle = '#fffaf0'; ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
}
// The podium, staged: third and second crash down onto their steps in turn,
// a drumroll builds, then the winner slams onto the top step: a flash, a
// fanfare, a confetti cannon and fireworks while the camera
// circles. Any key or click skips to the results.
function podiumDrumroll(dur) {
  if (!audio.ctx || !audio.on || !audio.nodes) return null;
  const c = audio.ctx, t = c.currentTime;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.8;
  const trem = c.createGain(); trem.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(12, t); lfo.frequency.linearRampToValueAtTime(24, t + dur);
  const lfoG = c.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG).connect(trem.gain);
  const g = c.createGain(); g.gain.setValueAtTime(0.02, t); g.gain.exponentialRampToValueAtTime(0.4, t + dur);
  src.connect(bp).connect(trem).connect(g).connect(audio.nodes.master);
  src.start(t); lfo.start(t);
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setTargetAtTime(0, c.currentTime, 0.03); src.stop(c.currentTime + 0.2); lfo.stop(c.currentTime + 0.2); } catch {} };
  return { stop };
}
function startPodium(top, dash, done) {
  endPodium(false);
  const T = app.track, step = T.length / T.N, s = T.samples[Math.round(20 / step) % T.N];
  const head = Math.atan2(s.th.x, s.th.z);
  const g = new THREE.Group(); g.position.copy(s.p); g.rotation.y = head;
  const night = !!T.look?.night;
  const STEPS = [[0, 1.4, 0xffd23f], [3.8, 1.0, 0xcfd6e0], [-3.8, 0.65, 0xd08a4a]];
  const cars = [], blocks = [];
  STEPS.forEach(([x, h, col], i) => {
    const block = new THREE.Mesh(new THREE.BoxGeometry(3.6, h, 5.6), new THREE.MeshLambertMaterial({ color: col, emissive: night ? col : 0, emissiveIntensity: 0.35, flatShading: true }));
    block.position.set(x, h / 2, 0); block.castShadow = block.receiveShadow = true; g.add(block); blocks[i] = block;
    const num = plate(String(i + 1), Math.min(1.25, h * 0.9)); num.position.set(x, h / 2, 2.81); g.add(num);
    const r = top[i];
    if (!r) return; // fewer than three finishers: an empty step
    const car = makeCarMesh(r.color, r.name, false, app.carClass, false, raceNumberOf(r.id));
    car.group.position.set(x, h + 30, -0.2); car.group.visible = false; g.add(car.group);
    cars[i] = { group: car.group, h, r };
  });
  // the running order: third, second (whoever there is), then the winner
  const beats = []; let at = 1.2;
  for (const i of [2, 1]) if (cars[i]) { beats.push({ i, at }); at += 1.5; }
  const winAt = at + 0.9;
  beats.push({ i: 0, at: winAt, win: true });
  // camera keyframes: [time, look-at x on the podium, distance, height, angle round the front]
  const keys = [[0, 0, 26, 7, -0.9]];
  for (const b of beats) if (!b.win) keys.push([b.at - 0.3, STEPS[b.i][0], 8.5, 2.2, STEPS[b.i][0] < 0 ? -0.4 : 0.4]);
  keys.push([winAt - 0.7, 0, 14, 7.5, 0], [winAt + 0.2, 0, 8.5, 2.4, -0.18], [winAt + 6.5, 0, 13, 4.5, 0.95]);
  // confetti cannon from the top step (hidden until the winner lands)
  const n = 520, P = new Float32Array(n * 3), C = new Float32Array(n * 3), V = new Float32Array(n * 3), ph = new Float32Array(n);
  const pal = [0xff8a3d, 0x3d8bff, 0xffd23f, 0x7ed957, 0xff6bcb, 0xffffff].map(c => new THREE.Color(c));
  for (let i = 0; i < n; i++) { const c = pal[i % pal.length]; C.set([c.r, c.g, c.b], i * 3); ph[i] = Math.random() * 6.28; P[i * 3 + 1] = -50; }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(P, 3)); cg.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.42, vertexColors: true }));
  confetti.frustumCulled = false; confetti.visible = false; g.add(confetti);
  // fireworks: three bursts, launched again and again behind the podium
  const fireworks = [];
  for (let k = 0; k < 3; k++) {
    const m = 90, fp = new Float32Array(m * 3), dirs = new Float32Array(m * 3);
    const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    const pts = new THREE.Points(fgeo, new THREE.PointsMaterial({ size: 0.9, transparent: true, opacity: 0, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; pts.visible = false; g.add(pts);
    fireworks.push({ pts, fp, dirs, m, next: winAt + 0.25 + k * 0.45, start: -1, cx: 0, cy: 0, cz: 0, sp: 8 });
  }
  scene.add(g);
  carsGroup.visible = false;
  if (app.ghost) app.ghost.group.visible = false;
  $('#podium-title').textContent = '';
  $('#podium-ui').classList.remove('hidden');
  $('#screen-race').classList.add('podium-on');
  const skip = (e) => {
    if (performance.now() - podium.t0 < 800 || e.repeat) return; // not a key still held from driving
    e.stopImmediatePropagation(); e.preventDefault();
    endPodium(true);
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  const dur = (winAt + 6.5) * 1000;
  podium = { g, head, x: s.p.x, y: s.p.y, z: s.p.z, t0: performance.now(), done, skip, cars, blocks, beats, keys, winAt, dash, top,
    cg, P, V, ph, n, confetti, fireworks, night, shake: 0, drum: podiumDrumroll(winAt), timer: setTimeout(() => endPodium(true), dur) };
}
function podiumTitle(text) {
  const el = $('#podium-title');
  el.textContent = text;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); // play the pop again
}
function podiumLand(b) {
  const p = podium, r = p.cars[b.i]?.r;
  if (!b.win) {
    beep(85, 0.22, 0.3); // thud
    if (r) podiumTitle(`${ordinal(b.i + 1)}  ${r.name}`);
    return;
  }
  // the winner
  p.drum?.stop();
  beep(60, 0.4, 0.4);
  [523, 659, 784].forEach((f) => beep(f, 0.9, 0.09));
  setTimeout(() => beep(1047, 1.3, 0.13), 320);
  p.shake = 1;
  const fl = $('#podium-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
  podiumTitle(r.id === app.myId ? (p.dash ? 'You got to 9LAT2 first!' : 'You win!') : `${r.name} ${p.dash ? 'got to 9LAT2 first!' : 'wins!'}`);
  // the confetti cannon goes off
  const { P, V, n } = p;
  for (let i = 0; i < n; i++) {
    P.set([(Math.random() - 0.5) * 2, 2.6, (Math.random() - 0.5) * 2], i * 3);
    V.set([(Math.random() - 0.5) * 10, 5 + Math.random() * 6, (Math.random() - 0.5) * 10], i * 3);
  }
  p.confetti.visible = true;
  const gold = p.blocks[0].material; gold.emissive.setHex(0xffc23a);
}
function endPodium(showDone) {
  if (!podium) return;
  const p = podium; podium = null;
  clearTimeout(p.timer);
  p.drum?.stop();
  window.removeEventListener('keydown', p.skip, true);
  window.removeEventListener('pointerdown', p.skip, true);
  scene.remove(p.g); disposeTree(p.g);
  carsGroup.visible = true;
  $('#podium-ui').classList.add('hidden');
  $('#podium-flash').classList.remove('go');
  $('#screen-race').classList.remove('podium-on');
  camInit = false;
  if (showDone) p.done();
}
function updatePodium(dt, now) {
  const p = podium, t = (now - p.t0) / 1000, ease = (k) => k * k * (3 - 2 * k);
  // the cars drop onto their steps, bounce, and the winner turns
  for (const b of p.beats) {
    const car = p.cars[b.i]; if (!car) continue;
    const u = t - (b.at - 0.45); // each one falls for 0.45 s and lands on its beat
    if (u < 0) { car.group.visible = false; continue; }
    car.group.visible = true;
    car.group.position.y = u < 0.45 ? car.h + 10 * (1 - (u / 0.45) ** 2) : car.h + Math.abs(Math.sin((u - 0.45) * 9)) * 0.8 * Math.exp(-(u - 0.45) * 5);
    if (b.win && u > 0.45) car.group.rotation.y = (u - 0.45) * 0.6;
    if (!b.landed && u >= 0.45) { b.landed = true; podiumLand(b); }
  }
  const won = t >= p.winAt;
  // confetti: shot up, then fluttering down and starting again at the top
  if (won) {
    const { P, V, ph, n } = p;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      V[k + 1] -= 9.8 * 0.55 * dt; V[k] *= 1 - 1.1 * dt; V[k + 2] *= 1 - 1.1 * dt; if (V[k + 1] < -2.6) V[k + 1] = -2.6;
      P[k] += (V[k] + Math.sin(t * 2.2 + ph[i]) * 0.7) * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt;
      if (P[k + 1] < 0.1) { P[k] = (Math.random() - 0.5) * 16; P[k + 1] = 8 + Math.random() * 3; P[k + 2] = (Math.random() - 0.5) * 12; V[k] = V[k + 2] = 0; V[k + 1] = -2; }
    }
    p.cg.attributes.position.needsUpdate = true;
    // the gold step glows
    const f = clamp((t - p.winAt) / 0.6, 0, 1);
    p.blocks[0].material.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 5) * f;
  }
  // fireworks
  for (const fw of p.fireworks) {
    if (t >= fw.next) {
      fw.start = t; fw.next = t + 1.35;
      fw.cx = (Math.random() - 0.5) * 26; fw.cy = 16 + Math.random() * 9; fw.cz = -8 - Math.random() * 12; fw.sp = 7 + Math.random() * 4;
      for (let i = 0; i < fw.m; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, q = Math.sqrt(1 - u * u); fw.dirs.set([q * Math.cos(a), u, q * Math.sin(a)], i * 3); }
      fw.pts.material.color.setHex([0xffd23f, 0xff6bcb, 0x3d8bff, 0x7ed957, 0xff8a3d][Math.floor(Math.random() * 5)]);
      fw.pts.visible = true;
      beep(120 + Math.random() * 60, 0.12, 0.08);
    }
    if (fw.start < 0) continue;
    const a = t - fw.start, out = fw.sp * (1 - Math.exp(-a * 2.2)) / 2.2 * 2.2;
    for (let i = 0; i < fw.m; i++) { const k = i * 3; fw.fp[k] = fw.cx + fw.dirs[k] * out; fw.fp[k + 1] = fw.cy + fw.dirs[k + 1] * out - 1.6 * a * a; fw.fp[k + 2] = fw.cz + fw.dirs[k + 2] * out; }
    fw.pts.geometry.attributes.position.needsUpdate = true;
    fw.pts.material.opacity = clamp(1 - a / 1.3, 0, 1);
  }
  // the camera: from one step to the next, up for the build-up, in close for the winner, then round
  const K = p.keys; let j = 0;
  while (j < K.length - 2 && t > K[j + 1][0]) j++;
  const k = ease(clamp((t - K[j][0]) / Math.max(0.01, K[j + 1][0] - K[j][0]), 0, 1));
  const [fx, r, h, ang] = [1, 2, 3, 4].map(n => lerp(K[j][n], K[j + 1][n], k));
  const c = Math.cos(p.head), sn = Math.sin(p.head), lx = fx + Math.sin(ang) * r, lz = Math.cos(ang) * r;
  const sh = p.shake; p.shake = Math.max(0, p.shake - dt * 1.6);
  camera.position.set(p.x + lx * c + lz * sn + (Math.random() - 0.5) * sh * 0.6, p.y + h + (Math.random() - 0.5) * sh * 0.6, p.z - lx * sn + lz * c);
  camera.lookAt(p.x + fx * c, p.y + 1.6, p.z - fx * sn);
  camera.near = 0.5; camera.fov = won ? lerp(42, 50, clamp((t - p.winAt) / 2, 0, 1)) : 50; camera.updateProjectionMatrix();
  sun.position.set(p.x + 80, p.y + 140, p.z + 60); sun.target.position.set(p.x, p.y, p.z);
  app.inCockpit = false;
}
// whoever is host gets the button (the host can change if someone leaves)
function resultsButtons() {
  const isHost = app.room?.hostId === app.myId;
  $('#btn-lobby').classList.toggle('hidden', !isHost);
  $('#results-wait').classList.toggle('hidden', isHost);
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
  $('#btn-cam').textContent = app.camMode === 'cockpit' ? 'Camera: cockpit' : 'Camera: chase';
  if (inRace()) raceToast(app.camMode === 'cockpit' ? 'Cockpit camera' : 'Chase camera', 1200);
}

function goHome() {
  endPodium(false);
  setMenu(false);
  $('#results').classList.add('hidden');
  $('#lights').classList.add('hidden');
  $('#countdown').classList.add('hidden');
  $('#dash-nav').classList.add('hidden');
  $('#gate-nav').classList.add('hidden');
  app.phase = 'home';
  app.room = null;
  clearCars();
  history.replaceState(null, '', '/');
  showScreen('home');
}

function showLobby() {
  endPodium(false);
  setMenu(false);
  if (app.phase !== 'lobby') showTip(); // a new tip each time you come into the lobby
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
    chip.innerHTML = `<span class="dot" style="background:${COLOR_CSS[p.color]}"></span>${r.grid ? `<span class="gridpos">P${gi + 1}</span>` : ''}${esc(p.name)}${r.grid && r.times?.[p.id] ? `<span class="gridtime">${fmtTime(r.times[p.id])}</span>` : ''}`;
    list.appendChild(chip);
  });
  const isHost = r.hostId === app.myId;
  $('#btn-start').classList.toggle('hidden', !isHost);
  $('#btn-quali').classList.toggle('hidden', !isHost);
  $('#laps-val').textContent = r.laps || 3;
  for (const id of ['#laps-minus', '#laps-plus']) $(id).classList.toggle('hidden', !isHost);
  $('#secrets').classList.toggle('hidden', !(isHost && app.secrets));
  $('#car-hint').textContent = r.car === 'camry' ? '— Toyota Camry' : '';
  $('#wait-host').classList.toggle('hidden', isHost);
  $('#track-list').classList.toggle('locked', !isHost);
  $('#track-hint').textContent = isHost ? '— you pick' : '— host picks';
  renderRecord();
  document.querySelectorAll('.trackcard').forEach((el, i) => el.classList.toggle('on', i === r.trackId));
  $('#car-list').classList.toggle('locked', !isHost);
  // the car row only shows when there's a choice to make (the rally car is unlocked) or the host picked another car
  const showRally = (isHost && app.rallyOn) || r.car === 'rally';
  $('.carrow').classList.toggle('hidden', !showRally && (r.car || 'open') === 'open');
  $('.carpick[data-car="rally"]').classList.toggle('hidden', !showRally);
  document.querySelectorAll('.carpick').forEach((el) => el.classList.toggle('on', el.dataset.car === (r.car || 'open')));
}

function buildTrackCards() {
  const list = $('#track-list');
  TRACKS.forEach((def, i) => {
    const card = document.createElement('button');
    card.className = 'trackcard';
    card.title = def.blurb;
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 120;
    if (def.theme === 'desert') cv.style.background = '#e2b77c';
    if (def.theme === 'forest') cv.style.background = '#3f7a3a';
    if (def.theme === 'snow') cv.style.background = '#e6edf3';
    if (def.theme === 'night') cv.style.background = '#1b2442';
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
  el.innerHTML = '';
  COLOR_CSS.forEach((css, i) => {
    if (i === LIVERY && !app.liveryOn) return; // the secret livery
    const s = document.createElement('div');
    s.className = 'swatch' + (i === app.color ? ' on' : '') + (i === LIVERY ? ' livery' : '');
    s.style.background = i === LIVERY ? 'linear-gradient(135deg, #13806a 56%, #c6f432 56% 64%, #16191f 64%)' : css;
    s.title = i === LIVERY ? 'Racing green livery' : `Colour ${i + 1}`;
    s.addEventListener('click', () => {
      app.color = i;
      document.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === s));
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

let secretTyped = ''; // the last few keys pressed, checked against SECRET_CODE and RALLY_CODE
app.rallyOn = (() => { try { return localStorage.getItem('dc-rally') === '1'; } catch { return false; } })();
app.liveryOn = (() => { try { return localStorage.getItem('dc-livery') === '1'; } catch { return false; } })();

function wireUI() {
  try {
    const n = localStorage.getItem('dc-name'); if (n) $('#name').value = n;
    const c = localStorage.getItem('dc-color'); if (c != null && CAR_COLORS[+c] && (+c !== LIVERY || app.liveryOn)) app.color = +c;
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
  $('#btn-dash').addEventListener('click', () => { initAudio(); send({ t: 'start', mode: 'dash' }); });
  // what's new
  const seen = (() => { try { return localStorage.getItem('dc-seen'); } catch { return null; } })();
  $('#ver').textContent = 'v' + UPDATES[0].v;
  $('#updates-dot').classList.toggle('hidden', seen === UPDATES[0].v);
  $('#updates-list').innerHTML = UPDATES.map(u => `<h3><span class="tagv">v${esc(u.v)}</span>${esc(u.title)}<small>${esc(u.date)}</small></h3><ul>${u.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('');
  $('#btn-updates').addEventListener('click', () => {
    $('#updates').classList.remove('hidden'); $('#updates-dot').classList.add('hidden');
    try { localStorage.setItem('dc-seen', UPDATES[0].v); } catch {}
  });
  $('#btn-updates-close').addEventListener('click', () => $('#updates').classList.add('hidden'));
  $('#updates').addEventListener('click', (e) => { if (e.target.id === 'updates') $('#updates').classList.add('hidden'); });
  $('#btn-endq').addEventListener('click', (e) => { e.currentTarget.blur(); send({ t: 'endquali' }); });
  $('#lobby-tip').addEventListener('click', (e) => { e.currentTarget.blur(); showTip(); });
  $('#btn-leave').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-resume').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(false); });
  $('#btn-quit').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-cam').addEventListener('click', (e) => { e.currentTarget.blur(); toggleCamera(); });
  $('#btn-cam').textContent = app.camMode === 'cockpit' ? 'Camera: cockpit' : 'Camera: chase';
  // settings: graphics and the expanded map
  const openSettings = (e) => { e?.currentTarget?.blur?.(); $('#map-note').textContent = ''; renderSettings(); $('#settings').classList.remove('hidden'); };
  for (const id of ['#btn-settings', '#btn-settings-lobby', '#btn-settings-pause']) $(id).addEventListener('click', openSettings);
  $('#btn-settings-close').addEventListener('click', () => $('#settings').classList.add('hidden'));
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').classList.add('hidden'); });
  document.querySelectorAll('#seg-gfx button').forEach(b => b.addEventListener('click', () => setGfxMode(b.dataset.v)));
  document.querySelectorAll('#seg-map button').forEach(b => b.addEventListener('click', () => setExpanded(b.dataset.v === 'on')));
  // laps (host only)
  const setLaps = (e, d) => { e.currentTarget.blur(); if (app.room?.hostId === app.myId) send({ t: 'laps', laps: (app.room.laps || 3) + d }); };
  $('#laps-minus').addEventListener('click', (e) => setLaps(e, -1));
  $('#laps-plus').addEventListener('click', (e) => setLaps(e, 1));
  $('#btn-menu').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(true); });
  for (const id of ['#btn-board', '#btn-board-lobby']) $(id).addEventListener('click', (e) => { e.currentTarget.blur(); openBoard(app.room ? app.room.trackId : null); });
  $('#btn-board-close').addEventListener('click', () => $('#board').classList.add('hidden'));
  $('#board-tracks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { board.track = +b.dataset.t; renderBoard(); } });
  for (const id of ['#btn-feedback', '#btn-feedback-pause']) {
    $(id).classList.toggle('hidden', !FEEDBACK_URL);
    $(id).addEventListener('click', (e) => { e.currentTarget.blur(); window.open(FEEDBACK_URL, '_blank', 'noopener'); });
  }
  $('#btn-lobby').addEventListener('click', () => send({ t: 'lobby' }));
  document.querySelectorAll('#seg-sound button').forEach(b => b.addEventListener('click', () => { initAudio(); setSound(b.dataset.v === 'on'); }));
  $('#vol').addEventListener('input', (e) => { initAudio(); setVolume(+e.target.value); });
  for (const id of ['#btn-create', '#btn-join']) $(id).addEventListener('click', initAudio);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Escape' && !$('#settings').classList.contains('hidden')) { $('#settings').classList.add('hidden'); return; }
    if (e.code === 'Escape' && !$('#board').classList.contains('hidden')) { $('#board').classList.add('hidden'); return; }
    if (e.key && e.key.length === 1) {
      secretTyped = (secretTyped + e.key.toUpperCase()).slice(-12);
      if (hashCode(secretTyped.slice(-LIVERY_LEN)) === LIVERY_HASH && app.phase === 'home') {
        secretTyped = '';
        app.liveryOn = !app.liveryOn;
        try { localStorage.setItem('dc-livery', app.liveryOn ? '1' : '0'); } catch {}
        if (!app.liveryOn && app.color === LIVERY) { app.color = 0; try { localStorage.setItem('dc-color', '0'); } catch {} }
        buildSwatches();
        toast(app.liveryOn ? 'Racing green livery unlocked: pick it under Car colour' : 'Racing green livery hidden');
      }
      if (secretTyped.endsWith(RALLY_CODE) && app.phase === 'lobby' && app.room?.hostId === app.myId) {
        secretTyped = '';
        app.rallyOn = !app.rallyOn;
        try { localStorage.setItem('dc-rally', app.rallyOn ? '1' : '0'); } catch {}
        if (!app.rallyOn && app.room.car === 'rally') send({ t: 'car', car: 'open' });
        renderLobby();
        toast(app.rallyOn ? 'Rally car unlocked' : 'Rally car hidden');
      }
      if (secretTyped.endsWith(SECRET_CODE) && app.phase === 'lobby' && app.room?.hostId === app.myId) {
        secretTyped = '';
        app.secrets = !app.secrets;
        renderLobby();
        toast(app.secrets ? 'Secrets unlocked' : 'Secrets hidden');
      }
    }
    if (!e.repeat) initAudio();
    if (e.code === 'KeyM' && !e.repeat) { setSound(!audio.on); if (inRace()) raceToast(audio.on ? 'Sound on' : 'Sound off', 1000); }
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

// How far round the race a car is, for the standings. Progress only counts
// up to the next gate it has to go through: a car that missed a gate stays
// there in the order (instead of jumping about), and cars still behind the
// line at the start are behind the ones that have crossed it.
function raceKey(lap, nextCp, idx) {
  const { N, cps } = app.track, C = cps.length;
  if (!(lap >= 1) || !(nextCp >= 0 && nextCp < C) || !(idx >= 0)) return -N;
  const last = cps[(nextCp + C - 1) % C], seg = (cps[nextCp] - last + N) % N || N;
  let ahead = (idx - last + N) % N;
  if (ahead > N / 2) ahead -= N; // just behind the last gate
  return (lap - 1) * N + last + Math.min(ahead, seg);
}
function standingsOrder() {
  const N = app.track.N;
  const entries = [];
  if (app.local && !app.spectate) {
    entries.push({ id: app.myId, name: app.name, color: app.color, finished: app.finished, place: app.myPlace || 0, lap: app.local.lap, key: raceKey(app.local.lap, app.local.nextCp, app.local.idx), me: true });
  }
  for (const p of app.room?.players || []) {
    if (p.id === app.myId || (p.spec && app.mode !== 'quali')) continue; // joined part-way through: watching, not racing
    const c = app.cars.get(p.id);
    entries.push({ id: p.id, name: p.name, color: p.color, finished: !!c?.finished, place: c?.place || 0, lap: c?.lap || 1, key: c ? raceKey(c.lap, c.cp, Math.round(c.pr * N) % N) : -N, me: false });
  }
  if (app.mode === 'dash' && app.track.goal) {
    // order by how far each car still has to go
    const g = app.track.goal;
    for (const e of entries) {
      const c = e.me ? null : app.cars.get(e.id);
      e.togo = e.me ? Math.hypot(app.local.pos.x - g.x, app.local.pos.z - g.z) : c?.shown ? Math.hypot(c.sx - g.x, c.sz - g.z) : 99999;
      e.key = -e.togo;
    }
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
const textCache = new Map();
function setText(sel, v) {
  v = String(v);
  let e = textCache.get(sel);
  if (!e) textCache.set(sel, e = { el: $(sel), v: null });
  if (e.v !== v) { e.v = v; e.el.textContent = v; }
}
function updateHud(now) {
  const car = app.local;
  if (!car) return;
  setText('#hud-speed', Math.round(Math.abs(car.speed) * 3.6));
  if (app.phase === 'countdown') {
    // F1 start: five red lights come on one by one, then all go out
    const left = app.startAt - Date.now();
    const lights = $('#lights');
    lights.classList.remove('hidden');
    const lit = left > 0 ? clamp(Math.floor((LIGHTS_MS - left) / 650), 0, 5) : 0;
    if (lit !== app.litCount) {
      app.litCount = lit;
      lights.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < lit));
      if (lit > 0) beep(520, 0.18, 0.2);
    }
    if (left <= 0) {
      app.phase = 'racing';
      // the exact start, like the race clock (not this frame, a moment later);
      // or, joining a session that's already going, the moment you joined
      car.lapStart = Math.max(raceStartPerf(), app.joinedRaceAt || 0);
      beep(1040, 0.6, 0.25);
      const el = $('#countdown');
      el.textContent = 'GO!'; el.classList.remove('hidden'); el.classList.add('go');
      setTimeout(() => { el.classList.add('hidden'); lights.classList.add('hidden'); }, 900);
    }
  }
  setText('#hud-best', app.bestLap ? fmtTime(app.bestLap) : '--');
  const gd = app.mode === 'quali' ? app.ghostDelta : null;
  setText('#hud-delta', gd == null ? '' : (gd >= 0 ? '+' : '\u2212') + Math.abs(gd).toFixed(2));
  if (gd != null) { const el = textCache.get('#hud-delta').el; el.classList.toggle('ahead', gd < 0); el.classList.toggle('behind', gd >= 0); }
  if (app.phase === 'racing' || app.phase === 'results') {
    const t = app.mode !== 'quali' && app.finished && !app.spectate ? app.finishTime : Math.max(0, now - raceStartPerf()); // Polytrack mode has no time limit: the clock counts up
    setText('#hud-time', fmtTime(t));
  }
  const goal = app.mode === 'dash' ? app.track.goal : null;
  if (goal) {
    const dx = goal.x - car.pos.x, dz = goal.z - car.pos.z, d = Math.round(Math.hypot(dx, dz));
    setText('#hud-lap', d + 'm');
    setText('#dash-dist', d + ' m');
    $('#dash-arrow').style.transform = `rotate(${(-(Math.atan2(dx, dz) - car.h)).toFixed(2)}rad)`; // points where 9LAT2 is, relative to the nose
  } else setText('#hud-lap', app.mode === 'quali' ? car.lap : Math.min(car.lap, app.laps));
  const missed = !!car.missedGate && app.phase === 'racing' && !app.finished && app.mode !== 'dash';
  $('#gate-nav').classList.toggle('hidden', !missed);
  if (missed) {
    const g = app.track.samples[app.track.cps[car.nextCp]].p, dx = g.x - car.pos.x, dz = g.z - car.pos.z;
    $('#gate-arrow').style.transform = `rotate(${(-(Math.atan2(dx, dz) - car.h)).toFixed(2)}rad)`; // points at the gate you missed
    setText('#gate-dist', Math.round(Math.hypot(dx, dz)) + ' m');
  }
  $('#respawn-tip').classList.toggle('hidden', car.onTrack || missed || app.phase === 'countdown' || app.mode === 'dash');

  if (++hudTick % 6 === 0) {
    const order = standingsOrder();
    const myIdx = order.findIndex(e => e.me);
    if (myIdx < 0) setText('#hud-pos', '-');
    else if (app.finished) setText('#hud-pos', order[myIdx].place || myIdx + 1);
    else setText('#hud-pos', myIdx + 1);
    setText('#hud-pos-of', '/' + order.length);
    const st = $('#standings');
    // a big room: the top eight, then you
    const shown = order.map((e, i) => [e, i]).filter(([e, i]) => order.length <= 10 || i < 8 || e.me);
    const html = shown.map(([e, i]) =>
      `<div class="standing${e.me ? ' me' : ''}${e.finished ? ' done' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS[e.color]}"></span><span>${esc(e.name)}</span><span class="lap">${app.mode === 'quali' ? (e.best ? fmtTime(e.best) : '--') : e.finished ? 'FIN' : app.mode === 'dash' ? (e.togo < 99999 ? Math.round(e.togo) + 'm' : '--') : 'L' + Math.min(e.lap, app.laps)}</span></div>`
    ).join('');
    if (html !== st._html) { st._html = html; st.innerHTML = html; }
  }

  // glow the next gate
  const gates = app.track.gateMats;
  const nextGate = car.nextCp - 1;
  if (app.nextCpMesh !== nextGate) {
    gates.forEach((m, i) => { m.emissive.setHex(i === nextGate ? 0xff6a00 : 0x000000); m.color.setHex(i === nextGate ? 0xffc14a : 0xffa030); });
    app.nextCpMesh = nextGate;
  }

  if (hudTick % 2 === 0) drawMinimap();
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
  if (app.mode === 'dash' && app.track.goal && inRace()) {
    const g = app.track.goal, x = clamp(g.x * sc + ox, 8, mm.width - 8), y = clamp(g.z * sc + oz, 8, mm.height - 8);
    mmCtx.fillStyle = '#ffd23f'; mmCtx.strokeStyle = '#1d2230'; mmCtx.lineWidth = 2;
    mmCtx.fillRect(x - 6, y - 6, 12, 12); mmCtx.strokeRect(x - 6, y - 6, 12, 12);
  }
  // your next gate: an orange bar across the track
  if (app.local && app.mode !== 'dash' && app.phase === 'racing' && !app.finished) {
    const s = app.track.samples[app.track.cps[app.local.nextCp]], hw = app.track.hw + 5;
    mmCtx.beginPath();
    mmCtx.moveTo((s.p.x + s.left.x * hw) * sc + ox, (s.p.z + s.left.z * hw) * sc + oz);
    mmCtx.lineTo((s.p.x - s.left.x * hw) * sc + ox, (s.p.z - s.left.z * hw) * sc + oz);
    mmCtx.lineCap = 'butt'; mmCtx.strokeStyle = '#1d2230'; mmCtx.lineWidth = 7; mmCtx.stroke();
    mmCtx.strokeStyle = app.local.missedGate ? '#ff3b30' : '#ff8a3d'; mmCtx.lineWidth = 4; mmCtx.stroke();
    mmCtx.lineCap = 'round';
  }
  for (const c of app.cars.values()) if (c.mesh.group.visible) {
    if (c.spec) mmCtx.globalAlpha = 0.35; // a spectator, just driving around
    dot(c.mesh.group.position.x, c.mesh.group.position.z, COLOR_CSS[c.color], 4);
    mmCtx.globalAlpha = 1;
  }
  if (app.ghostOn && app.ghost) { // your qualifying ghost: a pale dot with a blue ring, unlike any real car's
    const gp = app.ghost.group.position;
    mmCtx.beginPath(); mmCtx.arc(gp.x * sc + ox, gp.z * sc + oz, 4.5, 0, Math.PI * 2);
    mmCtx.fillStyle = 'rgba(255,255,255,0.6)'; mmCtx.fill(); mmCtx.strokeStyle = '#3d8bff'; mmCtx.lineWidth = 2.5; mmCtx.stroke();
  }
  if (app.local) dot(app.local.pos.x, app.local.pos.z, COLOR_CSS[app.color], 6);
}

// ---------------------------------------------------------------------------
// sound: a synthesised engine (two oscillators through a low-pass filter,
// pitched by simulated gears), tyre screech and gravel rumble from filtered
// noise, and start-light beeps. Nothing is loaded from anywhere.
// ---------------------------------------------------------------------------
const audio = { ctx: null, nodes: null, on: true, vol: 1, gear: 0, rpm: 0 };
try { const v = localStorage.getItem('dc-vol'); if (v !== null && +v >= 0 && +v <= 100) audio.vol = +v / 100; } catch {}
const masterLevel = () => (audio.on ? 0.6 * audio.vol : 0);
try { audio.on = localStorage.getItem('dc-sound') !== 'off'; } catch {}

function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const c = new AC();
  const master = c.createGain(); master.gain.value = masterLevel(); master.connect(c.destination);
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
  // helicopter: low noise chopped by the rotor
  const lp3 = c.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 240;
  const chop = c.createGain(); chop.gain.value = 0.5;
  const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 13;
  const lfoG = c.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG).connect(chop.gain); lfo.start();
  const gH = c.createGain(); gH.gain.value = 0; nz.connect(lp3).connect(chop).connect(gH).connect(master);
  audio.ctx = c; audio.nodes = { master, eng, lp, o1, o2, gS, gG, gH };
}
function setSound(on) {
  audio.on = on;
  try { localStorage.setItem('dc-sound', on ? 'on' : 'off'); } catch {}
  if (audio.nodes) audio.nodes.master.gain.setTargetAtTime(masterLevel(), audio.ctx.currentTime, 0.05);
  renderSettings();
}
// the volume slider (0-100): turning it up also turns the sound on
function setVolume(pct) {
  audio.vol = clamp(pct, 0, 100) / 100;
  try { localStorage.setItem('dc-vol', String(Math.round(audio.vol * 100))); } catch {}
  if (audio.vol > 0 && !audio.on) { setSound(true); return; }
  if (audio.nodes) audio.nodes.master.gain.setTargetAtTime(masterLevel(), audio.ctx.currentTime, 0.05);
  renderSettings();
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
  const hd = app.heli ? Math.max(0, 1 - app.heli.distanceTo(car.pos) / 150) : 0;
  n.gH.gain.setTargetAtTime(hd * hd * 0.5, t, 0.15);
}
function quietAudio() {
  if (!audio.nodes) return;
  const t = audio.ctx.currentTime;
  audio.nodes.eng.gain.setTargetAtTime(0, t, 0.2);
  audio.nodes.gS.gain.setTargetAtTime(0, t, 0.1);
  audio.nodes.gG.gain.setTargetAtTime(0, t, 0.1);
  audio.nodes.gH.gain.setTargetAtTime(0, t, 0.2);
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  watchFrameRate(now - last, now);
  last = now;

  if (app.local && (app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results')) {
    const canDrive = !app.menuOpen && (app.phase === 'racing' || (app.phase === 'results' && app.finished));
    stepLocal(app.local, dt, canDrive);
    stepRemotes(now, dt);
    if (app.mode === 'quali' && app.phase === 'racing') {
      // The ghost lap is timed from the start line, not from the grid: the
      // first lap only starts recording once the car has crossed the line.
      // (Recording from the grid made the ghost trail behind you, out of sight.)
      const c = app.local;
      if (app.recFrom == null && c.idx < app.track.N / 2) { app.recFrom = now; app.rec = []; }
      if (app.recFrom != null) {
        const r = app.rec, t = now - app.recFrom;
        if (!r.length || t - r[r.length - 1].t >= 50) r.push({ t, x: c.pos.x, y: c.pos.y, z: c.pos.z, h: c.h, i: c.idx });
      }
    }
    updateGhost(now);
    updateHud(now);
    updateAudio(app.local, dt);
    if (now - app.lastSend >= 1000 / SEND_HZ - 4 && app.phase !== 'results') {
      app.lastSend = now;
      const c = app.local, r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
      const s = [Math.round(now), r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r3(c.h), r2(c.vx), r2(c.vz), r2(c.yawRate), r3(c.gPitch), r3(c.gRoll), c.lap, c.nextCp, Math.round(c.idx / app.track.N * 1e4) / 1e4, c.braking ? 1 : 0, r3(c.lPitch), r3(c.lRoll)];
      if (!app.pairStates) send({ t: 'state', s });
      // two positions to a message: half the messages, a touch less smooth
      else if (app.heldState && now - app.heldState[0] < 100) { send({ t: 'state', q: app.heldState, s }); app.heldState = null; }
      else app.heldState = s;
    }
  }
  if (!app.local || app.phase === 'home' || app.phase === 'lobby') quietAudio();
  for (const f of anim) f(now / 1000, dt);
  updateDust(dt);
  if (podium) updatePodium(dt, now);
  updateCamera(dt);
  app.camHook?.(camera); // debugging: lets the console place the camera
  renderFrame();
}

// The scene, then (in cockpit view) the car's cabin on top of it with its own
// depth, so the solid body can't hide the dash or the steering wheel.
function renderFrame() {
  renderer.render(scene, camera);
  if (!app.inCockpit || !app.local?.mesh.interior) return;
  const bg = scene.background;
  scene.background = null;
  renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
  renderer.clearDepth();
  camera.layers.set(1);
  renderer.render(scene, camera);
  camera.layers.set(0);
  renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
  scene.background = bg;
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
buildWorld(0);
wireUI();
window.__dc = app; app.gfx = gfx; app.scene = scene; app.renderer = renderer; app.makeCarMesh = makeCarMesh; // handy for poking at the game from the console
$('#btn-create').disabled = true; $('#btn-join').disabled = true;
connect();
requestAnimationFrame(frame);
