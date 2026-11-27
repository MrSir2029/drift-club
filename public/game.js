import * as THREE from 'three';
import { TRACKS, buildTrack, locate, startSlot, CHECKPOINT_COUNT } from '/tracks.js';
import { UPDATES, POLL } from '/updates.js';

// Has this browser opened the game before? (Asked first thing, before the game
// saves any settings of its own: What's new opens by itself after an update
// for someone coming back, not for someone here for the first time.)
const VISITED_BEFORE = (() => { try { return localStorage.getItem('dc-defaults') != null; } catch { return false; } })();

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------
// Each is the main colour of a livery in a famous Formula 1 team's colours (TEAM, below): red, papaya, yellow, bright
// green, silver, blue, navy, pink, white, black, (brown: not offered), sky blue. Until 4.0 they were plain colours,
// with teal where the silver is and purple where the navy is.
const CAR_COLORS = [0xe10600, 0xff8000, 0xffd200, 0x3fd94a, 0xb8c0c8, 0x1463d8, 0x1b2757, 0xff87bc, 0xf5f5f0, 0x15181f, 0x8b5a2b, 0x7cc7f2, 0x13806a, 0xf0b02e]; // the last two: the secret racing green livery (LIVERY_HASH), and the Drift King's gold (KING)
const COLOR_CSS = CAR_COLORS.map(c => '#' + c.toString(16).padStart(6, '0'));
// the colours on the home screen: all but brown (10), which was taken out so the
// secret livery fits on the same row; the numbers don't change
const PICKER_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11];
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
  // the beach: sand down to a turquoise sea (the track's `sea`), green higher
  // up, palms, islands offshore. lo is the sand, hi the grass.
  beach: { sky: 0x86d6f7, skyLight: 0xe4f7ff, bounce: 0xd8c08e, lo: 0xead49e, hi: 0x7fbf58, rock: 0xa89e86, verge: 0xe2cc95, gravelVerge: 0xe2cc95, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0x5aa456, noise: 1 },
  // a city at night: dark streets, office blocks with lit windows, neon signs
  city: { sky: 0x0a1028, skyLight: 0x56638f, bounce: 0x171a24, lo: 0x2b2f37, hi: 0x343943, rock: 0x474c57, verge: 0x7a7f89, gravelVerge: 0x7a7f89, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0x10162a, noise: 0.12, ease: 14, night: true, hemiI: 0.95, sunI: 0.6, sunColor: 0xa9c0ff },
  // a shopping centre and the streets round it, by day: flat paved ground, no countryside
  mall: { sky: 0x8ad4f5, skyLight: 0xdff1ff, bounce: 0x9aa0aa, lo: 0x8d939d, hi: 0x8d939d, rock: 0x7c8696, verge: 0x9aa0aa, gravelVerge: 0x9aa0aa, road: 0xb49c70, curbs: [0x7d6d52, 0xe9dec4], hills: 0x7aa070, noise: 0, ease: 14 },
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
// The Drift King's own livery (colour 13): gold over black with a crimson line, a crown behind the driver and
// DRIFT KING on the rear wing. Nobody picks it. It goes on the car of whoever leads the Drift King championship,
// by name like the crown on the leaderboard, whatever colour they chose, and comes off when someone takes the lead.
const KING = 13;
const isDriftKing = (name) => !!(name && app.king && String(name).toLowerCase() === app.king);
// The sponsor lettering on that livery. Made-up names: no real brands.
const SPONSORS = { pods: 'DRIFT CLUB', cover: '9MILE', wing: '9LAT2' };
// Paint and lettering laid flat on the car's blocks, so nothing pokes out of
// the bodywork or sinks into it. q = four corners as someone looking at it
// sees them: bottom-left, bottom-right, top-right, top-left. Paint sits 3 mm off
// the surface, and lettering 3 mm further out, so lettering on paint (DRIFT CLUB
// on the black) is never half hidden by it; lettering gets a canvas the shape of its patch.
const textMats = new Map(); // lettering, shared between cars with the same words
// A 2D canvas drawing (lettering, the floodlight pools, name tags, podium
// numbers) as a texture with clean edges. Handed over as a canvas, the browser
// divides each pixel's colour by its alpha, and where the alpha is tiny that
// turns rounding into bright random colours; Macs (Apple's graphics) then
// showed coloured specks in the floodlight pools and holes in lettering. So
// each pixel keeps its alpha but takes its colour from the solid pixels round
// it (or the one colour given), and the smaller copies used further away are
// made here rather than by the graphics chip.
function cleanTexture(c, rgb, mips = true) {
  const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) d.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // bottom row first
  if (rgb) for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; }
  else bleedColours(d, w, h);
  const tex = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  if (mips) { tex.mipmaps = mipChain(d, w, h); tex.minFilter = THREE.LinearMipmapLinearFilter; } else tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
// Faint pixels (alpha under 64) take the colour of their most solid neighbour,
// spreading out a few pixels from the drawing.
function bleedColours(d, w, h) {
  let ok = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ok[i] = d[i * 4 + 3] >= 64 ? 1 : 0;
  for (let pass = 0; pass < 6; pass++) {
    const next = ok.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (ok[i]) continue;
      let best = -1, ba = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (ok[j] && d[j * 4 + 3] > ba) { ba = d[j * 4 + 3]; best = j; }
      }
      if (best >= 0) { d[i * 4] = d[best * 4]; d[i * 4 + 1] = d[best * 4 + 1]; d[i * 4 + 2] = d[best * 4 + 2]; next[i] = 1; }
    }
    ok = next;
  }
}
// Every smaller copy down to 1x1: each pixel the average of four, colours
// weighted by how solid they are, so faint pixels can't tint the result.
function mipChain(d0, w0, h0) {
  const levels = [{ data: d0, width: w0, height: h0 }];
  let d = d0, w = w0, h = h0;
  while (w > 1 || h > 1) {
    const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1), o = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (let k = 0; k < 4; k++) {
        const i = (Math.min(h - 1, y * 2 + (k >> 1)) * w + Math.min(w - 1, x * 2 + (k & 1))) * 4, al = d[i + 3];
        r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2];
      }
      const j = (y * W + x) * 4;
      if (a) { o[j] = r / a; o[j + 1] = g / a; o[j + 2] = b / a; } else { o[j] = r0 / 4; o[j + 1] = g0 / 4; o[j + 2] = b0 / 4; }
      o[j + 3] = (a + 2) / 4;
    }
    levels.push({ data: o, width: W, height: H }); d = o; w = W; h = H;
  }
  return levels;
}
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
      const tex = cleanTexture(c, [1, 3, 5].map(k => parseInt(ink.slice(k, k + 2), 16))); tex.anisotropy = 8;
      mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
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
// -x edge) to +1. Lettering reads from in front of the car, or with driver
// set, from the cockpit.
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
// stands out against it, the driver's name on the sidepods, their race number
// (random, or the one they typed) on the engine cover and on the nose (it
// reads from in front, like on a real F1 car), and DRIFT CLUB once, on the rear wing endplates. The secret livery adds its sponsors and lime trim.
const POD = [0.62, 0.44, 1.45, null, [0.35, 0.5, -0.028], 0.7, 0.45, -0.375];
const TUB = [0.78, 0.56, 2.3, [0.6, 0.58, -0.05], null, 0, 0.5, 0.85];
const NOSE = [0.468, 0.325, 1.25, [0.45, 0.42, -0.1], null, 0, 0.45, 2.62];
const COVER = [0.56, 0.66, 2.1, null, [0.28, 0.3, -0.18], 0, 0.72, -1.15];
const PLATE = [0.045, 0.22, 0.85, null, null, 0.6, 1.35, -2.25];
const AIRBOX = [0.34, 0.32, 2.0, null, [0.1, 0.469, -0.475], 0, 1.2, -1.075]; // the airbox running back into the fin
const FRONT_PLATE = [0.05, 0.3, 0.62, [1, 0.6, -0.05], null, 1.0, 0.27, 3.12];
// the pinstripe for each car colour (CAR_COLORS order): for the colours with no livery of their own below (brown, the
// secret livery, the Drift King's)
const STRIPES = [0xffffff, 0x1d2b5c, 0x1d2230, 0x1d2b5c, 0xff8a3d, 0xff8a3d, 0xffd23f, 0xffffff, 0xe6453a, 0xd9b44a, 0xf3e3c3, 0x1d2b5c, 0xc6f432, 0xb3261e];
// Every colour a player can pick is a livery in the colours of a famous Formula 1 team (the owner: "have every livery
// look like famous f1 team"). The paint and where it goes, and nothing else: no team's name, badge or sponsors (cars
// carry made-up names only: DRIFT CLUB, the driver's name and number).
//   second: what sweeps in over the back of the sidepods and the engine cover, and the rear wing's endplates (the
//           same as the body where the car is one colour all over)
//   stripe: the pinstripe along that split, down the nose and round the cockpit
//   tip: the nose tip (the stripe's colour if not given)   nose: a band over the top of the nose
//   air: the sides of the airbox                           wing: the upper flaps of both wings (the body's colour if not given)
//   helmet: the driver's helmet, and the band on the tyres rim: the wheels   accent: the small top flap of the front wing, the mirrors
const TEAM = {
  0: { second: 0x15181f, stripe: 0xffffff, tip: 0xffd800, air: 0xffffff, helmet: 0xffd800 },                                                    // red, black behind, white line and airbox, a touch of yellow: Ferrari
  1: { second: 0x23272e, stripe: 0x47c7fc, air: 0x23272e, helmet: 0x47c7fc, accent: 0x23272e },                                                 // papaya into anthracite with a blue line: McLaren
  2: { second: 0x15181f, stripe: 0x15181f, tip: 0x15181f, nose: 0x15181f, wing: 0x15181f, helmet: 0xe10600 },                                   // yellow and black, black nose and wings: Jordan
  3: { second: 0x15181f, stripe: 0xffffff, wing: 0x15181f, helmet: 0xffffff },                                                                  // bright green into black: Sauber
  4: { second: 0x15181f, stripe: 0x00d2be, tip: 0x00d2be, air: 0x15181f, helmet: 0x00d2be, rim: 0x15181f },                                     // silver into black with a teal line: Mercedes
  5: { second: 0xf5f5f0, stripe: 0xe10600, helmet: 0xf5f5f0 },                                                                                  // blue and white with a red line: Williams
  6: { second: 0x1b2757, stripe: 0xe21b2c, tip: 0xffcc00, nose: 0xffcc00, air: 0xffcc00, helmet: 0xe21b2c, accent: 0xe21b2c },                  // navy all over, red line, yellow nose and airbox: Red Bull
  7: { second: 0x1463d8, stripe: 0xffffff, helmet: 0x1463d8, accent: 0x1463d8 },                                                                // pink into blue: Alpine's pink car
  8: { second: 0x15181f, stripe: 0xe10600, tip: 0xe10600, air: 0x15181f, helmet: 0xe10600 },                                                    // white into black with a red line: Haas
  9: { second: 0x15181f, stripe: 0xd9b44a, tip: 0xd9b44a, air: 0xd9b44a, helmet: 0xd9b44a, rim: 0xd9b44a, accent: 0xd9b44a },                   // black and gold: Lotus
  11: { second: 0xffd200, stripe: 0x1d2b5c, helmet: 0xffd200, accent: 0x1d2b5c },                                                               // sky blue into yellow: Renault's 2005 and 2006 cars
};
const luminance = (c) => (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
// only if the server didn't give one (an older server): one from the name
function raceNumber(name) { let h = 7; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 2 + (h % 98); }
function paintLivery(K, g, colorIdx, name, raceNum) {
  const secret = K.livery, twoTone = secret || K.king;
  const stripe = K.stripe;
  const ink = K.lightCar ? '#1d2230' : '#f2f5f0'; // lettering on the car's own colour
  const num = String(raceNum ?? (secret ? 18 : raceNumber(name)));
  const patches = [], lettering = (m) => patches.push(m);
  for (const sx of [-1, 1]) {
    if (twoTone) {
      // green on top, black underneath, a level lime line (like the real car); the Drift King's is gold over black with a crimson line
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
      // (K.second: black, or the livery's second colour; none where the car is one colour all over)
      onPanel(g, NOSE, sx, 0, 0.9, 0.3, 0.365, stripe);
      onPanel(g, TUB, sx, 0.29, 1, 0.3, 0.365, stripe);
      if (!K.plain) onPanel(g, POD, sx, 0, 1, 0, [0.88, 0.36], K.second);
      onPanel(g, POD, sx, 0, 1, [0.88, 0.36], [0.95, 0.43], stripe);
      if (!K.plain) onPanel(g, COVER, sx, 0, 0.524, 0, [0.88, 0.21], K.second);
      onPanel(g, COVER, sx, 0, 0.524, [0.88, 0.21], [0.95, 0.28], stripe);
      onPanel(g, PLATE, sx, 0, 1, 0, 1, K.second);              // the rear wing's endplates
      if (K.air) onPanel(g, AIRBOX, sx, 0.62, 1, 0, 1, K.air);  // the airbox's sides
    }
    onPanel(g, FRONT_PLATE, sx, 0, 1, 0.82, 0.93, stripe);   // the same colour on the front wing endplates
    K.box(0.48, 0.022, 0.06, stripe, sx * 0.72, 0.631, 0.36, false); // and on each sidepod intake
    // what you see from the cockpit: pinstripes down both top edges of the tub and nose
    onTop(g, TUB, 0.4, 1, sx * 0.72, sx * 0.86, stripe);
    onTop(g, NOSE, 0, 0.96, sx * 0.72, sx * 0.86, stripe); // (meeting the tub's without a step)
    if (twoTone) onPanel(g, AIRBOX, sx, 0.62, 1, 0, 1, K.carbon); // black airbox sides (the front of the spine)
    if (secret) {
      lettering(onPanel(g, COVER, sx, 0.58, 0.85, 0.748, 0.875, null, SPONSORS.cover));
      lettering(onPanel(g, PLATE, sx, 0.06, 0.94, 1.27, 1.43, null, SPONSORS.wing));
      lettering(onPanel(g, NOSE, sx, 0.12, 0.6, 0.345, 0.41, null, SPONSORS.pods));
    } else {
      lettering(onPanel(g, PLATE, sx, 0.06, 0.94, 1.27, 1.43, null, K.king ? 'DRIFT KING' : SPONSORS.pods, K.plateInk)); // DRIFT CLUB, big on the rear wing endplates (DRIFT KING on the champion's)
      lettering(onPanel(g, COVER, sx, 0.6, 0.85, 0.745, 0.88, null, num, ink)); // the race number on the engine cover
    }
  }
  // the driver's name on each sidepod, up at the front in the car's colour (on the
  // secret livery, above its level lime line), clear of the black and the intake
  if (name) for (const sx of [-1, 1]) lettering(onPanel(g, POD, sx, 0.55, 0.97, 0.505, 0.6, null, name.toUpperCase(), ink));
  if (K.noseBand) onTop(g, NOSE, 0.42, 0.96, -0.7, 0.7, K.noseBand); // a livery's band over the top of the nose, between the pinstripes
  lettering(onTop(g, TUB, 0.8, 0.96, -0.55, 0.55, null, num, ink)); // and on the nose, reading from in front like a real F1 car's
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
// feedback. The Feedback button (on the home screen, beside Settings) stays
// hidden while this is empty.
const FEEDBACK_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf5U42l6jkWDvBuiG2E4ggpI6ZcHBNJH4_4nfAL_sbAMMtnnA/viewform';
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
  color: PICKER_COLORS[Math.floor(Math.random() * PICKER_COLORS.length)],
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

// expanded map (landmarks, blimp): off unless the player turns it on
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
try { app.recGhostOn = localStorage.getItem('dc-recghost') === 'on'; } catch { app.recGhostOn = false; } // the record holder's ghost in Polytrack mode: off unless you've switched it on (the owner: "off by default")

// (the landmarks used to hide stars to find; forget the ones found)
try { localStorage.removeItem('dc-found'); } catch {}

// ---- controls: which key does what. Players can change them under Settings
// (Change keys), up to two keys an action, kept in this browser. Esc is
// always the menu. Keys are physical positions (KeyW is the key where W is on
// an English keyboard), so WASD works on any layout.
const ACTIONS = [
  ['up', 'Accelerate', ['ArrowUp', 'KeyW']],
  ['down', 'Brake, reverse', ['ArrowDown', 'KeyS']],
  ['left', 'Steer left', ['ArrowLeft', 'KeyA']],
  ['right', 'Steer right', ['ArrowRight', 'KeyD']],
  ['hand', 'Handbrake', ['Space']],
  ['reset', 'Reset to the last gate', ['KeyR']],
  ['restart', 'Restart your run (Polytrack mode)', ['Backspace']],
  ['cam', 'Camera', ['KeyC']],
  ['mute', 'Sound on / off', ['KeyM']],
];
const defaultBinds = () => Object.fromEntries(ACTIONS.map(([a, , keys]) => [a, [...keys]]));
app.bind = defaultBinds();
try {
  const b = JSON.parse(localStorage.getItem('dc-keys') || 'null');
  if (b && typeof b === 'object' && !Array.isArray(b)) for (const [a] of ACTIONS) if (Array.isArray(b[a])) app.bind[a] = b[a].filter(c => typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c)).slice(0, 2);
} catch {}
app.touch = {};                                             // the same actions, held on the touch controls (setupTouch)
const held = (a) => !!app.touch[a] || app.bind[a].some(c => app.keys[c]); // is that action's key (or its button on a touch screen) down?
const isKey = (a, code) => app.bind[a].includes(code);      // is this key one of that action's?
const KEY_NAMES = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Backspace: 'Backspace', Enter: 'Enter', Tab: 'Tab', CapsLock: 'Caps Lock', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', PageUp: 'Page Up', PageDown: 'Page Down', IntlBackslash: '\\' };
function keyName(c) {
  if (!c) return '—';
  if (KEY_NAMES[c]) return KEY_NAMES[c];
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (c.startsWith('Numpad')) return 'Num ' + c.slice(6);
  const m = /^(Shift|Control|Alt)(Left|Right)$/.exec(c);
  return m ? `${m[2]} ${m[1] === 'Control' ? 'Ctrl' : m[1]}` : c;
}
const keyOf = (a) => keyName(app.bind[a][0]); // the first key for an action, for hints

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
const SEA_SAND = new THREE.Color(0xc9b17c), SEA_DEEP = new THREE.Color(0x1f5d70); // the sea bed: wet sand, and deep water
const WADE = 0.55;          // out at sea cars wade this deep (the sea bed is too deep to drive on)

// What stands under a spot `y` high: the ground, or the flat roof of one of
// the track's own buildings (`roofs` in tracks.js, each [x0, z0, x1, z1,
// height]: Westfield's car park) for anything already up at its level.
function surfaceAt(def, x, z, y) {
  let g = terrainHeight(x, z);
  if (y != null && def?.roofs) for (const r of def.roofs) if (x > r[0] && x < r[2] && z > r[1] && z < r[3] && y > r[4] - 2.5) g = Math.max(g, r[4]);
  return g;
}
// The ground a car rides on: the terrain (or a roof it's already up on), or
// out at sea, wading depth. Give y to count roofs.
function groundAt(x, z, y) {
  const T = app.track, g = surfaceAt(T?.def, x, z, y), sea = T?.sea;
  return sea ? Math.max(g, sea.level - WADE) : g;
}
// is this spot under water? (from the heights before any landmark levelled
// the ground, so it's the same for every player)
function wetAt(x, z) {
  const T = TERRAIN; if (!T.wet) return false;
  const i = clamp(Math.round((x - T.origin.x) / T.cell), 0, T.seg), j = clamp(Math.round((z - T.origin.z) / T.cell), 0, T.seg);
  return T.wet[j * (T.seg + 1) + i] === 1;
}

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
  // (a track can say that road above a certain height stands on piers, like a
  // car park roof and its ramps: the ground takes no notice of that road)
  const onPiers = (s) => track.def.deckAbove != null && s.p.y > track.def.deckAbove;
  for (const s of samples) {
    s.grade = s.t.y / Math.max(0.001, Math.hypot(s.t.x, s.t.z)); // rise per metre along the road
    if (onPiers(s)) continue;
    const k = bkey(Math.floor(s.p.x / R), Math.floor(s.p.z / R));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(s);
  }
  const coarse = samples.filter((s, i) => i % 4 === 0 && !onPiers(s));
  const amp = track.look?.noise ?? 1; // the desert's hills roll bigger
  const noise = (x, z) => (Math.sin(x * 0.011 + 0.3) * Math.cos(z * 0.009) * 8 + Math.sin(x * 0.027 + 1.7) * Math.sin(z * 0.023 + 0.4) * 3 + Math.sin(x * 0.06) * Math.cos(z * 0.07) * 0.8) * amp;
  const smooth = (t) => t * t * (3 - 2 * t);
  // The sea (Noosa Heads): more than `shore` metres from any road, and past the
  // line `from` metres behind the start straight (z < -from), the ground runs
  // down to the sea bed. The road never comes that close, so the guarantee
  // below holds. Inland the hills sit a little higher, so few hollows flood
  // (`base` and `hills` set how high and how rolling; `sand` and `fade`, how
  // far above the water the sand goes before it turns to grass).
  const sea = track.sea = track.def.sea ? { ...track.def.sea, bed: track.def.sea.level - 5 } : null;

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
    const far = smooth(clamp((Math.sqrt(best) - R) / (track.look?.ease ?? 90), 0, 1)); // (in a city, raised road drops straight to the street)
    H[j * n1 + i] = lerp(yN - ROAD_CLEARANCE - 0.3, sea ? noise(x, z) * (sea.hills ?? 0.7) + (sea.base ?? 2.5) : noise(x, z), far);
    if (sea) H[j * n1 + i] = lerp(H[j * n1 + i], sea.bed, smooth(clamp((Math.sqrt(best) - sea.shore) / 30, 0, 1)) * smooth(clamp((-z - sea.from) / 40, 0, 1)));
  }
  // where the water is, before any landmark levels the ground: the same for
  // every player, so everyone puts the palms and huts in the same places
  if (sea) { T.wet = new Uint8Array(n1 * n1); for (let k = 0; k < n1 * n1; k++) T.wet[k] = H[k] < sea.level + 0.6 ? 1 : 0; } else T.wet = null;

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
  // The beach has the sea instead of a lake; the city keeps only what fits in
  // a city: 9LAT2, the radio mast and a fairground in a park.
  const city = track.theme === 'city' || !!track.def.urban; // (and any other track in a town)
  for (const [name, r, mode] of [['lake', 30, ''], ['lat9', 18, track.def.goalFar ? 'remote' : 'far'], ['castle', 23, 'high'], ['fair', 27, 'near'], ['village', 31, ''], ['stones', 12, ''], ['camp', 13, ''], ['windmill', 9, ''], ['mast', 7, 'high']]) {
    if ((sea || city) && name === 'lake') continue;
    if (city && !['lat9', 'mast', 'fair'].includes(name)) continue;
    let best = null;
    for (let k = 0; k < (mode === 'remote' ? 300 : 140); k++) {
      // 9LAT2 ('far' and 'remote') looks only in the outer ring of the map
      const a = srnd() * 6.2832, d = (mode === 'remote' || mode === 'far' ? 0.72 + 0.28 * srnd() : Math.sqrt(srnd())) * (lim.r - r - 24);
      const x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
      const gap = roadGap(track, x, z);
      if (gap < hw + r + 26 || taken.some(o => Math.hypot(o.x - x, o.z - z) < o.r + r + 26)) continue;
      const y = terrainHeight(x, z);
      if (sea && y < sea.level + 1.2) continue; // not out at sea
      if (city && insideLoop(track, x, z)) continue; // the walls close off the middle of the city circuit
      if ([...(track.def.blocks || []), ...(track.def.streets || [])].some(b => x > b[0] - r - 12 && x < b[2] + r + 12 && z > b[1] - r - 12 && z < b[3] + r + 12)) continue; // not on the track's own buildings or streets
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
  // (there used to be a castle: its spot is still picked, so everything picked
  // after it stays where it was, but nothing is built there now)
  delete sites.castle;
  // (and the shopping centre had the fairground, behind its car park, where the owner found it out of place. Its
  // spot is still picked and still kept clear, so the mast and the town round about stay where they were: it's a
  // park now, which buildMall plants)
  if (track.theme === 'mall' && sites.fair) { sites.park = sites.fair; delete sites.fair; }
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
  // (On the beach that level is the sea bed: the land is an island.)
  let edgeSum = 0, edgeN = 0;
  for (let i = 0; i <= T.seg; i++) for (const j of [0, T.seg]) { edgeSum += H[j * n1 + i] + H[i * n1 + j]; edgeN += 2; }
  const edgeY = sea ? sea.bed : edgeSum / edgeN, band = Math.round(60 / T.cell);
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
    const e = Math.min(i, j, T.seg - i, T.seg - j);
    if (e < band) { const k = j * n1 + i, f = smooth(e / band); H[k] = edgeY + (H[k] - edgeY) * f; if (T.wet && H[k] < sea.level + 0.6) T.wet[k] = 1; } // no landmark reaches out this far
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
    // (on the beach: sand up to a couple of metres above the sea, grass above that)
    c.copy(lo).lerp(hi, sea ? clamp((y - sea.level - (sea.sand ?? 1.6)) / (sea.fade ?? 2.6), 0, 1) : clamp((y + 2) / 16, 0, 1)).multiplyScalar(0.96 + 0.05 * Math.sin(pos.getX(k) * 0.021 + 1.3) * Math.cos(pos.getZ(k) * 0.017));
    c.lerp(rock, clamp((steep - 0.55) / 0.6, 0, 1));
    if (track.lake && y < track.lake.level + 0.25 && (pos.getX(k) - track.lake.x) ** 2 + (pos.getZ(k) - track.lake.z) ** 2 < 1100) c.set(0xd9c48a); // sandy lake bed
    if (sea && y < sea.level + 0.25) c.copy(SEA_SAND).lerp(SEA_DEEP, clamp((sea.level - y) / 4, 0, 1)); // wet sand, then the sea bed darkening with depth
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
  T.far = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: sea ? SEA_DEEP : new THREE.Color(look.lo).lerp(new THREE.Color(look.hi), clamp((edgeY + 2) / 16, 0, 1)).multiplyScalar(0.96) }));
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
  document.querySelectorAll('#seg-recghost button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'on') === app.recGhostOn));
  $('#row-recghost').classList.toggle('hidden', !recGhostReady()); // (not on offer until every track's record has its line: see wantRecordGhost)
  document.querySelectorAll('#seg-cam button').forEach(b => b.classList.toggle('on', b.dataset.v === app.camMode));
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

// The centre line: a strip half a metre wide down the middle of the road, white for four samples and road grey
// for the next four. The road between two samples is two flat triangles, cut corner to corner (from its left
// edge at this sample to its right edge at the next). On a bend that climbs or drops, that is not the surface a
// strip laid straight from one sample's centre to the next lies on: round a downhill hairpin the road stood two
// or three centimetres proud of the dashes and buried bits of them. So each length of the line is cut along the
// same diagonal as the road under it, and lies flat on each of the two triangles, 2 cm up.
function centreDashes(track) {
  const { samples, N, hw } = track, pos = [], col = [], white = new THREE.Color(0xf6f2e8), grey = new THREE.Color(0x5b6472), W = 0.25, LIFT = 0.04;
  const at = (s, lat) => V(s.p.x + s.left.x * lat, s.p.y + LIFT, s.p.z + s.left.z * lat);
  for (let i = 0; i < N; i++) {
    const s = samples[i], n = samples[(i + 1) % N], c = Math.floor(i / 4) % 2 ? white : grey;
    const A = at(s, W), B = at(s, -W), C = at(n, -W), D = at(n, W);
    const lx = s.p.x + s.left.x * hw, lz = s.p.z + s.left.z * hw, fx = n.p.x - n.left.x * hw - lx, fz = n.p.z - n.left.z * hw - lz; // the road's cut: from (lx, lz), along (fx, fz)
    const cut = (P, Q) => { // where the cut crosses the side of the strip that runs from P to Q, at the height the road has there
      const ex = Q.x - P.x, ez = Q.z - P.z, gx = lx - P.x, gz = lz - P.z, den = ex * fz - ez * fx;
      const v = Math.abs(den) < 1e-9 ? 0.5 : clamp((gx * fz - gz * fx) / den, 0, 1), u = Math.abs(den) < 1e-9 ? 0.5 : clamp((gx * ez - gz * ex) / den, 0, 1);
      return V(P.x + ex * v, s.p.y + (n.p.y - s.p.y) * u + LIFT, P.z + ez * v);
    };
    const P1 = cut(A, D), P0 = cut(B, C);
    pushQuad(pos, col, A, B, P0, P1, c); pushQuad(pos, col, P1, P0, C, D, c);
  }
  return { pos, col };
}

let menuOrbit = 0;

// Centennial Park is a gravel rally stage with two jumps, made for the rally car. In
// any other car (the open seater, the Camry) it's tarmac and the jumps are
// smoothed out: on gravel the open seater was quicker across the grass.
function trackDef(trackId, car) {
  const def = TRACKS[trackId];
  return def.surface === 'gravel' && car !== 'rally' ? { ...def, surface: 'tarmac', jumps: [] } : def;
}
const trackVariant = (trackId, car) => (TRACKS[trackId].surface === 'gravel' && car === 'rally' ? 'rally' : 'road');
// does the world need building again for this track and car?
const HOME_TRACK = 6; // the track behind the home screen when the game opens: Rose Bay (the owner's choice; it was Queens Park, the first)
const worldStale = (trackId, car) => app.trackId !== trackId || !app.track || app.track.expanded !== app.expanded || app.track.variant !== trackVariant(trackId, car || 'open');
function buildWorld(trackId, car = app.worldCar || 'open') {
  // clear old
  while (worldGroup.children.length) disposeTree(worldGroup.children.pop());
  occupied.length = 0; anim.length = 0; cityTowers.length = 0; cityTowers.left = 0;
  for (const Q of Object.values(sponsorQuads)) { Q.pos.length = 0; Q.uv.length = 0; }
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

  // centre dashes (tarmac only). Drawn a shade nearer than they are (the offset), so the road under them never wins
  // the pixel from far off, and kept out of the merged scenery for the sake of that.
  if (!gravel) {
    const dash = centreDashes(track), m = flatMesh(dash.pos, dash.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    m.userData.dyn = true; worldGroup.add(m);
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
    const gL = surfaceAt(track.def, Lo.x, Lo.z, s.p.y), gR = surfaceAt(track.def, Ro.x, Ro.z, s.p.y); // (the ground, or a roof the road runs across)
    Lo.y = Math.min(s.p.y - 0.25, gL - 0.35); Ro.y = Math.min(s.p.y - 0.25, gR - 0.35); // tuck under the grass
    return { L, R, Lo, Ro, dropL: s.p.y - gL, dropR: s.p.y - gR };
  });
  track.vergeDrop = edges.map(e => Math.max(e.dropL, e.dropR));
  const down = (v) => { const c = v.clone(); c.y -= DECK; return c; };
  const railMat = new THREE.MeshLambertMaterial({ color: 0xc9ced6, flatShading: true }), railPost = new THREE.BoxGeometry(0.16, 1.1, 0.16);
  const railing = (p, q, i) => {
    track.walls.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: (p.y + q.y) / 2 });
    for (const h of [0.55, 1.0]) worldGroup.add(strut(V(p.x, p.y + h, p.z), V(q.x, q.y + h, q.z), 0.12, 0.12, railMat, true));
    if (i % 3 === 0) { const post = new THREE.Mesh(railPost, railMat); post.position.set(p.x, p.y + 0.55, p.z); worldGroup.add(post); } // (no sponsors' banners here: the owner wants them on barriers, not on fences)
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
      const ground = surfaceAt(track.def, s.p.x, s.p.z, s.p.y), gap = s.p.y - ground;
      if (gap > 3.5 && !roadBelow(track, s)) {
        const pier = new THREE.Mesh(pierGeo, pierMat);
        const tall = gap - DECK + 1.5;                 // sunk 1 m into the ground, tucked into the deck
        pier.scale.y = tall;
        pier.position.set(s.p.x, ground - 1 + tall / 2, s.p.z);
        pier.rotation.y = Math.atan2(s.th.x, s.th.z); // wide side across the road
        pier.castShadow = true;
        worldGroup.add(pier);
        const w = hw * 0.65; // and solid, for anyone driving about underneath
        track.walls.push({ ax: s.p.x - s.left.x * w, az: s.p.z - s.left.z * w, bx: s.p.x + s.left.x * w, bz: s.p.z + s.left.z * w, y: ground });
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
    arch.add(post); // (not solid, like the gates below: a car that runs wide at the line goes through it)
  }
  const bannerTex = makeCheckerTexture();
  // a little longer and deeper than the posts it sits on: with faces level with
  // theirs, the two flickered through each other
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6.2, 2.2, 1.5), new THREE.MeshLambertMaterial({ map: bannerTex }));
  banner.position.copy(s0.p); banner.position.y += 8.2;
  banner.rotation.y = Math.atan2(s0.th.x, s0.th.z);
  banner.castShadow = true;
  arch.add(banner);
  const line = buildRibbonSegment(track, 0, hw, -hw, 0.05);
  const lineMesh = new THREE.Mesh(line, new THREE.MeshLambertMaterial({ map: bannerTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); // drawn in front of the road from far off too
  arch.add(lineMesh);
  worldGroup.add(arch);

  // checkpoint gates
  track.gateMats = [];
  const gatePostGeo = new THREE.BoxGeometry(0.9, 9, 0.9); // also sunk 4 m
  // (The gates carry no sponsor. Each had a name three times across its top from 4.5, every other one in 4.9, and
  // the owner asked "why are they over checkpoints": the sponsor bridges are the ones that hang over the track.)
  for (let k = 1; k < cps.length; k++) {
    const s = samples[cps[k]];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffa030, flatShading: true, emissive: 0x000000 });
    track.gateMats.push(mat);
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(gatePostGeo, mat);
      post.position.copy(s.p).addScaledVector(s.left, side * (hw + 2.2));
      post.position.y += 0.5;
      post.castShadow = true;
      worldGroup.add(post); // (a gate's posts aren't solid: a checkpoint is there to be driven through, not crashed into)
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 5.2, 0.5, 0.5), mat);
    bar.position.copy(s.p); bar.position.y += 5.2;
    bar.rotation.y = Math.atan2(s.th.x, s.th.z);
    worldGroup.add(bar);
  }

  if (track.def.walls) buildStreetWalls(track);
  buildProps(track);
  buildLandmarks(track);
  buildLocal(track);
  buildBoundary(track);
  buildScenery(track);
  if (track.sea) buildSea(track);
  if (look.night) buildNight(track);
  buildSideStreets(track, !!look.night);
  buildHelicopter(track);
  buildSponsorBridges(track);
  // the sponsors' posters and banners, every one in the world: a mesh for each kind
  for (const [kind, Q] of Object.entries(sponsorQuads)) {
    if (!Q.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(Q.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Q.uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, sponsorMat(kind, !!look.night)); m.receiveShadow = true; m.userData.dyn = true; worldGroup.add(m); // (lit and shadowed like what they hang on, by day; kept out of the merged scenery, which would take them for plain boards before their artwork has loaded)
  }
  mergeStatic(worldGroup, new Set(track.gateMats)); // gates stay apart: the next one glows
  // each wall's box, so a car only tests the few walls near it (the city has thousands)
  for (const w of track.walls) { w.x0 = Math.min(w.ax, w.bx) - 3.3; w.x1 = Math.max(w.ax, w.bx) + 3.3; w.z0 = Math.min(w.az, w.bz) - 3.3; w.z1 = Math.max(w.az, w.bz) + 3.3; }
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
  if (TERRAIN.wet && wetAt(x, z)) return false; // nothing gets built in the sea
  for (const b of track.def.blocks || []) if (x > b[0] - r && x < b[2] + r && z > b[1] - r && z < b[3] + r) return false; // nor on the track's own buildings
  if (track.sea?.quay) for (let k = 0; k < 8; k++) if (wetAt(x + Math.cos(k * 0.7854) * 24, z + Math.sin(k * 0.7854) * 24)) return false; // nor on a quay: the track's own scenery looks after its waterfront
  for (const o of occupied) {
    const dx = o.x - x, dz = o.z - z, rr = o.r + r;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return roadGap(track, x, z) >= roadMargin;
}

// a box stretched between two points
const _z = new THREE.Vector3(0, 0, 1);
// A box from a to b, w wide and h tall. `upright` keeps its sides vertical, for a rail: without it the box takes
// the shortest turn from pointing along z, which twists one that slopes while heading the other way (enough to
// lean a rail over the banner hung on it).
function strut(a, b, w, h, mat, upright) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  d.normalize();
  if (upright && Math.abs(d.y) < 0.999) {
    const x = new THREE.Vector3(0, 1, 0).cross(d).normalize(), y = new THREE.Vector3().crossVectors(d, x);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, d));
  } else m.quaternion.setFromUnitVectors(_z, d);
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Solid things are flat line segments (barriers, fences, buildings), circles
// (trees, posts, rocks, towers) and the ring round the edge of the map. The
// car is treated as three circles, nose, middle and tail: any that overlaps
// something solid is pushed back out, and the car loses the speed it had
// going into it.
const nearWalls = [];
function collideWalls(car) {
  const T = app.track, solids = T.solids, lim = T.limit;
  const R = 1.0;
  const fx = Math.sin(car.h), fz = Math.cos(car.h);
  let hit = 0, off = 0, isWall = false; // (car.wallHit: the hardest hit on a wall, not a post, tree or the map's edge)
  // only the walls whose box the car is in (a wall without a box always counts)
  const walls = nearWalls; walls.length = 0;
  const cx = car.pos.x, cz = car.pos.z;
  for (const w of T.walls) if (!(cx < w.x0 || cx > w.x1 || cz < w.z0 || cz > w.z1)) walls.push(w);
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
    if (isWall && -vn > (car.wallHit || 0)) car.wallHit = -vn;
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
      isWall = true; push(dx / d, dz / d, R - d); isWall = false;
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

// ---- a lap's path, packed small enough to keep with the leaderboard: a four-byte header (version, hundredths of
// a second between samples), then five bytes a sample (x and z in tenths of a metre, the heading in 256ths of a
// turn), as base64. Ten samples a second; fewer on a very long lap, so it never passes about 12,000 characters ----
function packPath(rec) {
  if (!rec || rec.length < 20) return null;
  const total = rec[rec.length - 1].t, step = Math.min(2550, Math.max(100, Math.ceil(total / 1800 / 10) * 10)), n = Math.floor(total / step) + 1;
  const b = new Uint8Array(4 + n * 5), v = new DataView(b.buffer);
  b[0] = 1; b[1] = step / 10;
  for (let k = 0, j = 0; k < n; k++) {
    const t = k * step;
    while (j < rec.length - 2 && rec[j + 1].t <= t) j++;
    const a = rec[j], c = rec[j + 1] || a, u = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 0;
    v.setInt16(4 + k * 5, clamp(Math.round(lerp(a.x, c.x, u) * 10), -32767, 32767)); v.setInt16(6 + k * 5, clamp(Math.round(lerp(a.z, c.z, u) * 10), -32767, 32767));
    b[8 + k * 5] = Math.round((lerpAngle(a.h, c.h, u) / (2 * Math.PI)) * 256) & 255;
  }
  let str = ''; for (let i = 0; i < b.length; i += 3000) str += String.fromCharCode(...b.subarray(i, i + 3000));
  return btoa(str);
}
function unpackPath(p) {
  try {
    const raw = atob(p), b = Uint8Array.from(raw, (ch) => ch.charCodeAt(0)), v = new DataView(b.buffer);
    if (b[0] !== 1 || !b[1] || (b.length - 4) % 5 || b.length < 24) return null;
    const out = [];
    for (let k = 0; 4 + k * 5 < b.length; k++) out.push({ t: k * b[1] * 10, x: v.getInt16(4 + k * 5) / 10, z: v.getInt16(6 + k * 5) / 10, h: (b[8 + k * 5] / 256) * 2 * Math.PI });
    return out;
  } catch { return null; }
}
// Your own best lap on each track, kept in this browser: its time and how it was driven (packed as the leaderboard's
// paths are). Polytrack mode starts with it: the best time on the HUD and the ghost you race are your best ever on
// that track in that car, not just the best of this session. (The owner: "allow players to start off polytrack mode
// with their own best times for that track all time not just in that session". Other players' lines and the record
// holder's ghost were switched off in 4.1, so this is the ghost there is.) A new layout of a track starts it again.
const ownBestKey = () => `dc-best-${app.trackId}.${TRACKS[app.trackId]?.v || 1}-${app.carClass}`;
function loadOwnBest() {
  try {
    const o = JSON.parse(localStorage.getItem(ownBestKey()) || 'null'), pts = o && o.ms > 0 && typeof o.p === 'string' ? unpackPath(o.p) : null;
    if (!pts) return null;
    // each point's place along the lap and the road's height there (the ghost and the gap to it need both): the
    // nearest sample, looking only a little way on from the last point's, so a road that crosses itself is no trouble
    const S = app.track.samples, N = app.track.N;
    let at = 0;
    pts.forEach((q, k) => {
      const from = k ? at : 0, to = k ? Math.min(N - 1, at + 90) : Math.floor(N * 0.2);
      let best = Infinity;
      for (let i = from; i <= to; i++) { const d = (S[i].p.x - q.x) ** 2 + (S[i].p.z - q.z) ** 2; if (d < best) { best = d; at = i; } }
      q.i = at; q.y = S[at].p.y;
    });
    return { ms: o.ms, lap: pts };
  } catch { return null; }
}
function saveOwnBest(ms, rec) {
  const p = packPath(rec);
  if (p) try { localStorage.setItem(ownBestKey(), JSON.stringify({ ms: Math.round(ms), p })); } catch {}
}
// The record holder's ghost: in Polytrack mode the lap at the top of the track's leaderboard drives round with
// you, a see-through gold car with its driver's name and time over it, setting off as you cross the line. The
// server keeps how each leaderboard lap was driven (laps set since 3.34) and sends it when asked.
// It is only on offer once the lap at the top of every track's board is one the server has the path of: its switches
// in Settings and the pause menu stay hidden until then, and nothing is chased. (Until 3.65 it was offered from the
// first lap that had a path, and on a track whose record had none it chased the best lap that did, which wasn't the
// record. The owner: "don't offer the fastest lap option until every track's genuine fastest lap has the data".)
function recGhostReady() { return TRACKS.every((_, t) => !!boardList(t)[0]?.g); }
function wantRecordGhost() {
  if (!app.room || app.mode !== 'quali' || !app.recGhostOn) return;
  if (!recGhostReady()) { app.recLap = null; app.recKey = null; ghostButton(); return; }
  // the lap to chase: the record, at the top of the track's board
  const list = boardList(app.trackId), at = 0, top = list[0]?.g ? list[0] : null;
  const key = top ? `${app.trackId}|${top.n}|${top.ms}` : null;
  if (!key) { app.recLap = null; app.recKey = null; ghostButton(); return; }
  if (key === app.recKey) return;
  app.recKey = key; app.recLap = null; app.recPlace = at + 1; app.recCar = top.c;
  send({ t: 'path', k: String(app.trackId), n: top.n });
}
// the ghost on or off: from Settings, or from the pause menu in Polytrack mode
function setRecGhost(on) {
  app.recGhostOn = !!on;
  try { localStorage.setItem('dc-recghost', app.recGhostOn ? 'on' : 'off'); } catch {}
  if (!app.recGhostOn) { app.recLap = null; app.recKey = null; }
  renderSettings(); wantRecordGhost(); ghostButton();
}
// what the pause menu's button says: whose ghost it is, or that this track has none yet
function ghostButton() {
  const b = $('#btn-recghost'), who = app.recLap && app.recWho;
  if (b) b.textContent = !app.recGhostOn ? "Record holder's ghost: off" : who ? `Ghost on: ${who.name}  ${fmtTime(who.ms)}` : "Record holder's ghost: on (no lap here has one yet)";
}
// ---- Keeping lines. The server keeps how each leaderboard lap was driven, but one with no database forgets
// them all when it restarts (and the live one restarts with every update). So this browser keeps a copy of the
// lines it has had to do with, its own laps' first and then any it has watched or chased, each with the
// server's signature, and hands one back when the lap is on the board without its line ('pathseed').
const LINES_KEPT = 16;
try { const o = JSON.parse(localStorage.getItem('dc-lines') || '[]'); app.lines = Array.isArray(o) ? o.filter((e) => e && typeof e.k === 'string' && typeof e.n === 'string' && Number.isInteger(e.ms) && typeof e.p === 'string' && typeof e.s === 'string').slice(0, LINES_KEPT) : []; } catch { app.lines = []; }
function keepLine(k, n, ms, p, s, mine) {
  if (typeof s !== 'string' || typeof p !== 'string' || !Number.isInteger(ms)) return;
  const same = (e) => e.k === k && e.n.toLowerCase() === String(n).toLowerCase();
  const had = app.lines.find(same);
  if (had && had.ms === ms && had.s === s) return;
  app.lines = [{ k, n, ms, p, s, ...(mine || had?.mine ? { mine: 1 } : {}) }, ...app.lines.filter((e) => !same(e))];
  // (its own laps are the last to go when the list is full: nobody else is as sure to come back with them)
  while (app.lines.length > LINES_KEPT) { const i = app.lines.findLastIndex((e) => !e.mine); app.lines.splice(i >= 0 ? i : app.lines.length - 1, 1); }
  try { localStorage.setItem('dc-lines', JSON.stringify(app.lines)); } catch {}
}
const linesSent = new Set(); let linesTimer = null;
function handBackLines() {
  if (linesTimer) return;
  const due = app.lines.filter((e) => !linesSent.has(`${e.k}|${e.n}|${e.ms}`) && (app.boards[e.k] || []).some((b) => b.n.toLowerCase() === e.n.toLowerCase() && b.ms === e.ms && !b.g));
  if (!due.length) return;
  const e = due[0]; linesSent.add(`${e.k}|${e.n}|${e.ms}`);
  send({ t: 'pathseed', k: e.k, n: e.n, ms: e.ms, p: e.p, s: e.s });
  linesTimer = setTimeout(() => { linesTimer = null; handBackLines(); }, 320); // (the server takes one every 200 ms from a player)
}
function onPath(msg) {
  if (typeof msg.k !== 'string' || typeof msg.n !== 'string') return;
  if (msg.p && msg.s) keepLine(msg.k, msg.n, msg.ms, msg.p, msg.s, false);
  const pts = msg.p ? unpackPath(msg.p) : null;
  if (lineView.want && lineView.want.k === msg.k && lineView.want.n.toLowerCase() === msg.n.toLowerCase()) showLine(msg, pts);
  if (app.recKey === `${msg.k}|${msg.n}|${msg.ms}` && pts && app.track && String(app.trackId) === msg.k) {
    // where each sample is on this track: the road's height there (the path only has x and z) and how far round the lap
    let hint = 0, y = app.track.samples[0].p.y;
    app.recLap = pts.map((q) => { const loc = locate(app.track, { x: q.x, y, z: q.z }, hint, 60); if (loc) { hint = loc.i; y = loc.y; } return { ...q, y, i: hint }; });
    app.recWho = { name: msg.n, ms: msg.ms, c: app.recCar, place: app.recPlace };
    if (app.recGhost) { carsGroup.remove(app.recGhost.group); disposeTree(app.recGhost.group); app.recGhost = null; }
    app.recI = 0; ghostButton();
    // say so (after the start's own message, if that's still up): a gold car you weren't told about is easy to miss
    const who = app.recWho, text = who.place === 1 ? `Chasing the record: ${who.name}  ${fmtTime(who.ms)}` : `Chasing ${who.name}  ${fmtTime(who.ms)}, the fastest lap with a ghost`;
    setTimeout(() => { if (app.recLap && app.recWho === who && inRace() && app.mode === 'quali') raceToast(text, 3500); }, Math.max(0, 4300 - (performance.now() - raceStartPerf())));
  }
}
function updateRecGhost(now) {
  const car = app.local, lap = app.recLap;
  const on = car && lap && app.recGhostOn && app.mode === 'quali' && app.phase === 'racing';
  app.recOn = false; // set below once the ghost has a place on the lap (the minimap shows it then)
  if (!on) { if (app.recGhost) app.recGhost.group.visible = false; return; }
  if (!app.recGhost) {
    const who = app.recWho || {};
    app.recGhost = makeCarMesh(2, '', true, CAR_NAMES[who.c] ? who.c : app.carClass, false, null);
    app.recGhost.group.traverse(m => { if (m.material) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.5; m.material.color?.setHex(0xffd76a); m.material.depthWrite = false; m.castShadow = false; } });
    const label = makeLabel(who.name || 'Record', '#ffd23f'); label.position.y = 2.6; app.recGhost.group.add(label); // (just the name: the time is in the message when it joins, and in the pause menu)
    carsGroup.add(app.recGhost.group);
  }
  const t = car.armed ? 0 : now - car.lapStart, g = app.recGhost.group;
  let i = app.recI || 0;
  if (i >= lap.length || lap[i].t > t) i = 0;
  while (i < lap.length - 2 && lap[i + 1].t <= t) i++;
  app.recI = i;
  const a = lap[i], b = lap[i + 1];
  if (!b || t > lap[lap.length - 1].t) { g.visible = false; return; }
  const u = clamp((t - a.t) / (b.t - a.t), 0, 1);
  g.position.set(lerp(a.x, b.x, u), lerp(a.y, b.y, u) + 0.02, lerp(a.z, b.z, u));
  g.rotation.set(0, lerpAngle(a.h, b.h, u), 0);
  app.recOn = true;
  g.visible = (g.position.x - car.pos.x) ** 2 + (g.position.z - car.pos.z) ** 2 > 9; // not when it's sitting on top of you
  // Your own best lap's ghost sets off from the line at the same moment. Where the two laps run together, two
  // see-through cars stood in the same place and the picture flickered between your car's colours and gold (all
  // the way round, if the record is your own lap; and plainest with a two-tone livery under the gold). So where
  // they are within a car's length of each other, yours gives way to the record holder's.
  const mine = app.ghost?.group;
  if (mine && mine.visible && (mine.position.x - g.position.x) ** 2 + (mine.position.z - g.position.z) ** 2 < 25) mine.visible = false;
}
// ---- a lap's line, from the leaderboard: the track from above with the lap drawn on it, red where it's slow
// through yellow to green where it's fast ----
const lineView = { want: null, tracks: new Map() };
function askLine(t, name) {
  lineView.want = { k: String(t), n: name };
  send({ t: 'path', k: String(t), n: name });
}
function showLine(msg, pts) {
  lineView.want = null;
  const t = +msg.k, def = TRACKS[t], cv = $('#line-canvas');
  if (!def || !cv) return;
  $('#line-title').textContent = `${msg.n}  ${msg.ms ? fmtTime(msg.ms) : ''}`;
  $('#line-sub').textContent = pts ? def.name : `${def.name}: no line was kept for this lap (it was set before lines were, or in a race)`;
  if (!lineView.tracks.has(t)) lineView.tracks.set(t, buildTrack(def));
  const T = lineView.tracks.get(t), S = T.samples, W = cv.width, H = cv.height, pad = 34;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of S) { x0 = Math.min(x0, s.p.x); x1 = Math.max(x1, s.p.x); z0 = Math.min(z0, s.p.z); z1 = Math.max(z1, s.p.z); }
  const k = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad) / (z1 - z0)), ox = (W - (x1 - x0) * k) / 2 - x0 * k, oz = (H - (z1 - z0) * k) / 2 - z0 * k;
  const X = (x) => x * k + ox, Z = (z) => z * k + oz, c = cv.getContext('2d');
  c.fillStyle = '#1d2230'; c.fillRect(0, 0, W, H);
  c.lineJoin = c.lineCap = 'round';
  c.beginPath(); S.forEach((s, i) => (i ? c.lineTo(X(s.p.x), Z(s.p.z)) : c.moveTo(X(s.p.x), Z(s.p.z)))); c.closePath();
  c.strokeStyle = '#4a5160'; c.lineWidth = Math.max(5, T.hw * 2 * k); c.stroke();
  { const s = S[0]; c.strokeStyle = '#f6f2e8'; c.lineWidth = 3; c.beginPath(); c.moveTo(X(s.p.x + s.left.x * T.hw), Z(s.p.z + s.left.z * T.hw)); c.lineTo(X(s.p.x - s.left.x * T.hw), Z(s.p.z - s.left.z * T.hw)); c.stroke(); } // the start line
  if (pts && pts.length > 2) {
    const v = pts.map((q, i) => { const o = pts[Math.min(pts.length - 1, i + 1)], b = pts[Math.max(0, i - 1)]; return Math.hypot(o.x - b.x, o.z - b.z) / Math.max(1, o.t - b.t); });
    const sorted = [...v].sort((a, b) => a - b), lo = sorted[Math.floor(sorted.length * 0.04)], hi = sorted[Math.floor(sorted.length * 0.97)] || 1;
    const shade = (u) => { const a = u < 0.5 ? [230, 69, 58] : [255, 210, 63], b = u < 0.5 ? [255, 210, 63] : [126, 217, 87], w = u < 0.5 ? u * 2 : u * 2 - 1; return `rgb(${a.map((x, j) => Math.round(x + (b[j] - x) * w)).join(',')})`; };
    c.lineWidth = 3.2;
    for (let i = 1; i < pts.length; i++) { c.strokeStyle = shade(clamp((v[i] - lo) / Math.max(1e-6, hi - lo), 0, 1)); c.beginPath(); c.moveTo(X(pts[i - 1].x), Z(pts[i - 1].z)); c.lineTo(X(pts[i].x), Z(pts[i].z)); c.stroke(); }
    const g = c.createLinearGradient(W - 190, 0, W - 60, 0); g.addColorStop(0, 'rgb(230,69,58)'); g.addColorStop(0.5, 'rgb(255,210,63)'); g.addColorStop(1, 'rgb(126,217,87)');
    c.fillStyle = g; c.fillRect(W - 190, H - 24, 130, 8);
    c.fillStyle = '#c9ced6'; c.font = '600 13px "Segoe UI", Arial, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'right'; c.fillText('slow', W - 196, H - 20); c.textAlign = 'left'; c.fillText('fast', W - 54, H - 20);
  }
  $('#lineview').classList.remove('hidden');
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
  const t = car.armed ? 0 : now - car.lapStart, g = app.ghost.group;
  // the gap: how long the ghost took to reach the point you're at now, against
  // your own time so far this lap (negative: you're ahead)
  let j = app.dI || 0;
  if (j >= lap.length || lap[j].i > car.idx + 30) j = 0;
  while (j < lap.length - 2 && lap[j + 1].i <= car.idx) j++;
  app.dI = j;
  const pa = lap[j], pb = lap[j + 1];
  if (pa && pb && pb.i > pa.i && car.lap > 1 && !car.armed) app.ghostDelta = (t - lerp(pa.t, pb.t, clamp((car.idx - pa.i) / (pb.i - pa.i), 0, 1))) / 1000;
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
const _psc = new THREE.Vector3();
function makePeople(max, rnd) {
  const shirts = [0xf6f2e8, 0xe6453a, 0x1d2230, 0xffd23f, 0x9ad0ff, 0xff6bcb, 0x7ed957, 0xff8a3d, 0x3d8bff];
  const skins = [0xf1c9a5, 0xd9a577, 0xa8703f, 0x6b4526];
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.85, 0.3), new THREE.MeshLambertMaterial({ flatShading: true }), max);
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ flatShading: true }), max);
  bodies.frustumCulled = heads.frustumCulled = false;
  const list = [], col = new THREE.Color(), M = new THREE.Matrix4();
  return {
    add(x, y, z, rot, shirt, sc = 1) {
      if (list.length >= max) return;
      const i = list.length;
      list.push({ x, y, z, rot, sc, ph: rnd() * 6.28, sp: 5 + rnd() * 4, keen: rnd() < 0.2 });
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
          if (p.sc !== 1) M.scale(_psc.set(p.sc, p.sc, p.sc));
          M.setPosition(p.x, p.y + 0.43 * p.sc + hop, p.z); bodies.setMatrixAt(i, M);
          M.setPosition(p.x, p.y + 1.02 * p.sc + hop, p.z); heads.setMatrixAt(i, M);
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

// ---------------------------------------------------------------------------
// The trackside sponsors: on every poster, and on banners along the barriers.
// They're the owner's choice: three puns on real companies (9 Meter for Nine
// Mile, PWD for PwC, Glory Dates for Glory Days) and two real ones as
// themselves (Tenth Floor Chambers and Frangos). Each is in the company's
// own look, as the owner asked. No picture file is used: everything is drawn
// here, in open-licence typefaces served from /vendor/fonts (see the README
// there), except 9 Meter, whose letters are drawn one by one, below.
// Posters go on the billboards. Banners go on solid walls only, one every
// 20 m or so (the pit wall, Sydney CBD's walls, Rose Bay's two sandstone
// walls, the wall along Westfield's roof): never on rails, fences or bridge
// railings. The owner found one every 9 m far too many, one every 60 m too
// few, and one every 30 m nearly right ("you can have a bit more"). Cars
// are another matter: they only ever carry made-up names.
// ---------------------------------------------------------------------------
const SPONSOR_FONTS = { charis: ['DC Charis', 'charis-sil-700.woff2', '700'], overpass: ['DC Overpass', 'overpass-800.woff2', '800'], caprasimo: ['DC Caprasimo', 'caprasimo-400.woff2', '400'], cormorant: ['DC Cormorant', 'cormorant-garamond-600.woff2', '600'], anton: ['DC Anton', 'anton-400.woff2', '400'] };
const sponsorFace = (k, size) => `${SPONSOR_FONTS[k][2]} ${Math.round(size)}px "${SPONSOR_FONTS[k][0]}", ${k === 'charis' || k === 'cormorant' || k === 'caprasimo' ? 'Georgia, "Times New Roman", serif' : '"Arial Narrow", Arial, sans-serif'}`;
// the biggest size (up to `max`) at which `text` is no wider than `wide`
const fitSize = (c, k, text, wide, max, gap = 0) => { let s = max; for (; s > 8; s -= 1) { c.font = sponsorFace(k, s); if (c.measureText(text).width + gap * s * (text.length - 1) <= wide) break; } return s; };
// text with its letters spread out by `gap` (a share of the size), centred on cx
const spaced = (c, text, cx, y, size, gap) => { const ws = [...text].map((ch) => c.measureText(ch).width), total = ws.reduce((a, b) => a + b, 0) + gap * size * (text.length - 1); let x = cx - total / 2; c.textAlign = 'left'; [...text].forEach((ch, i) => { c.fillText(ch, x, y); x += ws[i] + gap * size; }); c.textAlign = 'center'; };
const roundedPath = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };

// "9 meter", the owner's pun on Nine Mile, in Nine Mile's own lettering: a round, heavy lower case. The m and e
// are traced from the company's logo (every measurement taken off the picture the owner sent, in x-heights, y
// going up from the baseline); the 9, t and r aren't in "nine mile", so they're drawn to match. Corners are round
// outside and square inside, and the stem of an m or r stops short, touching its shoulder at one corner only.
// It's drawn, not kept as a picture, so it stays sharp at any size. Each piece of a letter is wound clockwise (as
// a rect is), so pieces that overlap fill as one shape.
const NM_T = 0.218, NM_ASC = 1.357, NM_R = 0.365; // how thick a stroke is, how tall the 9 stands, and the round of a shoulder
const nmBox = (c, x0, y0, x1, y1) => c.rect(x0, -y1, x1 - x0, y1 - y0); // (the canvas's y goes down)
const nmStem = (c, x) => nmBox(c, x, 0, x + NM_T, 0.787); // the stem that stops short of its shoulder
// a shoulder: from x0 along the top, round the corner and down a stem to the baseline at x1
const nmArch = (c, x0, x1) => {
  c.moveTo(x0, 0.22 - 1); c.lineTo(x0, -1); c.lineTo(x1 - NM_R, -1); c.arc(x1 - NM_R, NM_R - 1, NM_R, -Math.PI / 2, 0);
  c.lineTo(x1, 0); c.lineTo(x1 - NM_T, 0); c.lineTo(x1 - NM_T, 0.22 - 1); c.closePath();
};
// Part of a quarter of an oval about (cx, cy), a wide and b tall, as a run of short lines: the quarter towards
// (sx, sy), from angle t0 to t1 (0 at its side, a right angle at its top or bottom). n is how square it is: 2 is
// an ellipse, more is fuller in the corner. `move` starts a new outline there.
const nmQuarter = (c, cx, cy, a, b, n, sx, sy, t0, t1, move) => {
  for (let k = 0; k <= 16; k++) {
    const t = t0 + ((t1 - t0) * k) / 16, x = cx + sx * a * Math.max(0, Math.cos(t)) ** (2 / n), y = -(cy + sy * b * Math.max(0, Math.sin(t)) ** (2 / n));
    if (move && !k) c.moveTo(x, y); else c.lineTo(x, y);
  }
};
const nmTurn = (d, b, n) => Math.asin(Math.min(1, (d / b) ** (n / 2))); // the angle at which such a quarter is d above or below its middle
const NM_LETTERS = {
  m: (c, x) => { nmStem(c, x); nmArch(c, x + 0.212, x + 0.855); nmArch(c, x + 0.822, x + 1.461); },
  // The e is not quite round: a little taller than wide, fuller at the bottom right where the tail is, with a
  // bar across the middle and a slit under the bar on the right.
  e: (c, x) => {
    const cx = x + 0.4995, cy = 0.4945, A = 0.4995, B = 0.5265, Q = Math.PI / 2;
    const under = 0.0875, over = 0.0975, tail = 0.2165; // below the middle: the underside of the bar; above it: the bar's top; below it: the top of the tail
    // the outside, clockwise from the tip of the tail: round the bottom, up the left, over the top, down the right to the underside of the bar
    nmQuarter(c, cx, cy, A, B, 2.33, 1, -1, nmTurn(tail, B, 2.33), Q, true); nmQuarter(c, cx, cy, A, B, 2, -1, -1, Q, 0); nmQuarter(c, cx, cy, A, B, 2, -1, 1, 0, Q); nmQuarter(c, cx, cy, A, B, 2, 1, 1, Q, 0); nmQuarter(c, cx, cy, A, B, 2.33, 1, -1, 0, nmTurn(under, B, 2.33));
    // then the inside of the bowl: back along under the bar, down its left side, round the bottom and up to the tail
    nmQuarter(c, cx, cy, 0.283, 0.3205, 2.05, -1, -1, nmTurn(under, 0.3205, 2.05), Q); nmQuarter(c, cx, cy, 0.3, 0.3205, 2.45, 1, -1, Q, nmTurn(tail, 0.3205, 2.45)); c.closePath();
    // and the eye, the other way round, which makes it a hole
    nmQuarter(c, cx, cy, 0.283, 0.3285, 2.25, 1, 1, nmTurn(over, 0.3285, 2.25), Q, true); nmQuarter(c, cx, cy, 0.283, 0.3285, 2.25, -1, 1, Q, nmTurn(over, 0.3285, 2.25)); c.closePath();
  },
  // drawn to match: a t and an r in the same strokes
  t: (c, x) => { nmBox(c, x + 0.13, 0, x + 0.13 + NM_T, 1.27); nmBox(c, x, 0.78, x + 0.6, 1); },
  r: (c, x) => { nmStem(c, x); nmBox(c, x + 0.212, 0.78, x + 0.6, 1); },
  // and a 9: a ring, with a tail made like the m's shoulder turned over (down the right side, round the corner
  // and along the bottom to a square end)
  9: (c, x) => {
    const r = 0.43, cx = x + r, cy = NM_ASC - r, xr = x + 2 * r;
    c.moveTo(cx + r, -cy); c.arc(cx, -cy, r, 0, Math.PI * 2);
    c.moveTo(cx + 0.212, -cy); c.ellipse(cx, -cy, 0.212, 0.23, 0, Math.PI * 2, 0, true); // (the other way round: a hole)
    c.moveTo(xr, -cy); c.lineTo(xr, -NM_R); c.arc(xr - NM_R, -NM_R, NM_R, 0, Math.PI / 2); c.lineTo(x + 0.12, 0); c.lineTo(x + 0.12, -0.22); c.lineTo(xr - NM_T, -0.22); c.lineTo(xr - NM_T, -cy); c.closePath();
  },
};
const NM_WORDS = [['9', 0], ['m', 1.272], ['e', 2.877], ['t', 3.977], ['e', 4.667], ['r', 5.811]], NM_WIDE = 6.411; // where each letter starts, and how wide the lot is
// "9 meter" in the current fill colour, its x-height `xh` pixels, sitting about (cx, cy) as Nine Mile's name sits in its logo
function nmWords(c, cx, cy, xh) {
  c.save(); c.translate(cx - (NM_WIDE / 2) * xh, cy + 0.57 * xh); c.scale(xh, xh); c.beginPath();
  for (const [ch, x] of NM_WORDS) NM_LETTERS[ch](c, x);
  c.fill(); c.restore();
}

// each draws itself into a rectangle of a canvas, as a poster (about 10 : 3) or a banner (about 10.7 : 1, the name twice).
// `gap`: how far across its banner there's a column with no lettering on it, just the banner's own colours (and
// any stripe that runs its whole length): a barrier painted in a sponsor's colours is that column between the names.
const SPONSOR_ART = [
  { name: '9 Meter', gap: 0.495, // a pun on Nine Mile, in its own lettering and colours: aqua on deep blue, and nothing else
    draw(c, x, y, w, h, banner) {
      c.fillStyle = '#272d9f'; c.fillRect(x, y, w, h);
      c.fillStyle = '#54edd9';
      if (banner) { for (const f of [0.25, 0.75]) nmWords(c, x + w * f, y + h / 2, Math.min(h * 0.44, (w * 0.4) / NM_WIDE)); }
      else nmWords(c, x + w / 2, y + h / 2, Math.min(h * 0.36, (w * 0.72) / NM_WIDE));
    } },
  { name: 'PWD', gap: 0.495, // a pun on PwC: lower-case serif letters and a stack of warm blocks
    draw(c, x, y, w, h, banner) {
      c.fillStyle = '#ffffff'; c.fillRect(x, y, w, h);
      const mark = (cx, cy, s) => { // the letters, baseline at cy, with the blocks up and to the right of them
        c.font = sponsorFace('charis', s); const tw = c.measureText('pwd').width, u = s * 0.115, left = cx - (tw + u * 3.2) / 2;
        c.fillStyle = '#2d2d2d'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('pwd', left, cy); c.textAlign = 'center'; c.textBaseline = 'middle';
        const bx = left + tw - u * 1.2, by = cy - s * 0.74 - u * 2.1;
        for (const [col, x0, y0, x1, y1] of [['#eb8c00', 0, 1.7, 3.3, 2.7], ['#ffb600', 1.1, 0.3, 3.5, 2.0], ['#e0301e', 2.3, 1.0, 4.5, 3.0], ['#db536a', 3.2, 0, 5.3, 1.5], ['#a32020', 3.8, 1.9, 5.0, 3.5]]) { c.globalAlpha = 0.88; c.fillStyle = col; c.fillRect(bx + x0 * u, by + y0 * u, (x1 - x0) * u, (y1 - y0) * u); }
        c.globalAlpha = 1;
      };
      if (banner) { mark(x + w * 0.25, y + h * 0.7, h * 0.74); mark(x + w * 0.75, y + h * 0.7, h * 0.74); } else mark(x + w / 2, y + h * 0.71, h * 0.7);
    } },
  { name: 'Glory Dates', gap: 0.495, // a pun on Glory Days: a soft old-fashioned serif, a rising sun
    draw(c, x, y, w, h, banner) {
      c.fillStyle = '#f7ead3'; c.fillRect(x, y, w, h);
      const sun = (cx, cy, r) => {
        c.save(); c.beginPath(); c.rect(x, y, w, cy - y); c.clip();
        c.fillStyle = '#f4b23c'; for (let k = 0; k < 9; k++) { const a = Math.PI + (k + 0.5) * Math.PI / 9; c.beginPath(); c.moveTo(cx + Math.cos(a - 0.07) * r * 1.2, cy + Math.sin(a - 0.07) * r * 1.2); c.lineTo(cx + Math.cos(a) * r * 1.75, cy + Math.sin(a) * r * 1.75); c.lineTo(cx + Math.cos(a + 0.07) * r * 1.2, cy + Math.sin(a + 0.07) * r * 1.2); c.fill(); }
        c.fillStyle = '#ef8a2b'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); c.restore();
      };
      const word = (cx, cw, size) => { const s = fitSize(c, 'caprasimo', 'Glory Dates', cw, size); c.font = sponsorFace('caprasimo', s); c.fillStyle = '#8f3519'; c.fillText('Glory Dates', cx + s * 0.035, y + h * 0.5 + s * 0.045); c.fillStyle = '#c4502b'; c.fillText('Glory Dates', cx, y + h * 0.5); };
      if (banner) { for (const f of [0, 0.5]) { sun(x + w * (f + 0.065), y + h * 0.86, h * 0.34); word(x + w * (f + 0.3), w * 0.36, h * 0.74); } }
      else { sun(x + w * 0.165, y + h * 0.8, h * 0.3); c.fillStyle = '#c4502b'; c.fillRect(x + w * 0.065, y + h * 0.8, w * 0.2, h * 0.02); word(x + w * 0.64, w * 0.66, h * 0.56); }
    } },
  { name: 'Tenth Floor Chambers', gap: 0.469, // themselves: a barristers' chambers, so a quiet serif in gold on navy
    draw(c, x, y, w, h, banner) {
      c.fillStyle = '#101d3a'; c.fillRect(x, y, w, h);
      const GOLD = '#d9b86c', IVORY = '#f4efe2';
      c.strokeStyle = GOLD; c.lineWidth = Math.max(1, h * 0.014); c.strokeRect(x + h * 0.07, y + h * 0.07, w - h * 0.14, h - h * 0.14);
      if (banner) {
        for (const f of [0, 0.5]) {
          const cx = x + w * (f + 0.25);
          c.font = sponsorFace('charis', h * 0.6); c.fillStyle = GOLD; const tw = c.measureText('10').width; c.fillText('10', x + w * (f + 0.05) + tw / 2, y + h * 0.53);
          const s = fitSize(c, 'cormorant', 'TENTH FLOOR CHAMBERS', w * 0.315, h * 0.42, 0.1); c.font = sponsorFace('cormorant', s); c.fillStyle = IVORY; spaced(c, 'TENTH FLOOR CHAMBERS', cx + w * 0.045, y + h * 0.52, s, 0.1);
        }
        c.fillStyle = GOLD; c.fillRect(x + w / 2 - 1, y + h * 0.2, 2, h * 0.6);
      } else {
        c.font = sponsorFace('charis', h * 0.62); c.fillStyle = GOLD; c.fillText('10', x + w * 0.16, y + h * 0.52);
        c.fillRect(x + w * 0.285, y + h * 0.24, Math.max(2, h * 0.012), h * 0.52);
        let s = fitSize(c, 'cormorant', 'TENTH FLOOR', w * 0.6, h * 0.34, 0.12); c.font = sponsorFace('cormorant', s); c.fillStyle = IVORY; spaced(c, 'TENTH FLOOR', x + w * 0.63, y + h * 0.38, s, 0.12);
        s = fitSize(c, 'cormorant', 'CHAMBERS', w * 0.5, h * 0.2, 0.42); c.font = sponsorFace('cormorant', s); c.fillStyle = GOLD; spaced(c, 'CHAMBERS', x + w * 0.63, y + h * 0.69, s, 0.42);
      }
    } },
  { name: 'Frangos', gap: 0.497, // themselves: Portuguese charcoal chicken, so red, with the flag's green and gold
    draw(c, x, y, w, h, banner) {
      c.fillStyle = '#d42a1e'; c.fillRect(x, y, w, h);
      c.fillStyle = '#0a7a3c'; c.fillRect(x, y + h * 0.9, w, h * 0.1); c.fillStyle = '#ffd200'; c.fillRect(x, y + h * 0.865, w, h * 0.035);
      const flame = (cx, cy, s) => { for (const [col, k] of [['#ffd200', 1], ['#ff8a1e', 0.62]]) { c.fillStyle = col; c.beginPath(); c.moveTo(cx, cy - s * k); c.bezierCurveTo(cx + s * 0.75 * k, cy - s * 0.25 * k, cx + s * 0.6 * k, cy + s * 0.55 * k, cx, cy + s * 0.55 * k); c.bezierCurveTo(cx - s * 0.6 * k, cy + s * 0.55 * k, cx - s * 0.55 * k, cy - s * 0.05 * k, cx - s * 0.18 * k, cy - s * 0.3 * k); c.bezierCurveTo(cx - s * 0.1 * k, cy - s * 0.05 * k, cx + s * 0.12 * k, cy - s * 0.35 * k, cx, cy - s * k); c.fill(); } };
      const name = (cx, cy, s) => { c.font = sponsorFace('anton', s); c.fillStyle = '#8f140c'; c.fillText('FRANGOS', cx + s * 0.045, cy + s * 0.05); c.fillStyle = '#fff6e0'; c.fillText('FRANGOS', cx, cy); return c.measureText('FRANGOS').width; };
      if (banner) {
        for (const f of [0, 0.5]) { const tw = name(x + w * (f + 0.17), y + h * 0.47, h * 0.72); flame(x + w * (f + 0.17) - tw / 2 - h * 0.34, y + h * 0.46, h * 0.36); c.font = sponsorFace('overpass', h * 0.2); c.fillStyle = '#ffd200'; c.textAlign = 'left'; c.fillText('PORTUGUESE', x + w * (f + 0.17) + tw / 2 + h * 0.2, y + h * 0.3); c.fillText('CHARCOAL CHICKEN', x + w * (f + 0.17) + tw / 2 + h * 0.2, y + h * 0.58); c.textAlign = 'center'; }
      } else {
        const tw = name(x + w * 0.53, y + h * 0.37, h * 0.55); flame(x + w * 0.53 - tw / 2 - h * 0.3, y + h * 0.36, h * 0.3);
        const s = fitSize(c, 'overpass', 'PORTUGUESE CHARCOAL CHICKEN', w * 0.8, h * 0.14, 0.08); c.font = sponsorFace('overpass', s); c.fillStyle = '#ffd200'; spaced(c, 'PORTUGUESE CHARCOAL CHICKEN', x + w / 2, y + h * 0.735, s, 0.08);
      }
    } },
];

// Every poster and banner in the world is one of two meshes, each with one
// sheet of artwork: posters two across and three down, banners in rows. The
// sheets are drawn once the typefaces have arrived (or after five seconds
// without them, in whatever the browser has), so for a moment after the page
// opens the boards are blank.
const sponsorQuads = { poster: { pos: [], uv: [] }, banner: { pos: [], uv: [] } }; // this world's, filled in as it's built
const sponsorMats = new Map(), SPONSOR_TONE = 0xd9d6cf; // (the tone: a little under full strength, so a white board is the white of a painted wall and not the brightest thing in sight)
let sponsorSheets = null;
function sponsorMat(kind, night) {
  const key = kind + (night ? '|night' : '|day');
  let m = sponsorMats.get(key);
  if (!m) {
    // By day they take the light and the shadows of the place like the wall or the board they're on. They used to
    // be lit from inside whichever way they faced, and a sign glowing on a wall in the shade looked stuck on
    // ("the sign sponsors feel way too intrusive and out of place"). At night they were still lit from inside,
    // as a city's signs are, until the owner asked "why are they illuminated in cbd": now they take the night's
    // light too, like the walls they are on, and are read by the street lamps.
    // (Either way they're drawn as if a touch nearer than they are: from far off, the
    // frame or wall a hand's width behind one can't be told from it by depth, and the two flickered through
    // each other.)
    const common = { map: sponsorSheets?.[kind] ?? null, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 };
    m = new THREE.MeshLambertMaterial({ ...common, color: SPONSOR_TONE });
    m.userData.keep = true; m.userData.kind = kind; // shared by every track: never disposed with one
    sponsorMats.set(key, m);
  }
  return m;
}
// Where each sponsor's artwork is on its sheet. They're kept apart, and the edge of each is carried on out into the
// gap: from far off a sheet is read in coarser and coarser copies, and a neighbour's colours would creep in at
// the edges (a white line down the side of a blue poster, flickering as you drive).
const POSTER_SHEET = [2048, 1024], BANNER_SHEET = [1024, 1024];
const posterCell = (k) => [(k % 2) * 1024 + 32, (k >> 1) * 341 + 26, 960, 288];
const bannerCell = (k) => [0, k * 200 + 52, 1024, 96];
function drawSponsorSheets() {
  const sheet = ([w, h], cell, banner) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    SPONSOR_ART.forEach((s, k) => {
      const [x, y, cw, ch] = cell(k), gx = banner ? 0 : 32, gy = banner ? 52 : 26;
      c.save(); c.beginPath(); c.rect(x, y, cw, ch); c.clip(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.globalAlpha = 1; s.draw(c, x, y, cw, ch, banner); c.restore();
      c.drawImage(cv, x, y, cw, 1, x, y - gy, cw, gy); c.drawImage(cv, x, y + ch - 1, cw, 1, x, y + ch, cw, gy); // its top and bottom rows, out into the gap
      if (gx) { c.drawImage(cv, x, y - gy, 1, ch + 2 * gy, x - gx, y - gy, gx, ch + 2 * gy); c.drawImage(cv, x + cw - 1, y - gy, 1, ch + 2 * gy, x + cw, y - gy, gx, ch + 2 * gy); } // and its sides
    });
    const tex = cleanTexture(cv);
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); // they're read from along the road, at a slant
    return tex;
  };
  sponsorSheets = { poster: sheet(POSTER_SHEET, posterCell, false), banner: sheet(BANNER_SHEET, bannerCell, true) };
  for (const m of sponsorMats.values()) { m.map = sponsorSheets[m.userData.kind]; m.needsUpdate = true; }
}
Promise.race([
  Promise.all(Object.values(SPONSOR_FONTS).map(async ([name, file, weight]) => { const f = new FontFace(name, `url(/vendor/fonts/${file})`, { weight }); document.fonts.add(await f.load()); })).catch(() => {}),
  new Promise((done) => setTimeout(done, 5000)),
]).then(drawSponsorSheets);
// A poster: its four corners as someone reading it sees them (bottom-left, bottom-right, top-right, top-left).
function addPoster(q, k) {
  const [x, y, w, h] = posterCell(k % SPONSOR_ART.length), u0 = (x + 0.5) / POSTER_SHEET[0], u1 = (x + w - 0.5) / POSTER_SHEET[0], v1 = 1 - (y + 0.5) / POSTER_SHEET[1], v0 = 1 - (y + h - 0.5) / POSTER_SHEET[1];
  const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], Q = sponsorQuads.poster;
  for (const j of [0, 1, 2, 0, 2, 3]) { Q.pos.push(q[j].x, q[j].y, q[j].z); Q.uv.push(uv[j][0], uv[j][1]); }
}
// A piece of a banner hung along a barrier, from p to q ({x, y, z} at its foot), y0 to y1 above them, facing the
// point (tx, tz) on the road side so it reads the right way round from there. fp and fq say how far along the
// whole banner p and q are (0 to 1, in the order the pieces come), so a banner can follow a bend in several
// pieces. One name fills it unless `twice`; `plain`: no name at all, just the banner's own colours.
function addBanner(k, p, q, y0, y1, fp, fq, tx, tz, twice, plain) {
  const facesP = (tx - p.x) * -(q.z - p.z) + (tz - p.z) * (q.x - p.x) > 0; // is p on the left, seen from the road?
  const [L, R, fL, fR] = facesP ? [p, q, fp, fq] : [q, p, 1 - fq, 1 - fp], span = twice ? 1 : 0.5, gap = SPONSOR_ART[k % SPONSOR_ART.length].gap;
  const [, y, , h] = bannerCell(k % SPONSOR_ART.length), u0 = plain ? gap : 0.002 + fL * (span - 0.004), u1 = plain ? gap : 0.002 + fR * (span - 0.004), v1 = 1 - (y + 0.5) / BANNER_SHEET[1], v0 = 1 - (y + h - 0.5) / BANNER_SHEET[1];
  const c = [[L.x, L.y + y0, L.z, u0, v0], [R.x, R.y + y0, R.z, u1, v0], [R.x, R.y + y1, R.z, u1, v1], [L.x, L.y + y1, L.z, u0, v1]], Q = sponsorQuads.banner;
  for (const j of [0, 1, 2, 0, 2, 3]) { Q.pos.push(c[j][0], c[j][1], c[j][2]); Q.uv.push(c[j][3], c[j][4]); }
}
// A length of barrier painted in a sponsor's colours, as the barriers of a grand prix circuit are: its whole face
// from p to q ({x, y, z} at its foot), y0 to y1 above them, in the banner's own colours, with the name on it every
// 8 m or so and plain paint between. (The owner sent a picture of one, yellow with the tyre maker's name along it,
// and asked for the barriers' sponsors to "look somewhat like this": until 3.68 a sponsored barrier was bare
// concrete with one banner 4.5 m long on it.) (tx, tz): a point on the road side, as for addBanner.
function paintBarrier(k, p, q, y0, y1, tx, tz) {
  // (the name all the way along the length, as many times as fit with a little paint between: the owner asked for
  // the barriers' advertisements "in long rows". It was three to a length, "groups of 3 not 2", however long.)
  const len = Math.hypot(q.x - p.x, q.z - p.z), wide = Math.min((y1 - y0) * (512 / 96), len), n = Math.max(1, Math.floor(len / (wide * 1.12))), pad = Math.max(0, (len - n * wide) / (2 * n));
  const at = (d) => ({ x: p.x + ((q.x - p.x) * d) / len, y: p.y + ((q.y - p.y) * d) / len, z: p.z + ((q.z - p.z) * d) / len });
  for (let j = 0, d = 0; j < n; j++) {
    if (pad > 0.01) addBanner(k, at(d), at(d + pad), y0, y1, 0, 1, tx, tz, false, true);
    addBanner(k, at(d + pad), at(d + pad + wide), y0, y1, 0, 1, tx, tz);
    if (pad > 0.01) addBanner(k, at(d + pad + wide), at(d + 2 * pad + wide), y0, y1, 0, 1, tx, tz, false, true);
    d += 2 * pad + wide;
  }
}

// Sponsor bridges: a steel gantry over a straight with one sponsor's name three times across it, facing the cars
// coming, as over the straights at a grand prix. (The owner, once the barriers had their long rows: "you can have
// some that hang over the track like irl".) Two a lap, each where the road runs straight or nearly, 170 m or more
// from the start line, well away from the checkpoint gates and from each other, and from anything in the
// way: another part of the circuit, a building, a tunnel, the harbour front. A track can name its own spots
// instead (`sponsorBridges` in tracks.js, as [x, z]): Westfield does, for Oxford Street, where the usual rules
// find no room. They go up last, on ground that nothing else has taken, and take none themselves: nothing else
// in the world moves for them. Not solid, like the gates: a car that runs wide goes through a leg.
function buildSponsorBridges(track) {
  const { samples, N, hw, cps } = track, step = track.length / N, n = (m) => Math.round(m / step), wrap = (i) => ((i % N) + N) % N;
  const apart = (i, j) => { const d = Math.abs(i - j) % N; return Math.min(d, N - d); };
  const LEG = hw + 3, CLEAR = 5.6; // (the legs, this far out from the centre line; the road's clearance under the beam)
  const straight = (i, dir) => { let k = 0; const t = samples[i].th; while (k < n(140)) { const u = samples[wrap(i + dir * (k + 1))].th; if (t.x * u.x + t.z * u.z < 0.97) break; k++; } return k; }; // (how far the road runs on within 14 degrees of this heading)
  const free = (i) => {
    const s = samples[i];
    if (apart(i, 0) < n(170) || cps.some((c) => apart(i, c) < n(55))) return false; // (the first Queens Park one stood 57 m past the line: "why is it so close to the start line")
    if (track.vergeDrop[i] > 0.6 || Math.abs(samples[wrap(i + 6)].p.y - samples[wrap(i - 6)].p.y) > 1.2) return false; // not up on a deck or a ramp, nor on a steep hill
    for (const b of track.def.blocks || []) if (s.p.x > b[0] - LEG && s.p.x < b[2] + LEG && s.p.z > b[1] - LEG && s.p.z < b[3] + LEG) return false;
    for (const d of [-1, 1]) if (!isFree(track, s.p.x + s.left.x * d * LEG, s.p.z + s.left.z * d * LEG, 1.3, 0)) return false;
    for (let j = 0; j < N; j += 2) if (apart(i, j) > n(60) && Math.hypot(samples[j].p.x - s.p.x, samples[j].p.z - s.p.z) < hw * 2 + 14) return false; // the circuit again, beside it, over it or under it
    for (const o of track.localSpots || []) if (o.line) { // nor under a cable strung over the road (Thredbo's chairlift)
      const [ax, az, bx, bz] = o.line, dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((s.p.x - ax) * dx + (s.p.z - az) * dz) / (dx * dx + dz * dz)));
      if (Math.hypot(ax + dx * t - s.p.x, az + dz * t - s.p.z) < 50) return false;
    }
    return true;
  };
  const spots = [];
  for (let i = 0; i < N; i += 2) { const back = straight(i, -1), on = straight(i, 1); if (back >= n(28) && on >= n(8) && free(i)) spots.push([Math.min(back, n(90)) + Math.min(on, n(40)), i]); }
  spots.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const picked = (track.def.sponsorBridges || []).map(([x, z]) => { let best = 0, bd = Infinity; samples.forEach((q, i) => { const d = Math.hypot(q.p.x - x, q.p.z - z); if (d < bd) { bd = d; best = i; } }); return best; });
  // (a third of a lap apart, or a fifth where that leaves only one; and as far from the sponsors painted and hung
  // on the walls and barriers as the track allows, 40 m if it can be had: "don't have so many sponsors close together")
  const B = sponsorQuads.banner.pos, room = (i) => { const q = samples[i].p; let best = Infinity; for (let k = 0; k < B.length; k += 18) best = Math.min(best, Math.hypot(B[k] - q.x, B[k + 2] - q.z)); return best; };
  const clear = new Map(spots.map(([, i]) => [i, room(i)]));
  for (const least of [40, 25, 12, 0]) for (const far of [N / 3, N / 5]) for (const [, i] of spots) { if (picked.length < 2 && clear.get(i) >= least && picked.every((j) => apart(i, j) > far)) picked.push(i); }
  track.sponsorBridges = picked.sort((a, b) => a - b);
  const steel = new THREE.MeshLambertMaterial({ color: 0x8d93a0, flatShading: true }), dark = new THREE.MeshLambertMaterial({ color: 0x1d2230, flatShading: true });
  picked.forEach((i, k) => {
    const s = samples[i], g = new THREE.Group(), L = LEG * 2 + 1.5, name = L / 18.2, edge = name * 0.2, h = name + edge * 2, top = CLEAR + h; // (name: its height, to come three times across; edge: the band of the sponsor's paint above it and below)
    g.position.copy(s.p); g.rotation.y = Math.atan2(s.th.x, s.th.z); // (the group's x runs across the road, its z the way the cars go)
    const part = (mat, w, hh, d, x, y, z, shadow) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat); m.position.set(x, y, z); m.castShadow = !!shadow; g.add(m); };
    for (const sd of [-1, 1]) {
      for (const z of [-0.55, 0.55]) part(steel, 0.3, top + 4.4, 0.3, sd * LEG, (top + 0.4) / 2 - 2, z, true); // a leg: two posts (4 m into the ground)...
      for (let y = 1.2; y < CLEAR - 0.4; y += 1.3) part(steel, 0.16, 0.16, 1.1, sd * LEG, y, 0);                 // ...and the rungs between them
    }
    part(steel, L, 0.3, 1.5, 0, CLEAR - 0.15, 0, true); part(steel, L, 0.3, 1.5, 0, top + 0.15, 0, true);         // the beam: a chord below the face and one above
    part(dark, L - 0.2, h, 0.12, 0, CLEAR + h / 2, 0.4, true);                                                     // and a board well behind the face (nothing just behind it, to flicker from far off)
    worldGroup.add(g);
    const end = (lat) => ({ x: s.p.x + s.left.x * lat - s.th.x * 0.72, y: s.p.y, z: s.p.z + s.left.z * lat - s.th.z * 0.72 });
    const ad = app.trackId + 1 + k * 2, tx = s.p.x - s.th.x * 30, tz = s.p.z - s.th.z * 30;
    paintBarrier(ad, end(L / 2), end(-L / 2), CLEAR + edge, top - edge, tx, tz);
    for (const y of [CLEAR, top - edge]) addBanner(ad, end(L / 2), end(-L / 2), y, y + edge, 0, 1, tx, tz, false, true);
  });
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
    if (track.def.bare) return null; // (a track with no room for stands, pits and car parks)
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
      // side by side, 3 m apart (they used to point along the row, 4.2 m long every
      // 3 m, so each overlapped the next and their sides flickered)
      parkCar(lateral(lot.s, lot.side, hw + 28.5 + row * 6, -18 + c * 3), heading(lot.s) + Math.PI / 2 + (rnd() < 0.5 ? Math.PI : 0));
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
      // By night the garages are open and lit from inside, all but a couple, with a strip of lamps under the roof.
      // (Unlit, the whole building was a black slab 52 m long beside the grid: the owner, at Sydney CBD, "random
      // black wall in cbd start".)
      const night = !!track.look?.night, glow = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true }), garage = night ? glow(0x6a5a3a, 0xd9b062) : null;
      for (let k = 0; k < 8; k++) { const door = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.4, 0.2), night && k % 3 !== 1 ? garage : lam(k % 2 ? 0x3b4250 : 0x5a6372)); door.position.set(-22.4 + k * 6.4, 1.7, -1.45); pit.add(door); }
      if (night) { const lamps = new THREE.Mesh(new THREE.BoxGeometry(51, 0.16, 0.3), glow(0x6a6a5a, 0xfff0cc)); lamps.position.set(0, 4.62, -1.3); pit.add(lamps); }
      const pw = new THREE.Mesh(new THREE.BoxGeometry(52, 1, 0.4), lam(0xf6f2e8)); pw.position.set(0, 0.5, 2); pit.add(pw);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(52.1, 0.32, 0.44), lam(0xe6453a)); stripe.position.set(0, 0.86, 2); pit.add(stripe); // top 2 cm above the wall's
      put(pit, spot, hw + 8);
      wallRect(pit, -26.5, 26.5, -10.6, 2.3);
      track.pitWall = { i: spot.i, side: spot.side, lat: hw + 6, half: 26, top: spot.y + 1.02 }; // (for a track whose own barriers join it: Rose Bay's)
      // sponsors' banners along the pit wall, under its red stripe: a proper barrier, and the place for them on a circuit
      // (not where street walls stand in front of it, as at Sydney CBD: those carry their own)
      if (!track.def.walls) for (let k = 0; k < 6; k++) { const x = -20 + k * 8, a = toWorld(pit, x - 1.6, 0, 2.3), b = toWorld(pit, x + 1.6, 0, 2.3), t = toWorld(pit, x, 0, 30); addBanner(app.trackId, a, b, 0.07, 0.67, 0, 1, t.x, t.z); } // (one long row: the same sponsor six times)
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
  const boardGeo = new THREE.BoxGeometry(1.6, 1.1, 0.12), legGeo = new THREE.BoxGeometry(0.12, 1.4, 0.12);
  const boardMats = [lam(0xf6f2e8), lam(0xffd23f), lam(0xe6453a)];
  const railPostGeo = new THREE.BoxGeometry(0.2, 1.0, 0.2);
  // (On a street circuit the walls do this job. There used to be stacks of two tyres standing in front of the
  // barrier on every sharp corner, on every track: the owner had them taken out, "the little black pole things".)
  const street = !!track.def.walls;
  let n = 0, wasCorner = false, prev = null, firstRail = null, lastRail = null;
  for (let i = 0; i < N; i += 4) {
    const s = samples[i], corner = Math.abs(turn[i]) > 0.22;
    const outside = turn[i] > 0 ? 1 : -1;      // outside of a right-hander is the left side
    let here = null;
    if (corner && flat(i) && !street) {
      const p = at(s, outside * (hw + 5.2));
      if (isFree(track, p.x, p.z, 0.6, hw + 3)) {
        here = { p, outside, i, bits: [] }; // (bits: its post, and the rail on from the last one)
        if (!firstRail) firstRail = here;
        lastRail = here;
        if (!gravel) { const post = new THREE.Mesh(railPostGeo, postMat); post.position.set(p.x, p.y + 0.4, p.z); worldGroup.add(post); here.bits.push(post); }
        (track.rails ||= []).push(here); // (for a track whose own barrier takes a rail's place: Rose Bay's, out of the tunnel)
      }
    }
    // join this barrier post to the last one so the rail has no gaps or overlaps
    if (here && prev && prev.outside === here.outside && here.i - prev.i === 4) {
      const a = prev.p.clone(), b = here.p.clone();
      const rail = gravel ? strut(V(a.x, a.y + 0.45, a.z), V(b.x, b.y + 0.45, b.z), 1.0, 0.9, baleMat, true) : strut(V(a.x, a.y + 0.78, a.z), V(b.x, b.y + 0.78, b.z), 0.25, 0.5, railMat, true);
      rail.castShadow = true; worldGroup.add(rail);
      wall(a, b);
      here.bits.push(rail); here.wall = walls[walls.length - 1];
      // (no sponsors' banners here: a rail on posts is a fence to the owner's eye, and banners go on solid walls only)
    }
    prev = here;
    // three boards counting down to a corner that follows a straight
    if (corner && !wasCorner) {
      [60, 40, 20].forEach((back, k) => {
        const bi = wrap(i - back), b = samples[bi];
        if (Math.abs(turn[bi]) > 0.12 || !flat(bi)) return;
        const p = at(b, outside * (street ? hw + 5.4 : track.theme === 'mall' ? hw + 5.6 : hw + 4)); // behind the wall on a street circuit, and behind the race barrier at Westfield (where it stood on the barrier's own line)
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
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.04), lam(n++ % 2 ? 0xffd23f : 0x3d8bff)); cloth.position.set(0.48, 1.0, 0); arm.add(cloth); // (yellow and blue flags, turn about)
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
  let bb = 0;
  for (let i = 60; i < N - 40; i += 46) {
    if (Math.abs(turn[i]) > 0.15 || !flat(i)) continue;
    const s = samples[i], side = bb % 2 ? 1 : -1, p = at(s, side * (hw + 12));
    const rot = heading(s) + Math.PI / 2 - 0.5 * side; // long side along the road, its road side turned to face the cars coming (it used to be turned the other way, which nobody noticed while the boards were plain colours)
    const ex = Math.cos(rot) * 5, ez = -Math.sin(rot) * 5;
    if (![-1, 0, 1].every(e => isFree(track, p.x + ex * e, p.z + ez * e, 1.5, hw + 5))) continue;
    for (const e of [-1, 0, 1]) claim(p.x + ex * e, p.z + ez * e, 2.6);
    // (A billboard with a sponsor's poster stood here, on every track. The owner had them all taken down: "please
    // remove the signs with sponsors on side of track". Its place is still claimed, so nothing else moves into it or
    // shifts; the lamp post across the road stays. The sponsors on the walls and barriers are another matter and stay.)
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
  const ring = [], buoys = [], sea = track.sea, city = track.theme === 'city';
  const tall = city ? 2.6 : 1.7; // the city's is a concrete wall
  for (let k = 0; k < SEG; k++) {
    const a = (k / SEG) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
    const xi = lim.x + cx * lim.r, zi = lim.z + cz * lim.r, xo = lim.x + cx * (lim.r + 1.1), zo = lim.z + cz * (lim.r + 1.1);
    const g = Math.max(terrainHeight(xi, zi), terrainHeight(xo, zo));
    ring.push({ i0: V(xi, g - 3, zi), i1: V(xi, g + tall, zi), o0: V(xo, g - 3, zo), o1: V(xo, g + tall, zo), wet: sea && g < sea.level + 0.3 });
  }
  for (let k = 0; k < SEG; k++) {
    const a = ring[k], b = ring[(k + 1) % SEG];
    if (a.wet || b.wet) { if (k % 2 === 0) buoys.push([(a.i0.x + a.o0.x) / 2, (a.i0.z + a.o0.z) / 2]); continue; }
    if (city) shade.set(k % 2 ? 0x6f7580 : 0x646a75); else
    shade.set(k % 2 ? 0xa3a195 : 0x8f8d80).multiplyScalar(0.92 + ((k * 7919) % 11) / 90);
    pushQuad(pos, col, a.i1, a.i0, b.i0, b.i1, shade);   // inner face
    pushQuad(pos, col, a.o0, a.o1, b.o1, b.o0, shade);   // outer face
    shade.multiplyScalar(1.12);
    pushQuad(pos, col, a.o1, a.i1, b.i1, b.o1, shade);   // top
  }
  const mesh = flatMesh(pos, col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  worldGroup.add(mesh);
  // out at sea there's no wall: a line of red and white buoys marks the edge
  if (buoys.length) {
    const g = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xe6453a, flatShading: true }), white = new THREE.MeshLambertMaterial({ color: 0xf6f2e8, flatShading: true });
    const body = new THREE.CylinderGeometry(0.55, 0.75, 1.3, 8), top = new THREE.ConeGeometry(0.5, 0.9, 8);
    buoys.forEach(([x, z], k) => {
      const b = new THREE.Mesh(body, k % 2 ? white : red); b.position.set(x, 0.1, z); g.add(b);
      const t = new THREE.Mesh(top, k % 2 ? red : white); t.position.set(x, 1.2, z); g.add(t);
    });
    g.userData.dyn = true; mergeStatic(g); worldGroup.add(g);
    anim.push((t) => { g.position.y = track.sea.level + Math.sin(t * 1.1) * 0.12; });
  }
}

// Is (x, z) inside the circuit's loop? (even-odd rule round the centre line)
function insideLoop(track, x, z) {
  const P = track.poly ??= track.samples.filter((_, i) => i % 3 === 0).map(s => [s.p.x, s.p.z]);
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < xi + (z - zi) * (xj - xi) / (zj - zi)) inside = !inside;
  }
  return inside;
}

// A street circuit (Sydney CBD): concrete walls down both sides of the road,
// just past the kerbs, with a sponsor's banner on them now and then. Side
// streets meet them now and then, always on the outside of the circuit:
// track.gaps keeps the buildings out of those streets, and the wall runs
// across their mouths (they were ways off the circuit once: see below).
// (Rose Bay and Westfield had walls like these all the way round at first.
// They don't now: like the older tracks they have rails on the outside of
// corners, and a barrier only where a car would otherwise end up somewhere
// it can't be.)
function buildStreetWalls(track) {
  const { samples, N, hw, cps } = track;
  const IN = hw + 3.4, THICK = 0.6, H = 1.15, SINK = 0.6, GAP = 8; // a side street is 8 samples (12 m) wide
  const turn = samples.map((a, i) => { const b = samples[(i + 14) % N]; return a.th.x * b.th.z - a.th.z * b.th.x; });
  const straight = (i) => Math.abs(turn[((i % N) + N - 14) % N]) < 0.02 && Math.abs(turn[i % N]) < 0.02; // straight for 21 m either side
  const nearGate = (i) => cps.some(c => Math.min((i - c + N) % N, (c - i + N) % N) < 14);
  const gaps = track.gaps = [];
  let last = -999;
  for (let i = 70; i < N - 60; i++) { // not on the grid, behind the line, or just after it
    if (i - last < 85 || !straight(i) || !straight(i + GAP) || nearGate(i) || nearGate(i + GAP)) continue;
    const s = samples[i + (GAP >> 1)];
    const out = [1, -1].find((side) => {
      const x = s.p.x + s.left.x * side * 30, z = s.p.z + s.left.z * side * 30;
      return !insideLoop(track, x, z) && roadGap(track, x, z) > 25 && !wetAt(x, z); // the outside, and not straight onto another bit of track or into the sea
    });
    if (!out) continue;
    gaps.push({ side: out, a: i, b: i + GAP });
    last = i;
    // nothing gets put in the mouth of the street (the city keeps its own blocks out of them)
    if (track.theme !== 'city') for (let lat = hw + 6; lat < hw + 46; lat += 6) claim(s.p.x + s.left.x * out * lat, s.p.z + s.left.z * out * lat, 8);
  }
  const inGap = (side, i) => gaps.some(g => g.side === side && i >= g.a && i <= g.b);
  const concrete = new THREE.Color(0xd4d7dc), topC = new THREE.Color(0xb9bdc5), backC = new THREE.Color(0x8f949e);
  const pos = [], col = [], rails = track.walls.slice(); // (rails: what's solid already, the railings of the bridge decks)
  // how near the road comes to a spot, counting only road on the spot's own level: a flyover overhead is no reason
  // to leave the wall out. (It used to count, and the wall stopped short of the bridge over Sydney CBD's start
  // straight and took up again past it, on both sides: "random holes at start of track in the barriers", said the
  // owner, "a piece of wall is missing, just add it back".)
  const levelGap = (x, z, y) => { let best = Infinity; for (let i = 0; i < N; i += 2) { const q = samples[i].p; if (Math.abs(q.y - y) > 3) continue; const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < best) best = d; } return Math.sqrt(best); };
  const lo = (v, g = Infinity) => V(v.x, Math.min(v.y - SINK, g - 0.3), v.z), hi = (v) => V(v.x, v.y + H, v.z); // down to the ground, where the road is up on a ramp
  // one length of wall, from a to b: its faces (road side, top, back: each facing out, whichever side of the road)
  const length = (P, C, side, a, b) => {
    const A0 = lo(a.p, a.g), A1 = hi(a.p), B0 = lo(b.p, b.g), B1 = hi(b.p);
    const C0 = A0.clone().add(a.o), C1 = A1.clone().add(a.o), D0 = B0.clone().add(b.o), D1 = B1.clone().add(b.o);
    if (side > 0) { pushQuad(P, C, A0, A1, B1, B0, concrete); pushQuad(P, C, A1, C1, D1, B1, topC); pushQuad(P, C, C0, D0, D1, C1, backC); }
    else { pushQuad(P, C, A0, B0, B1, A1, concrete); pushQuad(P, C, A1, B1, D1, C1, topC); pushQuad(P, C, C0, C1, D1, D0, backC); }
  };
  track.wallAt = {}; // which samples have a wall beside them, each side (the city puts its crowds behind them)
  for (const side of [1, -1]) {
    // the wall's road-side face, IN metres out; where the inside of a tight
    // bend folds that line back on itself the points come too near the road
    // and are dropped, and the wall cuts straight across instead
    const point = (i, gap, open) => {
      const s = samples[i], p = V(s.p.x + s.left.x * side * IN, s.p.y, s.p.z + s.left.z * side * IN);
      if ((open && inGap(side, i)) || track.vergeDrop[i] > VERGE_MAX_DROP || gap(p.x, p.z, p.y) < IN - 0.35) return null; // (a bridge deck has railings instead)
      return { p, o: V(s.left.x * side * THICK, 0, s.left.z * side * THICK), i, g: terrainHeight(p.x, p.z) };
    };
    // join each point to the next one; across a run of dropped points (but
    // never a side street) only if a straight wall there keeps clear of the road
    const join = (P, gap) => {
      const links = [], hasIn = new Uint8Array(N), hasOut = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        if (!P[i]) continue;
        let m = 1;
        while (m < 24 && !P[(i + m) % N] && !inGap(side, (i + m) % N)) m++;
        const j = (i + m) % N, c = P[j];
        if (!c) continue;
        if (m > 1 && gap((P[i].p.x + c.p.x) / 2, (P[i].p.z + c.p.z) / 2, (P[i].p.y + c.p.y) / 2) < hw + 1.9) continue;
        links.push([P[i], c]); hasOut[i] = 1; hasIn[j] = 1;
      }
      return { links, hasIn, hasOut };
    };
    // (the crowds go where the wall always was: none under a bridge or in the mouth of a side street, and nobody
    // moves for the lengths added there)
    const was = join(samples.map((s, i) => point(i, (x, z) => roadGap(track, x, z), true)), (x, z) => roadGap(track, x, z));
    track.wallAt[side] = was.hasIn.map((v, i) => v | was.hasOut[i]);
    // The wall itself runs across the side streets too. They were openings at first, the way off the circuit for
    // Race to 9LAT2; the owner took them for holes ("a piece of wall is missing, just add it back"), they became
    // gates that opened for that mode alone, and then he binned the mode so they could stay shut.
    const P = samples.map((s, i) => point(i, levelGap)), { links, hasIn, hasOut } = join(P, levelGap);
    // is the wall whole and near its proper length for the three samples from g0? (on the inside of a tight bend it
    // bunches up, on the outside it stretches: a banner there would come out squashed, cut short or pulled wide)
    const whole = (g0) => [0, 1, 2].every((j) => { const u = P[(g0 + j) % N], v = P[(g0 + j + 1) % N]; if (!u || !v) return false; const t = samples[u.i].th, run = (v.p.x - u.p.x) * t.x + (v.p.z - u.p.z) * t.z; return run > 1.05 && run < 2.1; });
    for (const [a, b] of links) {
      // A long row: the name six times, 27 m of wall, in every 135 m; the two sides out of step, so a row comes up on
      // one side or the other every 67 m. (The owner: "keep all the advertisements on barriers but have them in long
      // rows"; then, with a row every 67 m on each side, "don't have so many sponsors close together". It was three
      // in a row, and before that one banner at a time.) A name is left out where the wall bends too much to carry it.
      { const shifted = a.i + (side > 0 ? 0 : 45), row = Math.floor(shifted / 90), kk = (shifted % 90) - 3, g0 = a.i - (((kk % 3) + 3) % 3);
        if (kk >= 0 && kk < 18 && g0 >= 0 && g0 + 3 <= N && (b.i - a.i + N) % N === 1 && whole(g0)) {
          const on = (q) => ({ x: q.p.x - (q.o.x / THICK) * 0.08, y: q.p.y, z: q.p.z - (q.o.z / THICK) * 0.08 }), c = samples[a.i].p;
          addBanner(row + (side > 0 ? 0 : 2), on(a), on(b), 0.14, 0.98, (kk % 3) / 3, (kk % 3 + 1) / 3, c.x, c.z);
        } }
      length(pos, col, side, a, b);
      track.walls.push({ ax: a.p.x, az: a.p.z, bx: b.p.x, bz: b.p.z, y: (a.p.y + b.p.y) / 2, mouth: inGap(side, a.i) || inGap(side, b.i) }); // (mouth: across a side street)
    }
    // close off the ends of each run of wall (drawn both sides, so either way round is fine)
    for (let i = 0; i < N; i++) if (P[i] && hasIn[i] !== hasOut[i]) { const q = P[i], b0 = q.p, b1 = q.p.clone().add(q.o); pushQuad(pos, col, lo(b0, q.g), lo(b1, q.g), hi(b1), hi(b0), backC); }
    // where a run of wall ends at a bridge deck it turns in to meet the end of the deck's railing, which stands
    // nearer the road: no way between the two (the owner, of Rose Bay: "gap between fence and barrier here")
    for (let i = 0; i < N; i++) if (P[i] && hasIn[i] !== hasOut[i]) {
      const q = P[i], dir = hasOut[i] ? -1 : 1, t = samples[i].th; // (dir: the deck lies this way along the track)
      let end = null, best = 2.6;
      for (const w of rails) {
        if (Math.abs((w.y ?? 0) - q.p.y) > 3) continue;
        for (const [x, z] of [[w.ax, w.az], [w.bx, w.bz]]) { const d = Math.hypot(x - q.p.x, z - q.p.z); if (d < best) best = d, end = [x, z]; }
      }
      if (!end || best < 0.5) continue;
      const o = V(t.x * dir * THICK, 0, t.z * dir * THICK), g = Math.min(q.g, terrainHeight(end[0], end[1]));
      length(pos, col, side * dir, { p: q.p, o, g }, { p: V(end[0], q.p.y, end[1]), o, g });
      track.walls.push({ ax: q.p.x, az: q.p.z, bx: end[0], bz: end[1], y: q.p.y });
    }
  }
  const mesh = flatMesh(pos, col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  worldGroup.add(mesh);
}

// The mouth of each side street (track.gaps). The street walls open there and a street leads off into the city, but
// nothing used to be drawn in it and no lamp reached it. At night, from the driver's seat (eyes about as high as the
// wall's top), the dark ground behind the opening filled just the band a wall would, and read as a length of wall
// painted black: "Random black wall in cbd start", said the owner, of the one past the bridge at Sydney CBD. So each
// opening gets its street: asphalt from the track's kerb out as far as the ground stays level and clear, a line down
// each side, dashes down the middle and a line across where it meets the track, and at night a lamp or two with
// their pools of light. (Built last, when everything else has its place, so nothing else in the world moves for it.)
function buildSideStreets(track, night) {
  const gaps = track.gaps || [];
  if (!gaps.length) return;
  const { samples, N, hw } = track;
  const HALF = 6, EDGE = hw + 1.6, V0 = hw + 3.1, DEEP = 44, LIFT = 0.06, R = 13; // (V0: where the verge's skirt has dipped under the ground)
  const tar = new THREE.Color(0x4f5764), white = new THREE.Color(0xe9e6dc);
  const pos = [], col = [], lpos = [], lcol = [], ppos = [], puv = [], lamps = [];
  // flat on the ground, facing up whichever way round its corners come
  const flat = (P, C, a, b, c, d, color) => ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0 ? pushQuad(P, C, a, b, c, d, color) : pushQuad(P, C, a, d, c, b, color));
  const blocked = (x, z, y, v) => {
    if ((TERRAIN.wet && wetAt(x, z)) || (v > hw + 6 && roadGap(track, x, z) < hw + 4)) return true; // (another stretch of the circuit: the one the street leaves is further off than that by then)
    for (const o of occupied) if (o.r >= 2.5 && (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + 0.6) ** 2) return true;
    for (const w of track.walls) { // a building, or anything else solid
      if (w.mouth || Math.abs((w.y ?? 0) - y) > 3) continue; // (not the wall across the street's own mouth)
      const ex = w.bx - w.ax, ez = w.bz - w.az, t = clamp(((x - w.ax) * ex + (z - w.az) * ez) / (ex * ex + ez * ez || 1), 0, 1), dx = x - w.ax - ex * t, dz = z - w.az - ez * t;
      if (dx * dx + dz * dz < 1.3) return true;
    }
    return false;
  };
  for (const g of gaps) {
    const c = (g.a + g.b) >> 1, s = samples[c], ox = s.left.x * g.side, oz = s.left.z * g.side, tx = s.th.x, tz = s.th.z, NU = HALF * 2;
    // u metres along the track from the middle of the opening, v out from the centre line; the street leans `lean`
    // metres along the track for each metre it goes out
    let lean = 0;
    const at = (u, v) => { const w = u + Math.max(0, v - V0) * lean; return [s.p.x + tx * w + ox * v, s.p.z + tz * w + oz * v]; };
    const raw = (u, v) => { const [x, z] = at(u, v); return terrainHeight(x, z); };
    // How far out it can run at its full width: until the ground stops being level (a bank), or something stands
    // there. Straight out if that gets it anywhere; if not, leaning one way or the other, whichever goes furthest
    // (the first opening at Sydney CBD has the flyover's bank on one side, and its street runs along the foot of it).
    const run = () => {
      let far = DEEP;
      for (let i = 0; i < NU && far; i++) for (let j = 0; j < far; j++) {
        const hs = [raw(i - HALF, V0 + j), raw(i + 1 - HALF, V0 + j), raw(i - HALF, V0 + j + 1), raw(i + 1 - HALF, V0 + j + 1)], [x, z] = at(i + 0.5 - HALF, V0 + j + 0.5);
        if (Math.max(...hs) - Math.min(...hs) > 0.22 || blocked(x, z, hs[0], V0 + j + 0.5)) { far = j; break; }
      }
      return far;
    };
    let far = 0;
    for (const l of [0, 0.4, -0.4, 0.75, -0.75]) { lean = l; const f = run() - Math.abs(l) * 8; if (f > far + 0.5) far = f, g.lean = l; if (far >= 30) break; }
    if (far < 6) continue; // no room for a street here
    lean = g.lean; far = run();
    // the highest ground within half a metre: where the ground bends, the paint keeps clear of it
    const top = (u, v) => { let h = -Infinity; for (const du of [-0.5, 0, 0.5]) for (const dv of [-0.5, 0, 0.5]) h = Math.max(h, raw(u + du, v + dv)); return h + LIFT; };
    const H = [];
    for (let i = 0; i <= NU; i++) { H.push([]); for (let j = 0; j <= DEEP; j++) H[i].push(j <= far ? top(i - HALF, V0 + j) : 0); }
    const reach = new Array(NU).fill(far);
    const P = (i, j, lift = 0) => { const [x, z] = at(i - HALF, V0 + j); return V(x, H[i][j] + lift, z); };
    // the road's own height beside the opening, and the strip from its kerb down to the street
    const roadY = (u) => { const f = c + u / 1.5, i = Math.floor(f), a = samples[((i % N) + N) % N].p.y, b = samples[(((i + 1) % N) + N) % N].p.y; return a + (b - a) * (f - i); };
    const K = (i, lift = 0) => { const [x, z] = at(i - HALF, EDGE); return V(x, roadY(i - HALF) + 0.04 + lift, z); };
    const cells = []; // every piece of the street, for the lamps' pools
    for (let i = 0; i < NU; i++) {
      if (!reach[i]) continue;
      cells.push([K(i), P(i, 0), P(i + 1, 0), K(i + 1)]);
      for (let j = 0; j < reach[i]; j++) cells.push([P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)]);
    }
    for (const q of cells) flat(pos, col, ...q, tar);
    // the lines: a height anywhere on the street, a touch over the asphalt
    const surf = (u, v) => { const fu = clamp(u + HALF, 0, NU - 1e-6), fv = clamp(v - V0, 0, DEEP - 1e-6), i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j; return (H[i][j] * (1 - a) + H[i + 1][j] * a) * (1 - b) + (H[i][j + 1] * (1 - a) + H[i + 1][j + 1] * a) * b + 0.035; };
    const Lp = (u, v) => { const [x, z] = at(u, v); return V(x, surf(u, v), z); };
    const line = (u0, u1, v0, v1) => { for (let v = v0; v < v1 - 1e-6; v += 1) { const w = Math.min(v + 1, v1); flat(lpos, lcol, Lp(u0, v), Lp(u0, w), Lp(u1, w), Lp(u1, v), white); } };
    const lane = (u) => reach[clamp(Math.floor(u + HALF), 0, NU - 1)];
    for (const e of [-1, 1]) { const far = Math.min(lane(e * 5.3 - 0.1), lane(e * 5.3 + 0.1)); if (far > 2) line(e * 5.3 - 0.09, e * 5.3 + 0.09, V0 + 1.8, V0 + far); }
    const mid = Math.min(reach[HALF - 1], reach[HALF]);
    for (let j = 3; j + 2 <= mid; j += 4) line(-0.1, 0.1, V0 + j, V0 + j + 2);
    for (let i = 0; i < NU; i++) if (reach[i] > 2 && i >= 1 && i < NU - 1) line(i - HALF, i + 1 - HALF, V0 + 1, V0 + 1.4); // (where the street meets the track)
    if (!night) continue;
    // a lamp at the kerb a little way in, and another further up on the other side, each with its pool of light
    const spots = [];
    for (const [e, v] of [[-1, hw + 7.5], [1, hw + 7.5]]) {
      const u = e * (HALF + 0.7), [x, z] = at(u, v), edge = reach[e < 0 ? 0 : NU - 1];
      if (edge < v - V0 + 1 || !isFree(track, x, z, 0.8, hw + 3) || track.solids.some((o) => Math.hypot(o.x - x, o.z - z) < 6)) continue;
      spots.push([e, v]);
      const far = reach[e < 0 ? NU - 1 : 0], v2 = v + 15, [x2, z2] = at(-u, v2);
      if (far >= v2 - V0 + 1 && isFree(track, x2, z2, 0.8, hw + 3) && !track.solids.some((o) => Math.hypot(o.x - x2, o.z - z2) < 6)) spots.push([-e, v2]);
      break;
    }
    for (const [e, v] of spots) {
      const u = e * (HALF + 0.7), [x, z] = at(u, v), y = terrainHeight(x, z), [ax, az] = at(u - e * 3.2, v);
      track.solids.push({ x, z, r: 0.35, y });
      lamps.push({ x, z, y, tip: V(ax, y + 9.6, az), rot: Math.atan2(-tz, tx) });
      for (const q of cells) {
        const mx = (q[0].x + q[2].x) / 2, mz = (q[0].z + q[2].z) / 2;
        if ((mx - ax) ** 2 + (mz - az) ** 2 > (R + 1) ** 2) continue;
        for (const k of [0, 1, 2, 0, 2, 3]) { const p = q[k], dx = p.x - ax, dz = p.z - az; ppos.push(p.x, p.y + 0.05, p.z); puv.push(0.5 + (dx * tx + dz * tz) / (2 * R), 0.5 + (dx * ox + dz * oz) / (2 * R)); }
      }
    }
  }
  if (!pos.length) return;
  const street = flatMesh(pos, col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); // (each drawn a shade nearer than what it lies on, so the ground never wins the pixel from far off)
  const lines = flatMesh(lpos, lcol, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }));
  for (const m of [street, lines]) { m.receiveShadow = true; m.userData.dyn = true; worldGroup.add(m); }
  if (!lamps.length) return;
  const steel = new THREE.MeshLambertMaterial({ color: 0x8d93a0, flatShading: true });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.35, 0.8), new THREE.MeshBasicMaterial({ color: 0xfff2c4 }), lamps.length), M = new THREE.Matrix4();
  heads.userData.dyn = true; heads.frustumCulled = false;
  lamps.forEach((l, k) => {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 11, 0.3), steel); mast.position.set(l.x, l.y + 4.5, l.z); mast.castShadow = true; worldGroup.add(mast);
    worldGroup.add(strut(V(l.x, l.y + 9.6, l.z), l.tip, 0.2, 0.2, steel));
    M.makeRotationY(l.rot); M.setPosition(l.tip.x, l.tip.y - 0.25, l.tip.z); heads.setMatrixAt(k, M);
  });
  worldGroup.add(heads);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(ppos, 3));
  pg.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
  const pools = new THREE.Mesh(pg, lightMat(glowTexture(128, 128, 64, 64, 64), 0xffd9a0, 0.6));
  pools.userData.dyn = true; pools.renderOrder = 1; worldGroup.add(pools);
}

// The sea round Noosa Heads: water out to the horizon, see-through enough that
// the sand shows in the shallows and the deep reads darker. It's drawn as rings
// round the camera, small close by and bigger further out, and moves with the
// camera (it's flat and all one colour, so that looks the same as a sea that
// goes on for ever). It used to be one huge square, two triangles kilometres
// across, and graphics chips couldn't work out its depth accurately enough:
// the sea flickered through the sand.
function ringGeometry(rings = 62, segs = 48, first = 1, grow = 1.16) {
  const pos = [0, 0, 0], index = [];
  for (let k = 0, r = first; k < rings; k++, r *= grow) for (let j = 0; j < segs; j++) { const a = (j / segs) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); }
  const at = (k, j) => 1 + k * segs + (j % segs);
  for (let j = 0; j < segs; j++) index.push(0, at(0, j + 1), at(0, j)); // the middle (all facing up)
  for (let k = 0; k < rings - 1; k++) for (let j = 0; j < segs; j++) index.push(at(k, j), at(k, j + 1), at(k + 1, j), at(k, j + 1), at(k + 1, j + 1), at(k + 1, j));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(index);
  return g; // out to first * grow^(rings-1): about 7 km, past the furthest the camera sees
}
function buildSea(track) {
  const sea = track.sea;
  const water = new THREE.Mesh(ringGeometry(), new THREE.MeshLambertMaterial({ color: 0x29b8d0, transparent: true, opacity: 0.74 }));
  water.position.y = sea.level;
  water.receiveShadow = true; water.userData.dyn = true; water.frustumCulled = false;
  water.renderOrder = -1; // first of the see-through things (the ghost car, the rotor's blur), which go over it
  // centred under whichever camera is drawing it (the race, the menus, the podium)
  water.onBeforeRender = (r, s, cam) => { water.position.set(cam.position.x, sea.level, cam.position.z); water.updateMatrixWorld(); };
  worldGroup.add(water);
}

// Words on a sign: a texture of `text` in `ink` on `bg`, with a line round it.
function signTexture(text, bg, ink, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const inset = Math.min(12, h * 0.1), line = Math.min(8, h * 0.07); // (a long low sign gets a finer frame and smaller letters)
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = ink; x.lineWidth = line; x.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = Math.min(78, Math.round(h * 0.8)); do { x.font = `900 ${size}px "Segoe UI", Arial, sans-serif`; size -= 4; } while (x.measureText(text).width > w - 70 && size > 12);
  x.fillText(text, w / 2, h / 2 + Math.min(4, h * 0.035));
  return cleanTexture(c);
}

// Something of the real place each track is named after (`local` in
// tracks.js). Queens Park: a footy field (NSW blue against QLD maroon), a
// cricket match and big Moreton Bay figs. Centennial Park: the Federation
// Pavilion, horses in a paddock and black swans on the pond. Thredbo: a
// chairlift across the track with skiers coming down beside it, and A-frame lodges.
// Pinto Speedway (Mount Panorama until 3.55): campers round their fires on the mountain (and, until 3.56, signs
// with Mount Panorama's corner names). Noosa Heads: surfers riding the waves in
// along the headland, koalas in the gum trees on it. Sydney: Sydney Tower at
// the end of the main straight, the Harbour Bridge and the Opera House across
// the water. Built after the landmarks and before the scenery, so the trees,
// huts and buildings leave room for it.
function buildLocal(track) {
  const which = track.def.local;
  if (!which) return;
  const rnd = mulberry32(5150 + app.trackId * 41);
  const { samples, N, hw } = track, lim = track.limit, solids = track.solids;
  const spots = track.localSpots = []; // what went where (handy for testing)
  const mats = new Map();
  const lam = (c, e = 0, side = THREE.FrontSide) => { const k = `${c}|${e}|${side}`; let m = mats.get(k); if (!m) mats.set(k, m = new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true, side })); return m; };
  const put = (g, geo, c, x, y, z, e = 0, side) => { const m = new THREE.Mesh(geo, lam(c, e, side)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, c, x, y, z, e) => put(g, new THREE.BoxGeometry(w, h, d), c, x, y, z, e);
  const cyl = (g, r0, r1, h, n, c, x, y, z, e) => put(g, new THREE.CylinderGeometry(r0, r1, h, n), c, x, y, z, e);
  const at = (x, z, ry = 0, y = terrainHeight(x, z)) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; worldGroup.add(g); return g; };
  const W = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)]; // a group's local x, z in the world
  const randIn = (pad) => { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * (lim.r - pad); return [lim.x + Math.cos(a) * d, lim.z + Math.sin(a) * d]; };
  // a free spot of radius r, `margin` clear of the road, rising or falling no more than `flat` across it
  const spot = (r, margin, flat = 99, near = null, tries = 400) => {
    for (let k = 0; k < tries; k++) {
      const [x, z] = near ? [near[0] + (rnd() - 0.5) * near[2] * 2, near[1] + (rnd() - 0.5) * near[2] * 2] : randIn(r + 10);
      if (Math.hypot(x - lim.x, z - lim.z) > lim.r - r - 6 || !isFree(track, x, z, r, margin)) continue;
      if (flat < 99) {
        let lo = Infinity, hi = -Infinity;
        for (let j = 0; j < 9; j++) { const y = terrainHeight(x + (j ? Math.cos(j * 0.785) * r : 0), z + (j ? Math.sin(j * 0.785) * r : 0)); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        if (hi - lo > flat) continue;
      }
      return [x, z];
    }
    return null;
  };
  const nearest = (x, z) => { let b = samples[0], d = Infinity; for (let i = 0; i < N; i += 2) { const s = samples[i], e = (s.p.x - x) ** 2 + (s.p.z - z) ** 2; if (e < d) { d = e; b = s; } } return b; };
  // a line painted on the grass, in short pieces that follow the ground
  const paint = (x0, z0, x1, z1, w = 0.22, c = 0xf6f2e8, h = 0.06) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 3)), ry = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k < n; k++) {
      const x = x0 + (x1 - x0) * (k + 0.5) / n, z = z0 + (z1 - z0) * (k + 0.5) / n;
      const m = box(worldGroup, w, h, len / n + 0.05, c, x, terrainHeight(x, z) + 0.04, z); m.rotation.y = ry; m.castShadow = false;
    }
  };
  // a three-sided prism: a w x h triangle standing on its base, d deep (tents, A-frames)
  const prism = (w, h, d) => {
    const P = [], f = d / 2, A = [-w / 2, 0], B = [w / 2, 0], C = [0, h], v = (p, z) => [p[0], p[1], z];
    const tri = (a, b, c) => P.push(...a, ...b, ...c), quad = (a, b, c, e) => { tri(a, b, c); tri(a, c, e); };
    tri(v(A, f), v(B, f), v(C, f)); tri(v(B, -f), v(A, -f), v(C, -f));
    quad(v(B, f), v(B, -f), v(C, -f), v(C, f)); quad(v(C, f), v(C, -f), v(A, -f), v(A, f)); quad(v(A, f), v(A, -f), v(B, -f), v(B, f));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
  };

  if (which === 'queens') {
    const crowd = makePeople(70, rnd);
    // a footy field: the try lines, halfway and the 20s, H posts at each end, a State of Origin on it
    let f = null, FL = 70, FW = 48;
    for (const [l, w, flat] of [[70, 48, 1.8], [70, 48, 3], [60, 40, 3], [54, 36, 4]]) { f = spot(Math.hypot(l, w) / 2 + 2, hw + 12, flat); if (f) { FL = l; FW = w; break; } } // as big and flat as there's room for
    if (f) {
      const [x, z] = f, s = nearest(x, z), ry = Math.atan2(s.th.x, s.th.z), P = (lx, lz) => W(x, z, ry, lx, lz);
      for (const lz of [-FL / 2, -FL / 2 + 20, 0, FL / 2 - 20, FL / 2]) paint(...P(-FW / 2, lz), ...P(FW / 2, lz));
      for (const lx of [-FW / 2, FW / 2]) paint(...P(lx, -FL / 2), ...P(lx, FL / 2));
      for (const e of [-1, 1]) {
        const [gx, gz] = P(0, e * FL / 2), g = at(gx, gz, ry);
        for (const sx of [-2.8, 2.8]) {
          box(g, 0.18, 10, 0.18, 0xf6f2e8, sx, 5, 0);
          box(g, 0.55, 1.8, 0.55, e > 0 ? 0x6cb4ee : 0x7a1f3d, sx, 0.9, 0); // post pads
          const [px, pz] = W(gx, gz, ry, sx, 0); solids.push({ x: px, z: pz, r: 0.35, y: g.position.y });
        }
        box(g, 5.8, 0.16, 0.16, 0xf6f2e8, 0, 3, 0);
      }
      for (let k = 0; k < 26; k++) {
        const side = k % 2 ? 1 : -1, [px, pz] = P((rnd() - 0.5) * FW * 0.8, side * (3 + rnd() * (FL / 2 - 8)));
        crowd.add(px, terrainHeight(px, pz), pz, ry + (side > 0 ? Math.PI : 0), side > 0 ? 0x6cb4ee : 0x7a1f3d);
      }
      claim(x, z, Math.hypot(FL, FW) / 2 + 2); spots.push({ name: 'footy', x, z });
    }
    // a cricket match: the pitch, stumps at each end, everyone in white
    const c = spot(30, hw + 14, 1.4);
    if (c) {
      const [x, z] = c, ry = rnd() * 6.28, P = (lx, lz) => W(x, z, ry, lx, lz);
      paint(...P(0, -11), ...P(0, 11), 3.0, 0xc9b17c, 0.05);
      for (const e of [-1, 1]) {
        const g = at(...P(0, e * 10), ry);
        for (const sx of [-0.11, 0, 0.11]) box(g, 0.05, 0.71, 0.05, 0xf1e9d6, sx, 0.36, 0);
        box(g, 0.3, 0.03, 0.04, 0xf1e9d6, 0, 0.73, 0);
        paint(...P(-1.5, e * 8.8), ...P(1.5, e * 8.8), 0.08);
      }
      for (const [lx, lz] of [[0.5, 9.3], [-0.5, -9.7], [0.3, -12.5], [0, 13.5], [-1.5, 15]]) { const [px, pz] = P(lx, lz); crowd.add(px, terrainHeight(px, pz), pz, ry, 0xf6f2e8); }
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28 + rnd() * 0.5, d = 15 + rnd() * 10, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; crowd.add(px, terrainHeight(px, pz), pz, Math.atan2(x - px, z - pz), 0xf6f2e8); }
      const sc = at(...P(0, 27), ry); box(sc, 9, 4, 0.3, 0xf6f2e8, 0, 2.8, 0); for (const sx of [-3.5, 3.5]) box(sc, 0.25, 1.2, 0.25, 0x9a9aa6, sx, 0.5, 0); // the sight screen
      claim(x, z, 30); spots.push({ name: 'cricket', x, z });
    }
    // Moreton Bay figs: a fat trunk on buttress roots under a huge dark canopy
    for (let k = 0; k < 6; k++) {
      const f2 = spot(7, hw + 9); if (!f2) break;
      const [x, z] = f2, g = at(x, z, rnd() * 6.28), sc = 0.9 + rnd() * 0.35;
      cyl(g, 0.9 * sc, 1.5 * sc, 6 * sc, 7, 0x7a6a58, 0, 2.6 * sc, 0);
      for (let j = 0; j < 4; j++) box(g, 0.5, 1.2, 2.4 * sc, 0x6e5f4f, Math.sin(j * 1.571) * sc * 1.1, 0.35, Math.cos(j * 1.571) * sc * 1.1).rotation.y = j * 1.571;
      for (let j = 0; j < 6; j++) { const a = j * 1.05 + rnd() * 0.4, d = j ? 3.6 * sc : 0; put(g, new THREE.IcosahedronGeometry((3.8 + rnd() * 1.4) * sc, 0), j % 2 ? 0x2f5d2a : 0x3a6b31, Math.cos(a) * d, (7 + rnd() * 1.5) * sc, Math.sin(a) * d).scale.y = 0.62; }
      solids.push({ x, z, r: 1.4 * sc, y: g.position.y }); claim(x, z, 7 * sc); spots.push({ name: 'fig', x, z });
    }
    crowd.finish();
  }

  if (which === 'centennial') {
    // the Federation Pavilion: a dome on a ring of columns, up on a round base
    const p = spot(11, hw + 12, 1.2);
    if (p) {
      const [x, z] = p, g = at(x, z, 0, terrainHeight(x, z) - 0.3), stone = 0xe8d9b5;
      cyl(g, 8.6, 9.2, 1.6, 16, stone, 0, 0.6, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832; cyl(g, 0.42, 0.5, 5.2, 8, 0xf1e9d6, Math.cos(a) * 6.6, 4.0, Math.sin(a) * 6.6); }
      cyl(g, 7.4, 7.4, 1.1, 16, stone, 0, 7.1, 0);
      put(g, new THREE.SphereGeometry(7.2, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9c9a0, 0, 7.6, 0);
      cyl(g, 1.1, 1.3, 1.8, 8, stone, 0, 15.6, 0);
      solids.push({ x, z, r: 8.6, y: g.position.y }); claim(x, z, 11); spots.push({ name: 'pavilion', x, z });
    }
    // horses in a paddock with a white post-and-rail fence
    const h = spot(19, hw + 14, 2.5);
    if (h) {
      const [x, z] = h, ry = rnd() * 6.28, P = (lx, lz) => W(x, z, ry, lx, lz), white = lam(0xf6f2e8);
      const cs = [[-16, -12], [16, -12], [16, 12], [-16, 12]].map(([a, b]) => P(a, b));
      for (let k = 0; k < 4; k++) {
        const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3.2);
        const post = (j) => { const px = ax + (bx - ax) * j / n, pz = az + (bz - az) * j / n; return V(px, terrainHeight(px, pz), pz); };
        for (let j = 0; j <= n; j++) { const q = post(j); box(worldGroup, 0.16, 1.5, 0.16, 0xf6f2e8, q.x, q.y + 0.6, q.z); }
        for (let j = 0; j < n; j++) for (const y of [0.55, 1.15]) { const a = post(j), b = post(j + 1); worldGroup.add(strut(a.clone().setY(a.y + y), b.clone().setY(b.y + y), 0.1, 0.12, white)); }
        track.walls.push({ ax, az, bx, bz, y: terrainHeight(ax, az) });
      }
      const coats = [0x6b4226, 0x3b2a1e, 0x8a5a2b, 0xd9c9a0, 0x2a2a2a, 0x7a4a2a];
      for (let k = 0; k < 6; k++) {
        const [hx, hz] = P((rnd() - 0.5) * 24, (rnd() - 0.5) * 16), c0 = coats[k], g = at(hx, hz, rnd() * 6.28), grazing = k % 2 === 0;
        box(g, 0.9, 1.0, 2.2, c0, 0, 1.55, 0);
        for (const [lx, lz] of [[-0.3, -0.8], [0.3, -0.8], [-0.3, 0.8], [0.3, 0.8]]) box(g, 0.22, 1.1, 0.22, c0, lx, 0.55, lz);
        if (grazing) { box(g, 0.42, 1.3, 0.5, c0, 0, 1.45, 1.35).rotation.x = 2.2; box(g, 0.36, 0.42, 0.9, c0, 0, 0.75, 1.95).rotation.x = 1.2; }
        else { box(g, 0.42, 1.2, 0.5, c0, 0, 2.2, 1.05).rotation.x = 0.6; box(g, 0.36, 0.42, 0.95, c0, 0, 2.7, 1.7).rotation.x = 0.5; box(g, 0.1, 0.55, 0.6, 0x1d1a17, 0, 2.5, 0.95).rotation.x = 0.6; }
        box(g, 0.14, 0.85, 0.16, 0x1d1a17, 0, 1.55, -1.2).rotation.x = 0.35;
      }
      claim(x, z, 21); spots.push({ name: 'horses', x, z });
    }
    // black swans on the pond
    if (track.lake && track.sites?.lake) {
      const Lk = track.lake, swans = [];
      for (let k = 0; k < 5; k++) {
        const g = new THREE.Group(); g.userData.dyn = true; worldGroup.add(g);
        box(g, 0.6, 0.42, 1.15, 0x1d1a17, 0, 0.2, 0);
        box(g, 0.15, 0.95, 0.15, 0x1d1a17, 0, 0.8, 0.45).rotation.x = -0.15;
        box(g, 0.17, 0.17, 0.4, 0x1d1a17, 0, 1.22, 0.55);
        box(g, 0.11, 0.09, 0.26, 0xe6453a, 0, 1.19, 0.86);
        box(g, 0.5, 0.25, 0.5, 0x2a2622, 0, 0.42, -0.42).rotation.x = 0.5;
        mergeStatic(g);
        swans.push({ g, a: rnd() * 6.28, r: Lk.r * (0.25 + rnd() * 0.4), sp: (0.08 + rnd() * 0.06) * (k % 2 ? 1 : -1), cx: Lk.x + (rnd() - 0.5) * Lk.r * 0.3, cz: Lk.z + (rnd() - 0.5) * Lk.r * 0.3 });
      }
      const swim = (t) => { for (const s of swans) { const a = s.a + t * s.sp; s.g.position.set(s.cx + Math.cos(a) * s.r, Lk.level + 0.05, s.cz + Math.sin(a) * s.r); s.g.rotation.y = Math.atan2(-Math.sin(a) * s.sp, Math.cos(a) * s.sp); } };
      swim(0); anim.push(swim); spots.push({ name: 'swans', x: Lk.x, z: Lk.z });
    }
  }

  if (which === 'thredbo') {
    // A chairlift across the track, so everyone drives under it: a line through a
    // straight bit of road (not by a gate, the start or the bridge), its pylons
    // well clear of the road and the cable lifted high enough over it. The
    // steeper the hill it climbs and the longer the run-up to it, the better.
    const PYLON = 9, CLEAR = 7.2; // a pylon's height, and how far the cable stays above any road under it
    const lineUp = (bx, bz, tx, tz, dc) => {
      const len = Math.hypot(tx - bx, tz - bz), ux = (tx - bx) / len, uz = (tz - bz) / len, P = (d) => [bx + ux * d, bz + uz * d];
      if ([P(0), P(len)].some(([x, z]) => Math.hypot(x - lim.x, z - lim.z) > lim.r - 20 || !isFree(track, x, z, 7, hw + 10))) return null;
      // pylons about 32 m apart; where the line crosses the road (dc along it), one 19 m either side of the crossing
      const ds = [0];
      if (dc == null) { const n = Math.max(2, Math.round(len / 32)); for (let k = 1; k < n; k++) ds.push(len * k / n); }
      else { for (let d = dc - 19; d > 24; d -= 32) ds.push(d); for (let d = dc + 19; d < len - 24; d += 32) ds.push(d); }
      ds.push(len); ds.sort((p, q) => p - q);
      if (ds.slice(1, -1).some((d) => !isFree(track, ...P(d), 3, hw + 6))) return null;
      const H = ds.map(() => PYLON), base = ds.map((d) => terrainHeight(...P(d)));
      const cable = (d) => { let k = 0; while (k < ds.length - 2 && d >= ds[k + 1]) k++; const u = (d - ds[k]) / (ds[k + 1] - ds[k]); return [lerp(base[k] + H[k], base[k + 1] + H[k + 1], u) + 0.4 - Math.sin(Math.PI * u) * 0.8, k]; };
      // taller pylons either side of any road the cable passes over
      let crossings = 0;
      for (let pass = 0; pass < 3; pass++) {
        crossings = 0;
        for (const q of samples) {
          const rx = q.p.x - bx, rz = q.p.z - bz, d = rx * ux + rz * uz;
          if (d < -3 || d > len + 3 || Math.abs(rx * uz - rz * ux) > hw + 3.4) continue;
          crossings++;
          const [y, k] = cable(clamp(d, 0, len)), short = q.p.y + CLEAR - y;
          if (short > 0) { H[k] += short + 0.2; H[k + 1] += short + 0.2; }
        }
      }
      if (H.some((h) => h > 17)) return null;
      return { bx, bz, tx, tz, len, ds, H, crossings, climb: Math.abs(base[base.length - 1] - base[0]) };
    };
    const runUp = (i) => { let n = 0; const h = samples[i].th; while (n < 90) { const t = samples[(i - n - 1 + N) % N].th; if (t.x * h.x + t.z * h.z < 0.985) break; n++; } return n; }; // how long the road has been straight
    let lift = null;
    for (let k = 0; k < 600; k++) {
      const i = Math.floor(rnd() * N), s = samples[i], near = (j, n) => Math.min((i - j + N) % N, (j - i + N) % N) < n;
      if (track.vergeDrop[i] > 1.5 || near(0, 45) || track.cps.some((c) => near(c, 16))) continue;
      const run = runUp(i);
      if (run < 24) continue;
      const a = Math.atan2(s.th.x, s.th.z) + Math.PI / 2 + (rnd() - 0.5) * 0.8, cx = Math.sin(a), cz = Math.cos(a);
      let d1 = 50 + rnd() * 90, d2 = 50 + rnd() * 90, lo = [s.p.x - cx * d1, s.p.z - cz * d1], hi = [s.p.x + cx * d2, s.p.z + cz * d2];
      if (terrainHeight(...hi) < terrainHeight(...lo)) { [lo, hi] = [hi, lo]; d1 = d2; } // it runs uphill
      const L = lineUp(lo[0], lo[1], hi[0], hi[1], d1);
      if (!L || L.climb < 5) continue;
      L.score = L.climb * 2 + run * 0.6 + (near(0, 160) ? 18 : 0); L.cross = [s.p.x, s.p.z, i];
      if (!lift || L.score > lift.score) lift = L;
    }
    if (!lift) for (let k = 0; k < 300; k++) { // nowhere to cross it: the steepest clear line beside the track instead
      const [tx, tz] = randIn(20), a = rnd() * 6.2832, len = 150 + rnd() * 80, bx = tx + Math.cos(a) * len, bz = tz + Math.sin(a) * len;
      if (Math.hypot(bx - lim.x, bz - lim.z) > lim.r - 20) continue;
      const climb = terrainHeight(tx, tz) - terrainHeight(bx, bz);
      if (climb < 12 || (lift && climb <= lift.climb)) continue;
      let ok = true;
      for (let d = 0; d <= len && ok; d += 6) ok = isFree(track, bx + (tx - bx) * d / len, bz + (tz - bz) * d / len, 3, hw + 9);
      if (ok) lift = lineUp(bx, bz, tx, tz) || lift;
    }
    if (lift) {
      const { bx, bz, len, ds, H } = lift, ux = (lift.tx - bx) / len, uz = (lift.tz - bz) / len, sx = uz, sz = -ux, ry = Math.atan2(ux, uz);
      const n = ds.length - 1, tops = [], steel = 0x5b606a;
      for (let k = 0; k <= n; k++) {
        const px = bx + ux * ds[k], pz = bz + uz * ds[k], y = terrainHeight(px, pz), g = at(px, pz, ry, y), end = k === 0 || k === n, h = H[k];
        if (!end) { box(g, 0.6, h + 0.6, 0.6, steel, 0, (h + 0.6) / 2, 0); box(g, 5.4, 0.35, 0.35, steel, 0, h + 0.4, 0); solids.push({ x: px, z: pz, r: 0.5, y }); claim(px, pz, 3); }
        else {
          const back = k ? 3 : -3; // the station hut sits behind the big wheel
          box(g, 7, 3.4, 5, k ? 0x8f3a2e : 0x6b4a2a, 0, 1.7, back); box(g, 7.8, 0.5, 5.8, 0xf6f2e8, 0, 3.6, back);
          box(g, 0.8, h, 0.8, steel, 0, h / 2, 0); cyl(g, 2.4, 2.4, 0.5, 16, 0x3b4250, 0, h, 0);
          solids.push({ x: px + ux * back, z: pz + uz * back, r: 3.5, y }); claim(px, pz, 7);
        }
        tops.push(V(px, y + h, pz));
      }
      for (let d = 8; d < len; d += 8) { const x = bx + ux * d, z = bz + uz * d; if (roadGap(track, x, z) > hw + 4) claim(x, z, 4); } // nothing grows up into the chairs
      const wire = lam(0x26303f);
      for (const side of [2.2, -2.2]) for (let k = 0; k < n; k++) {
        const a = tops[k].clone().add(V(sx * side, 0.4, sz * side)), b = tops[k + 1].clone().add(V(sx * side, 0.4, sz * side));
        worldGroup.add(strut(a, b, 0.07, 0.07, wire));
      }
      // the chairs: up one side with skiers on, down the other empty
      const chairG = new THREE.Group();
      box(chairG, 1.7, 0.15, 0.62, 0x3b4250, 0, -2.4, 0.05); box(chairG, 1.7, 0.65, 0.12, 0x3b4250, 0, -2.0, -0.26); box(chairG, 0.09, 2.3, 0.09, 0x8d93a0, 0, -1.15, -0.1);
      mergeStatic(chairG);
      const riderG = new THREE.Group();
      for (const s of [-0.42, 0.42]) { box(riderG, 0.46, 0.75, 0.32, 0xffffff, s, -1.95, 0.05); box(riderG, 0.3, 0.3, 0.3, 0xffffff, s, -1.4, 0.05); }
      mergeStatic(riderG);
      const SP = 14, count = Math.floor((2 * len) / SP), jackets = [0xe6453a, 0x3d8bff, 0xffd23f, 0x7ed957, 0xff6bcb, 0xff8a3d, 0x2ec4b6];
      const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.userData.dyn = true; m.castShadow = true; worldGroup.add(m); return m; };
      const chairs = mk(chairG.children[0].geometry, mergedMat(THREE.FrontSide, 0)), riders = mk(riderG.children[0].geometry, mergedMat(THREE.FrontSide, 0));
      for (let i = 0; i < count; i++) riders.setColorAt(i, new THREE.Color(jackets[i % jackets.length]));
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = V(0, 1, 0), Z = V(0, 0, 0), ONE = V(1, 1, 1), P = V(0, 0, 0);
      // skiers coming down beside it, turning from side to side; the run is kept clear of trees
      // (on whichever side, and along whichever stretch, a run beside the lift stays longest clear of the road)
      const clearRun = (off) => {
        let best = [0, 0], from = null;
        for (let d = 0; d <= len; d += 4) {
          const ok = [off - 8, off + 8].every((l) => { const x = bx + ux * d + sx * l, z = bz + uz * d + sz * l; return roadGap(track, x, z) > hw + 9 && Math.hypot(x - lim.x, z - lim.z) < lim.r - 6; });
          if (ok && from == null) from = d;
          if (from != null && (!ok || d + 4 > len)) { const to = ok ? d : d - 4; if (to - from > best[1] - best[0]) best = [from, to]; from = null; }
        }
        return best;
      };
      const [runA, runB] = [20, -20].map((off) => ({ off, r: clearRun(off) })), pick = runA.r[1] - runA.r[0] >= runB.r[1] - runB.r[0] ? runA : runB;
      const off = pick.off, r0 = pick.r[0], r1 = pick.r[1], RL = r1 - r0, SKI = RL >= 40 ? 7 : 0;
      for (let d = r0; d <= r1; d += 10) claim(bx + ux * d + sx * off, bz + uz * d + sz * off, 9);
      const skierG = new THREE.Group();
      for (const s of [-0.16, 0.16]) box(skierG, 0.1, 0.05, 1.7, 0xffffff, s, 0.03, 0);
      box(skierG, 0.46, 0.8, 0.32, 0xffffff, 0, 0.8, 0).rotation.x = 0.25; box(skierG, 0.3, 0.3, 0.3, 0xffffff, 0, 1.35, 0.12);
      mergeStatic(skierG);
      const skiers = new THREE.InstancedMesh(skierG.children[0].geometry, mergedMat(THREE.FrontSide, 0), Math.max(1, SKI)); skiers.count = SKI;
      skiers.frustumCulled = false; skiers.userData.dyn = true; skiers.castShadow = true; worldGroup.add(skiers);
      for (let i = 0; i < SKI; i++) skiers.setColorAt(i, new THREE.Color(jackets[(i + 3) % jackets.length]));
      const run = (t) => {
        for (let i = 0; i < count; i++) {
          const d = (i * SP + t * 2.4) % (2 * len), goingUp = d < len, x = goingUp ? d : 2 * len - d, side = goingUp ? 2.2 : -2.2;
          let k = 0; while (k < n - 1 && x >= ds[k + 1]) k++;
          const u = (x - ds[k]) / (ds[k + 1] - ds[k]);
          const a = tops[k], b = tops[k + 1];
          P.set(a.x + (b.x - a.x) * u + sx * side, a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * 0.8 + 0.4, a.z + (b.z - a.z) * u + sz * side);
          Q.setFromAxisAngle(up, ry + (goingUp ? 0 : Math.PI));
          chairs.setMatrixAt(i, M.compose(P, Q, ONE)); riders.setMatrixAt(i, M.compose(P, Q, goingUp ? ONE : Z));
        }
        for (let i = 0; i < SKI; i++) {
          const p = (t * 7 + (i * RL) / SKI) % RL, d = r1 - p, w = 0.11 + i * 0.01, lat = off + Math.sin(p * w + i) * 7, slope = Math.cos(p * w + i) * 7 * w;
          const x = bx + ux * d + sx * lat, z = bz + uz * d + sz * lat;
          P.set(x, terrainHeight(x, z), z); Q.setFromAxisAngle(up, ry + Math.PI - Math.atan(slope));
          skiers.setMatrixAt(i, M.compose(P, Q, ONE));
        }
        chairs.instanceMatrix.needsUpdate = riders.instanceMatrix.needsUpdate = skiers.instanceMatrix.needsUpdate = true;
      };
      run(0); anim.push(run);
      spots.push({ name: 'chairlift', x: bx + ux * len / 2, z: bz + uz * len / 2, cross: lift.cross || null, crossings: lift.crossings, H, ds, line: [bx, bz, lift.tx, lift.tz], run: [off, r0, r1] });
      // A-frame lodges round the bottom of it
      for (let k = 0, made = 0; k < 40 && made < 6; k++) {
        const f = spot(5, hw + 9, 2.5, [bx - ux * 24, bz - uz * 24, 28], 30); if (!f) continue;
        const [x, z] = f, g = at(x, z, ry + Math.PI + (rnd() - 0.5) * 0.6);
        put(g, prism(7, 7.5, 8), [0x8f3a2e, 0x6b4a2a, 0x3b4250][made % 3], 0, 0, 0);
        box(g, 2.6, 2.6, 0.1, 0xffd27a, 0, 2.2, 4.02, 0xc98a2a); // a lit window in the gable
        box(g, 1.1, 1.9, 0.1, 0x3b2a1e, 0, 0.95, 4.02);
        solids.push({ x, z, r: 3.6, y: g.position.y }); claim(x, z, 5); made++;
      }
    }
  }

  if (which === 'panorama') {
    // (Until 3.56 a lit sign stood on the approach to each corner with one of Mount Panorama's corner names on it,
    // Hell Corner to Murray's Corner. The track is Pinto Speedway now, and the owner had them taken down. Each
    // sign's place is still found and kept clear, as it always was, so that the trees and everything else on the
    // track stand exactly where they did.)
    const turn = samples.map((a, i) => { const b = samples[(i + 10) % N]; return a.th.x * b.th.z - a.th.z * b.th.x; });
    const corners = [];
    for (let i = 0; i < N; i++) {
      const k = Math.abs(turn[i]);
      if (k < 0.22) continue;
      const last = corners[corners.length - 1];
      if (last && i - last.i < 45) { if (k > last.k) Object.assign(last, { i, k, dir: Math.sign(turn[i]) }); continue; }
      corners.push({ i, k, dir: Math.sign(turn[i]) });
    }
    if (corners.length > 1 && corners[0].i + N - corners[corners.length - 1].i < 45) corners.pop(); // the last bend is the first one again
    for (const c of corners.slice(0, 11)) {
      const out = c.dir > 0 ? 1 : -1, tries = [];
      for (const back of [14, 20, 9, 27, 34]) for (const side of [out, -out]) for (let lat = hw + 6; lat < hw + 22; lat += 2) tries.push([back, side, lat]);
      for (const [back, side, lat] of tries) {
        const s = samples[(c.i - back + N) % N], x = s.p.x + s.left.x * side * lat, z = s.p.z + s.left.z * side * lat;
        if (Math.hypot(x - lim.x, z - lim.z) > lim.r - 6 || !isFree(track, x, z, 3.4, hw + 5)) continue;
        claim(x, z, 4);
        break;
      }
    }
    // campers up on the mountain, round their fires
    let top = samples[0];
    for (const s of samples) if (s.p.y > top.p.y) top = s;
    const crowd = makePeople(80, rnd), fires = [], glow = glowTexture(128, 128, 64, 64, 64);
    const canvas = [0xff8a3d, 0x3d8bff, 0x7ed957, 0xffd23f, 0xe6453a, 0x2ec4b6];
    for (const side of [1, -1]) {
      const cx = top.p.x + top.left.x * side * (hw + 38), cz = top.p.z + top.left.z * side * (hw + 38);
      for (let k = 0, placed = 0; k < 200 && placed < 22; k++) {
        const x = cx + (rnd() - 0.5) * 64, z = cz + (rnd() - 0.5) * 64;
        if (Math.hypot(x - lim.x, z - lim.z) > lim.r - 8 || !isFree(track, x, z, 3, hw + 12)) continue;
        const g = at(x, z, rnd() * 6.28), kind = placed % 5;
        if (kind === 4) {
          cyl(g, 0.75, 0.9, 0.3, 7, 0x5b5b5b, 0, 0.15, 0);
          for (let j = 0; j < 3; j++) box(g, 0.18, 0.18, 1.3, 0x4a3221, 0, 0.35, 0).rotation.y = j * 1.05;
          const flame = put(g, new THREE.ConeGeometry(0.55, 1.4, 6), 0xffa040, 0, 0.95, 0, 0xff6a00); flame.castShadow = false; flame.userData.dyn = true;
          const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), lightMat(glow, 0xff8a30, 0.8)); pool.position.y = 0.12; pool.userData.dyn = true; g.add(pool);
          fires.push({ m: flame, ph: rnd() * 6.28 });
          for (let j = 0; j < 4; j++) { const a = j * 1.571 + rnd() * 0.5; crowd.add(x + Math.cos(a) * 2.3, g.position.y, z + Math.sin(a) * 2.3, Math.atan2(-Math.cos(a), -Math.sin(a))); }
        } else if (kind === 3) { // a caravan
          box(g, 2.3, 2.2, 5, 0xf1f0ea, 0, 1.4, 0); box(g, 2.34, 0.3, 4.6, canvas[placed % canvas.length], 0, 1.1, 0); box(g, 2.36, 0.6, 2.4, 0x26303f, 0, 1.9, 0.6);
          for (const wx of [-1.2, 1.2]) cyl(g, 0.4, 0.4, 0.3, 8, 0x1d2230, wx, 0.4, 0).rotation.z = Math.PI / 2;
        } else { // a tent, and now and then a flag on a pole by it
          put(g, prism(2.6, 1.8, 3), canvas[(placed * 7) % canvas.length], 0, 0, 0);
          if (placed % 3 === 0) { box(g, 0.08, 5, 0.08, 0xd9dde3, 2, 2.5, 0); box(g, 1.3, 0.75, 0.04, canvas[(placed + 2) % canvas.length], 2.65, 4.5, 0); }
        }
        claim(x, z, 3); solids.push({ x, z, r: 1.8, y: g.position.y }); placed++;
      }
    }
    crowd.finish();
    if (fires.length) anim.push((t) => { for (const f of fires) f.m.scale.set(1, 0.8 + Math.sin(t * 11 + f.ph) * 0.15 + Math.sin(t * 17.3 + f.ph * 2) * 0.1, 1); });
    spots.push({ name: 'campers', x: top.p.x, z: top.p.z });
  }

  if (which === 'noosa') {
    const L = track.sea.level, s0 = samples[0], out = wetAt(s0.p.x + s0.left.x * 80, s0.p.z + s0.left.z * 80) ? 1 : -1;
    const F = (a, o) => [s0.p.x + s0.th.x * a + s0.left.x * out * o, s0.p.z + s0.th.z * a + s0.left.z * out * o]; // along the straight, out to sea
    // waves rolling in along the headland, surfers riding them, more waiting out the back
    const shoreA = (o) => { let a = 150; while (a > -80 && terrainHeight(...F(a, o)) > L) a -= 0.5; return a; };
    const o0 = 165, o1 = 245, a0 = shoreA(o0), a1 = shoreA(o1), da = a1 - a0, dO = o1 - o0, len = Math.hypot(da, dO);
    const na = -dO / len, no = da / len; // out from the shore, into the bay
    const [ex, ez] = F(a0 + da, o0 + dO), [sx0, sz0] = F(a0, o0), ry = Math.atan2(ex - sx0, ez - sz0); // along the shore, in the world
    const waves = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, len * 0.85), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0, flatShading: true }));
      m.rotation.y = ry; m.userData.dyn = true; worldGroup.add(m); waves.push(m);
    }
    const board = (g, c) => put(g, taperBox(0.55, 0.08, 2.3, [0.4, 1, 0.05], [0.8, 1, 0]), c, 0, 0.04, 0);
    const surfers = [0xffd23f, 0xf6f2e8, 0xff6bcb, 0x2ec4b6].map((c, k) => {
      const g = new THREE.Group(); g.userData.dyn = true; worldGroup.add(g);
      board(g, c); box(g, 0.46, 0.7, 0.3, 0x1d2230, 0, 0.5, 0).rotation.x = 0.3; box(g, 0.3, 0.3, 0.3, 0xd9a577, 0, 1.0, 0.12);
      mergeStatic(g); return { g, wave: k % 3, ph: rnd() * 6.28 };
    });
    const sitters = [0x3d8bff, 0xffffff, 0xe6453a, 0x7ed957].map((c, k) => {
      const g = new THREE.Group(); g.userData.dyn = true; worldGroup.add(g);
      board(g, c); box(g, 0.46, 0.55, 0.3, 0x1d2230, 0, 0.32, 0); box(g, 0.3, 0.3, 0.3, 0xd9a577, 0, 0.75, 0);
      mergeStatic(g);
      const u = (k + 0.5) / 4 - 0.5, [x, z] = F(a0 + da * (0.5 + u * 0.8) + na * 70, o0 + dO * (0.5 + u * 0.8) + no * 70);
      return { g, x, z, ph: rnd() * 6.28 };
    });
    const CYCLE = 13;
    const surf = (t) => {
      waves.forEach((m, k) => {
        const p = ((t / CYCLE) + k / 3) % 1, off = 4 + 56 * (1 - p), [x, z] = F(a0 + da / 2 + na * off, o0 + dO / 2 + no * off);
        m.position.set(x, L + 0.12, z); m.material.opacity = Math.sin(Math.PI * p) * 0.85; m.userData.p = p;
      });
      for (const s of surfers) {
        const w = waves[s.wave], p = w.userData.p, along = Math.sin(t * 0.32 + s.ph) * len * 0.33, dir = Math.cos(t * 0.32 + s.ph) >= 0 ? 1 : -1;
        s.g.visible = p > 0.12 && p < 0.88;
        s.g.position.set(w.position.x + Math.sin(ry) * along, L + 0.2, w.position.z + Math.cos(ry) * along);
        s.g.rotation.set(0, ry + (dir > 0 ? 0 : Math.PI) + 0.35 * dir, -0.15 * dir, 'YXZ');
      }
      for (const s of sitters) { s.g.position.set(s.x, L + 0.05 + Math.sin(t * 1.2 + s.ph) * 0.12, s.z); s.g.rotation.set(0, s.ph, Math.sin(t * 0.9 + s.ph) * 0.06); }
    };
    surf(0); anim.push(surf);
    { const [x, z] = F(a0 + da / 2, o0 + dO / 2); spots.push({ name: 'surf', x, z }); }
    // koalas up in the gum trees on the headland
    for (let k = 0, n = 0; k < 500 && n < 7; k++) {
      const [x, z] = F(60 + rnd() * 140, 25 + rnd() * 240);
      if (wetAt(x, z) || Math.hypot(x - lim.x, z - lim.z) > lim.r - 10 || !isFree(track, x, z, 2.5, hw + 8)) continue;
      const g = at(x, z, rnd() * 6.28);
      cyl(g, 0.26, 0.4, 7.5, 6, 0xe3ddd0, 0, 3.75, 0);
      box(g, 0.2, 3, 0.2, 0xe3ddd0, 0.9, 6.4, 0).rotation.z = -0.5;
      for (let j = 0; j < 4; j++) put(g, new THREE.IcosahedronGeometry(1.8 + rnd() * 0.6, 0), j % 2 ? 0x6f8f5a : 0x7d9a62, (rnd() - 0.5) * 2.6, 7.8 + rnd() * 1.6, (rnd() - 0.5) * 2.6);
      box(g, 0.56, 0.76, 0.5, 0x8f949e, 0, 4.2, 0.44);           // the koala, hugging the trunk
      box(g, 0.5, 0.44, 0.44, 0x9a9faa, 0, 4.8, 0.5);
      for (const ex2 of [-0.32, 0.32]) box(g, 0.26, 0.26, 0.12, 0x9a9faa, ex2, 5.05, 0.48);
      box(g, 0.15, 0.19, 0.1, 0x1d1a17, 0, 4.74, 0.75);
      solids.push({ x, z, r: 0.45, y: g.position.y }); claim(x, z, 2.5); spots.push({ name: 'koala', x, z }); n++;
    }
  }

  if (which === 'sydney') {
    const s0 = samples[0];
    // Sydney Tower: straight ahead down the main straight, out past the edge of the map
    const R = lim.r + 70, dx = s0.p.x - lim.x, dz = s0.p.z - lim.z, b = dx * s0.th.x + dz * s0.th.z, d = -b + Math.sqrt(Math.max(0, b * b - (dx * dx + dz * dz - R * R)));
    const tx = s0.p.x + s0.th.x * d, tz = s0.p.z + s0.th.z * d, g = at(tx, tz, 0), grey = 0xb9bdc5;
    cyl(g, 3.4, 4.4, 252, 10, grey, 0, 124, 0);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.2832; g.add(strut(V(Math.cos(a) * 13, 0, Math.sin(a) * 13), V(Math.cos(a) * 4.3, 196, Math.sin(a) * 4.3), 0.35, 0.35, lam(0x9a9faa))); }
    cyl(g, 12, 9, 6, 16, grey, 0, 200, 0);
    cyl(g, 12.5, 12.5, 20, 16, 0xd9b44a, 0, 213, 0, 0x6a5214);                    // the golden turret
    cyl(g, 12.7, 12.7, 3.2, 16, 0xffe9a8, 0, 208, 0, 0xffd27a);                    // its lit windows
    cyl(g, 9, 12.5, 4, 16, grey, 0, 225, 0);
    cyl(g, 0.7, 1.4, 70, 6, grey, 0, 262, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); tip.position.set(tx, g.position.y + 298, tz); tip.userData.dyn = true; worldGroup.add(tip);
    anim.push((t) => { tip.visible = t % 1.5 < 0.75; });
    claim(tx, tz, 26); spots.push({ name: 'tower', x: tx, z: tz, h: 220 });
    // the harbour behind the start line: the Harbour Bridge across it, the Opera House on the far side
    const ox = -s0.th.x, oz = -s0.th.z, HR = 210, hx = lim.x + ox * (lim.r + 430), hz = lim.z + oz * (lim.r + 430);
    let top = -Infinity;
    for (let k = 0; k < 60; k++) { const a = rnd() * 6.2832, r = Math.sqrt(rnd()) * HR; top = Math.max(top, terrainHeight(hx + Math.cos(a) * r, hz + Math.sin(a) * r)); }
    const WL = top + 0.4, water = new THREE.Mesh(new THREE.CircleGeometry(HR, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x14304f, emissive: 0x050f1d }));
    water.position.set(hx, WL, hz); water.receiveShadow = true; worldGroup.add(water);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(HR, HR, 12, 48, 1, true), lam(0x5b606a, 0, THREE.DoubleSide)); wall.position.set(hx, WL - 6, hz); worldGroup.add(wall);
    track.harbour = { x: hx, z: hz, r: HR }; claim(hx, hz, HR + 8);
    // the Harbour Bridge across it and the Opera House on the far side
    const px = -oz, pz = ox, cx = hx + ox * -(HR * 0.35), cz = hz + oz * -(HR * 0.35);
    const ohx = hx + ox * (HR * 0.3) + px * (HR * 0.45), ohz = hz + oz * (HR * 0.3) + pz * (HR * 0.45);
    const DECK = buildSydneyIcons(cx, cz, px, pz, WL, ohx, ohz, Math.atan2(px, pz) + 0.4, 1, true);
    spots.push({ name: 'bridge', x: cx, z: cz, h: DECK });
    spots.push({ name: 'opera', x: ohx, z: ohz, h: 30 });
  }
}

// Places to explore away from the circuit: a lake, a fairground, a
// village, a stone circle, a campsite, a windmill, a radio mast, and a blimp
// overhead. Everything here is solid.
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
  }

  // ---- 9LAT2: a brick classroom block with its name on the roof ----
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
    // The signs take the light of the place, like the walls they're on: in the sun by day, dim at night. (They used to
    // be lit from inside, glowing at full strength whatever the hour: the owner asked for 9LAT2 not to be illuminated.
    // They're drawn as if a touch nearer than they are, so the one over the door never flickers against the wall
    // a hand's width behind it.)
    const signMat = new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }); // fades into the haze like everything else: you have to get close
    for (const [w, h, y, z, ry] of [[10, 2.5, 9.4, 0.12, 0], [10, 2.5, 9.4, -0.12, Math.PI], [5.2, 1.3, 4.35, 5.6, 0]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), signMat); m.position.set(0, y, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m); }
    for (const x of [-4.4, 4.4]) box(g, 0.25, 2.2, 0.25, 0x3b4250, x, 8.3, 0);
    for (const x of [-7, 7]) { box(g, 2.6, 0.2, 0.7, 0x7a4a2a, x, 0.55, 8); box(g, 2.2, 0.5, 0.2, 0x5a6372, x, 0.25, 8); }
    rect(g, 0, 0, 20, 11);
    // (Race to 9LAT2 finished on a pad in front of the door, under a beam of light. The mode is gone: the owner binned
    // it so that the gaps left in the barriers for it could be closed. The building stays, a landmark like the rest.)
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
  return cleanTexture(c, [255, 255, 255], false);
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
  for (let k = 0; k < (track.theme === 'city' ? 300 : 900); k++) { // (fewer over the city: the glow of the streets)
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
  const desert = track.theme === 'desert', snow = track.theme === 'snow', forest = track.theme === 'forest', beach = track.theme === 'beach';
  if (track.theme === 'city') { buildCity(track, rnd); return; } // the city has a skyline of its own, and no countryside
  if (track.theme === 'mall') { buildMall(track, rnd); return; }  // and so has the shopping centre
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
  for (let k = 0; k < (beach ? 0 : 4); k++) { // (the beach has boats instead)
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
  const farm = beach ? null : pick(16, hw + 38);
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
  for (let f = 0; f < (desert || snow || forest || beach ? 0 : 5); f++) { // no sheep in the desert, the snow or the forest
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
  for (let f = 0; f < (desert || snow || forest || beach ? 0 : 5); f++) { // or hay
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
  } else if (beach) {
    if (track.def.local === 'rosebay') buildRoseBay(track, rnd, randIn); else buildBeach(track, rnd, randIn);
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
  } else if (beach) {
    scatter(bushes, 200, [0x4f9a3a, 0x3f8a3a, 0x6cb84f, 0x8cc65a], 0.7, 1.7, 0.35); // tropical shrubs
    scatter(rocks, 130, [0xa39a86, 0x8f8a7c, 0xb5ab95, 0x7d7a70], 0.6, 2.8, 0.2, true);
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
    const h = (40 + rnd() * 70) * (snow ? 1.5 : beach ? 0.6 : 1), w = 90 + rnd() * 120; // taller, alpine, in the snow; low green islands off the beach
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.scale.set(w, h, w);
    hill.position.set(center.x + Math.cos(ang) * r, h / 2 - 2, center.z + Math.sin(ang) * r);
    hill.rotation.y = rnd() * Math.PI;
    if (track.sea?.clear && terrainHeight(hill.position.x, hill.position.z) < track.sea.level) continue; // (this track's own scenery puts what's wanted out in the water)
    if (track.def.suburbs) continue; // (and this one has hills of its own all round, with a town on them)
    worldGroup.add(hill);
  }
  // and bigger ones far off on the horizon: hazy on high, clear on max
  for (let i = 0; i < 22; i++) {
    const ang = (i / 22) * Math.PI * 2 + rnd() * 0.25;
    const r = 1300 + rnd() * 900;
    const h = (130 + rnd() * 190) * (snow ? 1.4 : beach ? 0.45 : 1), w = 320 + rnd() * 320;
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
    // The basket hangs from the envelope: four ropes from its corners up to the skirt, and the burner between them.
    // (There used to be nothing joining the two: a balloon, and a box floating a metre under it.)
    const rope = lam(0x3b2a1e);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) g.add(strut(V(sx * 0.8, -11.9, sz * 0.8), V(sx * 1.9, -7.6, sz * 1.9), 0.22, 0.22, rope));
    const burner = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), lam(0x8d93a0)); burner.position.y = -10.6; g.add(burner);
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
  const birdMat = new THREE.MeshBasicMaterial({ color: beach ? 0xf4f6f8 : 0x2b2f3a, side: THREE.DoubleSide }); // gulls at the seaside
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

// Westfield: a shopping centre you race through. The lap starts on the roof
// of the car park, comes down the ramp, crosses Oxford Street, goes in through
// the doors and along the mall between the shops (some real ones among them,
// in plain lettering: the owner asked for local names here), round the food
// court and back out, across Oxford Street again and up the other ramp. The
// 333 waits at its stop, there are walkways over the street between the two
// buildings, and the city and the Harbour Bridge are on the horizon from the
// roof. There are no barriers along the road: the roof is open to drive on,
// out to the low wall round its edge (the parked cars are solid), the ramps
// have railings because they're bridges, in the mall the shopfronts are the
// walls, and the food court has a glass screen round it.
// A shape made of blocks, to be drawn many times as instances. `build` is handed block(): a block between two
// rectangles (x half-width, z from a to b) at two heights, centred on x = cx. `side` colours its sides, `top` its
// top (null: no top, it's hidden); `mask` picks the sides: 1 back, 2 right, 4 front, 8 left. Colours are what each
// instance's own colour gets multiplied by: white takes it as it is, dark stays dark.
function blockShape(build) {
  const pos = [], col = [];
  build((w0, a0, b0, y0, w1, a1, b1, y1, side, top, cx = 0, mask = 15) => {
    const B = [V(cx - w0, y0, a0), V(cx + w0, y0, a0), V(cx + w0, y0, b0), V(cx - w0, y0, b0)], T = [V(cx - w1, y1, a1), V(cx + w1, y1, a1), V(cx + w1, y1, b1), V(cx - w1, y1, b1)];
    for (let k = 0; k < 4; k++) if (mask & (1 << k)) pushQuad(pos, col, B[(k + 1) % 4], B[k], T[k], T[(k + 1) % 4], side); // (wound to face outwards)
    if (top) pushQuad(pos, col, T[3], T[2], T[1], T[0], top);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
// A parked car, as one shape: a low body, a glasshouse that narrows to the roof, four wheels. Its paint is white
// here and takes each car's own colour; glass and tyres are dark whatever the colour. It stands on y = 0, nose to +z.
function parkedCarGeometry() {
  const PAINT = new THREE.Color(1, 1, 1), GLASS = new THREE.Color(0.13, 0.16, 0.2), TYRE = new THREE.Color(0.07, 0.07, 0.08), TRIM = new THREE.Color(0.2, 0.2, 0.22);
  return blockShape((block) => {
    block(0.9, -2.1, 2.1, 0.22, 0.9, -2.1, 2.1, 0.5, TRIM, null);           // sills and bumpers
    block(0.9, -2.08, 2.08, 0.5, 0.88, -2.02, 1.98, 0.78, PAINT, PAINT);    // the body, to the waistline
    block(0.84, -1.5, 0.95, 0.78, 0.7, -1.08, 0.42, 1.28, GLASS, PAINT);    // the glasshouse, and the roof
    for (const sx of [-1, 1]) for (const z of [-1.3, 1.32]) block(0.14, z - 0.36, z + 0.36, 0, 0.14, z - 0.36, z + 0.36, 0.66, TYRE, null, sx * 0.8, 5 | (sx > 0 ? 2 : 8)); // (a touch proud of the body: the outside, front and back of each tyre)
  });
}
// A house (walls and a hipped roof) and a block of flats (four floors of windows under a flat roof), for a suburb
// seen from a way off. Each stands on y = 0 with four metres of wall below that, to sit on sloping ground.
function suburbGeometry() {
  const WALL = new THREE.Color(1, 1, 1), ROOF = new THREE.Color(0.74, 0.36, 0.27), GLASS = new THREE.Color(0.3, 0.38, 0.47), TRIM = new THREE.Color(0.8, 0.8, 0.8);
  // (Windows are lengths of the wall itself, not panes standing just in front of it: these are seen from half a
  // kilometre off and more, where two faces 12 cm apart come out at the same depth and flicker.)
  const house = blockShape((block) => {
    block(5, -4, 4, -4, 5, -4, 4, 3.4, WALL, null, 0, 11);                                              // the back and the two ends
    const front = (x0, x1, y0, y1, c) => block((x1 - x0) / 2, 4, 4, y0, (x1 - x0) / 2, 4, 4, y1, c, null, (x0 + x1) / 2, 4);
    front(-5, 5, -4, 0.9, WALL); front(-5, 5, 2.3, 3.4, WALL);                                           // the front: wall below and above,
    for (const [x0, x1, c] of [[-5, -3.3, WALL], [-3.3, -1.1, GLASS], [-1.1, 1.1, WALL], [1.1, 3.3, GLASS], [3.3, 5, WALL]]) front(x0, x1, 0.9, 2.3, c); // and two windows between
    block(5.5, -4.5, 4.5, 3.4, 1.2, -0.3, 0.3, 6.2, ROOF, ROOF);
  });
  const flats = blockShape((block) => {
    block(8, -6, 6, -4, 8, -6, 6, 13, WALL, null, 0, 10);                                                // the two end walls
    let y = -4;
    for (const g of [1.3, 4.5, 7.7, 10.9, 13]) { // the long sides: a band of wall, then a row of windows, four floors of them
      block(8, -6, 6, y, 8, -6, 6, g, WALL, null, 0, 5);
      if (g < 13) block(8, -6, 6, g, 8, -6, 6, g + 1.3, GLASS, null, 0, 5);
      y = g + 1.3;
    }
    block(8.3, -6.3, 6.3, 13, 8.3, -6.3, 6.3, 13.6, TRIM, TRIM);
  });
  return { house, flats };
}

function buildMall(track, rnd) {
  const { samples, N, hw } = track, lim = track.limit, solids = track.solids, walls = track.walls;
  const [A, B, MEDIAN, SPAN] = track.def.blocks; // the car park and the mall, each [x0, z0, x1, z1]; then Oxford Street's median, and the bridge over the street
  const mats = new Map();
  const lam = (c, e = 0) => { const k = c + '|' + e; let m = mats.get(k); if (!m) mats.set(k, m = new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true })); return m; };
  const add = (g, geo, c, x, y, z, e) => { const m = new THREE.Mesh(geo, lam(c, e)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, c, x, y, z, e) => add(g, new THREE.BoxGeometry(w, h, d), c, x, y, z, e);
  const at = (x, z, ry = 0, y = terrainHeight(x, z)) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; worldGroup.add(g); return g; };
  const W = (g, lx, lz) => { const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y); return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c]; }; // a group's local x, z in the world
  const wrap = (i) => ((Math.round(i) % N) + N) % N;
  const P = (i, lat) => { const s = samples[wrap(i)]; return [s.p.x + s.left.x * lat, s.p.z + s.left.z * lat]; };
  const nearestI = (x, z) => { let b = 0, d = Infinity; for (let i = 0; i < N; i++) { const s = samples[i], e = (s.p.x - x) ** 2 + (s.p.z - z) ** 2; if (e < d) { d = e; b = i; } } return b; };
  const along = (i) => { const s = samples[wrap(i)]; return Math.atan2(s.th.x, s.th.z); };
  const facing = (i, sd) => { const s = samples[wrap(i)]; return Math.atan2(-s.left.x * sd, -s.left.z * sd); }; // turned to face the road from side sd
  const people = makePeople(1600, rnd);
  const C = (hex) => new THREE.Color(hex);
  // three sheets of flat colour: lit (and casting no shadow: the mall isn't dark inside), glowing, and painted on the ground
  const lit = { pos: [], col: [] }, glow = { pos: [], col: [] }, paint = { pos: [], col: [] };
  const quad = (Q, a, b, c, d, color) => pushQuad(Q.pos, Q.col, V(...a), V(...b), V(...c), V(...d), color);
  // a strip beside the road from sample i to the next: from lat0 (at y0 above the road) across to lat1 (at y1)
  const ribbon = (Q, i, sd, lat0, lat1, y0, y1, color) => {
    const a = samples[wrap(i)], b = samples[wrap(i + 1)], [ax, az] = P(i, sd * lat0), [bx, bz] = P(i + 1, sd * lat0), [cx, cz] = P(i + 1, sd * lat1), [dx, dz] = P(i, sd * lat1);
    quad(Q, [ax, a.p.y + y0, az], [bx, b.p.y + y0, bz], [cx, b.p.y + y1, cz], [dx, a.p.y + y1, dz], color);
  };
  // an upright wall from (x0, z0) to (x1, z1), and a flat rectangle
  const wallQ = (Q, x0, z0, x1, z1, y0, y1, color) => quad(Q, [x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], color);
  const flatQ = (Q, x0, z0, x1, z1, y, color) => quad(Q, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color);
  const blockQ = (Q, x0, z0, x1, z1, y0, y1, color, top = color) => { wallQ(Q, x0, z0, x1, z0, y0, y1, color); wallQ(Q, x1, z0, x1, z1, y0, y1, color); wallQ(Q, x1, z1, x0, z1, y0, y1, color); wallQ(Q, x0, z1, x0, z0, y0, y1, color); flatQ(Q, x0, z0, x1, z1, y1, top); };
  // painted on the ground: it follows the ground, a few centimetres over it
  const decal = (x0, z0, x1, z1, color, lift = 0.05) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 5)), nz = Math.max(1, Math.ceil((z1 - z0) / 5)), g = (x, z) => [x, terrainHeight(x, z) + lift, z];
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const xa = x0 + ((x1 - x0) * a) / nx, xb = x0 + ((x1 - x0) * (a + 1)) / nx, za = z0 + ((z1 - z0) * b) / nz, zb = z0 + ((z1 - z0) * (b + 1)) / nz;
      quad(paint, g(xa, za), g(xa, zb), g(xb, zb), g(xb, za), color);
    }
  };
  const solidRect = (x0, z0, x1, z1, y = 0) => { for (const [a, b, c, d] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) walls.push({ ax: a, az: b, bx: c, bz: d, y }); };
  // a board with words on it
  const sign = (g, text, bg, ink, w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, ink, 512, Math.max(32, Math.round(512 * h / w))), color: 0xf0f0f0 }));
    m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
  };
  const world = at(0, 0, 0, 0);
  // every parked car is one of these (some stretched a little taller: a van, a four-wheel drive)
  const cars = new THREE.InstancedMesh(parkedCarGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 560), carM = new THREE.Matrix4(), carC = new THREE.Color();
  let nCars = 0;
  const parkCar = (x, y, z, ry, hex, tall = 1) => { if (nCars >= 560) return; carM.makeRotationY(ry); carM.scale(V(1, tall, 1)); carM.setPosition(x, y, z); cars.setMatrixAt(nCars, carM); cars.setColorAt(nCars++, carC.set(hex)); };
  // It's a race track: where people stand to watch there's a length of race barrier in front of them, a concrete
  // block with a wire catch fence on top (solid). Along x, from x0 to x1 at z, the ground at y; `out` is +1 or -1,
  // the side of it the crowd is on; k: which sponsor's banner the block carries on its track side, or -1 for none.
  const rndC = mulberry32(5150);
  const raceFence = (x0, x1, z, y, out, k = -1) => {
    const len = x1 - x0, mx = (x0 + x1) / 2, STEEL = 0x8d93a0;
    box(world, len, 1.6, 0.5, 0xd4d7dc, mx, y + 0.2, z); box(world, len + 0.1, 0.08, 0.6, 0xb9bdc5, mx, y + 1.02, z).castShadow = false; // (the block goes 0.6 m into the ground: beside the road the ground is a little lower than the road, and the block used to stop short of it)
    for (let x = x0; x <= x1 + 0.01; x += len / Math.round(len / 4)) box(world, 0.1, 2.5, 0.1, STEEL, x, y + 2.25, z + out * 0.15).castShadow = false;
    box(world, len, 0.08, 0.08, STEEL, mx, y + 3.5, z + out * 0.15).castShadow = false;
    for (const h of [1.5, 2.0, 2.5, 3.0]) box(world, len, 0.03, 0.03, STEEL, mx, y + h, z + out * 0.15).castShadow = false;
    walls.push({ ax: x0, az: z, bx: x1, bz: z, y });
    if (k >= 0) paintBarrier(k, { x: x0, y, z: z - out * 0.33 }, { x: x1, y, z: z - out * 0.33 }, 0.02, 0.98, mx, z - out * 10); // (the whole length in the sponsor's colours)
  };
  // The same barrier between any two points, for the lengths that don't lie along x. From a to b; `out` is +1 for
  // the crowd on the side (-dz, dx) of that way (for a length running towards +z, that's the -x side), -1 for the
  // other. `foot`: how far the block goes into the ground (more where the ground dips).
  const raceFenceTo = (ax, az, bx, bz, y, out, k = -1, foot = 0.6) => {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), g = at((ax + bx) / 2, (az + bz) / 2, Math.atan2(-dz, dx), y), STEEL = 0x8d93a0;
    box(g, len, 1 + foot, 0.5, 0xd4d7dc, 0, (1 - foot) / 2, 0); box(g, len + 0.1, 0.08, 0.6, 0xb9bdc5, 0, 1.02, 0).castShadow = false;
    for (let n = Math.max(1, Math.round(len / 4)), j = 0; j <= n; j++) box(g, 0.1, 2.5, 0.1, STEEL, -len / 2 + (len * j) / n, 2.25, out * 0.15).castShadow = false;
    box(g, len, 0.08, 0.08, STEEL, 0, 3.5, out * 0.15).castShadow = false;
    for (const h of [1.5, 2.0, 2.5, 3.0]) box(g, len, 0.03, 0.03, STEEL, 0, h, out * 0.15).castShadow = false;
    walls.push({ ax, az, bx, bz, y });
    if (k >= 0) { const [px, pz] = W(g, -len / 2, -out * 0.33), [qx, qz] = W(g, len / 2, -out * 0.33), [tx, tz] = W(g, 0, -out * 10); paintBarrier(k, { x: px, y, z: pz }, { x: qx, y, z: qz }, 0.02, 0.98, tx, tz); }
  };
  // n people standing in the rectangle, facing the way `out` points from (towards -out: the track)
  const crowd = (x0, x1, z0, z1, y, n, out, avoid = []) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + rndC() * (x1 - x0), z = z0 + rndC() * (z1 - z0), rot = (out > 0 ? Math.PI : 0) + (rndC() - 0.5) * 0.7;
      if (!avoid.some(([ox, oz, r]) => Math.hypot(x - ox, z - oz) < r)) people.add(x, y, z, rot);
    }
  };
  // a grandstand: four tiers rising away from the track, a back wall and a roof in the centre's red, most seats taken
  const grandstand = (x0, x1, z, y, out) => {
    const len = x1 - x0, mx = (x0 + x1) / 2;
    for (let r = 0; r < 4; r++) {
      const zr = z + out * (0.45 + r * 0.9), top = 0.35 + r * 0.42;
      box(world, len, top, 0.9, r % 2 ? 0xb9bdc5 : 0xcfd3d8, mx, y + top / 2, zr);
      for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.78) if (rndC() < 0.8) people.add(x + (rndC() - 0.5) * 0.2, y + top, zr, (out > 0 ? Math.PI : 0) + (rndC() - 0.5) * 0.4);
    }
    box(world, len, 3.6, 0.2, 0xd62f2f, mx, y + 1.8, z + out * 3.75); box(world, len + 0.8, 0.2, 4.6, 0xf6f2e8, mx, y + 3.9, z + out * 1.9);
    for (const x of [x0 + 0.15, x1 - 0.15]) box(world, 0.16, 3.8, 0.16, 0x8d93a0, x, y + 1.9, z + out * 0.1).castShadow = false;
    solidRect(x0, Math.min(z, z + out * 3.85), x1, Math.max(z, z + out * 3.85), y);
  };

  const PAVE = -0.2, SHOPS = hw + 8.5, UP = SHOPS + 3, CEIL = 9.2, ROOF = 10.4, DECK = track.def.roofs[0][4]; // (DECK: the car park's roof, which cars drive on)
  const indoors = (i) => samples[wrap(i)].p.z < B[3] - 0.5;
  const i0 = samples.findIndex((_, i) => indoors(i)), i1 = N - 1 - [...samples].reverse().findIndex((_, i) => indoors(N - 1 - i)); // in through the east doors, out through the west ones
  // the food court: the middle of the hairpin at the far end
  const fc = (() => { let x = 0, z = 0, n = 0; for (let i = i0; i <= i1; i++) { const s = samples[i].p; if (s.z < -172) { x += s.x; z += s.z; n++; } } const mx = x / n; return { x: mx, z: -170 }; })();
  const inU = (i) => { const s = samples[wrap(i)].p; return s.z < fc.z + 1 && Math.hypot(s.x - fc.x, s.z - fc.z) < 40; };

  // ---- the shops' signs, all on one sheet ----
  // Every shop has a real name, in plain lettering. (There were made-up ones among them, Galah Games and Platypus
  // Phones and so on, until 3.64: the owner asked for those to go and for "duplicates of the other real ones".) There
  // are many more shops than names, so the names come round again: `turn` says which the nth shop gets.
  const MAIN = [['Myer', '#111318', '#ffffff'], ['Kmart', '#d62f2f', '#ffffff'], ['David Jones', '#ffffff', '#111318'], ['JB Hi-Fi', '#ffd400', '#111318'],
    ['Woolworths', '#2f9e44', '#ffffff'], ['Rebel', '#111318', '#e6453a'], ['Coles', '#ffffff', '#d62f2f'], ['Event Cinemas', '#16204a', '#ffffff']];
  const FOOD = [["Chargrill Charlie's", '#e6453a', '#fff6dc'], ['Oporto', '#ff8a3d', '#ffffff'], ['Boost Juice', '#8fd400', '#ffffff'], ['Guzman y Gomez', '#ffd400', '#111318']];
  // Shops come one side of the road and then the other, so the names go round one side while the other side is
  // half a turn ahead: next-door neighbours differ, and so do the two shops facing each other.
  const turn = (n, len) => ((n >> 1) + (n % 2 ? len >> 1 : 0)) % len;
  const NAMES = [...MAIN, ...FOOD], COLS = 2, ROWS = 16;
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 1024;
  const ax = atlas.getContext('2d'); ax.textAlign = 'center'; ax.textBaseline = 'middle';
  NAMES.forEach(([name, bg, ink], k) => {
    const x = (k % COLS) * 512, y = Math.floor(k / COLS) * 64;
    ax.fillStyle = bg; ax.fillRect(x, y, 512, 64); ax.fillStyle = ink;
    let size = 46; do { ax.font = `900 ${size}px "Segoe UI", Arial, sans-serif`; size -= 3; } while (ax.measureText(name).width > 480 && size > 14);
    ax.fillText(name, x + 256, y + 34);
  });
  const sp = [], suv = [];
  // a sign that follows the wall from sample i for n samples (reading the right way from the road)
  const signStrip = (i, n, sd, lat, y0, y1, cell) => {
    const u0 = (cell % COLS) / COLS, v1 = 1 - Math.floor(cell / COLS) / ROWS, v0 = v1 - 1 / ROWS;
    for (let j = 0; j < n; j++) {
      const a = samples[wrap(i + j)], b = samples[wrap(i + j + 1)], [ax0, az0] = P(i + j, sd * lat), [bx0, bz0] = P(i + j + 1, sd * lat);
      const ua = u0 + (sd > 0 ? j : n - j) / n / COLS, ub = u0 + (sd > 0 ? j + 1 : n - j - 1) / n / COLS;
      const q = [[ax0, a.p.y + y0, az0, ua, v0], [bx0, b.p.y + y0, bz0, ub, v0], [bx0, b.p.y + y1, bz0, ub, v1], [ax0, a.p.y + y1, az0, ua, v1]];
      for (const k of [0, 1, 2, 0, 2, 3]) { sp.push(q[k][0], q[k][1], q[k][2]); suv.push(q[k][3], q[k][4]); }
    }
  };

  // a sign on a flat wall, from (x0, z0) to (x1, z1), reading left to right that way
  const signFlat = (cell, x0, z0, x1, z1, y0, y1) => {
    const u0 = (cell % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(cell / COLS) / ROWS, v0 = v1 - 1 / ROWS;
    const q = [[x0, y0, z0, u0, v0], [x1, y0, z1, u1, v0], [x1, y1, z1, u1, v1], [x0, y1, z0, u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { sp.push(q[k][0], q[k][1], q[k][2]); suv.push(q[k][3], q[k][4]); }
  };

  // ---- inside the mall: walkways behind the barriers, shopfronts, a gallery above them, and a roof with a skylight ----
  {
    const TILE = [C(0xe9e2cf), C(0xd9d2c0)], FASCIA = C(0xf6f2e8), SLAB = C(0xcfd6dc), UPPER = C(0xefe9da), CEILING = C(0xd3d9e1), RAIL = C(0xbfe3f5), SKY = C(0xbfe6ff), LAMP = C(0xffffff);
    const GLASS = [0xfff3d6, 0xdff1ff, 0xffe9b8, 0xe6f7ee, 0xfde6ee, 0xf2ecff].map(C), SHOP = 8; // a shop every 8 samples (12 m)
    const WIN = 0.9, DOOR = 2.4, SILL = PAVE + 0.5, RISER = C(0x6a7280), SHELF = C(0xf6f2e8), TAPE = C(0xe6453a), STAND = C(0xd9dde3), SKIN = C(0xf1c9a5), BARR = hw + 3.7, STEELC = C(0xaab0ba);
    const ITEM = [0xe6453a, 0x3d8bff, 0xffd23f, 0x7ed957, 0xff6bcb, 0x1d2230, 0xf6f2e8, 0xff8a3d].map(C);
    // an upright wall across the walkway's line at sample i, from lat0 out to lat1 (the end of a window, the side of a doorway)
    const cross = (Q, i, sd, lat0, lat1, y0, y1, color) => { const c = samples[wrap(i)], [ax, az] = P(i, sd * lat0), [bx, bz] = P(i, sd * lat1); quad(Q, [ax, c.p.y + y0, az], [bx, c.p.y + y0, bz], [bx, c.p.y + y1, bz], [ax, c.p.y + y1, az], color); };
    // something on show in a window: a mannequin, or goods stacked on a stand
    const show = (i, sd, n, m) => {
      const [ax, az] = P(i, sd * (SHOPS + WIN / 2)), [bx, bz] = P(i + 1, sd * (SHOPS + WIN / 2)), x = (ax + bx) / 2, z = (az + bz) / 2, y = samples[wrap(i)].p.y + SILL, h = (i * 7 + n * 13 + (sd > 0 ? 0 : 3)) % 8;
      if ((n + m) % 2) { blockQ(lit, x - 0.2, z - 0.2, x + 0.2, z + 0.2, y, y + 1.0, ITEM[h]); blockQ(lit, x - 0.13, z - 0.13, x + 0.13, z + 0.13, y + 1.04, y + 1.3, SKIN); }
      else { blockQ(lit, x - 0.3, z - 0.3, x + 0.3, z + 0.3, y, y + 0.55, STAND); blockQ(lit, x - 0.2, z - 0.2, x + 0.2, z + 0.2, y + 0.55, y + 0.95, ITEM[h]); blockQ(lit, x - 0.12, z - 0.12, x + 0.12, z + 0.12, y + 0.95, y + 1.2, ITEM[(h + 3) % 8]); }
    };
    let shop = [0, 0];
    for (let i = i0; i < i1; i++) {
      const s = samples[i], k = i - i0;
      for (const sd of [1, -1]) {
        ribbon(lit, i, sd, hw + 1.62, hw + 3, 0.01, PAVE, TILE[(k >> 1) % 2]); ribbon(lit, i, sd, hw + 3, SHOPS, PAVE, PAVE, TILE[(k >> 1) % 2]); // tiles from the kerb to the shopfronts
        if (sd === 1 && inU(i)) continue; // the food court is on the inside of the hairpin
        const kk = k + (sd > 0 ? 0 : 4), n = Math.floor(kk / SHOP), first = kk % SHOP === 0, food = inU(i) || inU(i + 20) || inU(i - 20);
        // the shopfront, 12 m of it to a shop: a pane beside the pillar, a window with things on show, the way in
        // (taped off for the race, with shoppers watching from inside it), and a longer window
        const m = kk % SHOP, tint = GLASS[(n * 5 + (sd > 0 ? 0 : 3)) % GLASS.length];
        if (m === 0) ribbon(glow, i, sd, SHOPS, SHOPS + 0.02, PAVE, 3.4, tint);
        else if (m === 3 || m === 4) {
          ribbon(lit, i, sd, SHOPS, SHOPS + DOOR, PAVE, PAVE, TILE[1]); ribbon(glow, i, sd, SHOPS + DOOR, SHOPS + DOOR + 0.02, PAVE, 3.0, tint.clone().multiplyScalar(0.8));
          ribbon(lit, i, sd, SHOPS, SHOPS + DOOR, 3.0, 3.0, FASCIA); ribbon(lit, i, sd, SHOPS, SHOPS + 0.02, 3.0, 3.4, FASCIA);
          cross(lit, m === 3 ? i : i + 1, sd, SHOPS, SHOPS + DOOR, PAVE, 3.4, FASCIA);
          ribbon(lit, i, sd, SHOPS, SHOPS + 0.02, 0.62, 0.74, TAPE);
          if (rnd() < 0.5) { const [x, z] = P(i, sd * (SHOPS + 0.7 + rnd() * 1.2)); people.add(x, s.p.y + PAVE + 0.02, z, facing(i, sd) + (rnd() - 0.5) * 0.8, undefined, 1.1); }
        } else {
          ribbon(lit, i, sd, SHOPS, SHOPS + 0.02, PAVE, SILL, RISER); ribbon(lit, i, sd, SHOPS, SHOPS + WIN, SILL, SILL, SHELF);
          ribbon(glow, i, sd, SHOPS + WIN, SHOPS + WIN + 0.02, SILL, 3.4, tint); ribbon(lit, i, sd, SHOPS, SHOPS + WIN, 3.4, 3.4, FASCIA);
          if (m === 1) cross(lit, i, sd, SHOPS, SHOPS + WIN, SILL, 3.4, FASCIA);
          if (m === SHOP - 1) cross(lit, i + 1, sd, SHOPS, SHOPS + WIN, SILL, 3.4, FASCIA);
          show(i, sd, n, m);
        }
        ribbon(lit, i, sd, SHOPS, SHOPS + 0.02, 3.4, 4.9, FASCIA);
        // a crowd barrier on the walkway outside every other shop, one side then the other, and people behind it (solid)
        if (n % 2 === (sd > 0 ? 0 : 1) && m >= 2 && m <= 6 && i > i0 + 8 && i < i1 - 10 && !inU(i)) {
          for (const h of [0.52, 1.02]) ribbon(lit, i, sd, BARR, BARR + 0.02, PAVE + h, PAVE + h + 0.08, STEELC);
          for (const j of m === 6 ? [i, i + 1] : [i]) { const [x, z] = P(j, sd * BARR), y = samples[wrap(j)].p.y + PAVE; blockQ(lit, x - 0.05, z - 0.05, x + 0.05, z + 0.05, y, y + 1.12, STEELC); }
          { const [ax0, az0] = P(i, sd * BARR), [bx0, bz0] = P(i + 1, sd * BARR); walls.push({ ax: ax0, az: az0, bx: bx0, bz: bz0, y: s.p.y }); }
          for (let q = 0; q < 2; q++) if (rndC() < 0.55) { const [x, z] = P(i, sd * (BARR + 0.8 + rndC() * 2.4)); people.add(x + (rndC() - 0.5) * 1.1, s.p.y + PAVE + 0.02, z + (rndC() - 0.5) * 1.1, facing(i, sd) + (rndC() - 0.5) * 0.7, undefined, 1.05); }
        }
        ribbon(glow, i, sd, SHOPS - 1.3, UP, 4.9, 4.9, SLAB);                   // the gallery's floor, sticking out over the walkway
        ribbon(glow, i, sd, SHOPS - 1.3, SHOPS - 1.28, 4.9, 5.7, RAIL);         // its glass balustrade
        ribbon(lit, i, sd, UP, UP + 0.02, 4.9, CEIL, UPPER);
        ribbon(glow, i, sd, UP - 0.02, UP, 5.6, 7.6, GLASS[(n * 3 + 1) % GLASS.length]); // upstairs windows
        if (first) {
          const [x, z] = P(i, sd * (SHOPS - 0.15)), g = at(x, z, along(i), s.p.y + PAVE);
          box(g, 0.5, 5.1, 0.7, 0xd9dde3, 0, 2.55, 0).castShadow = false;       // the pillar between two shops
          if (i + SHOP <= i1 && !(sd === 1 && inU(i + SHOP))) signStrip(i + 1, SHOP - 2, sd, SHOPS - 0.06, 3.6, 4.7, food ? MAIN.length + turn(shop[1]++, FOOD.length) : turn(shop[0]++, MAIN.length));
        }
        if (k % 4 === 0) { const [ax0, az0] = P(i, sd * SHOPS), [bx0, bz0] = P(Math.min(i + 4, i1), sd * SHOPS); walls.push({ ax: ax0, az: az0, bx: bx0, bz: bz0, y: s.p.y }); }
        // shoppers watch from the gallery, up out of the way; benches and plants by the shopfronts (solid)
        if (rnd() < 0.34) { const [x, z] = P(i, sd * (SHOPS - 0.95 + rnd() * 0.7)); people.add(x, s.p.y + 4.92, z, facing(i, sd) + (rnd() - 0.5) * 0.9, undefined, 1.35); }
        if (kk % 22 === 11) {
          const [x, z] = P(i, sd * (SHOPS - 1.5)), g = at(x, z, facing(i, sd), s.p.y + PAVE);
          solids.push({ x, z, r: 1.1, y: s.p.y });
          if ((n + (sd > 0 ? 0 : 1)) % 2) { box(g, 1.3, 0.9, 1.3, 0xb5543c, 0, 0.45, 0).castShadow = false; add(g, new THREE.IcosahedronGeometry(0.95, 0), 0x3f9a4a, 0, 1.7, 0).castShadow = false; add(g, new THREE.IcosahedronGeometry(0.6, 0), 0x4fae54, 0.2, 2.6, 0.1).castShadow = false; }
          else { box(g, 2.2, 0.12, 0.55, 0x8a5a2b, 0, 0.45, 0).castShadow = false; for (const lx of [-0.9, 0.9]) box(g, 0.1, 0.45, 0.5, 0x4a4f5a, lx, 0.22, 0).castShadow = false; }
        }
      }
      // the roof: white either side, a skylight down the middle, lamps
      ribbon(glow, i, 1, UP, 3.4, CEIL, CEIL, CEILING); ribbon(glow, i, -1, UP, 3.4, CEIL, CEIL, CEILING);
      ribbon(glow, i, 1, 3.4, -3.4, CEIL, CEIL, SKY);
      if (k % 6 === 0) for (const sd of [1, -1]) { ribbon(glow, i, sd, 7, 9.5, CEIL - 0.05, CEIL - 0.05, LAMP); ribbon(glow, i + 1, sd, 7, 9.5, CEIL - 0.05, CEIL - 0.05, LAMP); }
    }
    // boards hanging over the road
    const hang = (i, text, bg, ink) => {
      const s = samples[wrap(i)], g = at(s.p.x, s.p.z, along(i) + Math.PI, s.p.y);
      for (const lx of [-5.6, 5.6]) box(g, 0.08, CEIL - 7.6, 0.08, 0x8d93a0, lx, (CEIL + 7.6) / 2, 0).castShadow = false;
      box(g, 12, 1.5, 0.16, 0x1d2230, 0, 6.9, 0).castShadow = false;
      sign(g, text, bg, ink, 11.6, 1.2, 0, 6.9, 0.1);
    };
    hang(i0 + 16, 'WELCOME TO WESTFIELD', '#ffffff', '#d62f2f');
    // (two more hung here until 3.67, FOOD COURT AHEAD and FOOD COURT, and the food court and its juice bar had
    // their names up as well: the owner had those signs taken down with the made-up shop names)
    hang(nearestI(-190, -120), 'PARKING  ROOFTOP', '#1f6fb5', '#ffffff');
    hang(i1 - 22, 'OXFORD ST EXIT', '#2f6b4a', '#ffffff');
    // An escalator up to the gallery, here and there. (Each was one bare slab sloping up between two sheets of glass:
    // no steps, no landings, it stopped in the air beside the gallery's glass, and on a bend the slab lay twisted
    // over on its side. The owner: "Escalator is slanted for no reason".) Now it is an escalator: a flat landing on
    // the floor, steps going up at 30 degrees between glass balustrades with dark handrails, a flat landing at the
    // top, and a piece of the gallery's floor that comes out to meet it. Each stands along the front of a shop that
    // has no crowd barrier, so nobody is standing where it goes. It is all flat faces with none lying over another:
    // the glass and the gallery's floor in the mall's glowing sheet, the rest in a sheet of its own (`steel`. Not the
    // mall's lit one: that is drawn a touch nearer than it is, which let a step seen edge on show through the
    // escalator's side). Solid (two walls, its sides) as far up as a car couldn't pass under it, and no nearer the
    // road than the old one's foot was.
    {
      const TAN = Math.tan(Math.PI / 6), HALF = 0.65, IN = 0.45, FOOT = 1, HEAD = 0.8, LAND = 1.7, DEEP = 1, PLINTH = 0.12, THICK = 0.4;
      const TREAD = C(0x2b303b), FRONT = C(0xaab0ba), CLAD = C(0xd9dde3), HAND = C(0x1d2230), steel = { pos: [], col: [] };
      for (const [x, z, sd] of [[100, -110, -1], [-40, -100, 1], [-190, -100, 1], [160, -70, -1]]) {
        // the shop it stands outside: every other one has a barrier with people behind it, and then it's the one before
        let n = Math.floor((nearestI(x, z) - i0 + (sd > 0 ? 0 : 4)) / SHOP); if (n % 2 === (sd > 0 ? 0 : 1)) n--;
        const i = i0 + n * SHOP - (sd > 0 ? 0 : 4), a = samples[i], y0 = a.p.y + PAVE + PLINTH, rise = samples[wrap(i + SHOP)].p.y + 4.9 - y0, run = rise / TAN;
        const K = [0, FOOT, FOOT + run, FOOT + run + HEAD], len = K[3] + LAND; // (where its slope starts and stops, and where its handrails end)
        // It lies along the line from that shop's pillar to the next one, its middle at the middle of the shop.
        // s: metres along it from its foot; x: across it, towards the shops; y: above its lower landing.
        const [px, pz] = P(i, sd * (SHOPS - 2.4)), [qx, qz] = P(i + SHOP, sd * (SHOPS - 2.4)), d = Math.hypot(qx - px, qz - pz), ux = (qx - px) / d, uz = (qz - pz) / d;
        const vs = (uz * a.left.x - ux * a.left.z) * sd > 0 ? 1 : -1, vx = uz * vs, vz = -ux * vs;
        let ox = (px + qx - ux * len) / 2, oz = (pz + qz - uz * len) / 2;
        // how far its centre line is from the middle of the road, s metres along
        const latOf = (s) => {
          const X = ox + ux * s, Z = oz + uz * s; let best = Infinity, lat = 0;
          for (let j = i - 6; j <= i + SHOP + 6; j++) { const q = samples[wrap(j)], e = (X - q.p.x) ** 2 + (Z - q.p.z) ** 2; if (e < best) { best = e; lat = sd * ((X - q.p.x) * q.left.x + (Z - q.p.z) * q.left.z); } }
          return lat;
        };
        // (round a bend the road comes nearer its middle or its ends: move it in until none of it is nearer than the old one's foot)
        const inwards = Math.max(0, ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((t) => SHOPS - 3.05 + HALF - latOf((t * len) / 8))); ox += vx * inwards; oz += vz * inwards;
        const pt = (s, x, y) => [ox + ux * s + vx * x, y0 + y, oz + uz * s + vz * x], steps = (s) => Math.min(rise, Math.max(0, (s - FOOT) * TAN)); // (steps: the height of the line the steps follow)
        // a face along it at x, from h0 to h1 above the steps' line; one lying across it from x0 to x1; and one standing across it
        const sideQ = (Q, s0, s1, x, h0, h1, c) => quad(Q, pt(s0, x, steps(s0) + h0), pt(s1, x, steps(s1) + h0), pt(s1, x, steps(s1) + h1), pt(s0, x, steps(s0) + h1), c);
        const flat = (Q, s0, s1, x0, x1, h, c) => quad(Q, pt(s0, x0, steps(s0) + h), pt(s1, x0, steps(s1) + h), pt(s1, x1, steps(s1) + h), pt(s0, x1, steps(s0) + h), c);
        const endQ = (Q, s, x0, x1, h0, h1, c) => quad(Q, pt(s, x0, steps(s) + h0), pt(s, x1, steps(s) + h0), pt(s, x1, steps(s) + h1), pt(s, x0, steps(s) + h1), c);
        for (let k = 0; k < 3; k++) {
          const s0 = K[k], s1 = K[k + 1];
          if (k) flat(steel, s0, s1, -HALF, HALF, -DEEP, CLAD);                                    // its underside
          for (const m of [-1, 1]) {
            sideQ(steel, s0, s1, m * HALF, -DEEP, 0.22, CLAD);                                     // its side, down from beside the steps
            flat(steel, s0, s1, m * IN, m * HALF, 0.22, CLAD); sideQ(steel, s0, s1, m * IN, -0.3, 0.22, CLAD); // the ledge the glass stands on, and its face beside the steps
            sideQ(glow, k ? s0 : 0.14, k < 2 ? s1 : s1 - 0.14, m * 0.55, 0.22, 0.92, RAIL);      // the glass
            for (const hx of [0.48, 0.62]) sideQ(steel, s0, s1, m * hx, 0.92, 1.02, HAND);         // the handrail, on top of the glass
            for (const hy of [0.92, 1.02]) flat(steel, s0, s1, m * 0.48, m * 0.62, hy, HAND);
          }
        }
        for (const m of [-1, 1]) for (const [s0, s1] of [[0, 0.14], [K[3] - 0.14, K[3]]]) { // each handrail turns down to the ledge at both ends
          for (const hx of [0.48, 0.62]) sideQ(steel, s0, s1, m * hx, 0.22, 0.92, HAND);
          endQ(steel, s0, m * 0.48, m * 0.62, 0.22, s0 ? 0.92 : 1.02, HAND); endQ(steel, s1, m * 0.48, m * 0.62, 0.22, s0 ? 1.02 : 0.92, HAND);
          endQ(steel, s0 ? s1 : s0, m * IN, m * HALF, 0, 0.22, CLAD);
        }
        endQ(steel, 0, -HALF, HALF, -PLINTH - 0.2, 0, CLAD); endQ(steel, K[3], -HALF, HALF, -DEEP, -THICK, CLAD); // its two ends: the step up onto it, and the machine under the top
        flat(steel, 0, K[1], -IN, IN, 0, TREAD); flat(steel, K[2], K[3], -IN, IN, 0, TREAD);       // the two flat landings
        // the steps: each one's front is pale with a dark edge, so they show as stripes from a car coming up to it
        for (let nS = Math.round(run / 0.42), go = run / nS, up = rise / nS, j = 0; j <= nS; j++) {
          const s = FOOT + j * go, lo = Math.max(0, (j - 0.5) * up), hi = Math.min(rise, (j + 0.5) * up), mid = hi - lo < 0.15 ? lo : hi - 0.09;
          if (mid > lo) quad(steel, pt(s, -IN, lo), pt(s, IN, lo), pt(s, IN, mid), pt(s, -IN, mid), FRONT);
          quad(steel, pt(s, -IN, mid), pt(s, IN, mid), pt(s, IN, hi), pt(s, -IN, hi), TREAD);
          if (j < nS) quad(steel, pt(s, -IN, hi), pt(s, IN, hi), pt(s + go, IN, hi), pt(s + go, -IN, hi), TREAD);
        }
        // where it arrives: the gallery's floor comes out to its top landing, with the gallery's glass round the edge
        const g0 = SHOPS - 1.3 - latOf(K[3]), g1 = SHOPS - 1.3 - latOf(len); // (the gallery's edge, across from its top and from the end of the floor)
        quad(glow, pt(K[3], -HALF, rise), pt(len, -HALF, rise), pt(len, g1, rise), pt(K[3], g0, rise), SLAB);
        quad(glow, pt(K[3], -HALF, rise - THICK), pt(len, -HALF, rise - THICK), pt(len, g1 + 0.3, rise - THICK), pt(K[3], g0 + 0.3, rise - THICK), SLAB); // (its underside runs in under the gallery's)
        sideQ(steel, K[3], len, -HALF, -THICK, 0, CLAD); endQ(steel, len, -HALF, g1 + 0.3, -THICK, 0, CLAD); endQ(steel, K[3], HALF, g0 + 0.3, -THICK, 0, CLAD);
        sideQ(glow, K[3], len, -0.55, 0, 0.8, RAIL); endQ(glow, len, -0.55, g1, 0, 0.8, RAIL); endQ(glow, K[3], HALF, g0, 0, 0.8, RAIL);
        // solid from its foot to where its underside is 2.4 m off the floor: past that a car goes under it
        for (const m of [-HALF, HALF]) { const sE = FOOT + (2.4 + DEEP - PLINTH) / TAN, [wx0, , wz0] = pt(0, m, 0), [wx1, , wz1] = pt(sE, m, 0); walls.push({ ax: wx0, az: wz0, bx: wx1, bz: wz1, y: a.p.y }); }
      }
      const mesh = flatMesh(steel.pos, steel.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      mesh.userData.dyn = true; worldGroup.add(mesh); // (kept as it is, like the mall's sheets: no shadow from it indoors)
    }
  }

  // ---- the food court: tables in the middle of the hairpin, a juice bar, palms in pots, a glass screen round it ----
  {
    const g = at(fc.x, fc.z, 0, PAVE - 0.3 + 0.32);
    flatQ(lit, fc.x - 15, fc.z - 15, fc.x + 15, fc.z + 2, PAVE + 0.01, C(0xe2dccb));
    // the screen: the one barrier in the mall. People are sitting in there, and it's the inside of the hairpin
    const R = 13.4, cz = fc.z - 1, GLASSC = C(0xbfe3f5), KERB = C(0xe9e4d8), back = fc.z + 1.8, half = 25 - SHOPS + 0.3;
    solids.push({ x: fc.x, z: cz, r: R, y: 0 });
    for (let k = 0; k < 28; k++) {
      const a0 = (k / 28) * 6.2832, a1 = ((k + 1) / 28) * 6.2832, p0 = [fc.x + Math.cos(a0) * R, cz + Math.sin(a0) * R], p1 = [fc.x + Math.cos(a1) * R, cz + Math.sin(a1) * R];
      if (Math.max(p0[1], p1[1]) > back) continue; // (the shops' end wall is there)
      wallQ(lit, p0[0], p0[1], p1[0], p1[1], PAVE, 0.3, KERB); wallQ(glow, p0[0], p0[1], p1[0], p1[1], 0.3, 1.25, GLASSC);
      box(world, 0.14, 1.35, 0.14, 0xd9dde3, p0[0], 0.6, p0[1]).castShadow = false;
    }
    // the end of the block of shops between the two legs, facing the food court
    wallQ(glow, fc.x - half, back, fc.x + half, back, PAVE, 3.4, C(0xfff3d6)); wallQ(lit, fc.x - half, back, fc.x + half, back, 3.4, CEIL, C(0xf6f2e8));
    walls.push({ ax: fc.x - half, az: back, bx: fc.x + half, bz: back, y: 0 });
    add(g, new THREE.CylinderGeometry(2.6, 2.6, 1.1, 10), 0xf6f2e8, 0, 0.55, -1).castShadow = false; add(g, new THREE.CylinderGeometry(3.2, 3.2, 0.25, 10), 0x8fd400, 0, 2.9, -1).castShadow = false;
    for (let k = 0; k < 5; k++) box(g, 0.12, 1.7, 0.12, 0xd9dde3, Math.cos(k * 1.257) * 2.4, 1.95, -1 + Math.sin(k * 1.257) * 2.4).castShadow = false;
    for (let k = 0, n = 0; k < 60 && n < 13; k++) {
      const a = rnd() * 6.2832, d = 5.2 + rnd() * 7.2, lx = Math.cos(a) * d, lz = -1 + Math.sin(a) * d * 0.95;
      if (lz > 1.5 || Math.hypot(lx, lz) > 12.6) continue;
      add(g, new THREE.CylinderGeometry(0.85, 0.85, 0.08, 8), 0xf6f2e8, lx, 0.75, lz).castShadow = false; add(g, new THREE.CylinderGeometry(0.08, 0.25, 0.75, 6), 0x8d93a0, lx, 0.37, lz).castShadow = false;
      for (let j = 0; j < 3; j++) { const b = a + j * 2.1, sx = lx + Math.cos(b) * 1.3, sz = lz + Math.sin(b) * 1.3; box(g, 0.4, 0.45, 0.4, [0xe6453a, 0x3d8bff, 0xffd23f][j], sx, 0.22, sz).castShadow = false; if (rnd() < 0.6) people.add(fc.x + sx, PAVE + 0.3, fc.z + sz, b + Math.PI, undefined, 0.85); }
      n++;
    }
    for (const [lx, lz] of [[-10.5, -8], [10.5, -8], [-12, 0.5], [12, 0.5]]) { box(g, 1.4, 1, 1.4, 0xb5543c, lx, 0.5, lz).castShadow = false; box(g, 0.2, 2.6, 0.2, 0x7a5a3a, lx, 2.2, lz).castShadow = false; for (let k = 0; k < 5; k++) { const m = add(g, new THREE.ConeGeometry(0.5, 2.2, 4), 0x3f9a4a, lx + Math.cos(k * 1.257) * 0.9, 3.6, lz + Math.sin(k * 1.257) * 0.9); m.rotation.set(Math.sin(k * 1.257) * 1.1, 0, -Math.cos(k * 1.257) * 1.1); m.castShadow = false; } }
  }

  // ---- the mall from outside: walls with glass along the street, doors where the road goes in and out, a flat roof ----
  {
    const WALLC = C(0xe9e4d8), BASE = C(0x3b556e), TOP = C(0xf6f2e8), ROOFC = C(0xcfd6dc), doors = [samples[i0].p.x, samples[i1].p.x].sort((a, b) => a - b), HALF = SHOPS + 0.4;
    const face = (x0, z0, x1, z1) => { wallQ(lit, x0, z0, x1, z1, -1, 3.6, BASE); wallQ(lit, x0, z0, x1, z1, 3.6, ROOF + 0.4, WALLC); wallQ(lit, x0, z0, x1, z1, ROOF + 0.4, ROOF + 1.2, TOP); walls.push({ ax: x0, az: z0, bx: x1, bz: z1, y: 0 }); };
    face(B[0], B[1], B[0], B[3]); face(B[2], B[1], B[2], B[3]); face(B[0], B[1], B[2], B[1]);
    let x = B[0];
    for (const d of doors) { face(x, B[3], d - HALF, B[3]); x = d + HALF; }
    face(x, B[3], B[2], B[3]);
    flatQ(lit, B[0], B[1], B[2], B[3], ROOF, ROOFC);
    for (const d of doors) { // each doorway: the wall over it, the name, and a porch
      wallQ(lit, d - HALF, B[3], d + HALF, B[3], 6.6, ROOF + 1.2, TOP);
      const g = at(d, B[3] + 0.3, 0, 0);
      sign(g, 'WESTFIELD', '#ffffff', '#d62f2f', 22, 3.2, 0, 8.6, 0.1);
      box(g, 2 * HALF + 2, 0.5, 7, 0xd62f2f, 0, 6.6, 3.2);
      for (const lx of [-HALF - 0.4, HALF + 0.4]) { box(g, 1, 6.6, 1, 0xf6f2e8, lx, 3.3, 6); const [wx, wz] = W(g, lx, 6); solids.push({ x: wx, z: wz, r: 0.8, y: 0 }); }
    }
    // along Oxford Street between the two doorways: shop windows with an awning and the shop's name over each
    {
      const AWN = [0xd62f2f, 0x1f6fb5, 0x2f6b4a, 0xff8a3d, 0x16204a, 0x8a5a2b], LITW = [0xfff3d6, 0xdff1ff, 0xffe9b8, 0xe6f7ee, 0xfde6ee];
      for (let x = doors[0] + HALF + 9, k = 0; x < doors[1] - HALF - 8; x += 13, k++) {
        box(world, 9.4, 2.6, 0.3, LITW[k % LITW.length], x, 1.75, B[3] + 0.1, 0x6a5f48).castShadow = false;
        for (const lx of [-1.6, 1.6]) box(world, 0.14, 2.6, 0.34, 0x3b4250, x + lx, 1.75, B[3] + 0.12).castShadow = false;
        box(world, 10, 0.22, 2.3, AWN[k % AWN.length], x, 3.38, B[3] + 1.15);
        signFlat((k * 5 + 3) % MAIN.length, x - 4, B[3] + 0.08, x + 4, B[3] + 0.08, 3.95, 4.95);
      }
    }
    // on the roof: glass over the mall, air-conditioners
    for (let k = 0; k < 9; k++) blockQ(lit, -100 + k * 26, -112, -82 + k * 26, -92, ROOF, ROOF + 1.6, C(0x9ad0ff), C(0xbfe3f5));
    for (let k = 0; k < 14; k++) { const ux = B[0] + 30 + rnd() * (B[2] - B[0] - 60), uz = B[1] + 14 + rnd() * 40; blockQ(lit, ux, uz, ux + 5, uz + 3, ROOF, ROOF + 1.8, C(0x9aa3ad)); }
  }

  // ---- the car park: a block under the roof the lap starts on, with the ramps down either side ----
  {
    const CONC = 0xcfd3d8, DARK = 0x3b4250, [main, strip] = track.def.roofs, rampE = samples[i0].p.x, rampW = samples[i1].p.x, RW = hw + 1.8; // (the ramps come up through the strip's near edge)
    const onRoof = (x, z, r) => solids.push({ x, z, r, y: DECK });
    for (const [x0, z0, x1, z1] of [main, strip]) {
      box(world, x1 - x0, DECK + 1, z1 - z0, CONC, (x0 + x1) / 2, (DECK - 1) / 2, (z0 + z1) / 2);
      solidRect(x0, z0, x1, z1);
    }
    // open decks: dark bands along the sides
    for (const y of [2.6, 6.2]) {
      box(world, main[2] - main[0] - 8, 1.7, 0.4, DARK, (main[0] + main[2]) / 2, y, main[1] - 0.1);
      for (const x of [main[0] - 0.1, main[2] + 0.1]) box(world, 0.4, 1.7, 100, DARK, x, y, 105);
      box(world, strip[2] - strip[0] - 8, 1.7, 0.4, DARK, (strip[0] + strip[2]) / 2, y, strip[3] + 0.1);
      for (const x of [strip[0] - 0.1, strip[2] + 0.1]) box(world, 0.4, 1.7, strip[3] - strip[1] - 8, DARK, x, y, (strip[1] + strip[3]) / 2);
    }
    // in the open decks you drive past (the side along Oxford Street, and the two beside the ramps): a parapet
    // and a column every 8 m
    {
      // one face, from a to b along it; (ox, oz) points out of the building
      const deckFace = (ax, az, bx, bz, ox, oz) => {
        const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, bays = Math.floor(len / 8), pad = (len - bays * 8) / 2;
        for (const y of [2.6, 6.2]) {
          const floor = y - 0.85, mx = (ax + bx) / 2, mz = (az + bz) / 2;
          { const m = box(world, Math.abs(ux) * len + Math.abs(uz) * 0.5, 0.6, Math.abs(uz) * len + Math.abs(ux) * 0.5, CONC, mx + ox * 0.34, floor + 0.3, mz + oz * 0.34); m.castShadow = false; }
          for (let k = 0; k <= bays; k++) { const d = pad + k * 8, m = box(world, Math.abs(ux) * 0.7 + Math.abs(uz) * 0.5, 1.7, Math.abs(uz) * 0.7 + Math.abs(ux) * 0.5, CONC, ax + ux * d + ox * 0.36, y, az + uz * d + oz * 0.36); m.castShadow = false; }
        }
      };
      deckFace(main[0] + 4, main[1], main[2] - 4, main[1], 0, -1); deckFace(main[0], main[1] + 5, main[0], main[3] - 5, -1, 0); deckFace(main[2], main[1] + 5, main[2], main[3] - 5, 1, 0);
    }
    // a low wall round the edge of the roof, solid: the roof is open to drive on, and this is where it stops
    for (const [x0, z0, x1, z1] of [[strip[0], strip[3], strip[2], strip[3]], [strip[0], strip[1], strip[0], strip[3]], [strip[2], strip[1], strip[2], strip[3]],
      [strip[0], strip[1], rampW - RW, strip[1]], [rampW + RW, strip[1], main[0], strip[1]], [main[2], strip[1], rampE - RW, strip[1]], [rampE + RW, strip[1], strip[2], strip[1]],
      [main[0], main[1], main[2], main[1]], [main[0], main[1], main[0], main[3]], [main[2], main[1], main[2], main[3]]]) {
      box(world, Math.abs(x1 - x0) + 0.5, 1.1, Math.abs(z1 - z0) + 0.5, 0xe9e4d8, (x0 + x1) / 2, DECK + 0.55, (z0 + z1) / 2);
      walls.push({ ax: x0, az: z0, bx: x1, bz: z1, y: DECK });
    }
    // sponsors' banners on that wall (a proper barrier), where a driver looks straight at it with no parked car in
    // the way: dead ahead at the end of the start straight, and ahead and alongside at the top of the ramp up
    {
      const zs = samples[0].p.z, xe = strip[2] - 0.36, xw = strip[0] + 0.36, zn = strip[3] - 0.36;
      for (let k = 0; k < 3; k++) { const z = zs + (k - 1) * 6; addBanner(0, { x: xe, y: DECK, z: z - 2.25 }, { x: xe, y: DECK, z: z + 2.25 }, 0.14, 0.98, 0, 1, xe - 20, z); }
      for (let k = 0; k < 3; k++) { const x = rampW + (k - 1) * 6; addBanner(3, { x: x - 2.25, y: DECK, z: zn }, { x: x + 2.25, y: DECK, z: zn }, 0.14, 0.98, 0, 1, x, zn - 20); }
      for (let k = 0; k < 3; k++) { const z = strip[1] + 9 + k * 6; addBanner(1, { x: xw, y: DECK, z: z - 2.25 }, { x: xw, y: DECK, z: z + 2.25 }, 0.14, 0.98, 0, 1, xw + 20, z); }
    }
    // parked cars in marked bays, some under shade sails: on the main roof, and one row each side of the start
    // straight, back behind the crowd. (Their own run of random numbers, like the town's and the skyline's further
    // down: a change to one of them no longer reshuffles the others.)
    const rndP = mulberry32(4421), STAIRS = [-100, 62];
    const CARS = [0xe6453a, 0xf6f2e8, 0x3d8bff, 0x2b2f3a, 0xb9c0cc, 0xffd23f, 0x2ec4b6, 0x7a4a2a, 0xf6f2e8, 0xb9c0cc];
    const white = C(0xf6f2e8);
    for (const z of [62, 68, 96, 102, 130, 136, 166, 210]) for (let x = (z > 162 ? strip[0] : main[0]) + 8; x < (z > 162 ? strip[2] : main[2]) - 8; x += 3) {
      if (z > 162 && z < 200 && (x > samples[i0].p.x - 34 || x < samples[i1].p.x + 34)) continue; // (the ramps come up through here)
      flatQ(lit, x - 1.55, z - 2.6, x - 1.45, z + 2.6, DECK + 0.03, white);
      if (rndP() < 0.42 || (z < 162 && Math.abs(x + 15) < 9)) continue;
      if (z > 200 && (Math.abs(x - rampW) < 11 || STAIRS.some((sx) => Math.abs(x - sx) < 4.8))) continue; // (nothing parked in front of the banners at the top of the ramp, or in a stair tower)
      parkCar(x, DECK + 0.02, z, rndP() < 0.5 ? 0 : Math.PI, CARS[Math.floor(rndP() * CARS.length)], rndP() < 0.22 ? 1.22 : 1);
      onRoof(x, z - 1, 1.25); onRoof(x, z + 1, 1.25); // (solid)
    }
    // The start straight, dressed as one: race barrier down both sides with the crowd behind it, unbroken from
    // where the cars come onto the roof, through the grid and the line, to the corner at the far end (it used to
    // come in lengths with gaps between, and the owner found it "just cut off"); a grandstand each side just past
    // the line. The far side runs a little further each way: the near side has the insides of the two corners to
    // keep clear of. The rest of the roof is reached round the ends.
    {
      const zr = samples[0].p.z, FENCE = hw + 3.9, xl = samples[0].p.x, sx0 = xl + 15, sx1 = xl + 39; // (sx0 to sx1: the grandstands)
      for (const out of [-1, 1]) {
        const z = zr + out * FENCE, x0 = out > 0 ? rampW + 14 : xl - 93, x1 = out > 0 ? rampE - 10 : rampE - 25, n = Math.round((x1 - x0) / 36), step = (x1 - x0) / n;
        for (let k = 0; k < n; k++) raceFence(x0 + k * step, x0 + (k + 1) * step, z, DECK, out, (k + (out > 0 ? 3 : 1)) % 4 ? -1 : k + (out > 0 ? 2 : 0)); // (a sponsor on every fourth length, the two sides out of step: it was every other, and "so many sponsors close together")
        grandstand(sx0, sx1, z + out * 1.3, DECK, out);
        for (const [c0, c1] of [[x0 + 0.6, sx0 - 0.6], [sx1 + 0.6, x1 - 0.6]]) crowd(c0, c1, z + out * 0.9, z + out * 5.6, DECK + 0.02, Math.round((c1 - c0) * 0.5), out);
      }
    }
    const sail = new THREE.MeshLambertMaterial({ color: 0xf1e9d6, side: THREE.DoubleSide, flatShading: true });
    for (let x = main[0] + 30; x < main[2] - 30; x += 36) for (const z of [99, 133]) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([x - 14, DECK + 4.6, z - 8, x + 14, DECK + 3.4, z - 8, x + 14, DECK + 4.6, z + 8, x - 14, DECK + 4.6, z - 8, x + 14, DECK + 4.6, z + 8, x - 14, DECK + 3.4, z + 8], 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, sail); m.castShadow = true; worldGroup.add(m);
      for (const [px, pz] of [[-14, -8], [14, -8], [14, 8], [-14, 8]]) { box(world, 0.25, 4.8, 0.25, 0x8d93a0, x + px, DECK + 2.4, z + pz); onRoof(x + px, z + pz, 0.35); }
    }
    // two stair towers against the far wall, and a raised boom gate each side of the top of each ramp
    for (const x of STAIRS) {
      const g = at(x, strip[3] - 2.3, 0, DECK);
      box(g, 6.4, 3.3, 3.4, 0xe9e4d8, 0, 1.65, 0); box(g, 7, 0.4, 4, 0x1f6fb5, 0, 3.5, 0); box(g, 1.5, 2.2, 0.12, 0x3b4250, -1.2, 1.1, -1.72).castShadow = false; box(g, 1.6, 1.0, 0.1, 0x9ad0ff, 1.5, 1.9, -1.72).castShadow = false;
      solidRect(x - 3.2, strip[3] - 4, x + 3.2, strip[3] - 0.6, DECK);
    }
    for (const rx of [rampE, rampW]) for (const sx of [-1, 1]) {
      const x = rx + sx * (RW + 0.25), z = strip[1] + 0.9;
      box(world, 0.55, 1.15, 0.55, 0xffd23f, x, DECK + 0.58, z);
      const arm = strut(V(x, DECK + 1.05, z), V(x - sx * 1.1, DECK + 4.3, z), 0.14, 0.14, lam(0xf6f2e8)); worldGroup.add(arm);
      const tip = strut(V(x - sx * 0.82, DECK + 3.5, z), V(x - sx * 1.1, DECK + 4.3, z), 0.16, 0.16, lam(0xe6453a)); worldGroup.add(tip);
      onRoof(x, z, 0.5);
    }
    // the lifts, with the centre's name on them, and lamps along the roof
    const lift = at(-15, 150, 0, DECK);
    box(lift, 16, 7, 8, 0xe9e4d8, 0, 3.5, 0); box(lift, 16.6, 0.5, 8.6, 0xd62f2f, 0, 7.2, 0);
    solidRect(-23, 146, -7, 154, DECK);
    sign(lift, 'WESTFIELD', '#ffffff', '#d62f2f', 13, 2, 0, 4.9, 4.06); sign(lift, 'P  ROOFTOP PARKING', '#1f6fb5', '#ffffff', 13, 1.4, 0, 2.6, 4.06);
    for (let x = strip[0] + 20; x < strip[2] - 10; x += 45) for (const z of [178, 203]) { if (roadGap(track, x, z) < hw + 4.5) continue; box(world, 0.22, 7, 0.22, 0x8d93a0, x, DECK + 3.5, z); box(world, 1.6, 0.2, 0.5, 0xd9dde3, x, DECK + 7, z); onRoof(x, z, 0.35); } // (never on the road: one used to stand in the corner at the top of the ramp)
    // a height bar at the foot of each ramp
    for (const x of [samples[i0].p.x, samples[i1].p.x]) {
      const g = at(x, 46, 0, 0);
      for (const lx of [-hw - 4.6, hw + 4.6]) { box(g, 0.4, 5.2, 0.4, 0xffd23f, lx, 2.6, 0); const [wx, wz] = W(g, lx, 0); solids.push({ x: wx, z: wz, r: 0.5, y: 0 }); }
      box(g, 2 * hw + 9.6, 1.1, 0.3, 0xffd23f, 0, 5.4, 0); sign(g, 'CLEARANCE 2.2 m', '#ffd23f', '#111318', 9, 0.95, 0, 5.4, 0.17, 0); sign(g, 'CLEARANCE 2.2 m', '#ffd23f', '#111318', 9, 0.95, 0, 5.4, -0.17, Math.PI);
    }
  }

  // ---- Oxford Street: where the lap runs along it, a carriageway each way with a planted median between them and
  // the Westfield bridge over both; beyond the hairpin, the street as it is every other day, the 333 at its stop ----
  // (the lap's street section: the samples between the foot of the ramp down and the doors in)
  const street = (() => {
    const ii = []; for (let i = 0; i < i0; i++) if (samples[i].p.y < 0.3 && Math.abs(samples[i].p.z) < 34) ii.push(i);
    const apex = ii.reduce((m, i) => (samples[i].p.x < samples[m].p.x ? i : m), ii[0]), mid = ii.find((i) => samples[i].p.x < 62);
    return { apex, xa: samples[apex].p.x, LN: Math.abs(samples[mid].p.z), xe: samples[i0].p.x };
  })();
  const MED = { x0: MEDIAN[0], x1: MEDIAN[2], half: MEDIAN[3], h: 1.05 }; // the median: a planter with concrete sides, from inside the hairpin to where the two legs part
  const BRIDGE = { x: (SPAN[0] + SPAN[2]) / 2, half: (SPAN[2] - SPAN[0]) / 2 };
  {
    const ROAD = C(0x4f5661), PATH = C(0xc9ced6), LINE = C(0xf6f2e8), X0 = lim.x - lim.r - 180, X1 = lim.x + lim.r + 180;
    const R0 = street.xa - 17, R1 = street.xe + 30, WIDE = street.LN + hw + 4; // (the race's part of the street, and how far out its tarmac goes)
    decal(X0, -13, R0, 13, ROAD); decal(X0, 13, R0, 19, PATH, 0.07); decal(X0, -19, R0, -13, PATH, 0.07);
    decal(R1, -13, X1, 13, ROAD); decal(R1, 13, X1, 19, PATH, 0.07); decal(R1, -19, X1, -13, PATH, 0.07);
    decal(R0, -WIDE, R1, WIDE, ROAD); decal(R0, WIDE, R1, WIDE + 6, PATH, 0.07); decal(R0, -WIDE - 6, R1, -WIDE, PATH, 0.07);
    for (let x = X0 + 4; x < X1; x += 9) if ((x + 3.4 < R0 || x > R1) && roadGap(track, x, 0) > hw + 6) decal(x, -0.15, x + 3.4, 0.15, LINE, 0.08);
    for (let k = -5; k <= 5; k++) decal(-62.2, k * 2.2 - 0.6, -57.8, k * 2.2 + 0.6, LINE, 0.08); // the zebra crossing under the walkway
    decal(samples[i0].p.x - 34, B[3], samples[i0].p.x + 30, -WIDE - 6, C(0xe2dccb), 0.06); decal(samples[i1].p.x - 34, B[3], samples[i1].p.x + 34, -19, C(0xe2dccb), 0.06); // paving outside the doors (never under another strip: two that nearly touch flicker)
    // the median: concrete sides (a proper barrier between cars going opposite ways), soil and shrubs on top, and
    // lamps with an arm over each carriageway
    {
      const { x0, x1, half, h } = MED, cx = (x0 + x1) / 2;
      box(world, x1 - x0, h, 2 * half, 0xd4d7dc, cx, h / 2, 0); box(world, x1 - x0 - 0.5, 0.14, 2 * half - 0.5, 0x6f8f52, cx, h + 0.03, 0);
      solidRect(x0, -half, x1, half, 0);
      // (no banners on its sides now: with the barriers' rows and the bridges, Oxford Street had "so many sponsors close together")
      for (let x = x0 + 9, k = 0; x < x1 - 4; x += 7, k++) { // shrubs, with a gap under the bridge
        if (Math.abs(x - BRIDGE.x) < BRIDGE.half + 2) continue;
        const m = add(world, new THREE.IcosahedronGeometry(1.1, 0), [0x3f9a4a, 0x4fae54, 0x3a8a44][k % 3], x, h + 0.75, ((k % 2) - 0.5) * 1.6); m.scale.y = 0.8;
      }
      for (let x = x0 + 16; x < x1 - 6; x += 33) {
        if (Math.abs(x - BRIDGE.x) < BRIDGE.half + 4) continue;
        box(world, 0.24, 7.2, 0.24, 0x8d93a0, x, h + 3.6, 0); box(world, 0.5, 0.18, 7.4, 0x8d93a0, x, h + 7.2, 0);
        for (const lz of [-3.4, 3.4]) box(world, 0.7, 0.16, 1.5, 0xfff3c4, x, h + 7.05, lz, 0x8a7a40);
      }
    }
    // Race barrier down the outside of each carriageway with the crowd on the footpath behind it: one unbroken run
    // each side, from the hairpin to where the two legs part. (It came in four lengths of 24 m with 12 m of nothing
    // between one and the next, and the owner drove along it: "These should all be one long barrier", "why are
    // there random holes".) The mall's side carries on west to the end of the hairpin's rail, where another 12 m
    // stood open. The sponsors' paint is where it was, on what were the first and third lengths one side and the
    // second and fourth the other. And a crowd round the outside of the hairpin, behind its rail.
    {
      const pillars = [-9, 9].flatMap((lx) => [[BRIDGE.x + lx, WIDE + 3, 1.3], [BRIDGE.x + lx, -WIDE - 3, 1.3]]);
      const X0 = MED.x0 + 16, X1 = MED.x1, ZB = WIDE + 0.3, was = []; // (was: what were the gaps)
      // the end of the hairpin's rail (the trackside props are up already): the nearest end of any wall just west of the barrier's own
      let rail = null;
      for (const w of walls) for (const [ex, ez] of [[w.ax, w.az], [w.bx, w.bz]]) if (ex < X0 - 2 && ex > X0 - 30 && Math.abs(ez + ZB) < 4 && Math.abs(w.y ?? 0) < 1.5 && (!rail || ex > rail[0])) rail = [ex, ez];
      for (const out of [-1, 1]) raceFence(X0, X1, out * ZB, 0, out);
      if (rail) raceFenceTo(rail[0], rail[1], X0, -ZB, 0, -1);
      // one sponsor's stretch of each barrier, 30 m with the name five times, at the hairpin end: well clear of the
      // sponsor bridges at the other, and the median hides each from the cars going the other way. (4.7 had 54 m
      // in every 96 m, and the owner: "don't have so many sponsors close together".)
      for (const out of [-1, 1]) {
        const x = X0 + 2, e = x + 30, z = out * (ZB - 0.33);
        paintBarrier(out > 0 ? 1 : 3, { x, y: 0, z }, { x: e, y: 0, z }, 0.02, 0.98, (x + e) / 2, z - out * 10);
      }
      for (let k = 0, x = X0; x + 24 <= MED.x1 - 2; x += 36, k++) for (const out of [-1, 1]) {
        crowd(x + 0.6, x + 23.4, out * (WIDE + 1.2), out * (WIDE + 5.4), 0.09, 14, out, pillars);
        if (out > 0) was.push([x + 24, Math.min(x + 36, X1)]);
      }
      // People where the gaps were, behind the barrier like everyone else. (A set of their own with their own run
      // of random numbers: nobody else in the centre moves. None in a pillar, a post or a braking board.)
      {
        const more = makePeople(140, mulberry32(6311)), rndG = mulberry32(6312), clear = (x, z) => !solids.some((c) => Math.abs(c.y ?? 0) < 1.5 && Math.hypot(c.x - x, c.z - z) < c.r + 0.7);
        for (const out of [-1, 1]) for (const [g0, g1] of was) for (let j = 0, n = Math.round((g1 - g0) * 0.6); j < n; j++) {
          const x = g0 + rndG() * (g1 - g0), z = out * (WIDE + 1.2 + rndG() * 4.2), rot = (out > 0 ? Math.PI : 0) + (rndG() - 0.5) * 0.7;
          if (clear(x, z)) more.add(x, 0.09, z, rot);
        }
        if (rail) for (let j = 0; j < 9; j++) { // and behind the length that runs to the rail
          const t = 0.08 + rndG() * 0.84, x = rail[0] + (X0 - rail[0]) * t, z = rail[1] + (-ZB - rail[1]) * t - 0.9 - rndG() * 3.6, rot = (rndG() - 0.5) * 0.7;
          if (clear(x, z)) more.add(x, 0.09, z, rot);
        }
        more.finish();
      }
      const hx = street.xa + 15; // (the hairpin's centre)
      for (let k = 0; k < 46; k++) {
        const a = (100 + rndC() * 160) * Math.PI / 180, r = 29 + rndC() * 4.5, x = hx + Math.cos(a) * r, z = Math.sin(a) * r;
        people.add(x, terrainHeight(x, z) + 0.08, z, Math.atan2(hx - x, -z) + (rndC() - 0.5) * 0.5);
      }
    }
    // the Westfield bridge between the two buildings: two glazed storeys, wide enough to drive under for a moment
    // like the real one's underpass. It stands on the median and on the footpaths; lights under it
    {
      const zc = (A[1] + B[3]) / 2, len = A[1] - B[3], g = at(BRIDGE.x, zc, 0, 0), w = 2 * BRIDGE.half;
      box(g, w, 0.6, len, 0xd9dde3, 0, 5.5, 0); box(g, w + 0.2, 6.2, len - 0.4, 0x9ad0ff, 0, 8.9, 0); box(g, w + 0.5, 0.5, len, 0xf6f2e8, 0, 8.9, 0); box(g, w + 0.6, 0.6, len, 0xf6f2e8, 0, 12.3, 0);
      for (let lz = -len / 2 + 6; lz < len / 2 - 2; lz += 6) box(g, w + 0.36, 6.2, 0.26, 0xd9dde3, 0, 8.9, lz).castShadow = false; // mullions
      const name = sign(g, 'WESTFIELD', '#ffffff', '#d62f2f', 24, 3, BRIDGE.half + 0.24, 10.65, -zc, Math.PI / 2);
      const other = name.clone(); other.position.x = -BRIDGE.half - 0.24; other.rotation.y = -Math.PI / 2; g.add(other);
      for (const lx of [-9, 9]) for (const wz of [0, WIDE + 3, -WIDE - 3]) {
        box(g, 1.4, wz ? 5.2 : 5.2 - MED.h, 1.4, 0xb9bdc5, lx, wz ? 2.6 : (5.2 + MED.h) / 2, wz - zc);
        if (wz) solids.push({ x: BRIDGE.x + lx, z: wz, r: 1.1, y: 0 });
      }
      for (const sd of [1, -1]) for (const lx of [-9, 0, 9]) flatQ(glow, BRIDGE.x + lx - 2.2, sd * street.LN - 0.7, BRIDGE.x + lx + 2.2, sd * street.LN + 0.7, 5.17, C(0xfff6da));
    }
    // the other walkway over the street, from the car park to the mall
    {
      const g = at(-60, (A[1] + B[3]) / 2, 0, 0), len = A[1] - B[3];
      box(g, 6, 0.5, len, 0xd9dde3, 0, 5.2, 0); box(g, 6.2, 2.6, len - 0.4, 0x9ad0ff, 0, 6.75, 0); box(g, 6.6, 0.5, len, 0xf6f2e8, 0, 8.3, 0);
      for (const lz of [-22, 22]) { box(g, 1.2, 5.2, 1.2, 0xb9bdc5, 0, 2.6, lz); const [wx, wz] = W(g, 0, lz); solids.push({ x: wx, z: wz, r: 1, y: 0 }); }
    }
    // the bus, waiting at its stop just past the hairpin: you brake straight at it
    const BX = street.xa - 37;
    const bus = at(BX, -8.6, Math.PI / 2, terrainHeight(BX, -8.6) + 0.05);
    box(bus, 2.6, 2.7, 12, 0x1f6fb5, 0, 1.85, 0); box(bus, 2.64, 0.9, 11.2, 0x23303f, 0, 2.35, 0); box(bus, 2.66, 0.5, 12.04, 0xf6f2e8, 0, 3.05, 0);
    for (const lz of [-3.8, 3.6]) for (const lx of [-1.2, 1.2]) add(bus, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8), 0x1d2230, lx, 0.5, lz).rotation.z = Math.PI / 2;
    sign(bus, '333  BONDI BEACH', '#111318', '#ffb000', 2.2, 0.42, 0, 2.95, 6.04); sign(bus, '333  BONDI BEACH', '#111318', '#ffb000', 4.6, 0.42, -1.34, 2.95, 2.6, -Math.PI / 2);
    for (const lz of [-4, 0, 4]) { const [wx, wz] = W(bus, 0, lz); solids.push({ x: wx, z: wz, r: 1.7, y: 0 }); }
    const stop = at(BX - 2, -16, 0, terrainHeight(BX - 2, -16) + 0.07);
    for (const lx of [-3, 3]) box(stop, 0.15, 2.6, 0.15, 0x8d93a0, lx, 1.3, -1); box(stop, 7, 0.15, 2.4, 0x1f6fb5, 0, 2.65, -0.2); box(stop, 6.6, 1.6, 0.08, 0x9ad0ff, 0, 1.3, -1.05); box(stop, 5, 0.12, 0.5, 0x8a5a2b, 0, 0.5, -0.6);
    for (let k = 0; k < 6; k++) people.add(BX - 4.5 + k * 1.1 + rnd() * 0.3, terrainHeight(BX - 2, -16) + 0.1, -15.4 + rnd() * 0.8, 0);
    const pole = at(BX - 8, -16.5, 0, terrainHeight(BX - 8, -16.5)); box(pole, 0.14, 3.6, 0.14, 0x8d93a0, 0, 1.8, 0); sign(pole, 'BONDI JUNCTION', '#ff8a3d', '#ffffff', 2.8, 0.5, 0, 3.4, 0.08); sign(pole, 'BONDI JUNCTION', '#ff8a3d', '#ffffff', 2.8, 0.5, 0, 3.4, -0.08, Math.PI);
    // traffic held up behind the bus and across the street from it, while the race is on
    for (const [x, z, c, taxi] of [[BX - 13, -8.6, 0xf6f2e8, 1], [BX - 20, -8.6, 0xe6453a, 0], [BX + 1, 6.4, 0x2b2f3a, 0], [BX - 6.5, 6.4, 0xffd23f, 0], [BX - 14, 6.4, 0xb9c0cc, 0]]) {
      const y = terrainHeight(x, z) + 0.05;
      parkCar(x, y, z, z < 0 ? Math.PI / 2 : -Math.PI / 2, c); // (each facing the way its side of the street goes)
      if (taxi) box(world, 0.5, 0.18, 0.9, 0xffd23f, x + 0.3, y + 1.37, z, 0x8a6a10);
      for (const o of [-1, 1]) solids.push({ x: x + o, z, r: 1.25, y: 0 });
    }
    // street signs: on the corners where the lap crosses at the west doors, and by the bridge
    for (const [x, z] of [[samples[i1].p.x + hw + 13, -15.5], [samples[i1].p.x - hw - 13, 15.5], [street.xe + 24, -WIDE - 3], [street.xe + 24, WIDE + 3]]) {
      const g = at(x, z, 0, terrainHeight(x, z));
      box(g, 0.12, 3.4, 0.12, 0x8d93a0, 0, 1.7, 0); sign(g, 'OXFORD ST', '#2f6b4a', '#ffffff', 2.2, 0.42, 0, 3.2, 0.07); sign(g, 'OXFORD ST', '#2f6b4a', '#ffffff', 2.2, 0.42, 0, 3.2, -0.07, Math.PI);
    }
    // The crossing at the west doors: out of the mall, over Oxford Street and onto the ramp up to the roof. It had
    // kerbs and nothing else (the owner, from the middle of it: "this whole area should have barriers"). Now a race
    // barrier runs down each side, with the crowd on two steps behind it on the closed street. It comes in from
    // each edge of the doorway, so there's no way round that end; runs straight across the street; and comes in
    // again to the foot of the ramp, where a concrete parapet carries on up each edge of the ramp as far as the
    // ramp's own rails. (The street light and the billboard that stood by the crossing still do, behind it.)
    {
      const cx = samples[i1].p.x, FENCE = hw + 3.9, DOOR = SHOPS + 0.4, LIP = hw + 1.4, zd = B[3]; // (LIP: the parapet's line, along the outer edge of the kerb)
      let iFoot = i1; while (samples[wrap(iFoot)].p.z < 46 && iFoot < i1 + 200) iFoot++; // the foot of the ramp, at the height bar
      let iRail = iFoot; while (Math.max(track.vergeDrop[wrap(iRail)], track.vergeDrop[wrap(iRail + 1)]) <= VERGE_MAX_DROP && iRail < iFoot + 80) iRail++; // where the drop is enough for the ramp to have rails
      const zf = samples[wrap(iFoot)].p.z, z0 = zd + 10, zm = zf - 9, LENGTHS = 3, step = (zm - z0) / LENGTHS;
      const fans = makePeople(150, mulberry32(6207)), rndF = mulberry32(6208); // (a set of their own with their own random numbers: nobody else in the centre moves)
      const par = { pos: [], col: [] }, CONC = C(0xd4d7dc), COPE = C(0xb9bdc5);
      for (const sd of [1, -1]) { // +1: the side towards +x (the left, going up the ramp)
        const xf = cx + sd * FENCE;
        raceFenceTo(cx + sd * DOOR, zd + 0.25, xf, z0, 0, -sd, -1, 1.4); // in from the edge of the doorway
        for (let k = 0; k < LENGTHS; k++) raceFenceTo(xf, z0 + k * step, xf, z0 + (k + 1) * step, 0, -sd, -1, 1.4); // across the street (plain: it carried a sponsor on every other length, a few metres from Oxford Street's own)
        raceFenceTo(xf, zm, cx + sd * LIP, zf, 0.2, -sd, -1, 1.6); // in to the foot of the ramp
        // two steps for the crowd, and the crowd
        const STEPS = [[0.7, 0.3, 0xcfd3d8], [2.9, 0.75, 0xb9bdc5]], sz0 = z0 + 0.5, sz1 = zm - 0.5;
        for (const [d, top, c] of STEPS) box(world, 2.2, top + 1.6, sz1 - sz0, c, xf + sd * (d + 1.1), (top - 1.6) / 2, (sz0 + sz1) / 2);
        solidRect(Math.min(xf + sd * 0.7, xf + sd * 5.1), sz0, Math.max(xf + sd * 0.7, xf + sd * 5.1), sz1, 0);
        for (let j = 0; j < 72; j++) {
          const [d, top] = STEPS[j % 2], x = xf + sd * (d + 0.4 + rndF() * 1.4), z = sz0 + 0.5 + rndF() * (sz1 - sz0 - 1), rot = -sd * Math.PI / 2 + (rndF() - 0.5) * 0.7;
          if (!solids.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.7)) fans.add(x, top + 0.02, z, rot); // (not standing in the street light)
        }
        // the parapet up the edge of the ramp: its inner face, its top, and its outer face down over the edge of the deck
        for (let i = iFoot; i < iRail; i++) {
          const a = samples[wrap(i)], b = samples[wrap(i + 1)], [ax, az] = P(i, sd * (LIP - 0.2)), [bx, bz] = P(i + 1, sd * (LIP - 0.2)), [cx2, cz2] = P(i + 1, sd * (LIP + 0.2)), [dx2, dz2] = P(i, sd * (LIP + 0.2));
          quad(par, [ax, a.p.y - 0.1, az], [bx, b.p.y - 0.1, bz], [bx, b.p.y + 1, bz], [ax, a.p.y + 1, az], CONC);
          quad(par, [ax, a.p.y + 1, az], [bx, b.p.y + 1, bz], [cx2, b.p.y + 1, cz2], [dx2, a.p.y + 1, dz2], COPE);
          quad(par, [dx2, a.p.y + 1, dz2], [cx2, b.p.y + 1, cz2], [cx2, b.p.y - 1.4, cz2], [dx2, a.p.y - 1.4, dz2], CONC);
          if (i === iFoot) quad(par, [ax, a.p.y - 1.4, az], [dx2, a.p.y - 1.4, dz2], [dx2, a.p.y + 1, dz2], [ax, a.p.y + 1, az], CONC);
          if (i === iRail - 1) quad(par, [bx, b.p.y - 0.1, bz], [cx2, b.p.y - 0.1, cz2], [cx2, b.p.y + 1, cz2], [bx, b.p.y + 1, bz], CONC);
          { const [wx0, wz0] = P(i, sd * LIP), [wx1, wz1] = P(i + 1, sd * LIP); walls.push({ ax: wx0, az: wz0, bx: wx1, bz: wz1, y: (a.p.y + b.p.y) / 2 }); } // (down its middle, the line the barrier comes in on)
        }
      }
      fans.finish();
      if (par.pos.length) { const m = flatMesh(par.pos, par.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; m.userData.dyn = true; worldGroup.add(m); }
    }
    // The other ramp, the one the lap comes down from the roof on, at the east end of the street: the same again.
    // Its own rails stop where the drop gets small, and from there to the height bar at its foot nothing stood at
    // either edge: a car could run off the side of the ramp and end up beside the bar, off the track (the owner,
    // from just there: "Fence here"). And round the inside of the corner at the bottom, from the ramp to the end of
    // the race barrier along Oxford Street, the way was open onto the forecourt of the car park ("why is the fence
    // gap still there"). A concrete parapet now carries on down each edge of the ramp from its rails. On the
    // outside it turns out at the foot to meet the first post of the rail round the corner. On the inside it goes
    // on round the corner and in to the end of the race barrier.
    {
      const LIP = hw + 1.4, RAIL = hw + 5.2, CONC = C(0xd4d7dc), COPE = C(0xb9bdc5), par = { pos: [], col: [] };
      const xr = samples[i0].p.x; // (the east ramp is in line with the doors the lap goes in by)
      let iFoot = samples.findIndex((a, i) => i > 60 && i < i0 && Math.abs(a.p.x - xr) < 1.5 && a.p.z > 46 && samples[i + 1].p.z <= 46); // the foot of the ramp, at the height bar
      if (iFoot > 0) {
        let iRail = iFoot; while (Math.max(track.vergeDrop[iRail], track.vergeDrop[iRail - 1]) <= VERGE_MAX_DROP && iRail > iFoot - 80) iRail--; // where the ramp's own rails end, coming down
        // a length of parapet between two points, each [x, road height, z]; sd: which side of the road it's on (so which face is the outer one)
        const piece = (a, b, sd) => {
          const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * 0.2 * sd, nz = (dx / l) * 0.2 * sd; // (towards the road's left, times sd: outwards)
          const A = [a[0] - nx, a[2] - nz], B = [b[0] - nx, b[2] - nz], Co = [b[0] + nx, b[2] + nz], D = [a[0] + nx, a[2] + nz];
          quad(par, [A[0], a[1] - 0.1, A[1]], [B[0], b[1] - 0.1, B[1]], [B[0], b[1] + 1, B[1]], [A[0], a[1] + 1, A[1]], CONC);       // its face to the road
          quad(par, [A[0], a[1] + 1, A[1]], [B[0], b[1] + 1, B[1]], [Co[0], b[1] + 1, Co[1]], [D[0], a[1] + 1, D[1]], COPE);         // its top
          quad(par, [D[0], a[1] + 1, D[1]], [Co[0], b[1] + 1, Co[1]], [Co[0], b[1] - 1.4, Co[1]], [D[0], a[1] - 1.4, D[1]], CONC);   // its outer face, down over the edge of the deck
          walls.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], y: (a[1] + b[1]) / 2 });
        };
        const cap = (a, sd, t) => { const nx = -t[1] * 0.2 * sd, nz = t[0] * 0.2 * sd; quad(par, [a[0] - nx, a[1] - 1.4, a[2] - nz], [a[0] + nx, a[1] - 1.4, a[2] + nz], [a[0] + nx, a[1] + 1, a[2] + nz], [a[0] - nx, a[1] + 1, a[2] - nz], CONC); }; // an end
        const at3 = (i, lat) => { const [x, z] = P(i, lat); return [x, samples[wrap(i)].p.y, z]; };
        // the inside of the corner: on until the parapet's line reaches the end of the race barrier (MED.x1, where the two legs part)
        let iEnd = iFoot; while (iEnd < iFoot + 60 && P(iEnd, LIP)[0] > MED.x1 + 2.5) iEnd++;
        for (const sd of [1, -1]) { // +1: the left coming down, which is the inside of the corner at the bottom
          const last = sd > 0 ? iEnd : iFoot;
          for (let i = iRail; i < last; i++) piece(at3(i, sd * LIP), at3(i + 1, sd * LIP), sd);
          { const a = at3(iRail, sd * LIP), t = samples[iRail].th; cap(a, sd, [t.x, t.z]); }
          if (sd > 0) piece(at3(iEnd, LIP), [MED.x1 + 0.05, 0, WIDE + 0.3], sd); // in to the end of the race barrier
          else {
            // out to the first post of the rail round the outside of the corner (the trackside builder's, RAIL out)
            let post = null, best = 7;
            for (const w of walls) for (const [x, z] of [[w.ax, w.az], [w.bx, w.bz]]) {
              if (Math.abs(w.y ?? 0) > 1.5) continue;
              const k = nearestI(x, z), q = samples[k], lat = (x - q.p.x) * q.left.x + (z - q.p.z) * q.left.z, d = Math.hypot(x - P(iFoot, -RAIL)[0], z - P(iFoot, -RAIL)[1]);
              if (Math.abs(lat + RAIL) < 0.4 && d < best) { best = d; post = [x, q.p.y, z]; }
            }
            const a = at3(iFoot, -LIP);
            if (post) piece(a, post, sd); else { const t = samples[iFoot].th; cap(a, sd, [t.x, t.z]); }
          }
        }
        if (par.pos.length) { const m = flatMesh(par.pos, par.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; m.userData.dyn = true; worldGroup.add(m); }
      }
    }
  }

  // ---- the streets round about: blocks of shops and flats, a few towers further off, trees ----
  {
    const rndT = mulberry32(8807);
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ flatShading: true }), 420), bands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0x3b556e), 900);
    const M = new THREE.Matrix4(), col = new THREE.Color(), WALLS = [0xe8d9b5, 0xd9c6a5, 0xcfd6dc, 0xf1e9d6, 0xc9a98a, 0xb5543c, 0xe2cc95, 0xb9bdc5, 0xd9dde3];
    let n = 0, nb = 0;
    const treeGeo = (() => { const g = new THREE.Group(); add(g, new THREE.CylinderGeometry(0.3, 0.45, 3.4, 6), 0x7a6a58, 0, 1.7, 0); for (const [x, y, z, r, c] of [[0, 4.8, 0, 2.6, 0x4a9a44], [1.5, 4.3, 0.5, 1.9, 0x5aae4e], [-1.4, 4.4, -0.8, 2.0, 0x3f8a3c], [0.2, 6.1, -0.3, 1.8, 0x5aae4e]]) add(g, new THREE.IcosahedronGeometry(r, 0), c, x, y, z).scale.y = 0.75; mergeStatic(g); return g.children[0].geometry; })();
    const trees = new THREE.InstancedMesh(treeGeo, mergedMat(THREE.FrontSide, 0), 260);
    let nt = 0;
    const tree = (x, z, sc, solid = true) => { if (nt >= 260) return; const y = terrainHeight(x, z); M.makeRotationY(rndT() * 6.28); M.scale(V(sc, sc, sc)); M.setPosition(x, y - 0.2, z); trees.setMatrixAt(nt++, M); if (solid) solids.push({ x, z, r: 0.5 * sc, y }); claim(x, z, 2.4 * sc); };
    for (let x = lim.x - lim.r - 150; x < lim.x + lim.r + 150; x += 22) for (const z of [-16, 16]) if (roadGap(track, x, z) > hw + 14 && Math.abs(x - street.xa + 39) > 10 && isFree(track, x, z, 1.5, hw + 10)) tree(x, z, 0.8 + rndT() * 0.3, Math.hypot(x - lim.x, z - lim.z) < lim.r);
    const PITCH = 46;
    for (let gx = -13; gx <= 13; gx++) for (let gz = -13; gz <= 13; gz++) {
      const x = lim.x + gx * PITCH + (rndT() - 0.5) * 8, z = lim.z + gz * PITCH + (rndT() - 0.5) * 8, d = Math.hypot(x - lim.x, z - lim.z), w = 16 + rndT() * 14, dp = 16 + rndT() * 14, inside = d < lim.r - 22;
      if (d > lim.r + 260 || Math.abs(d - lim.r) < 22 || Math.abs(z) < 32 || n >= 420) continue;
      if (!isFree(track, x, z, Math.max(w, dp) * 0.6, hw + 26) || (track.def.blocks || []).some(b => x > b[0] - 22 && x < b[2] + 22 && z > b[1] - 22 && z < b[3] + 22)) continue;
      if (rndT() < 0.2) { for (let k = 0; k < 3; k++) tree(x + (rndT() - 0.5) * 22, z + (rndT() - 0.5) * 22, 0.8 + rndT() * 0.6, inside); continue; } // a little park instead
      const tower = !inside && z < 180 && rndT() < 0.09, h = tower ? 40 + rndT() * 40 : z > 230 ? 6 + rndT() * 3 : 7 + rndT() * (inside ? 9 : 16), y = terrainHeight(x, z);
      M.makeScale(w, h + 2, dp); M.setPosition(x, y + h / 2 - 1, z); blocks.setMatrixAt(n, M); blocks.setColorAt(n++, col.set(WALLS[Math.floor(rndT() * WALLS.length)]));
      for (let f = 0; f < Math.min(tower ? 9 : 3, Math.floor(h / 3.4)) && nb < 900; f++) { M.makeScale(w + 0.3, 1.3, dp + 0.3); M.setPosition(x, y + 2.1 + f * (tower ? h / 9.5 : 3.4), z); bands.setMatrixAt(nb++, M); }
      claim(x, z, Math.max(w, dp) * 0.75);
      if (inside) solidRect(x - w / 2, z - dp / 2, x + w / 2, z + dp / 2, y);
    }
    // The park behind the car park. A fairground stood here until 3.63: big wheel, carousel and big top, which the
    // owner found out of place at a shopping centre. Now a lawn with two paths across it, trees round it and in
    // it, a lamp where the paths meet and a bench on each. (Its own trees and random numbers: the town's stay as
    // they were. The lawn and the paths are laid edge to edge, never one over another: two that close flicker.)
    if (track.sites?.park) {
      const { x: px, z: pz } = track.sites.park, R = 24, PW = 1.4, rndK = mulberry32(3310), GRASS = C(0x6aa85e), PATHC = C(0xd9d2c0), y0 = terrainHeight(px, pz);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) decal(Math.min(px + sx * PW, px + sx * R), Math.min(pz + sz * PW, pz + sz * R), Math.max(px + sx * PW, px + sx * R), Math.max(pz + sz * PW, pz + sz * R), GRASS, 0.06);
      decal(px - R, pz - PW, px + R, pz + PW, PATHC, 0.06); decal(px - PW, pz - R, px + PW, pz - PW, PATHC, 0.06); decal(px - PW, pz + PW, px + PW, pz + R, PATHC, 0.06);
      const parkTrees = new THREE.InstancedMesh(treeGeo, mergedMat(THREE.FrontSide, 0), 22);
      let np = 0;
      const plant = (x, z, sc) => { const y = terrainHeight(x, z); M.makeRotationY(rndK() * 6.28); M.scale(V(sc, sc, sc)); M.setPosition(x, y - 0.2, z); parkTrees.setMatrixAt(np++, M); solids.push({ x, z, r: 0.5 * sc, y }); };
      for (let k = 0; k < 14; k++) { const a = (k + 0.5) * (6.2832 / 14) + (rndK() - 0.5) * 0.18, d = R - 2.5 - rndK() * 2.5; plant(px + Math.cos(a) * d, pz + Math.sin(a) * d, 1 + rndK() * 0.45); } // round the edge
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) plant(px + sx * (8 + rndK() * 5), pz + sz * (8 + rndK() * 5), 0.9 + rndK() * 0.4); // one in each quarter of the lawn
      parkTrees.count = np; parkTrees.castShadow = true; worldGroup.add(parkTrees);
      box(world, 0.22, 5.2, 0.22, 0x8d93a0, px, y0 + 2.6, pz); box(world, 1.5, 0.2, 1.5, 0xd9dde3, px, y0 + 5.3, pz); solids.push({ x: px, z: pz, r: 0.4, y: y0 });
      for (const [bx, bz, ry] of [[9, PW + 1, 0], [-9, -PW - 1, 0], [PW + 1, -9, Math.PI / 2], [-PW - 1, 9, Math.PI / 2]]) {
        const g = at(px + bx, pz + bz, ry, terrainHeight(px + bx, pz + bz));
        box(g, 2.6, 0.2, 0.7, 0x7a4a2a, 0, 0.55, 0).castShadow = false; box(g, 2.2, 0.5, 0.2, 0x5a6372, 0, 0.25, 0).castShadow = false;
      }
    }
    blocks.count = n; bands.count = nb; trees.count = nt; blocks.castShadow = trees.castShadow = true; worldGroup.add(blocks, bands, trees);
  }

  // ---- on the horizon from the roof: the harbour, the Bridge, the Opera House and the city; hills the other ways ----
  {
    const rndF = mulberry32(1932);
    const far = at(0, 0, 0, 0), TOWERS = [0x8fa3b8, 0x7a8ea3, 0xa9b7c9, 0x9aa7b5, 0x6f8196, 0xc2b49a, 0x5f7790, 0xb7c3cf], WX = samples[i1].p.x;
    flatQ(lit, WX - 900, 700, WX + 900, 1000, 0.4, C(0x3aa6c4));
    for (let k = 0; k < 30; k++) { const w = 22 + rndF() * 22, h = 60 + rndF() * 150; cityTower(far, WX - 600 + rndF() * 400, 930 + rndF() * 110, w, h, TOWERS[k % TOWERS.length]); }
    add(far, new THREE.CylinderGeometry(3, 4, 230, 8), 0xb9bdc5, WX - 380, 115, 950).castShadow = false; add(far, new THREE.CylinderGeometry(11, 11, 18, 12), 0xd9b44a, WX - 380, 222, 950).castShadow = false; add(far, new THREE.CylinderGeometry(0.8, 1.4, 50, 6), 0xb9bdc5, WX - 380, 256, 950).castShadow = false;
    for (let k = 0; k < 12; k++) { const m = add(far, new THREE.IcosahedronGeometry(1, 1), [0x5f9c58, 0x6aa85e, 0x548f50][k % 3], WX - 760 + k * 140, -6, 1040 + rndF() * 40); m.scale.set(120, 26 + rndF() * 14, 80); m.castShadow = false; }
    for (let k = 0; k < 9; k++) { const w = 18 + rndF() * 14, h = 30 + rndF() * 60; cityTower(far, WX + 190 + rndF() * 200, 1010 + rndF() * 40, w, h, TOWERS[k % TOWERS.length], 8); }
    buildSydneyIcons(WX, 850, 1, 0, 0.4, WX - 215, 770, 0.2, 1.4);
    for (let i = 0; i < 20; i++) { // hazy hills all round
      const a = (i / 20) * 6.2832 + rndF() * 0.25; if (Math.sin(a) > 0.55) continue;
      const r = 1300 + rndF() * 800, h = (120 + rndF() * 170) * 0.5, w = 320 + rndF() * 320, m = add(far, new THREE.ConeGeometry(1, 1, 7), track.look.hills, lim.x + Math.cos(a) * r, h / 2 - 4, lim.z + Math.sin(a) * r); m.scale.set(w, h, w); m.castShadow = false;
    }
  }

  // the sheets
  const sheet = (Q, mat, shadow) => { if (!Q.pos.length) return; const m = flatMesh(Q.pos, Q.col, mat); m.userData.dyn = true; m.receiveShadow = !!shadow; worldGroup.add(m); };
  sheet(lit, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  sheet(glow, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  sheet(paint, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), true);
  if (sp.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    worldGroup.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: cleanTexture(atlas), color: 0xf0f0f0, side: THREE.DoubleSide })));
  }
  cars.count = nCars; cars.castShadow = true; worldGroup.add(cars);
  people.finish();
}

// The Harbour Bridge and the Opera House, for a far shore. The bridge is
// centred on (cx, cz) and runs along the unit vector (px, pz), its deck 48 m
// over the water at WL; the Opera House stands at (ohx, ohz), turned by ohRy.
// One sail of the Opera House, as a closed shape: its ridge rises in a curve from a foot at the back to a peak at
// the front, where the shell is cut off (the glass wall); across it, it's a pointed arch all the way along, so it
// narrows to its foot. H is the peak's height, L its length on the ground. The mouth faces +z and leans out over
// its own foot. Returns the shell and the mouth as two geometries (they're different colours).
function sailGeometry(H, L) {
  const N = 7, M = 4, RATIO = 2.6, LEAN = 0.22;
  const arch = (t) => { // the arch at t along the ridge (0 the foot, 1 the mouth): points from the ground on one side, over the top, to the ground on the other
    const top = Math.max(1e-3, H * Math.sin((t * Math.PI) / 2)), w = top / RATIO, k = (w * (RATIO * RATIO - 1)) / 2, R = w + k, A = Math.acos(k / R), out = [];
    for (let j = -M; j <= M; j++) { const a = A * (1 - Math.abs(j) / M), y = R * Math.sin(a); out.push([Math.sign(j) * (R * Math.cos(a) - k), y, -L * (1 - t) + LEAN * y]); }
    return out;
  };
  const shell = [], mouth = [], tri = (to, a, b, c) => to.push(...a, ...b, ...c);
  for (let i = 0; i < N; i++) {
    const a = arch(i / N), b = arch((i + 1) / N);
    for (let j = 0; j < 2 * M; j++) { tri(shell, a[j], b[j], b[j + 1]); tri(shell, a[j], b[j + 1], a[j + 1]); }
  }
  const front = arch(1);
  for (let j = 0; j < 2 * M; j++) tri(mouth, [0, 0, 0], front[j], front[j + 1]);
  const geo = (p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g; };
  return { shell: geo(shell), mouth: geo(mouth) };
}

// A city tower seen from far off, with enough to it to read as a building: rows of windows as darker bands (or
// upright strips), and a top of its own (a set-back upper part, a plant room, a mast, a fin, or just a cap).
// `far` is the group to put it in (one that isn't turned), c its colour, y0 the height of its foot; which kind it
// is follows from where it was asked for.
//
// Nothing on it lies just in front of anything else. From a kilometre off the graphics card can't tell two faces
// apart that are less than half a metre or so from each other (less still from the cockpit, whose camera has to
// see things a hand's breadth away), and draws now one, now the other: the city flickered. The windows used to
// be dark boxes standing 40 cm proud of the wall. Now each tower is one skin, drawn wall by wall with the windows
// as lengths of the wall itself, a top is a band of the same size as what it stands on, and a fin stands outside
// the wall. Towers also stood through one another wherever they happened to fall, some with walls nearly in
// line: each is now moved the few metres it takes to keep its walls CITY_GAP clear of any neighbour's that
// face the same way and overlap them (and the odd one that can't be is left out).
const cityTowers = [], CITY_GAP = 4; // the blocks of the towers built so far in this world, each [x0, x1, z0, z1, y0, y1] (emptied for each world)
const CITY_STEPS = (() => { const o = []; for (let i = -20; i <= 20; i++) for (let j = -20; j <= 20; j++) o.push([i, j]); return o.sort((p, q) => p[0] * p[0] + p[1] * p[1] - (q[0] * q[0] + q[1] * q[1])); })(); // moves to try, nearest first
function cityTower(far, x, z, w, h, c, y0 = 0) {
  const r = (n) => { const v = Math.sin(x * 12.9898 + z * 78.233 + n * 37.719) * 43758.5453; return v - Math.floor(v); }; // a number from 0 to 1 that goes with the place
  const base = new THREE.Color(c), dark = base.clone().multiplyScalar(0.62).lerp(new THREE.Color(0x24384f), 0.25), pale = base.clone().lerp(new THREE.Color(0xffffff), 0.4);
  const d = w * (0.7 + 0.5 * r(1)), kind = r(2), upright = r(3) < 0.3;
  const setBack = kind < 0.3 && h > 90, room = !setBack && kind < 0.55, fin = !setBack && !room && kind < 0.75, FIN = Math.max(w * 0.16, 3.5), cut = h * (0.62 + 0.14 * r(4));
  // The blocks it would be made of, standing at (px, pz) in the world. Two blocks flicker against each other where
  // a wall of one lies just behind the same wall of the other (both facing the same way) and the two overlap.
  const wy = far.position.y + y0;
  const blocks = (px, pz) => {
    const B = [[px - w / 2, px + w / 2, pz - d / 2, pz + d / 2, wy, wy + (setBack ? cut : h + (room || fin ? 0 : 2.6))]];
    if (setBack) B.push([px - w * 0.35, px + w * 0.35, pz - d * 0.35, pz + d * 0.35, wy + cut, wy + h + 2.2]);
    if (room) B.push([px - w * 0.29, px + w * 0.29, pz - d * 0.29, pz + d * 0.29, wy + h, wy + h + 8]);
    if (fin) B.push([px - w / 2 - FIN, px - w / 2, pz - d * 0.25, pz + d * 0.25, wy, wy + h + 7]);
    return B;
  };
  const clash = (P, Q) => Math.min(P[5], Q[5]) > Math.max(P[4], Q[4])
    && ((Math.min(P[3], Q[3]) > Math.max(P[2], Q[2]) - 0.5 && (Math.abs(P[0] - Q[0]) < CITY_GAP || Math.abs(P[1] - Q[1]) < CITY_GAP))
      || (Math.min(P[1], Q[1]) > Math.max(P[0], Q[0]) - 0.5 && (Math.abs(P[2] - Q[2]) < CITY_GAP || Math.abs(P[3] - Q[3]) < CITY_GAP)));
  const clear = (B) => B.every((P) => cityTowers.every((Q) => !clash(P, Q)));
  const wx = far.position.x + x, wz = far.position.z + z;
  const move = CITY_STEPS.find(([i, j]) => clear(blocks(wx + i, wz + j)));
  if (!move) { cityTowers.left++; return; } // (nowhere within 20 m to stand clear of the rest: it's left out; one or two of a skyline's worth)
  cityTowers.push(...blocks(wx + move[0], wz + move[1]));
  // its skin: every wall a row of upright lengths, each its own colour
  const pos = [], col = [];
  const ring = (bw, bd, ya, yb, cuts, colours, ox = 0, oz = 0, skip = -1) => {
    const C = [[ox - bw / 2, oz + bd / 2], [ox + bw / 2, oz + bd / 2], [ox + bw / 2, oz - bd / 2], [ox - bw / 2, oz - bd / 2]]; // (round it this way, each wall is drawn facing out)
    for (let k = 0; k < 4; k++) {
      if (k === skip) continue;
      const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
      for (let j = 0; j + 1 < cuts.length; j++) {
        const f0 = cuts[j] + 0.5, f1 = cuts[j + 1] + 0.5, px = ax + (bx - ax) * f0, pz = az + (bz - az) * f0, qx = ax + (bx - ax) * f1, qz = az + (bz - az) * f1;
        pushQuad(pos, col, V(px, ya, pz), V(qx, ya, qz), V(qx, yb, qz), V(px, yb, pz), colours[j]);
      }
    }
  };
  const lid = (bw, bd, y, colour, ox = 0, oz = 0) => pushQuad(pos, col, V(ox - bw / 2, y, oz + bd / 2), V(ox + bw / 2, y, oz + bd / 2), V(ox + bw / 2, y, oz - bd / 2), V(ox - bw / 2, y, oz - bd / 2), colour);
  const WHOLE = [-0.5, 0.5], STRIPS = [-0.5, -0.395, -0.225, -0.085, 0.085, 0.225, 0.395, 0.5];
  // a block of the tower from one height to another, with its windows: three upright strips a side, or a band every 14 m
  const body = (bw, bd, from, to) => {
    if (upright) {
      ring(bw, bd, from, from + 3, WHOLE, [base]); ring(bw, bd, from + 3, to - 3, STRIPS, [base, dark, base, dark, base, dark, base]); ring(bw, bd, to - 3, to, WHOLE, [base]);
    } else {
      let y = from;
      for (let b = from + 8; b < to - 4; b += 14) { ring(bw, bd, y, b - 2.2, WHOLE, [base]); ring(bw, bd, b - 2.2, b + 2.2, WHOLE, [dark]); y = b + 2.2; }
      ring(bw, bd, y, to, WHOLE, [base]);
    }
  };
  if (setBack) { // the upper part set back, under a pale top
    body(w, d, 0, cut); lid(w, d, cut, base); body(w * 0.7, d * 0.7, cut, h); ring(w * 0.7, d * 0.7, h, h + 2.2, WHOLE, [pale]); lid(w * 0.7, d * 0.7, h + 2.2, pale);
  } else {
    body(w, d, 0, h);
    if (room) { // a plant room on the roof, and often a mast
      lid(w, d, h, base); ring(w * 0.58, d * 0.58, h, h + 8, WHOLE, [pale]); lid(w * 0.58, d * 0.58, h + 8, pale);
      if (r(5) < 0.6) { const top = h + 33 + 8 * r(6); ring(1.5, 1.5, h + 8, top, WHOLE, [pale], w * 0.12, 0); lid(1.5, 1.5, top, pale, w * 0.12, 0); }
    } else if (fin) { // a fin up one side, standing above the roof (outside the wall, and without the face it has against it)
      lid(w, d, h, base); ring(FIN, d * 0.5, 0, h + 7, WHOLE, [pale], -w / 2 - FIN / 2, 0, 1); lid(FIN, d * 0.5, h + 7, pale, -w / 2 - FIN / 2, 0);
    } else { ring(w, d, h, h + 2.6, WHOLE, [pale]); lid(w, d, h + 2.6, pale); } // a cap
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, cityMat); m.position.set(x + move[0], y0, z + move[1]); m.castShadow = false; far.add(m); // (merged with the rest of the scenery, like any plain mesh)
}
const cityMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); cityMat.userData.keep = true; // shared by every tower: never disposed with a world

function buildSydneyIcons(cx, cz, px, pz, WL, ohx, ohz, ohRy, ohScale = 1, night = false) {
  const mats = new Map();
  const lam = (c, e = 0, side = THREE.FrontSide) => { const k = `${c}|${e}|${side}`; let m = mats.get(k); if (!m) mats.set(k, m = new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true, side })); return m; };
  const ax = -pz, az = px, DECK = WL + 48, SPAN = 140; // (ax, az): across the bridge
  const bp = (u, across, y) => V(cx + px * u + ax * across, y, cz + pz * u + az * across);
  const steel = lam(0x6f7680), lit = lam(0xffe2a8, 0xffc070);
  // the bridge: a steel arch from pylon to pylon, the deck hanging under it
  const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 400), lam(0x4a4f5a)); deck.position.copy(bp(0, 0, DECK)); deck.rotation.y = Math.atan2(px, pz); worldGroup.add(deck);
  for (const u of [-SPAN - 14, SPAN + 14]) for (const ac of [-13, 13]) {
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(14, DECK - WL + 36, 16), lam(0xc9b48c)); pyl.position.copy(bp(u, ac, WL + (DECK - WL + 36) / 2)); pyl.rotation.y = Math.atan2(px, pz); worldGroup.add(pyl);
  }
  const yTop = (u) => DECK + 10 + 54 * (1 - (u / SPAN) ** 2), yBot = (u) => DECK - 10 + 64 * (1 - (u / SPAN) ** 2), SEG = 20;
  for (const ac of [-11, 11]) for (let k = 0; k < SEG; k++) {
    const u0 = -SPAN + (2 * SPAN * k) / SEG, u1 = u0 + (2 * SPAN) / SEG;
    worldGroup.add(strut(bp(u0, ac, yTop(u0)), bp(u1, ac, yTop(u1)), 1.6, 1.6, steel));
    worldGroup.add(strut(bp(u0, ac, yBot(u0)), bp(u1, ac, yBot(u1)), 2.2, 2.2, steel));
    worldGroup.add(strut(bp(u0, ac, k % 2 ? yTop(u0) : yBot(u0)), bp(u1, ac, k % 2 ? yBot(u1) : yTop(u1)), 0.8, 0.8, steel));
    if (yBot(u0) > DECK + 2) worldGroup.add(strut(bp(u0, ac, yBot(u0)), bp(u0, ac, DECK + 1.5), 0.6, 0.6, steel));
    if (k % 2 === 0) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), lit); l.position.copy(bp(u0, ac, yTop(u0) + 1.2)); worldGroup.add(l); }
  }
  for (let k = 0; k <= SEG; k += 2) { const u = -SPAN + (2 * SPAN * k) / SEG; worldGroup.add(strut(bp(u, -11, yTop(u)), bp(u, 11, yTop(u)), 0.7, 0.7, steel)); }
  // The Opera House: on a stone podium, two halls side by side, each a run of white sails stepping down from the
  // harbour end with one more facing the other way at the land end. The sails are closed shapes with glass across
  // their mouths (as open sheets they were hollow from the side, with daylight under them). Lit up at night.
  const oh = new THREE.Group(); oh.position.set(ohx, WL, ohz); oh.rotation.y = ohRy; oh.scale.setScalar(ohScale); worldGroup.add(oh);
  for (const [w, h, d, y, c] of [[98, 3, 62, 1.5, 0xb89a7c], [84, 4, 52, 5, 0xc9a98a]]) { const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c, night ? 0x3a3026 : 0)); step.position.y = y; step.castShadow = true; oh.add(step); }
  const white = lam(0xf7f5ef, night ? 0x8f8d87 : 0x4a4946, THREE.DoubleSide), glass = lam(0x62758c, night ? 0xa8742c : 0x1c2530, THREE.DoubleSide);
  for (const [zc, sc] of [[-12, 1], [14, 0.84]]) for (const [H, L, x, dir] of [[40, 30, -33, -1], [31, 25, -13, -1], [23, 20, 5, -1], [17, 16, 36, 1]]) {
    const { shell, mouth } = sailGeometry(H * sc, L * sc);
    for (const [geo, mat] of [[shell, white], [mouth, glass]]) { const m = new THREE.Mesh(geo, mat); m.position.set(x, 7, zc); m.rotation.y = dir * Math.PI / 2; m.castShadow = true; oh.add(m); }
  }
  return DECK;
}

// Rose Bay: Sydney's own Monaco. Along the quay there's a sea wall with a wide
// promenade (and a guard rail to keep cars off it: it's paving over sloping
// ground, not somewhere to drive), Norfolk pines, marquees and superyachts moored stern-on; then a
// marina, the seaplanes, a ferry calling at the wharf and Catalina on its
// stilts over the water. Shops line New South Head Road on the way down (a few
// real ones among them, in plain lettering: the owner asked for local names
// here), the road dives through a tunnel under the hotel on the corner, big
// houses with pools climb Heartbreak Hill to the convent school at the top,
// there's a golf course in the middle, and the city, the Opera House and the
// Harbour Bridge stand across the water, dead ahead on the way down.
function buildRoseBay(track, rnd, randIn) {
  const { samples, N, hw } = track, sea = track.sea, L = sea.level, lim = track.limit, solids = track.solids, walls = track.walls;
  const mats = new Map();
  const lam = (c, e = 0) => { const k = c + '|' + e; let m = mats.get(k); if (!m) mats.set(k, m = new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true })); return m; };
  const add = (g, geo, c, x, y, z, e) => { const m = new THREE.Mesh(geo, lam(c, e)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const box = (g, w, h, d, c, x, y, z, e) => add(g, new THREE.BoxGeometry(w, h, d), c, x, y, z, e);
  const at = (x, z, ry = 0, y = terrainHeight(x, z)) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; worldGroup.add(g); return g; };
  const W = (g, lx, lz) => { const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y); return [g.position.x + lx * c + lz * s, g.position.z - lx * s + lz * c]; }; // a group's local x, z in the world
  const wrap = (i) => ((Math.round(i) % N) + N) % N;
  const P = (i, lat) => { const s = samples[wrap(i)]; return [s.p.x + s.left.x * lat, s.p.z + s.left.z * lat]; };
  const nearestI = (x, z) => { let b = 0, d = Infinity; for (let i = 0; i < N; i++) { const s = samples[i], e = (s.p.x - x) ** 2 + (s.p.z - z) ** 2; if (e < d) { d = e; b = i; } } return b; };
  const facing = (i, sd) => { const s = samples[wrap(i)]; return Math.atan2(-s.left.x * sd, -s.left.z * sd); }; // turned to face the road from side sd
  const outward = (i, sd) => { const s = samples[wrap(i)]; return Math.atan2(s.left.x * sd, s.left.z * sd); }; // turned to face away from it
  const along = (i) => { const s = samples[wrap(i)]; return Math.atan2(s.th.x, s.th.z); };
  const people = makePeople(200, rnd);
  const quads = { pos: [], col: [] }, C = (hex) => new THREE.Color(hex); // every flat-coloured strip, in one mesh
  const wires = { pos: [], col: [] }; // the catch fences' posts and wires: a mesh of their own, which casts no shadow (a wire's would only flicker)
  const PAVE = -0.2; // paving lies this far under the road's own level: just over the ground beside it
  // a strip beside the road from sample i to the next: from lat0 (at y0 above the road) across to lat1 (at y1)
  const ribbon = (i, sd, lat0, lat1, y0, y1, color) => {
    const a = samples[wrap(i)], b = samples[wrap(i + 1)], [ax, az] = P(i, sd * lat0), [bx, bz] = P(i + 1, sd * lat0), [cx, cz] = P(i + 1, sd * lat1), [dx, dz] = P(i, sd * lat1);
    pushQuad(quads.pos, quads.col, V(ax, a.p.y + y0, az), V(bx, b.p.y + y0, bz), V(cx, b.p.y + y1, cz), V(dx, a.p.y + y1, dz), color);
  };
  const model = (build) => { const g = new THREE.Group(); build(g); mergeStatic(g); return g; };
  // a board with words on it
  const sign = (g, text, bg, ink, w, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, ink, 512, Math.round(512 * h / w)), color: 0xe6e6e6 }));
    m.position.set(x, y, z); m.rotation.y = ry; g.add(m); return m;
  };

  // which side the harbour is on, sample by sample (0: no water beside the road there)
  const wet = samples.map((s, i) => [1, -1].find((sd) => wetAt(...P(i, sd * (hw + 26)))) || 0);
  const QUAY = hw + 17; // the sea wall: far enough out that all the ground past it is under water
  const onQuay = (i, n = 0) => { const sd = wet[wrap(i)]; for (let k = -n; k <= n; k++) if (wet[wrap(i + k)] !== sd) return 0; return sd; };
  // the tunnel: round the corner onto the quay
  const t0 = nearestI(-215, 52), t1 = nearestI(-170, 0), inTunnel = (i, pad = 3) => { const k = wrap(i); return k >= t0 - pad && k <= t1 + pad; };
  const TUN = hw + 4.7; // the tunnel's walls, this far out from the centre line
  const free = (x, z, r) => !occupied.some((o) => (o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2); // (isFree keeps everything off the waterfront: what's below belongs on it)
  // paving beside the road: up against the kerb, down a little to its own level, then flat out to `lat`
  const pave = (i, sd, lat, color) => { ribbon(i, sd, hw + 1.62, hw + 3, 0.01, PAVE, color); ribbon(i, sd, hw + 3, lat, PAVE, PAVE, color); };

  // ---- trees, as instances: Norfolk pines (the ones along every Sydney beach) and big round figs ----
  const pineGeo = model((g) => { add(g, new THREE.CylinderGeometry(0.22, 0.36, 11, 5), 0x6b5038, 0, 5.5, 0); for (let k = 0; k < 6; k++) add(g, new THREE.ConeGeometry(3.4 - k * 0.5, 1.5, 7), k % 2 ? 0x2f6b3f : 0x3a7a48, 0, 3.2 + k * 1.55, 0); }).children[0].geometry;
  const figGeo = model((g) => { add(g, new THREE.CylinderGeometry(0.4, 0.62, 3.6, 6), 0x7a6a58, 0, 1.8, 0); for (const [x, y, z, r, c] of [[0, 5.2, 0, 2.9, 0x3f7a35], [1.8, 4.6, 0.6, 2.2, 0x4a8a3c], [-1.6, 4.7, -0.9, 2.3, 0x37702f], [0.2, 6.6, -0.4, 2.0, 0x4a8a3c]]) add(g, new THREE.IcosahedronGeometry(r, 0), c, x, y, z).scale.y = 0.75; }).children[0].geometry;
  const PINES = 190, FIGS = 300, M = new THREE.Matrix4();
  const pines = new THREE.InstancedMesh(pineGeo, mergedMat(THREE.FrontSide, 0), PINES), figs = new THREE.InstancedMesh(figGeo, mergedMat(THREE.FrontSide, 0), FIGS);
  pines.castShadow = figs.castShadow = true;
  let np = 0, nf = 0;
  const tree = (pine, x, z, sc, solid = true, y = terrainHeight(x, z)) => {
    if (pine ? np >= PINES : nf >= FIGS) return;
    M.makeRotationY(rnd() * 6.28); M.scale(V(sc, sc, sc)); M.setPosition(x, y - 0.3, z);
    if (pine) pines.setMatrixAt(np++, M); else figs.setMatrixAt(nf++, M);
    if (solid) { solids.push({ x, z, r: 0.5 * sc, y }); claim(x, z, (pine ? 1.6 : 2.6) * sc); }
  };

  // ---- the tunnel, under the hotel ----
  {
    // (ROOF: the ceiling hangs a little under the hotel's floor, which is flat block by block while the road under it
    // drops: at the same height the two flickered against each other, and where the road fell away from a block
    // its pale floor showed through the ceiling in a wedge.)
    const TW = TUN, TH = 6.6, ROOF = TH - 0.35, conc = C(0x9aa0aa), roof = C(0x6b7078), floor = C(0x7c828d), lp = [];
    for (let i = t0; i < t1; i++) {
      for (const sd of [1, -1]) { ribbon(i, sd, TW, TW + 0.02, -0.5, TH, conc); pave(i, sd, TW, floor); } // walls, and concrete from the kerb to each
      ribbon(i, 1, TW, -TW, ROOF, ROOF, roof);
      if (i % 5 === 0) { // a strip light in the roof
        const a = samples[wrap(i)], b = samples[wrap(i + 2)], y = ROOF - 0.08;
        const c4 = [P(i, 1.4), P(i + 2, 1.4), P(i + 2, -1.4), P(i, -1.4)].map(([x, z], j) => [x, (j === 1 || j === 2 ? b : a).p.y + y, z]);
        for (const j of [0, 1, 2, 0, 2, 3]) lp.push(...c4[j]);
      }
    }
    if (lp.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); worldGroup.add(new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xfff1c9, side: THREE.DoubleSide }))); }
    for (let i = t0 + 3; i < t1 - 2; i += 8) { // the hotel standing over it, in blocks that follow the bend
      const s = samples[wrap(i)], g = at(s.p.x, s.p.z, along(i), s.p.y + TH);
      // its name, on the face of the first block that cars come up to: between two rows of windows and a little
      // proud of the wall (on a plane of its own it ran into the wall at one end, the blocks being turned to the bend)
      if (i === t0 + 3) sign(g, 'THE INTERCONTINENTAL', '#1d2b5c', '#f6e7c8', 15.4, 2.2, 0, 5.25, -7.75, Math.PI); // (the owner's choice of name, in plain lettering like the shops' signs)
      box(g, 2 * (hw + 9), 18, 15, 0xe8dcc0, 0, 9, 0);
      for (const y of [3, 7.5, 12, 16]) box(g, 2 * (hw + 9) + 0.2, 1.3, 15.2, 0x3b556e, 0, y, 0);
      box(g, 2 * (hw + 9) + 0.6, 0.6, 15.6, 0x8f949e, 0, 18.3, 0);
    }
    for (const i of [t0, t1]) { const s = samples[wrap(i)], g = at(s.p.x, s.p.z, along(i), s.p.y); box(g, 2 * TW + 3, 1.8, 1.4, 0x6b7078, 0, TH + 0.5, 0); for (const lx of [-TW - 0.7, TW + 0.7]) box(g, 1.4, TH + 0.8, 1.4, 0x6b7078, lx, TH / 2, 0); }
    for (let i = t0 - 4; i < t1 + 4; i += 3) for (const sd of [1, -1]) for (const lat of [hw + 9, hw + 15]) { const [x, z] = P(i, sd * lat); claim(x, z, 4.5); }
    // its walls are solid, and so are the posts at each end
    for (let i = t0; i < t1; i += 2) for (const sd of [1, -1]) { const [ax, az] = P(i, sd * TW), [bx, bz] = P(Math.min(i + 2, t1), sd * TW); walls.push({ ax, az, bx, bz, y: samples[wrap(i)].p.y }); }
    for (const i of [t0, t1]) for (const sd of [1, -1]) { const [x, z] = P(i, sd * (TW + 0.7)); solids.push({ x, z, r: 0.95, y: samples[wrap(i)].p.y }); }
  }

  // ---- the quay: a paved promenade, a sea wall down into the water, a white balustrade, pines, lamps and marquees ----
  {
    const paving = C(0xd9d2c0), stone = C(0xc9bfa6), white = lam(0xf6f2e8);
    // the wall's line, QUAY metres out; where the inside of a bend folds that line back on itself the points are dropped and it cuts straight across
    const edge = samples.map((s, i) => {
      const sd = onQuay(i, 1); if (!sd) return null;
      const [x, z] = P(i, sd * QUAY);
      return roadGap(track, x, z) < QUAY - 0.5 ? null : { x, z, y: s.p.y, nx: -s.left.x * sd, nz: -s.left.z * sd };
    });
    const nearEdge = (i) => { for (let k = 0; k < 40; k++) { const e = edge[wrap(i - k)] || edge[wrap(i + k)]; if (e) return e; } return null; };
    const start = Math.max(0, samples.findIndex((_, i) => !onQuay(i, 1)));
    let run = [];
    const flush = () => {
      for (let j = 0; j + 1 < run.length; j++) { const a = run[j], b = run[j + 1]; pushQuad(quads.pos, quads.col, V(a.x, a.y + PAVE, a.z), V(b.x, b.y + PAVE, b.z), V(b.x, L - 3.4, b.z), V(a.x, L - 3.4, a.z), stone); }
      for (let j = 0; j < run.length; j += 2) { // the balustrade: a post, and two rails on to the next
        const a = run[j], b = run[Math.min(j + 2, run.length - 1)], pa = V(a.x + a.nx * 0.3, a.y + PAVE, a.z + a.nz * 0.3), pb = V(b.x + b.nx * 0.3, b.y + PAVE, b.z + b.nz * 0.3);
        box(worldGroup, 0.2, 1.1, 0.2, 0xf6f2e8, pa.x, pa.y + 0.55, pa.z);
        if (a !== b) for (const h of [0.55, 1.05]) worldGroup.add(strut(V(pa.x, pa.y + h, pa.z), V(pb.x, pb.y + h, pb.z), 0.1, 0.1, white));
      }
      run = [];
    };
    for (let k = 1; k <= N; k++) {
      const i = wrap(start + k), sd = onQuay(i, 1), s = samples[i];
      if (!sd) { flush(); continue; }
      if (edge[i]) run.push(edge[i]);
      if (onQuay(i + 1, 1) === sd) { // the paving, from the kerb out to the wall
        // (In the tunnel the floor is the tunnel's own, out to its wall: the promenade starts outside that. It
        // used to be laid through the tunnel as well, and two floors in one place flickered on the way out.)
        const under = i >= t0 && i < t1, from = under ? TUN + 0.02 : hw + 3;
        const b = samples[wrap(i + 1)], [ax, az] = P(i, sd * from), [bx, bz] = P(i + 1, sd * from), ea = nearEdge(i), eb = nearEdge(i + 1);
        if (!under) ribbon(i, sd, hw + 1.62, hw + 3, 0.01, PAVE, paving);
        if (ea && eb) pushQuad(quads.pos, quads.col, V(ax, s.p.y + PAVE, az), V(bx, b.p.y + PAVE, bz), V(eb.x, eb.y + PAVE, eb.z), V(ea.x, ea.y + PAVE, ea.z), paving);
      }
      if (inTunnel(i, 8) || !edge[i]) continue;
      const y = s.p.y + PAVE;
      if (i % 12 === 6) { const [x, z] = P(i, sd * (hw + 8.5)); if (free(x, z, 1.2)) tree(true, x, z, 0.85 + rnd() * 0.3, true, y + 0.3); }
      if (i % 20 === 0) { // a lamp: a white post with two globes
        const [x, z] = P(i, sd * (hw + 15.6)), g = at(x, z, along(i), y);
        box(g, 0.16, 4.4, 0.16, 0xf6f2e8, 0, 2.2, 0); box(g, 0.1, 0.1, 1.3, 0xf6f2e8, 0, 4.3, 0);
        for (const lz of [-0.6, 0.6]) add(g, new THREE.IcosahedronGeometry(0.28, 0), 0xfff4d6, 0, 4.1, lz, 0x8a7a50);
      }
      if (i % 24 === 18 && s.p.x > 6 && s.p.x < 165 && Math.abs(s.p.z) < 8) { // race day, along the start straight: a white marquee with a pennant
        const [x, z] = P(i, sd * (hw + 12.5));
        if (free(x, z, 3.4)) {
          const g = at(x, z, along(i), y), pen = [0xe6453a, 0x1d6fb5, 0xffd23f][Math.floor(i / 24) % 3];
          for (const [lx, lz] of [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]]) box(g, 0.14, 2.6, 0.14, 0xd9dde3, lx, 1.3, lz);
          add(g, new THREE.ConeGeometry(3.9, 1.9, 4), 0xf6f2e8, 0, 3.5, 0).rotation.y = Math.PI / 4;
          box(g, 0.08, 1.6, 0.08, 0xd9dde3, 0, 5.1, 0); box(g, 0.05, 0.4, 0.9, pen, 0, 5.6, 0.5);
          box(g, 4.2, 0.9, 0.9, 0xf6f2e8, 0, 0.45, -1.6);
          claim(x, z, 3.6);
          for (let n = 0; n < 3; n++) { const [px, pz] = W(g, -1.6 + n * 1.6, 0.4); people.add(px, y + 0.02, pz, along(i) + Math.PI); }
        }
      }
      if (rnd() < 0.2) { const [x, z] = P(i, sd * (hw + 5 + rnd() * 11)); if (free(x, z, 0.5)) people.add(x, y + 0.02, z, rnd() * 6.28); }
    }
    flush();
    // A low wall between the road and the promenade, all the way along the water: the promenade is paving laid
    // over ground that slopes into the sea, so a car on it would sink through. Sandstone with a coping and a
    // pier every 6 m, like the wall behind the shops (the owner likes that one, and wanted walls here in place
    // of a rail on posts); at each end it turns back to the sea wall, or runs into the tunnel's wall, so
    // there's no way round it. Being a proper barrier, it carries a sponsor's banner every 18 m or so.
    {
      const stone = lam(0xcdb88a), coping = lam(0xb9a878), QRAIL = hw + 2.7;
      const span = (a, b) => {
        const m = strut(V(a[0], a[1] + 0.5, a[2]), V(b[0], b[1] + 0.5, b[2]), 0.5, 1.15, stone, true), top = strut(V(a[0], a[1] + 1.13, a[2]), V(b[0], b[1] + 1.13, b[2]), 0.66, 0.12, coping, true);
        m.castShadow = true; worldGroup.add(m, top); walls.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], y: (a[1] + b[1]) / 2 });
      };
      let lengths = 0;
      const on = (i) => !!onQuay(i, 1) && !inTunnel(i, 0);
      const end = (j, i, sd, y) => { if (inTunnel(j, 0)) { const [x, z] = P(j, sd * TUN); return [x, y, z]; } const e = nearEdge(i); return e && [e.x, y, e.z]; }; // what the rail meets beyond sample i, towards j
      let prev = null;
      for (let k = 1; k <= N; k++) {
        const i = wrap(start + k), sd = onQuay(i, 1);
        if (!on(i)) { prev = null; continue; }
        const s = samples[i], last = !(on(i + 1) && onQuay(i + 1, 1) === sd);
        if (prev && !last && i % 4) continue;
        const [x, z] = P(i, sd * QRAIL), q = [x, s.p.y - 0.16, z];
        box(worldGroup, 0.66, 1.32, 0.66, 0xcdb88a, x, q[1] + 0.6, z); // a pier
        if (prev) {
          span(prev, q);
          const dx = q[0] - prev[0], dz = q[2] - prev[2], len = Math.hypot(dx, dz);
          const nth = lengths++;
          if (len > 5.4 && nth % 24 >= 3 && nth % 24 < 9) { // (4.7: six in a row; 4.11: out of 24 lengths, not 12) // a sponsor's banner on three lengths in a row out of nine, on the road side (it was one in three, each a different sponsor)
            const ins = (len - 4.4) / 2 / len, nx = s.p.x - x, nz = s.p.z - z, nl = Math.hypot(nx, nz) || 1;
            const on = (f) => ({ x: prev[0] + dx * f + (nx / nl) * 0.33, y: prev[1] + (q[1] - prev[1]) * f, z: prev[2] + dz * f + (nz / nl) * 0.33 });
            addBanner(Math.floor(nth / 24), on(ins), on(1 - ins), 0.2, 1.0, 0, 1, s.p.x, s.p.z);
          }
        } else { const e = end(i - 1, i, sd, q[1]); if (e) span(e, q); }
        if (last) { const e = end(i + 1, i, sd, q[1]); if (e) span(q, e); }
        prev = last ? null : q;
      }
    }
  }

  // ---- superyachts moored stern-on to the quay beside the start straight ----
  const yacht = (i, len, hull) => {
    const sd = onQuay(i, 6); if (!sd) return;
    const [x, z] = P(i, sd * (QUAY + 4 + len / 2)); if (!wetAt(x, z)) return;
    const g = at(x, z, outward(i, sd), L), k = len / 34; // bow out to sea
    add(g, taperBox(7.2 * k, 4.2 * k, len, [0.18, 1, 1.4 * k], [0.92, 1, 0]), hull, 0, 1.0 * k, 0);
    box(g, 7.3 * k, 0.5 * k, len * 0.8, hull === 0xf6f2e8 ? 0x1d2b5c : 0xc9a271, 0, -0.2 * k, -len * 0.08);                       // the boot stripe
    for (const [w, h, d, y, zz] of [[6.2, 2.3, 0.56, 4.2, -0.07], [5.2, 2.1, 0.38, 6.3, -0.1], [3.6, 1.7, 0.2, 8.1, -0.13]]) {
      box(g, w * k, h * k, len * d, 0xf6f2e8, 0, y * k, len * zz);
      box(g, (w + 0.08) * k, h * 0.34 * k, len * d * 0.86, 0x23303f, 0, (y + 0.15) * k, len * zz);   // a band of dark glass
    }
    box(g, 0.3 * k, 2.6 * k, 0.3 * k, 0xd9dde3, 0, 10.2 * k, -len * 0.13); box(g, 2.2 * k, 0.2 * k, 0.5 * k, 0xd9dde3, 0, 10.6 * k, -len * 0.13);
    box(g, 6.4 * k, 0.4 * k, 3.4 * k, 0xc9a271, 0, 0.5 * k, -len / 2 - 1.2 * k);                   // the swim platform, teak
    box(g, 1.2, 0.2, 5.5, 0xd9dde3, 0, samples[wrap(i)].p.y - L + PAVE + 0.1, -len / 2 - 3.6);    // the gangway to the quay
    for (const lz of [-len * 0.3, 0, len * 0.3]) { const [wx, wz] = W(g, 0, lz); solids.push({ x: wx, z: wz, r: 4.2 * k, y: L - WADE }); }
  };
  [[30, 0xf6f2e8], [38, 0x1d2b5c], [26, 0xf6f2e8], [44, 0xf6f2e8], [32, 0x23303f], [28, 0xf6f2e8], [40, 0xf6f2e8], [34, 0x1d2b5c]].forEach(([len, hull], k) => yacht(nearestI(15 + k * 18, 0), len, hull));

  // ---- a marina pier with small boats, between the chicane and the start ----
  {
    const i = nearestI(-39, 0), sd = onQuay(i, 8);
    if (sd) {
      const LEN = 58, [x, z] = P(i, sd * (QUAY + LEN / 2)), g = at(x, z, outward(i, sd), L), top = samples[i].p.y - L + PAVE;
      box(g, 3, 0.3, LEN, 0xc9a271, 0, top - 0.15, 0);
      for (let d = -LEN / 2 + 3; d < LEN / 2; d += 7) for (const lx of [-1.3, 1.3]) add(g, new THREE.CylinderGeometry(0.16, 0.16, 5, 6), 0x6b4a2a, lx, -1.6, d);
      for (const lx of [-1.5, 1.5]) { const a = W(g, lx, -LEN / 2), b = W(g, lx, LEN / 2); walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y: L - WADE }); }
      for (let d = -LEN / 2 + 12, n = 0; d < LEN / 2 - 3; d += 9, n++) for (const side of [-1, 1]) {
        box(g, 9, 0.3, 1.1, 0xa8794a, side * 6, 0.6, d);
        if (rnd() < 0.2) continue;
        const b = new THREE.Group(); b.position.set(side * 6.5, 0, d + 4.3); b.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(b); // bows in to the pier
        if ((n + (side > 0 ? 1 : 0)) % 2) { // a yacht, sail furled on the boom
          add(b, taperBox(2.5, 1.1, 7.6, [0.15, 1, 0.25], [0.8, 1, 0]), n % 3 ? 0xf6f2e8 : 0x1d2b5c, 0, 0.35, 0);
          box(b, 1.6, 0.6, 2.8, 0xe9e2d0, 0, 1.1, -0.6); box(b, 0.13, 10, 0.13, 0xb9bdc5, 0, 6, 0.9); box(b, 0.3, 0.3, 3.2, 0x1d2b5c, 0, 2.1, -0.8);
        } else { // a motor cruiser
          add(b, taperBox(2.9, 1.3, 8.6, [0.2, 1, 0.35], [0.9, 1, 0]), 0xf6f2e8, 0, 0.4, 0);
          box(b, 2.3, 1.0, 3.8, 0xf6f2e8, 0, 1.5, -0.7); box(b, 2.36, 0.38, 3.2, 0x26303f, 0, 1.6, -0.5); box(b, 1.8, 0.5, 2, 0xe9e2d0, 0, 2.25, -1.3);
        }
        const [wx, wz] = W(g, side * 6.5, d + 4.3); solids.push({ x: wx, z: wz, r: 2.3, y: L - WADE });
      }
    }
  }

  // ---- Catalina: the white restaurant on stilts over the water ----
  {
    const i = nearestI(168, -5), sd = onQuay(i, 10);
    if (sd) {
      const [x, z] = P(i, sd * (QUAY + 12)), g = at(x, z, facing(i, sd), L), top = samples[i].p.y - L + PAVE; // local +z looks back at the road
      for (const lx of [-11, 0, 11]) for (const lz of [-5, 5]) add(g, new THREE.CylinderGeometry(0.3, 0.3, top + 3, 6), 0xd9dde3, lx, (top - 3) / 2, lz);
      box(g, 28, 0.5, 15, 0xe9e2cf, 0, top - 0.2, 0);
      box(g, 22, 4, 9, 0xf6f2e8, 0, top + 2.05, -1.5); box(g, 22.2, 2.3, 9.2, 0x3b6ea5, 0, top + 1.7, -1.5); box(g, 25, 0.4, 12, 0xf6f2e8, 0, top + 4.25, -1.5);
      box(g, 3, 0.3, 6, 0xe9e2cf, 0, top - 0.1, 9.6);                                                   // the walkway back to the quay
      sign(g, 'CATALINA', '#f6f2e8', '#1d2b5c', 8, 1.6, 0, top + 5.3, 3.1);
      for (const lx of [-8, 0, 8]) { const [wx, wz] = W(g, lx, 0); solids.push({ x: wx, z: wz, r: 7, y: L - WADE }); }
      for (let k = 0; k < 6; k++) { const [px, pz] = W(g, -10 + k * 4, 5.2); people.add(px, L + top + 0.07, pz, facing(i, sd) + 3.14); }
    }
  }

  // ---- the ferry wharf, and a green and cream ferry that goes round the bay and calls at it ----
  let FC = [204, -210], FR = [150, 130];
  {
    const i = nearestI(204, -10), sd = onQuay(i, 6);
    if (sd) {
      const [x, z] = P(i, sd * (QUAY + 19)), g = at(x, z, outward(i, sd), L), top = samples[i].p.y - L + PAVE;
      box(g, 4.5, 0.4, 38, 0x9aa3ad, 0, top - 0.15, 0);
      for (let d = -16; d <= 18; d += 8.5) for (const lx of [-2, 2]) add(g, new THREE.CylinderGeometry(0.2, 0.2, top + 3, 6), 0x6b7484, lx, (top - 3) / 2, d);
      box(g, 9, 0.5, 9, 0x9aa3ad, 0, top - 0.2, 20);
      for (const lx of [-3.6, 3.6]) box(g, 0.25, 3.2, 0.25, 0xf6f2e8, lx, top + 1.6, 18);
      box(g, 9, 0.35, 5, 0x2f6b4a, 0, top + 3.3, 18);
      sign(g, 'ROSE BAY', '#2f6b4a', '#ffffff', 5.5, 1.1, 0, top + 2.5, 15.6, Math.PI);
      for (const lx of [-2.25, 2.25]) { const a = W(g, lx, -19), b = W(g, lx, 24); walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y: L - WADE }); }
      for (let k = 0; k < 4; k++) { const [px, pz] = W(g, -2.5 + k * 1.6, 17.5); people.add(px, L + top + 0.07, pz, outward(i, sd)); }
      const [fx, fz] = W(g, 0, 33); FC = [fx, fz - FR[1]]; // the ferry comes alongside just off the end
    }
  }
  // Shark Island, out in the bay: sand, grass, a few trees and a little white pavilion. The ferry goes round it.
  const ISLE = [FC[0] - 8, FC[1] - 4];
  {
    const g = at(ISLE[0], ISLE[1], 0.3, L), top = (lx, lz) => 9 * Math.sqrt(Math.max(0, 1 - (lx / 40) ** 2 - (lz / 26) ** 2)) - 1.6;
    add(g, new THREE.IcosahedronGeometry(1, 1), 0xe6d39a, 0, -1.2, 0).scale.set(50, 4, 34);
    add(g, new THREE.IcosahedronGeometry(1, 1), 0x6aa85e, 0, -1.6, 0).scale.set(40, 9, 26);
    for (let k = 0; k < 11; k++) { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * 0.75, lx = Math.cos(a) * d * 40, lz = Math.sin(a) * d * 26; if (Math.hypot(lx, lz) < 7) continue; const [x, z] = W(g, lx, lz); tree(k % 3 === 0, x, z, 0.7 + rnd() * 0.4, false, L + top(lx, lz) + 0.1); }
    for (const [lx, lz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) box(g, 0.25, 3, 0.25, 0xf6f2e8, lx, top(0, 0) + 1.3, lz);
    add(g, new THREE.ConeGeometry(3.8, 1.8, 6), 0xf6f2e8, 0, top(0, 0) + 3.7, 0);
  }
  const ferry = model((g) => {
    add(g, taperBox(7.6, 2.4, 30, [0.5, 1, 0.3], [0.5, 1, 0.3]), 0x1f6b4a, 0, 0.6, 0);
    box(g, 6.6, 2.6, 22, 0xf1e6c4, 0, 3.0, 0); box(g, 6.7, 0.9, 20, 0x26303f, 0, 3.3, 0);
    box(g, 5.6, 2.2, 14, 0xf1e6c4, 0, 5.4, 0); box(g, 5.7, 0.8, 12.6, 0x26303f, 0, 5.6, 0);
    for (const lz of [-8.5, 8.5]) box(g, 3, 1.6, 3, 0xf1e6c4, 0, 7.3, lz);
    box(g, 1.6, 2.2, 2.4, 0xe6b83a, 0, 7.6, 0);
  });
  ferry.userData.dyn = true; worldGroup.add(ferry);

  // ---- the seaplanes: a pontoon and terminal by the chicane, two planes moored, one out flying ----
  const planeModel = (stripe) => model((g) => {
    add(g, taperBox(1.5, 1.6, 8.4, [0.5, 0.75, 0.15], [0.42, 0.6, 0.3]), 0xf6f2e8, 0, 0, 0);
    box(g, 1.54, 0.3, 6.4, stripe, 0, 0.05, 0.2);
    box(g, 13.4, 0.2, 1.9, 0xf6f2e8, 0, 1.0, 0.7); box(g, 13.5, 0.22, 0.5, stripe, 0, 1.0, 1.5);                // the high wing
    box(g, 4.4, 0.14, 1.2, 0xf6f2e8, 0, 0.75, -3.8); box(g, 0.16, 1.8, 1.5, stripe, 0, 1.5, -3.7);              // tail
    for (const lx of [-1.9, 1.9]) {
      add(g, taperBox(0.85, 0.75, 6.8, [0.35, 0.8, 0.2], [0.6, 0.9, 0.1]), 0xd9dde3, lx, -1.75, 0.4);           // the floats
      for (const lz of [-1.2, 1.6]) box(g, 0.1, 1.5, 0.1, 0x8d93a0, lx * 0.8, -0.9, lz);
      box(g, 0.1, 1.6, 0.1, 0x8d93a0, lx * 1.6, 0.25, 0.8).rotation.z = lx > 0 ? 0.7 : -0.7;                     // wing struts
    }
    box(g, 0.5, 0.5, 0.5, 0x26303f, 0, 0, 4.3);
  });
  {
    const i = nearestI(-99, -13.5), sd = onQuay(i, 5);
    if (sd) {
      const [x, z] = P(i, sd * (QUAY + 7)), g = at(x, z, outward(i, sd), L), top = samples[i].p.y - L + PAVE;
      box(g, 26, 0.5, 9, 0x9aa3ad, 0, 0.75, 0); box(g, 3, 0.3, 5.4, 0x9aa3ad, 0, (top + 1) / 2, -5.6).rotation.x = Math.atan2(top - 1, 5);
      box(g, 8, 3.2, 4.4, 0xf6f2e8, -7, 2.6, 0); box(g, 8.6, 0.35, 5, 0x1d6fb5, -7, 4.35, 0);
      sign(g, 'SYDNEY SEAPLANES', '#1d6fb5', '#ffffff', 7.2, 1.1, -7, 3.3, -2.26, Math.PI);
      for (const [lx, c] of [[3, 0xe6453a], [10.5, 0x1d6fb5]]) { const pl = planeModel(c); pl.position.set(lx, 2.4, 9.5); pl.rotation.y = 0.25; g.add(pl); }
      for (const lx of [-9, 0, 9]) { const [wx, wz] = W(g, lx, 0); solids.push({ x: wx, z: wz, r: 5.5, y: L - WADE }); }
      for (const lx of [3, 10.5]) { const [wx, wz] = W(g, lx, 9.5); solids.push({ x: wx, z: wz, r: 4.5, y: L - WADE }); }
      for (let k = 0; k < 4; k++) { const [px, pz] = W(g, -1 + k * 1.3, -1.5); people.add(px, L + 1.0, pz, rnd() * 6.28); }
    }
  }
  const flyer = planeModel(0xffd23f); flyer.userData.dyn = true; worldGroup.add(flyer);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 0.06), lam(0x26303f)); prop.position.set(0, 0, 4.6); prop.userData.dyn = true; flyer.add(prop);
  flyer.rotation.order = 'YXZ'; // heading, then nose up or down, then bank
  const PC = [-150, -250], PR = [300, 140]; // the seaplane's circuit: it lands and takes off along the near side

  // ---- sailing boats and the odd motor boat going round out in the bay, clear of the ferry and the seaplane ----
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, -1.2, 0, 0.9, 1.5, 0, 5.2, -1.0], 3)); sailGeo.computeVertexNormals();
  const boats = [];
  const busy = (x, z) => (z > -165 && x < PC[0] + 215) || Math.abs(Math.hypot((x - FC[0]) / FR[0], (z - FC[1]) / FR[1]) - 1) < 0.24 || Math.hypot(x - ISLE[0], z - ISLE[1]) < 64;
  for (let t = 0; t < 900 && boats.length < 9; t++) {
    const cx = lim.x + (rnd() - 0.5) * lim.r * 2.4, cz = -130 - rnd() * 300, r = 14 + rnd() * 24;
    let clear = !busy(cx, cz);
    for (let k = 0; k < 8 && clear; k++) { const x = cx + Math.cos(k * 0.785) * r, z = cz + Math.sin(k * 0.785) * r; clear = terrainHeight(x, z) < L - 2.5 && !busy(x, z); }
    if (!clear || boats.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < o.r + r + 12)) continue;
    const b = new THREE.Group(), motor = boats.length % 4 === 3;
    if (motor) { add(b, taperBox(2.2, 0.9, 6, [0.2, 1, 0.25], [0.95, 1, 0]), 0xf6f2e8, 0, 0.3, 0); box(b, 1.7, 0.9, 2, 0x3d8bff, 0, 1.1, -0.6); }
    else {
      add(b, taperBox(1.7, 0.8, 4.4, [0.25, 1, 0], [0.75, 1, 0]), [0xf6f2e8, 0x3d8bff, 0xe6453a][boats.length % 3], 0, 0.2, 0); box(b, 0.14, 5.4, 0.14, 0x7a4a2a, 0, 2.9, -1.1);
      b.add(new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: [0xf6f2e8, 0xffd23f, 0xff8fb0][boats.length % 3], side: THREE.DoubleSide, flatShading: true })));
    }
    b.userData.dyn = true; mergeStatic(b); worldGroup.add(b);
    boats.push({ b, cx, cz, r, sp: (motor ? 0.2 : 0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28 });
  }

  // ---- shops down New South Head Road: both sides of the long run after the hairpins, and the hill down to the tunnel ----
  // Every shop has a real name, in plain lettering: these four, over and over. (There were a dozen made-up ones as
  // well until 3.67, Bay Gelato and Harbour Books and so on: the owner had them taken out, here as at Westfield.)
  const SHOPS = [["Chargrill Charlie's", '#e6453a', '#fff6dc'], ['Sonoma', '#f1e9d6', '#3b2a1e'], ['Sushi Train', '#1d2230', '#ff8a3d'], ['Woolworths Metro', '#2f9e44', '#ffffff']];
  const named = []; // where each shop stands and which name it has, so the next one can be different from those near it
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 1024;
  const ax = atlas.getContext('2d'); ax.textAlign = 'center'; ax.textBaseline = 'middle';
  SHOPS.forEach(([name, bg, ink], k) => {
    const x = (k % 2) * 512, y = Math.floor(k / 2) * 128;
    ax.fillStyle = bg; ax.fillRect(x, y, 512, 128); ax.fillStyle = ink;
    let size = 76; do { ax.font = `900 ${size}px "Segoe UI", Arial, sans-serif`; size -= 4; } while (ax.measureText(name).width > 470 && size > 20);
    ax.fillText(name, x + 256, y + 68);
  });
  const sp = [], suv = [], WALLS = [0xf1e9d6, 0xe8d9b5, 0xd9c6a5, 0xcfd6dc, 0xf6f2e8, 0xc9a98a, 0xb5543c, 0xe2cc95], AWN = [0xe6453a, 0x1d6fb5, 0x2f6b4a, 0xffd23f, 0x26303f, 0xff8a3d];
  let shopN = 0;
  const footpath = C(0xb9bdc5), FRONT = hw + 8.8;
  const shopRow = (i0, i1, sd) => {
    for (let i = i0; i < i1;) {
      const w = 9 + rnd() * 5, span = Math.round(w / 1.5), c = i + (span >> 1), s = samples[wrap(c)];
      let D = 9;
      const fits = (d) => { const [x, z] = P(c, sd * (FRONT + d / 2)), [bx, bz] = P(c, sd * (FRONT + d)); return roadGap(track, bx, bz) > hw + 5 && isFree(track, x, z, Math.max(w, d) / 2 - 0.5, hw + 5); };
      if (inTunnel(i + span, 6)) { i += 2; continue; }
      if (!fits(D)) { D = 6; if (!fits(D)) { i += 3; continue; } }
      const [x, z] = P(c, sd * (FRONT + D / 2)), g = at(x, z, facing(c, sd), s.p.y), k = shopN++;
      box(g, w - 0.5, 11.2, D, WALLS[Math.floor(rnd() * WALLS.length)], 0, 1.6, 0);                           // (sunk 4 m, for the hill it stands on)
      box(g, w - 0.3, 0.5, D + 0.3, 0x8f949e, 0, 7.45, 0);
      box(g, w - 1.2, 0.22, 1.9, AWN[k % AWN.length], 0, 3.15, D / 2 + 0.95).rotation.x = 0.1;
      box(g, w - 2, 2.5, 0.1, 0x23303f, 0, 1.45, D / 2 + 0.03);
      const nw = Math.max(2, Math.floor((w - 2) / 2.6));
      for (let j = 0; j < nw; j++) box(g, 1.3, 1.2, 0.1, 0x3b556e, (j - (nw - 1) / 2) * 2.6, 6.2, D / 2 + 0.03);
      // its sign, between the awning and the upstairs windows (all the signs are one mesh)
      // (which name: the one least like its neighbours'. Next door counts most, then the shops across the road)
      let cell = 0, least = Infinity;
      for (let j = 0; j < SHOPS.length; j++) { const c = (k + j) % SHOPS.length; let near = 0; for (const q of named) { const d = Math.hypot(q.x - x, q.z - z); if (q.c === c && d < 46) near += 1 / Math.max(d, 1); } if (near < least - 1e-9) { least = near; cell = c; } }
      named.push({ x, z, c: cell });
      const sw = Math.min(w - 1.6, 6.4), sh = sw / 4, u0 = (cell % 2) * 0.5, v1 = 1 - Math.floor(cell / 2) / 8, v0 = v1 - 1 / 8;
      g.updateMatrixWorld();
      const q = [[-sw / 2, 3.6], [sw / 2, 3.6], [sw / 2, 3.6 + sh], [-sw / 2, 3.6 + sh]].map(([lx, ly]) => V(lx, ly, D / 2 + 0.1).applyMatrix4(g.matrixWorld)), t = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v1], [u0, v1]];
      for (const j of [0, 1, 2, 0, 2, 3]) { sp.push(q[j].x, q[j].y, q[j].z); suv.push(...t[j]); }
      const corners = [[-w / 2, D / 2], [w / 2, D / 2], [w / 2, -D / 2], [-w / 2, -D / 2]].map(([lx, lz]) => W(g, lx, lz));
      for (let j = 0; j < 4; j++) { const a = corners[(j + 3) % 4], b = corners[j]; walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], y: s.p.y }); } // solid all round
      claim(x, z, Math.max(w, D) / 2 + 0.5);
      if (rnd() < 0.75) { const [px, pz] = P(c + (rnd() - 0.5) * span, sd * (FRONT - 0.6 - rnd() * 1.6)); people.add(px, s.p.y + PAVE + 0.02, pz, facing(c, sd) + (rnd() - 0.5) * 1.2); } // by the shopfronts, under the awnings
      i += span;
    }
    for (let i = i0; i < i1; i++) pave(i, sd, FRONT, footpath);
  };
  const s0 = nearestI(40, 164), s1 = nearestI(-186, 163), s2 = nearestI(-215, 130), s3 = nearestI(-215, 60);
  for (const sd of [1, -1]) shopRow(s0, s1, sd);
  shopRow(s2, s3, -1);
  // the outside of the hill down is left open: a lookout over the harbour, with benches
  for (let i = s2; i < s3; i++) {
    const s = samples[wrap(i)];
    pave(i, 1, FRONT, footpath);
    if (i % 9 === 4) {
      const [x, z] = P(i, FRONT - 0.9), g = at(x, z, outward(i, 1) - 0.5, s.p.y + PAVE); // looking out, and round towards the city
      box(g, 1.9, 0.12, 0.5, 0x8a5a2b, 0, 0.45, 0); box(g, 1.9, 0.5, 0.1, 0x8a5a2b, 0, 0.75, -0.25); for (const lx of [-0.8, 0.8]) box(g, 0.1, 0.45, 0.45, 0x4a4f5a, lx, 0.22, 0);
      solids.push({ x, z, r: 1, y: s.p.y });
      if (rnd() < 0.7) { const [px, pz] = W(g, (rnd() - 0.5) * 1.2, 0.9); people.add(px, s.p.y + PAVE + 0.02, pz, outward(i, 1) - 0.5); }
    }
  }
  { const i = wrap(s2 + 6), s = samples[i], [x, z] = P(i, FRONT + 0.4), g = at(x, z, facing(i, 1), s.p.y + PAVE); for (const lx of [-2.6, 2.6]) box(g, 0.16, 2.6, 0.16, 0x4a4f5a, lx, 1.3, 0); sign(g, 'HARBOUR LOOKOUT', '#2f6b4a', '#ffffff', 5.6, 1.1, 0, 2.3, 0.02); }
  if (sp.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    worldGroup.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: cleanTexture(atlas), color: 0xe6e6e6 })));
  }

  // ---- A stone wall along the top of the bank behind the shops, from the second hairpin on past the next gate.
  // The road above runs back along it: without the wall you could come out of the first hairpin, drop down
  // the bank and join the shops' street, leaving out the straight and the second hairpin altogether. ----
  {
    const w0 = nearestI(53.5, 164.3), w1 = nearestI(-125, 160), LAT = FRONT + 9.8, TOP = 5.9, STONE = C(0xcdb88a), COPING = C(0xb9a878); // (from where the hairpin's two legs part)
    // a banner's place on the wall (the three samples from i): is it free of anything big standing in front, like a marshal's stand?
    const bayClear = (i) => { const [ax, az] = P(i, LAT + 1.6), [bx, bz] = P(i + 3, LAT + 1.6), mx = (ax + bx) / 2, mz = (az + bz) / 2, y = samples[wrap(i + 1)].p.y + TOP - 1; return !solids.some((c) => c.r >= 1.2 && Math.abs(c.y - y) < 3 && Math.hypot(c.x - mx, c.z - mz) < c.r + 2.6); };
    for (let i = w0; i < w1; i++) {
      ribbon(i, 1, LAT, LAT + 0.02, -1.5, TOP, STONE); ribbon(i, 1, LAT + 0.7, LAT + 0.72, -1.5, TOP, STONE); ribbon(i, 1, LAT, LAT + 0.7, TOP, TOP, COPING);
      if (samples[wrap(i)].p.x > -20 && Math.floor((i - w0) / 3) % 24 >= 3 && Math.floor((i - w0) / 3) % 24 < 9 && bayClear(i - ((i - w0) % 3))) { // beside the road above: a sponsor's banner on the top of it, 4.5 m in every 13.5
        const a = samples[wrap(i)], b = samples[wrap(i + 1)], [ax, az] = P(i, LAT + 0.82), [bx, bz] = P(i + 1, LAT + 0.82), [tx, tz] = P(i, LAT + 12), f = ((i - w0) % 3) / 3;
        addBanner(Math.floor((i - w0) / 72), { x: ax, y: a.p.y, z: az }, { x: bx, y: b.p.y, z: bz }, TOP - 1.0, TOP - 0.16, f, f + 1 / 3, tx, tz);
      }
      if ((i - w0) % 3 === 0) { // solid from either level
        const y = samples[wrap(i)].p.y, [ax, az] = P(i, LAT + 0.35), [bx, bz] = P(Math.min(i + 3, w1), LAT + 0.35);
        for (const dy of [1.2, 5.6]) walls.push({ ax, az, bx, bz, y: y + dy });
      }
    }
    { // and on to the middle of the hairpin, so there's no way down the bank beside it
      const a = samples[wrap(w0)], y0 = a.p.y - 1.5, y1 = a.p.y + TOP, [ax, az] = P(w0, LAT), [bx, bz] = P(w0, LAT + 0.7), ex = ax + 8.6;
      for (const z of [az, bz]) pushQuad(quads.pos, quads.col, V(ax, y0, z), V(ex, y0, z), V(ex, y1, z), V(ax, y1, z), STONE);
      pushQuad(quads.pos, quads.col, V(ax, y1, az), V(ex, y1, az), V(ex, y1, bz), V(ax, y1, bz), COPING);
      pushQuad(quads.pos, quads.col, V(ex, y0, az), V(ex, y0, bz), V(ex, y1, bz), V(ex, y1, az), STONE);
      for (const dy of [1.2, 5.6]) walls.push({ ax, az: (az + bz) / 2, bx: ex, bz: (az + bz) / 2, y: a.p.y + dy });
    }
    { const a = samples[wrap(w1)], [ax, az] = P(w1, LAT), [bx, bz] = P(w1, LAT + 0.7); pushQuad(quads.pos, quads.col, V(ax, a.p.y - 1.5, az), V(bx, a.p.y - 1.5, bz), V(bx, a.p.y + TOP, bz), V(ax, a.p.y + TOP, az), STONE); }
    for (let i = w0; i < w1; i += 4) { const [x, z] = P(i, LAT + 0.35); claim(x, z, 3.2); }
  }

  // ---- Heartbreak Hill (the City2Surf's): a banner over the climb ----
  {
    const i = nearestI(251, 82), s = samples[i], g = at(s.p.x, s.p.z, along(i), s.p.y), half = hw + 4.7;
    for (const lx of [-half, half]) box(g, 0.5, 8, 0.5, 0x1d2b5c, lx, 4, 0);
    box(g, 2 * half + 0.5, 1.9, 0.3, 0x1d2b5c, 0, 7.2, 0);
    sign(g, 'HEARTBREAK HILL', '#1d6fb5', '#ffffff', 2 * half - 1, 1.6, 0, 7.2, -0.17, Math.PI); sign(g, 'HEARTBREAK HILL', '#1d6fb5', '#ffffff', 2 * half - 1, 1.6, 0, 7.2, 0.17);
    for (const lx of [-half, half]) { const [x, z] = W(g, lx, 0); claim(x, z, 1.5); solids.push({ x, z, r: 0.5, y: s.p.y }); }
  }

  // ---- Race barriers, the kind Westfield has: a block with a wire catch fence on top and the crowd behind it.
  // Here the block is the bay's sandstone, like the harbour wall, whose line it carries on. The owner asked for
  // more of them at Rose Bay, so they line the straights that had nothing beside them: the land side of the
  // start straight (run in to the pit wall at each end, which carries the fence past the garages), the outside
  // of Heartbreak Hill, both sides of the straight along the top and of the shops' street, and the shops' side
  // of the hill down, run in to the tunnel's wall, and on from the tunnel's far end round the chicane to the start
  // straight's. Corners keep their rails, and a barrier that comes to one is
  // run in to meet its end. The water and the lookout keep their view. Behind the
  // barriers on the grass the crowd stands on two stone steps, to see over the block (and be seen over it). ----
  {
    const STONE = C(0xcdb88a), COPE = C(0xb9a878), STEEL = C(0x8d93a0), TREAD = C(0xd9d2c0), RISER = C(0xbfb394);
    const TH = 0.5, FACE = hw + 2.7 - TH / 2, TOP = 1.0, RUN = 6, rndC = mulberry32(6102); // (its middle is on the harbour wall's line, hw + 2.7)
    const fans = makePeople(1100, rndC); // the crowd behind them: a set of its own with its own random numbers, so the rest of the bay stays where it was
    const pt = (i, sd, lat, h) => { const a = samples[wrap(i)]; return V(a.p.x + a.left.x * sd * lat, a.p.y + h, a.p.z + a.left.z * sd * lat); };
    const part = (i, f, sd, lat, h) => pt(i, sd, lat, h).lerp(pt(i + 1, sd, lat, h), f); // f of the way on from sample i to the next
    // a strip from sample i to sample i + m: one edge `a` metres out at height y0 (b at the far end), the other a1 out at y1 (b1 at the far end)
    const strip = (Q, i, m, sd, a, b, a1, b1, y0, y1, color) => pushQuad(Q.pos, Q.col, pt(i, sd, a, y0), pt(i + m, sd, b, y0), pt(i + m, sd, b1, y1), pt(i, sd, a1, y1), color);
    const post = (i, sd, lat, y0) => {
      const a = samples[wrap(i)], x = a.p.x + a.left.x * sd * lat, z = a.p.z + a.left.z * sd * lat, r = 0.05;
      const c = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([u, v]) => [x + a.th.x * u + a.left.x * v, z + a.th.z * u + a.left.z * v]);
      for (let k = 0; k < 4; k++) { const [ax, az] = c[k], [bx, bz] = c[(k + 1) % 4]; pushQuad(wires.pos, wires.col, V(ax, a.p.y + y0, az), V(bx, a.p.y + y0, bz), V(bx, a.p.y + 3.56, bz), V(ax, a.p.y + 3.56, az), STEEL); }
    };
    // The land side from the tunnel's far end to the chicane gets a barrier of its own, below. What the trackside
    // builder left there, a rail three posts long and one post standing by itself, comes away first: they'd be
    // behind it, 2.5 m back, guarding nothing.
    const CH = 992; // where the chicane comes out onto the start straight, and the barrier along its land side begins
    for (const r of track.rails || []) if (r.outside === -1 && r.i > t1 && r.i < CH) { worldGroup.remove(...r.bits); if (r.wall) walls.splice(walls.indexOf(r.wall), 1); }
    // What already stands behind where a barrier goes, sample by sample and side by side (braking boards, light
    // poles, marshals' stands, the spectators' own fences, grandstands): the crowd's steps keep clear of it all.
    const taken = { 1: new Uint8Array(N), [-1]: new Uint8Array(N) }, stood = { 1: new Uint8Array(N), [-1]: new Uint8Array(N) }; // (stood: just the things with a foot on the ground there, which people on a footpath step round)
    const mark = (map, x, z, r, y, far) => {
      const i = nearestI(x, z), a = samples[i], lat = (x - a.p.x) * a.left.x + (z - a.p.z) * a.left.z, d = Math.abs(lat) - hw, n = Math.ceil(r / 1.5) + 1;
      if (Math.abs(y - a.p.y) < 4 && d + r > 3.3 && d - r < far) for (let k = -n; k <= n; k++) map[lat > 0 ? 1 : -1][wrap(i + k)] = 1;
    };
    for (const c of solids) { mark(taken, c.x, c.z, c.r, c.y ?? 0, 7.4); mark(stood, c.x, c.z, c.r, c.y ?? 0, 7.4); }
    for (const w of walls) { const n = Math.max(1, Math.ceil(Math.hypot(w.bx - w.ax, w.bz - w.az) / 1.5)); for (let k = 0; k <= n; k++) mark(taken, w.ax + ((w.bx - w.ax) * k) / n, w.az + ((w.bz - w.az) * k) / n, 0.3, w.y ?? 0, 9.2); }
    // Where the corners' rails begin and end (the rails are the trackside builder's, 5.2 m out on the outside of
    // each corner): a barrier that comes to one is run in to meet its end, so there's no way between the two.
    // (They used to pass side by side for a few metres, 2 m apart: "gap between fence and barrier here", and the
    // owner's car was through it.)
    const RAIL = hw + 5.2, railEnds = [];
    for (const w of walls) for (const [x, z] of [[w.ax, w.az], [w.bx, w.bz]]) {
      const i = nearestI(x, z), a = samples[i], lat = (x - a.p.x) * a.left.x + (z - a.p.z) * a.left.z;
      if (Math.abs(Math.abs(lat) - RAIL) < 0.3 && Math.abs((w.y ?? 0) - a.p.y) < 2) railEnds.push([i, lat > 0 ? 1 : -1]);
    }
    const railAt = (i, sd, first) => { // the sample where a rail on side sd begins (first) or ends, within 15 m of sample i: or null
      const near = railEnds.filter(([k, d]) => d === sd && Math.abs(k - wrap(i)) <= 10).map(([k]) => k);
      return near.length ? (first ? Math.min(...near) : Math.max(...near)) : null;
    };
    let nb = 0;
    // A barrier from sample i0 to i1 on side sd, in bays of three samples (4.5 m): a post at each end of a bay.
    // from/to: how far out its face is at each end, where it runs in to meet something (the pit wall, the tunnel)
    // over its first or last RUN samples. block: false is the fence alone, standing on a wall that's already
    // there (its top `foot` above the road). crowd: 'steps' on grass, 'path' where there's a footpath behind
    // (out to `deep`), or none.
    const barrier = (i0, i1, sd, { from, to, lat = FACE, block = true, foot = TOP, crowd = 'steps', deep = 0, ads = true } = {}) => {
      const n = i1 - i0, o = (j) => (from != null && j < RUN ? from + ((lat - from) * j) / RUN : to != null && j > n - RUN ? to + ((lat - to) * (n - j)) / RUN : lat), mid = TH / 2;
      for (let j = 0; j < n; j += 3) {
        const i = i0 + j, m = Math.min(3, n - j), a = o(j), b = o(j + m);
        if (block) {
          strip(quads, i, m, sd, a, b, a, b, -0.6, TOP, STONE); strip(quads, i, m, sd, a + TH, b + TH, a + TH, b + TH, -0.6, TOP, STONE);                                  // its two faces
          strip(quads, i, m, sd, a - 0.07, b - 0.07, a - 0.07, b - 0.07, TOP - 0.12, TOP, COPE); strip(quads, i, m, sd, a + TH + 0.07, b + TH + 0.07, a + TH + 0.07, b + TH + 0.07, TOP - 0.12, TOP, COPE); // the coping's edges
          strip(quads, i, m, sd, a - 0.07, b - 0.07, a + TH + 0.07, b + TH + 0.07, TOP, TOP, COPE);                                                                          // and its top
          const p = pt(i, sd, a + mid, 0), q = pt(i + m, sd, b + mid, 0); walls.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: (p.y + q.y) / 2 });
        }
        for (const h of [1.5, 2.0, 2.5, 3.0]) strip(wires, i, m, sd, a + mid, b + mid, a + mid, b + mid, h, h + 0.04, STEEL); // the catch fence: four wires
        strip(wires, i, m, sd, a + mid, b + mid, a + mid, b + mid, 3.46, 3.54, STEEL);                                            // and a rail along the top
        post(i, sd, a + mid, foot);
      }
      post(i1, sd, o(n) + mid, foot);
      if (!block) return;
      for (const j of [0, n]) { const q = pt(i0 + j, sd, o(j) + mid, 0); box(worldGroup, 0.66, 1.9, 0.66, 0xcdb88a, q.x, q.y + 0.35, q.z); } // a pier at each end, like the harbour wall's
      // a sponsor's banner every 80 m or so, on the road side (not where it runs in at an end, nor behind a gate's post).
      // (It was every 40 m: with the signs "way too intrusive", half of them went.)
      // a sponsor's stretch every 80 m: 22 m of the barrier in its colours with its name on it three times (twice,
      // on 15 m, until the owner asked for "groups of 3 not 2"; and until 3.68, one banner 4.5 m long). PAINT: for
      // each of the stretch's samples, which third of the name it carries, or -1 for plain paint
      // (4.7: "long rows": the name up to six times, 44 m, and three only where the barrier is too short for more)
      const PAINT = Array.from({ length: Math.max(3, Math.min(6, Math.floor((n - 20) / 5))) }).flatMap(() => [-1, 0, 1, 2, -1]);
      // (4.11: every 160 m on a side, not every 80, and the two sides of the road out of step by 80 m, counted round
      // the lap: "don't have so many sponsors close together")
      let j0 = 12; while ((((i0 + j0) % 108) + 108) % 108 !== (sd > 0 ? 0 : 54)) j0++;
      for (let j = j0; ads && j + PAINT.length <= n - 8; j += 108) {
        if (track.cps.some((c) => Math.abs(((i0 + j + PAINT.length / 2 - c) % N + N + N / 2) % N - N / 2) < 9)) continue;
        PAINT.forEach((third, k) => { const i = i0 + j + k, a = samples[wrap(i)]; addBanner(nb, pt(i, sd, lat - 0.1, 0), pt(i + 1, sd, lat - 0.1, 0), 0.1, 0.86, Math.max(third, 0) / 3, (Math.max(third, 0) + 1) / 3, a.p.x, a.p.z, false, third < 0); });
        nb++;
      }
      if (crowd === 'path') { // people along the footpath behind it
        for (let j = RUN; j < n - RUN; j++) if (rndC() < 0.45 && !stood[sd][wrap(i0 + j)]) { const q = part(i0 + j, rndC(), sd, lat + TH + 0.7 + rndC() * (deep - lat - TH - 0.7), PAVE + 0.02); fans.add(q.x, q.y, q.z, facing(i0 + j, sd) + (rndC() - 0.5) * 0.9); }
        return;
      }
      if (crowd !== 'steps') return;
      // the crowd's steps, wherever there's room for a length of them: two, each 1.4 m deep and half a metre up
      // (not round the inside of a tight bend, where the back of them would bunch up and the crowd stand on each other:
      // nowhere the back of the steps is under two thirds as long as the road beside it)
      const S0 = lat + TH + 0.9, D = 1.4, bunched = (j) => pt(i0 + j, sd, S0 + 2 * D, 0).distanceTo(pt(i0 + j + 1, sd, S0 + 2 * D, 0)) < 0.67 * pt(i0 + j, sd, 0, 0).distanceTo(pt(i0 + j + 1, sd, 0, 0));
      const room = (j) => j >= RUN && j <= n - RUN && !taken[sd][wrap(i0 + j)] && !bunched(j);
      for (let j = 0; j < n;) {
        if (!room(j)) { j++; continue; }
        let e = j; while (e - j < 24 && room(e + 1)) e++;
        if (e - j >= 6) {
          const a = i0 + j, b = i0 + e;
          for (let i = a; i < b; i += 3) {
            const m = Math.min(3, b - i);
            for (const k of [0, 1]) { const l = S0 + k * D, h = 0.5 * (k + 1); strip(quads, i, m, sd, l, l, l, l, k ? h - 0.5 : -0.7, h, RISER); strip(quads, i, m, sd, l, l, l + D, l + D, h, h, TREAD); }
            strip(quads, i, m, sd, S0 + 2 * D, S0 + 2 * D, S0 + 2 * D, S0 + 2 * D, -0.7, 1.0, RISER);                                              // the back
          }
          for (let i = a; i < b; i++) for (const k of [0, 1]) for (const chance of [0.9, 0.35]) if (rndC() < chance) { const q = part(i, rndC(), sd, S0 + k * D + 0.35 + rndC() * 0.7, 0.5 * (k + 1)); fans.add(q.x, q.y, q.z, facing(i, sd) + (rndC() - 0.5) * 0.5); }
          for (const i of [a, b]) { // the two ends, and all of it solid from behind
            pushQuad(quads.pos, quads.col, pt(i, sd, S0, -0.7), pt(i, sd, S0 + D, -0.7), pt(i, sd, S0 + D, 0.5), pt(i, sd, S0, 0.5), RISER);
            pushQuad(quads.pos, quads.col, pt(i, sd, S0 + D, -0.7), pt(i, sd, S0 + 2 * D, -0.7), pt(i, sd, S0 + 2 * D, 1.0), pt(i, sd, S0 + D, 1.0), RISER);
            const p = pt(i, sd, S0, 0), q = pt(i, sd, S0 + 2 * D, 0); walls.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: p.y });
          }
          for (let i = a; i < b; i += 3) { const p = pt(i, sd, S0 + 2 * D, 0), q = pt(Math.min(i + 3, b), sd, S0 + 2 * D, 0); walls.push({ ax: p.x, az: p.z, bx: q.x, bz: q.z, y: (p.y + q.y) / 2 }); }
        }
        j = e + 5; // (a gap before the next length)
      }
    };
    // a barrier from about a to about b that meets a rail at either end, if there's one there
    const run = (a, b, sd, o = {}) => {
      const ra = railAt(a, sd, false), rb = railAt(b, sd, true);
      barrier(ra ?? a, rb ?? b, sd, { ...o, ...(ra != null ? { from: RAIL - TH / 2 } : {}), ...(rb != null ? { to: RAIL - TH / 2 } : {}) });
    };
    // the start straight's land side: out of the chicane, in to the pit wall, the fence along the top of that, and on to the first corner
    const pit = track.pitWall && track.pitWall.side === -1 ? track.pitWall : null, T1 = N + 113;
    if (pit) {
      const pi = pit.i < N / 2 ? pit.i + N : pit.i, half = Math.floor(pit.half / 1.5), PL = pit.lat - TH / 2;
      barrier(CH, pi - half, -1, { to: PL });
      barrier(pi - half, pi + half, -1, { lat: PL, block: false, foot: pit.top - samples[wrap(pi)].p.y });
      barrier(pi + half, T1, -1, { from: PL });
    } else barrier(CH, T1, -1);
    run(153, 288, 1);                                       // up Heartbreak Hill, from the end of the harbour wall to the rail round the corner at the top
    // along the top, both sides whole. (The outside was in three lengths, with two ways through 12 m wide for Race
    // to 9LAT2 to leave the road by. That mode is gone, and the owner took them for holes: "please fix these two big ones".)
    barrier(322, 476, -1);
    run(309, 487, 1); // (from that corner's rail, and on to the first hairpin's)
    // the shops' street, both footpaths, and the shops' side of the hill down, in to the tunnel's wall
    run(609, 768, -1, { crowd: 'path', deep: FRONT - 2.6 }); run(622, 771, 1, { crowd: 'path', deep: FRONT - 2.6 }); // (from the second hairpin's rail; to the rail round the corner at the far end)
    barrier(806, t0, -1, { to: TUN - TH / 2 - 0.15, crowd: 'path', deep: hw + 6.4 }); // (15 cm in from the wall's own line, so its wires don't lie in the face of the portal's post)
    // and round the inside of the corner between those two, so the barrier is unbroken from the second hairpin to the
    // tunnel (the owner: "there should be a fence on the inside here"). No banner on it: round the inside of a bend
    // this tight one would come out squashed. No crowd: there's no footpath there.
    barrier(768, 806, -1, { crowd: null, ads: false });
    // And on the far side of the hotel: out of the tunnel's wall, round the chicane and up to the barrier that starts
    // there, on the land side, which had nothing but grass beside it. (The owner sent a picture of the fence on the
    // hill down: "put this wired fence in the other side" of the InterContinental.)
    barrier(t1, CH, -1, { from: TUN - TH / 2 - 0.15 });
    fans.finish();
  }

  // ---- the convent school at the top of the hill: sandstone, with a tower ----
  {
    const i = nearestI(262, 224), sd = [1, -1].reduce((a, b) => (roadGap(track, ...P(i, a * (hw + 44))) > roadGap(track, ...P(i, b * (hw + 44))) ? a : b));
    const [x, z] = P(i, sd * (hw + 44));
    if (isFree(track, x, z, 26, hw + 14)) {
      const g = at(x, z, facing(i, sd)), SAND = 0xdcc594, SLATE = 0x4a4f5a;
      box(g, 50, 16, 13, SAND, 0, 5, 0); box(g, 51, 1, 14, SLATE, 0, 13.4, 0);
      for (const lx of [-19, 19]) { box(g, 12, 18, 24, SAND, lx, 6, 4); box(g, 13, 1, 25, SLATE, lx, 15.4, 4); }
      box(g, 8, 30, 8, SAND, 0, 12, 5); add(g, new THREE.ConeGeometry(6, 10, 4), SLATE, 0, 32, 5).rotation.y = Math.PI / 4;
      for (const y of [3.5, 8.5]) box(g, 24, 1.8, 0.2, 0x3b4250, 0, y, 6.6);
      for (const lx of [-19, 0, 19]) { const [wx, wz] = W(g, lx, 3); solids.push({ x: wx, z: wz, r: 11, y: g.position.y }); }
      claim(x, z, 30);
    }
  }

  // (nothing tall goes in the view from the hill down: out over the water to the bridge and the city)
  const inView = (x, z) => x < -226 && z < 135 + 0.577 * (x + 215);

  // ---- big houses with pools up the hill ----
  for (let k = 0, n = 0; k < 700 && n < 20; k++) {
    const [x, z] = randIn(24), y = terrainHeight(x, z), gap = roadGap(track, x, z);
    if (y < 3.5 || gap > 85 || wetAt(x, z) || inView(x, z) || !isFree(track, x, z, 10, hw + 16)) continue;
    const g = at(x, z, Math.PI + (rnd() - 0.5) * 1.2, y), roof = n % 3 ? 0xb5543c : 0xd9dde3;   // facing the water, more or less
    box(g, 13, 10, 9, 0xf6f2e8, 0, 1, 0); box(g, 13.6, 0.4, 9.6, roof, 0, 6.2, 0);
    box(g, 9, 3, 8, 0xf1e9d6, -1.5, 7.9, 0); box(g, 9.6, 0.4, 8.6, roof, -1.5, 9.6, 0);
    box(g, 11, 1.3, 0.1, 0x3b556e, 0, 4, 4.55); box(g, 7, 1.2, 0.1, 0x3b556e, -1.5, 8, 4.05);
    box(g, 8.4, 4, 5.6, 0xe9dec4, 2, -1.5, 8.4); box(g, 6, 0.1, 3.4, 0x3fb7e0, 2, 0.52, 8.4);            // the terrace and its pool
    solids.push({ x, z, r: 7.5, y }); claim(x, z, 12); n++;
  }

  // ---- a golf course in the middle: greens with flags, and bunkers ----
  for (let k = 0, n = 0; k < 400 && n < 5; k++) {
    const x = -120 + rnd() * 320, z = 34 + rnd() * 96;
    if (!isFree(track, x, z, 13, hw + 22)) continue;
    const hx = (terrainHeight(x + 8, z) - terrainHeight(x - 8, z)) / 16, hz = (terrainHeight(x, z + 8) - terrainHeight(x, z - 8)) / 16;
    if (Math.hypot(hx, hz) > 0.12) continue;
    const g = at(x, z, 0, terrainHeight(x, z) + 0.25);
    g.quaternion.setFromUnitVectors(V(0, 1, 0), V(-hx, 1, -hz).normalize());                              // lying on the slope
    add(g, new THREE.CylinderGeometry(9, 9.6, 0.3, 16), 0x8fd46a, 0, -0.1, 0).castShadow = false;
    add(g, new THREE.CylinderGeometry(3.6, 3.9, 0.3, 9), 0xf1e2b3, 11.5, -0.1, 2).castShadow = false; add(g, new THREE.CylinderGeometry(2.6, 2.9, 0.3, 8), 0xf1e2b3, -3, -0.1, -11.5).castShadow = false;
    box(g, 0.08, 2.4, 0.08, 0xf6f2e8, 1.5, 1.2, 0.5); box(g, 0.8, 0.5, 0.04, 0xe6453a, 1.95, 2.15, 0.5);
    claim(x, z, 14); n++;
  }

  // ---- trees: all over the land (not on the quay), and beyond the edge of the map ----
  const nearWater = (x, z) => { for (let k = 0; k < 8; k++) if (wetAt(x + Math.cos(k * 0.785) * 12, z + Math.sin(k * 0.785) * 12)) return true; return false; };
  for (let k = 0; k < 2600 && nf < FIGS - 60; k++) {
    const [x, z] = randIn(8), sc = 0.8 + rnd() * 0.6;
    if (!nearWater(x, z) && !inView(x, z) && terrainHeight(x, z) > L + 0.9 && isFree(track, x, z, 2.4 * sc, hw + 9)) tree(rnd() < 0.25, x, z, sc);
  }
  for (let k = 0; k < 700; k++) {
    const a = rnd() * 6.2832, d = lim.r + 6 + rnd() * 110, x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
    if (!nearWater(x, z) && !inView(x, z) && terrainHeight(x, z) > L + 0.9) tree(rnd() < 0.3, x, z, 0.9 + rnd() * 0.7, false);
  }
  pines.count = np; figs.count = nf; worldGroup.add(pines, figs);

  const northShore = []; // the heads along the north shore: [x, z, height]
  // ---- across the water, to the north-west: the Harbour Bridge, the Opera House in front of its city end and the
  // city behind; the north shore runs on to the right. All of it is placed as seen from the hill down to the tunnel. ----
  {
    const far = at(0, 0, 0, L), GREEN = [0x5f9c58, 0x6aa85e, 0x548f50], TOWERS = [0x8fa3b8, 0x7a8ea3, 0xa9b7c9, 0x9aa7b5, 0x6f8196, 0xc2b49a, 0x5f7790, 0xb7c3cf], RAD = Math.PI / 180;
    const pol = (deg, d) => [-215 - d * Math.sin(deg * RAD), 120 - d * Math.cos(deg * RAD)]; // `deg` left of straight down the hill, d metres away
    const hill = (x, z, rx, ry, rz, c = GREEN[Math.floor(rnd() * 3)]) => { const m = add(far, new THREE.IcosahedronGeometry(1, 1), c, x, -ry * 0.3, z); m.scale.set(rx, ry, rz); m.castShadow = false; return m; };
    const block = (x, z, w, h, c, y0 = 0) => { box(far, w, h, w, c, x, y0 + h / 2, z).castShadow = false; }; // (houses)
    // the city
    for (const deg of [29, 37, 45, 53, 61, 70]) hill(...pol(deg, 960 + rnd() * 50), 125, 15 + rnd() * 8, 105);
    for (let k = 0; k < 32; k++) { const w = 22 + rnd() * 22, [x, z] = pol(32 + rnd() * 23, 850 + rnd() * 130); cityTower(far, x, z, w, 60 + rnd() * 150, TOWERS[k % TOWERS.length], 6); }
    { const [x, z] = pol(41, 905); add(far, new THREE.CylinderGeometry(3, 4, 230, 8), 0xb9bdc5, x, 121, z).castShadow = false; add(far, new THREE.CylinderGeometry(11, 11, 18, 12), 0xd9b44a, x, 228, z).castShadow = false; add(far, new THREE.CylinderGeometry(0.8, 1.4, 50, 6), 0xb9bdc5, x, 262, z).castShadow = false; } // Sydney Tower
    { const [x, z] = pol(38, 640); add(far, new THREE.CylinderGeometry(86, 94, 5, 12), 0xc9b48c, x, 0.5, z).castShadow = false; hill(...pol(39.5, 800), 70, 14, 60); } // Bennelong Point, under the Opera House
    // the north shore: green heads, a few towers by the bridge
    for (const deg of [13, 6, -2]) hill(...pol(deg, 900 + rnd() * 40), 120, 22 + rnd() * 10, 90);
    for (let k = 0; k < 11; k++) { const z = -830 - rnd() * 40, ry = 20 + rnd() * 16; hill(-190 + k * 125, z, 120, ry, 80); northShore.push([-190 + k * 125, z, ry]); } // (kept, for the houses that go on them further down)
    for (let k = 0; k < 9; k++) { const w = 18 + rnd() * 14, [x, z] = pol(4 + rnd() * 9, 880 + rnd() * 60); cityTower(far, x, z, w, 30 + rnd() * 70, TOWERS[k % TOWERS.length], 8); }
    // the head at the far end of the bay, with houses up it, and a hill behind the town
    { const hx = lim.x + lim.r + 150, hz = -150, rx = 120, rz = 150;
      hill(hx, hz, rx, 30, rz); hill(hx + rx * 0.4, hz + 90, rx * 0.8, 24, rz * 0.7);
      for (let k = 0; k < 14; k++) { const a = rnd() * 6.2832, d = Math.sqrt(rnd()) * 0.62; block(hx + Math.cos(a) * d * rx, hz + Math.sin(a) * d * rz, 9 + rnd() * 6, 7 + rnd() * 5, k % 3 ? 0xf6f2e8 : 0xe8d9b5, 30 * 0.7 * Math.sqrt(1 - d * d) - 3); } }
    hill(-590, 110, 120, 22, 120);
    const [bx, bz] = pol(25, 780), [ox, oz] = pol(38, 640);
    buildSydneyIcons(bx, bz, Math.cos(25 * RAD), -Math.sin(25 * RAD), L, ox, oz, 38 * RAD, 1.5);
  }

  // ---- the suburbs round the bay. The owner asked for buildings in the background, "like what we did with the
  // opera house but more": streets of houses and flats just beyond the circuit, hills further off with houses up
  // them and apartment towers along their tops (the eastern suburbs' skyline, Bondi Junction's the tallest), a
  // lighthouse on the far head, more of the city and a row of houses along the north shore. None of it can be
  // reached, so none of it is solid. It has its own run of random numbers, so nothing else on the map moved. ----
  {
    const rndB = mulberry32(2026), land = at(0, 0, 0, 0), RAD = Math.PI / 180, GREEN = [0x5f9c58, 0x6aa85e, 0x548f50, 0x62a05a];
    const WALLC = [0xf6f2e8, 0xe8d9b5, 0xf1e9d6, 0xd9c6a5, 0xf6f2e8, 0xe2cc95, 0xd9dde3, 0xc98a72], TOWERC = [0xe8dcc0, 0xd9dde3, 0xc9b99a, 0xb7c3cf, 0xf1e9d6, 0xa9b7c9, 0xc2b49a];
    const shape = suburbGeometry(), paint = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const houses = new THREE.InstancedMesh(shape.house, paint, 520), flats = new THREE.InstancedMesh(shape.flats, paint, 200), HM = new THREE.Matrix4(), HC = new THREE.Color();
    let nh = 0, nfl = 0;
    const dry = (x, z) => terrainHeight(x, z) > L + 1.3 && !nearWater(x, z);
    // one house, or one block of flats: at (x, y, z), turned to ry, a little bigger or smaller, in one of the wall colours
    const home = (big, x, y, z, ry) => {
      const mesh = big ? flats : houses, n = big ? nfl : nh;
      if (n >= (big ? 200 : 520)) return;
      const wide = 0.8 + rndB() * 0.5, tall = big ? 0.8 + rndB() * 0.8 : rndB() < 0.3 ? 1.75 : 1;
      HM.makeRotationY(ry); HM.scale(V(wide, tall, 0.8 + rndB() * 0.45)); HM.setPosition(x, y, z);
      mesh.setMatrixAt(n, HM); mesh.setColorAt(n, HC.set(WALLC[Math.floor(rndB() * WALLC.length)]));
      if (big) nfl++; else nh++;
    };
    // the streets just beyond the circuit: four of them round the land side, a house or a block of flats every 19 m or so
    for (let k = 0; k < 4; k++) {
      const d = lim.r + 38 + k * 42;
      for (let a = 0; a < 6.2832; a += 19 / d) {
        const x = lim.x + Math.cos(a) * d + (rndB() - 0.5) * 6, z = lim.z + Math.sin(a) * d + (rndB() - 0.5) * 6, big = rndB() < 0.16 + k * 0.06;
        if (rndB() < 0.2 || !dry(x, z) || inView(x, z) || !free(x, z, 8)) continue;
        home(big, x, terrainHeight(x, z) - 0.3, z, Math.atan2(lim.x - x, lim.z - z) + (rndB() < 0.25 ? Math.PI / 2 : 0));
      }
    }
    // the hills: each a green rise with houses and flats up it and towers along the top
    const rise = (x, z, rx, ry, rz, g = 0) => { const m = add(land, new THREE.IcosahedronGeometry(1, 1), GREEN[Math.floor(rndB() * GREEN.length)], x, g - ry * 0.3, z); m.scale.set(rx, ry, rz); m.castShadow = false; };
    const HILLS = [ // [degrees round from east (south is 90), metres out, rx, ry, rz, houses, flats, towers, tallest tower]
      [8, 610, 170, 34, 130, 26, 6, 2, 46], [43, 650, 190, 40, 150, 30, 8, 4, 62], [76, 610, 205, 44, 150, 30, 10, 5, 72],
      [107, 690, 215, 38, 165, 16, 10, 9, 128], [136, 630, 180, 36, 140, 22, 8, 6, 88], [160, 610, 170, 30, 125, 24, 8, 5, 92],
    ];
    for (const [deg, d, rx, ry, rz, nHouses, nFlats, nTowers, tallest] of HILLS) {
      const hx = lim.x + Math.cos(deg * RAD) * d, hz = lim.z + Math.sin(deg * RAD) * d;
      if (!dry(hx, hz)) continue;
      const g0 = terrainHeight(hx, hz), top = (u, v) => g0 - ry * 0.3 + ry * Math.sqrt(Math.max(0, 1 - u * u - v * v)) * 0.94; // the rise's height over a spot (a little under: its faces are flat)
      rise(hx, hz, rx, ry, rz, g0);
      for (let k = 0; k < nHouses + nFlats; k++) {
        const a = rndB() * 6.2832, r = 0.25 + Math.sqrt(rndB()) * 0.6, u = Math.cos(a) * r, v = Math.sin(a) * r, x = hx + u * rx, z = hz + v * rz;
        home(k >= nHouses, x, top(u, v) - 1.2, z, Math.atan2(lim.x - x, lim.z - z));
      }
      for (let k = 0; k < nTowers; k++) {
        const u = (k / Math.max(1, nTowers - 1) - 0.5) * 0.62 + (rndB() - 0.5) * 0.08, v = (rndB() - 0.5) * 0.3, h = tallest * (0.5 + 0.5 * rndB() ** 0.6), w = 16 + rndB() * 10;
        cityTower(land, hx + u * rx, hz + v * rz, w, k === Math.floor(nTowers / 2) ? tallest : h, TOWERC[Math.floor(rndB() * TOWERC.length)], top(u, v) - 4);
      }
    }
    // lower, hazier ridges behind them, so the skyline has depth
    for (let k = 0; k < 9; k++) { const a = (-8 + k * 24 + rndB() * 8) * RAD, d = 900 + rndB() * 160, x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d; if (dry(x, z) || terrainHeight(x, z) > L) rise(x, z, 230 + rndB() * 90, 50 + rndB() * 26, 170); }
    // the head at the far end of the bay: the lighthouse on top of it, white with a red cap, and more houses up it
    {
      const hx = lim.x + lim.r + 150, hz = -150, y = L + 20;
      add(land, new THREE.CylinderGeometry(1.7, 2.4, 22, 8), 0xf6f2e8, hx, y + 11, hz).castShadow = false; add(land, new THREE.CylinderGeometry(2.6, 2.6, 0.5, 8), 0xd9dde3, hx, y + 22.2, hz).castShadow = false;
      add(land, new THREE.CylinderGeometry(1.5, 1.5, 2.6, 8), 0x9ad0ff, hx, y + 23.8, hz, 0x4a6a80).castShadow = false; add(land, new THREE.ConeGeometry(2, 1.8, 8), 0xd62f2f, hx, y + 26, hz).castShadow = false;
      for (let k = 0; k < 18; k++) { const a = rndB() * 6.2832, r = 0.3 + Math.sqrt(rndB()) * 0.5, x = hx + Math.cos(a) * r * 120, z = hz + Math.sin(a) * r * 150; home(k % 6 === 5, x, L + 30 * 0.7 * Math.sqrt(1 - r * r) - 3.5, z, Math.atan2(lim.x - x, lim.z - z)); }
    }
    // across the water: more towers in the city and by the far end of the bridge, and a row of houses along the north shore
    {
      const pol = (deg, d) => [-215 - d * Math.sin(deg * RAD), 120 - d * Math.cos(deg * RAD)], CITY = [0x8fa3b8, 0x7a8ea3, 0xa9b7c9, 0x9aa7b5, 0x6f8196, 0xc2b49a, 0x5f7790, 0xb7c3cf];
      for (let k = 0; k < 18; k++) { const [x, z] = pol(30 + rndB() * 27, 835 + rndB() * 160); cityTower(land, x, z, 20 + rndB() * 22, 70 + rndB() * 170, CITY[k % CITY.length], L + 6); }
      for (let k = 0; k < 8; k++) { const [x, z] = pol(1 + rndB() * 13, 890 + rndB() * 70); cityTower(land, x, z, 18 + rndB() * 12, 40 + rndB() * 80, CITY[(k + 3) % CITY.length], L + 8); }
      for (const [nx, nz, ry] of northShore) for (let k = 0; k < 6; k++) { // houses down the side of each head that faces the bay
        const u = (rndB() - 0.5) * 1.5, v = 0.25 + rndB() * 0.6;
        if (u * u + v * v < 0.92) home(rndB() < 0.2, nx + u * 120, L - ry * 0.3 + ry * Math.sqrt(1 - u * u - v * v) * 0.94 - 1.2, nz + v * 80, (rndB() - 0.5) * 0.5);
      }
    }
    houses.count = nh; flats.count = nfl; houses.castShadow = flats.castShadow = false; worldGroup.add(houses, flats);
  }

  if (wires.pos.length) { const m = flatMesh(wires.pos, wires.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })); m.userData.dyn = true; worldGroup.add(m); } // (kept apart from the merged scenery, which casts shadows)
  // everything flat-coloured, in one mesh
  if (quads.pos.length) {
    const m = flatMesh(quads.pos, quads.col, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    m.castShadow = m.receiveShadow = true; m.userData.dyn = true; worldGroup.add(m);
  }

  // ---- things that move ----
  const tick = (t) => {
    // the ferry: round the bay, slowing right down as it comes alongside the wharf
    const fu = (t / 150 + 0.35) % 1, a = Math.PI / 2 + fu * 6.2832 - 0.9 * Math.sin(fu * 6.2832), fx = FC[0] + Math.cos(a) * FR[0], fz = FC[1] + Math.sin(a) * FR[1];
    ferry.position.set(fx, L - 0.5 + Math.sin(t * 0.9) * 0.05, fz); ferry.rotation.set(0, Math.atan2(-Math.sin(a) * FR[0], Math.cos(a) * FR[1]), Math.sin(t * 0.7) * 0.012);
    for (const o of boats) {
      const b = o.ph + t * o.sp;
      o.b.position.set(o.cx + Math.cos(b) * o.r, L - 0.1 + Math.sin(t * 1.3 + o.ph) * 0.1, o.cz + Math.sin(b) * o.r);
      o.b.rotation.set(Math.sin(t * 1.1 + o.ph) * 0.05, Math.atan2(-Math.sin(b) * o.sp, Math.cos(b) * o.sp), Math.sin(t * 0.9 + o.ph) * 0.07);
    }
    // the seaplane: down onto the water along the near side of its circuit, a run across the bay, and up again
    const u = (t / 62) % 1, th = u * 6.2832, v = ((u - 0.25 + 0.5) % 1) - 0.5, k = clamp((Math.abs(v) - 0.11) / 0.17, 0, 1), up = k * k * (3 - 2 * k);
    const px = PC[0] + Math.cos(th) * PR[0], pz = PC[1] + Math.sin(th) * PR[1], dx = -Math.sin(th) * PR[0], dz = Math.cos(th) * PR[1];
    const climb = (Math.abs(v) > 0.11 && Math.abs(v) < 0.28 ? 0.2 : 0) * Math.sign(v) * Math.sin(Math.PI * k);
    flyer.position.set(px, L + 2.2 + up * 46, pz); flyer.rotation.set(-climb, Math.atan2(dx, dz), 0.3 * up);
    prop.rotation.z = t * 40;
  };
  tick(0); anim.push(tick);
  people.finish();
}

// The harbour at Noosa Heads, in the bay beside the start straight: a marina
// tucked under the headland (two piers, pontoons, boats moored between them),
// a swimming beach between red and yellow flags with a lifeguard tower,
// swimmers and a line of buoys, jet skis, a parasail towed round the bay,
// gulls overhead and a cruise ship out on the horizon. Returns the patches of
// sea it uses, so the boats going round out there keep clear.
function buildHarbour(track, rnd, add, people) {
  const { samples, hw } = track, sea = track.sea, L = sea.level, lim = track.limit, solids = track.solids, walls = track.walls;
  const s0 = samples[0], out = wetAt(s0.p.x + s0.left.x * 80, s0.p.z + s0.left.z * 80) ? 1 : -1;
  // (a, o): metres along the start straight from the line, and out to sea from it
  const W = (a, o) => [s0.p.x + s0.th.x * a + s0.left.x * out * o, s0.p.z + s0.th.z * a + s0.left.z * out * o];
  const toSea = Math.atan2(s0.left.x * out, s0.left.z * out), along = Math.atan2(s0.th.x, s0.th.z);
  const shoreAt = (a) => { let o = 0; while (o < 160 && terrainHeight(...W(a, o)) > L) o += 0.5; return o; }; // where the water starts
  const inMap = (x, z, m) => Math.hypot(x - lim.x, z - lim.z) < lim.r - m;
  const wall = (a0, o0, a1, o1) => { const [ax, az] = W(a0, o0), [bx, bz] = W(a1, o1); walls.push({ ax, az, bx, bz, y: L - WADE }); };
  const keep = [];
  const model = (build) => { const g = new THREE.Group(); build(g); mergeStatic(g); return g; };

  // ---- the marina: two piers out from the beach, a pontoon every 9 m, boats moored between ----
  const DECK = L + 1.0, FLOAT = L + 0.45, berths = [];
  for (const pa of [-48, -8]) {
    const o0 = shoreAt(pa) - 5, o1 = Math.min(o0 + 82, 128); // from the sand just above the water
    const ends = [W(pa, o0), W(pa, o1)];
    if (o1 - o0 < 30 || !ends.every(([x, z]) => inMap(x, z, 20) && roadGap(track, x, z) > hw + 12)) continue;
    const [cx, cz] = W(pa, (o0 + o1) / 2);
    add(worldGroup, new THREE.BoxGeometry(3, 0.3, o1 - o0), 0xc9a271, cx, DECK - 0.15, cz).rotation.y = toSea;
    for (let o = o0 + 2; o < o1; o += 6) for (const sd of [-1.3, 1.3]) {
      const [x, z] = W(pa + sd, o), gy = Math.max(terrainHeight(x, z), L - 5);
      add(worldGroup, new THREE.CylinderGeometry(0.16, 0.16, DECK - gy, 6), 0x6b4a2a, x, (DECK + gy) / 2, z);
    }
    wall(pa - 1.5, o0, pa - 1.5, o1); wall(pa + 1.5, o0, pa + 1.5, o1); wall(pa - 1.5, o1, pa + 1.5, o1);
    { const [x, z] = W(pa, o0 - 3); claim(x, z, 4); } // keep the sand at its foot clear
    for (let o = o0 + 12; o < o1 - 3; o += 9) for (const sd of [-1, 1]) {
      const [fx, fz] = W(pa + sd * 6.5, o);
      add(worldGroup, new THREE.BoxGeometry(10, 0.35, 1.2), 0xa8794a, fx, FLOAT - 0.175, fz).rotation.y = toSea;
      wall(pa + sd * 1.5, o, pa + sd * 11.5, o);
      if (o + 4.5 < o1 - 1 && rnd() < 0.8) berths.push({ a: pa + sd * 7, o: o + 4.5, sd });
    }
    keep.push({ x: cx, z: cz, r: 45 });
  }
  // the boats in the berths: three kinds, each drawn as instances
  const kinds = [
    model((g) => { // a yacht, sail furled on the boom
      add(g, taperBox(2.6, 1.1, 8, [0.15, 1, 0.25], [0.8, 1, 0]), 0xf6f2e8, 0, 0.3, 0);
      add(g, new THREE.BoxGeometry(1.7, 0.6, 3), 0xe9e2d0, 0, 1.1, -0.6);
      add(g, new THREE.BoxGeometry(0.13, 11, 0.13), 0xb9bdc5, 0, 6.3, 0.9);
      add(g, new THREE.BoxGeometry(0.32, 0.32, 3.4), 0x1d2b5c, 0, 2.1, -0.8);
    }),
    model((g) => { // a motor cruiser
      add(g, taperBox(3, 1.3, 9, [0.2, 1, 0.35], [0.9, 1, 0]), 0xf6f2e8, 0, 0.35, 0);
      add(g, new THREE.BoxGeometry(2.4, 1.0, 4), 0xf6f2e8, 0, 1.45, -0.7);
      add(g, new THREE.BoxGeometry(2.46, 0.38, 3.4), 0x26303f, 0, 1.55, -0.5);
      add(g, new THREE.BoxGeometry(1.9, 0.5, 2), 0xe9e2d0, 0, 2.2, -1.3);
    }),
    model((g) => { // a yacht with a navy hull
      add(g, taperBox(2.4, 1.0, 7.4, [0.15, 1, 0.25], [0.8, 1, 0]), 0x1d2b5c, 0, 0.3, 0);
      add(g, new THREE.BoxGeometry(1.6, 0.55, 2.6), 0xf6f2e8, 0, 1.05, -0.5);
      add(g, new THREE.BoxGeometry(0.13, 10, 0.13), 0xb9bdc5, 0, 5.8, 0.8);
      add(g, new THREE.BoxGeometry(0.3, 0.3, 3.1), 0xe6453a, 0, 2.0, -0.7);
    }),
  ].map((g) => { const m = new THREE.InstancedMesh(g.children[0].geometry, mergedMat(THREE.FrontSide, 0), berths.length || 1); m.count = 0; m.castShadow = true; m.frustumCulled = false; m.userData.dyn = true; worldGroup.add(m); return m; });
  const moored = berths.map((b) => {
    const [x, z] = W(b.a, b.o), m = kinds[Math.floor(rnd() * kinds.length)];
    solids.push({ x, z, r: 2.4, y: L - WADE });
    return { m, i: m.count++, x, z, rot: along + (b.sd > 0 ? Math.PI : 0), ph: rnd() * 6.28 };
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = V(0, 0, 0), ONE = V(1, 1, 1);
  const place = (m, i, x, y, z, ry, rx = 0, rz = 0) => { m.setMatrixAt(i, M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz, 'YXZ')), ONE)); };

  // ---- the swimming beach: flags at each end, a lifeguard tower, buoys, swimmers ----
  const A0 = -150, A1 = -88, oFar = Math.max(shoreAt(A0), shoreAt(A1)) + 24;
  const flag = (x, z, y) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = along; worldGroup.add(g);
    add(g, new THREE.BoxGeometry(0.1, 4, 0.1), 0xf6f2e8, 0, 2, 0);
    add(g, new THREE.BoxGeometry(1.3, 0.45, 0.05), 0xe6453a, 0.7, 3.75, 0);
    add(g, new THREE.BoxGeometry(1.3, 0.45, 0.05), 0xffd23f, 0.7, 3.3, 0);
  };
  if ([A0, A1].every((a) => inMap(...W(a, oFar), 10))) {
    for (const a of [A0, A1]) {
      const [x, z] = W(a, shoreAt(a) - 7);
      if (isFree(track, x, z, 1, hw + 8)) { const y = terrainHeight(x, z); flag(x, z, y); claim(x, z, 1.2); solids.push({ x, z, r: 0.2, y }); }
    }
    const [tx, tz] = W((A0 + A1) / 2, shoreAt((A0 + A1) / 2) - 10);
    if (isFree(track, tx, tz, 3, hw + 8)) {
      const g = new THREE.Group(), y = terrainHeight(tx, tz);
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(g, new THREE.BoxGeometry(0.2, 3.3, 0.2), 0xf6f2e8, lx * 1.1, 1.6, lz * 1.1);
      add(g, new THREE.BoxGeometry(3, 0.2, 3), 0xc9a271, 0, 3.25, 0.2);
      add(g, new THREE.BoxGeometry(2.2, 1.8, 2.2), 0xe6453a, 0, 4.25, -0.2);
      add(g, new THREE.BoxGeometry(1.9, 0.6, 0.06), 0x26303f, 0, 4.6, 0.92); // its window, looking out to sea
      add(g, new THREE.BoxGeometry(2.8, 0.25, 2.8), 0xffd23f, 0, 5.25, -0.2);
      add(g, new THREE.BoxGeometry(0.8, 0.1, 3.8), 0xf6f2e8, 0, 1.6, 2.6).rotation.x = -0.95; // the ladder
      add(g, new THREE.BoxGeometry(0.08, 2.2, 0.08), 0xf6f2e8, 0.9, 6.4, -1.1);
      add(g, new THREE.BoxGeometry(0.9, 0.3, 0.04), 0xe6453a, 1.35, 7.3, -1.1); add(g, new THREE.BoxGeometry(0.9, 0.3, 0.04), 0xffd23f, 1.35, 7.0, -1.1);
      g.position.set(tx, y, tz); g.rotation.y = toSea; worldGroup.add(g);
      claim(tx, tz, 3.2); solids.push({ x: tx, z: tz, r: 1.9, y });
      people.add(tx + Math.sin(toSea) * 1.3, y + 3.35, tz + Math.cos(toSea) * 1.3, toSea, 0xe6453a); // on watch in front of the hut
    }
    const buoy = new THREE.SphereGeometry(0.35, 6, 4);
    const buoyAt = (a, o) => { const [x, z] = W(a, o); add(worldGroup, buoy, 0xffd23f, x, L + 0.1, z).castShadow = false; };
    for (const a of [A0, A1]) { for (let o = shoreAt(a) + 3; o < oFar; o += 4) buoyAt(a, o); wall(a, shoreAt(a) + 1, a, oFar); }
    for (let a = A0; a <= A1; a += 4) buoyAt(a, oFar);
    wall(A0, oFar, A1, oFar);
    const ring = new THREE.TorusGeometry(0.56, 0.17, 6, 12).rotateX(Math.PI / 2), ringCols = [0xff6bcb, 0xffd23f, 0x2ec4b6, 0xff8a3d];
    for (let k = 0, n = 0; k < 300 && n < 34; k++) {
      const a = A0 + 3 + rnd() * (A1 - A0 - 6), so = shoreAt(a), o = so + 1.5 + rnd() * (oFar - so - 4), [x, z] = W(a, o), gy = terrainHeight(x, z);
      if (L - gy < 0.3) continue; // not on the sand
      people.add(x, Math.max(gy, L - 0.8), z, rnd() * 6.28); // standing in the shallows, or swimming with just their head out
      if (L - gy > 0.9 && rnd() < 0.3) add(worldGroup, ring, ringCols[n % 4], x, L + 0.04, z).castShadow = false;
      n++;
    }
  }

  // ---- jet skis doing figures of eight ----
  const skis = [];
  for (const [a, o, R, col] of [[-115, 150, 30, 0xffd23f], [-30, 178, 26, 0xe6453a]]) {
    const [cx, cz] = W(a, o);
    if (!inMap(cx, cz, R + 15)) continue;
    const g = model((g) => {
      add(g, taperBox(1.1, 0.55, 3.2, [0.35, 1, 0.12], [0.95, 1, 0]), col, 0, 0.25, 0);
      add(g, new THREE.BoxGeometry(0.5, 0.3, 1.3), 0x26303f, 0, 0.65, -0.35);
      add(g, new THREE.BoxGeometry(0.46, 0.8, 0.3), 0x1d2230, 0, 1.15, -0.45);
      add(g, new THREE.BoxGeometry(0.5, 0.45, 0.34), 0xff8a3d, 0, 1.3, -0.45); // life jacket
      add(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), 0xd9a577, 0, 1.75, -0.4);
    });
    g.userData.dyn = true; worldGroup.add(g);
    skis.push({ g, cx, cz, R, ph: rnd() * 6.28, sp: 0.42 + rnd() * 0.08, turn: rnd() * 3.14 });
    keep.push({ x: cx, z: cz, r: R + 8 });
  }
  const skiAt = (k, u) => { const c = Math.cos(k.turn), s = Math.sin(k.turn), lx = k.R * Math.sin(u), lz = (k.R / 2) * Math.sin(2 * u); return [k.cx + lx * c - lz * s, k.cz + lx * s + lz * c]; };

  // ---- a parasail: a boat towing a striped canopy round the bay ----
  let para = null;
  { const [cx, cz] = W(-150, 250), R = 55;
    if (inMap(cx, cz, R + 10)) {
      const boat = model((g) => {
        add(g, taperBox(2.4, 1.0, 6.5, [0.25, 1, 0.3], [0.95, 1, 0]), 0xf6f2e8, 0, 0.3, 0);
        add(g, new THREE.BoxGeometry(1.2, 0.9, 1.0), 0x3d8bff, 0, 1.1, 0.2);
        add(g, new THREE.BoxGeometry(0.46, 0.85, 0.3), 0xe6453a, 0, 1.25, -0.8);
        add(g, new THREE.BoxGeometry(0.3, 0.3, 0.3), 0xd9a577, 0, 1.85, -0.8);
      });
      boat.userData.dyn = true; worldGroup.add(boat);
      const dome = new THREE.SphereGeometry(4.2, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed().scale(1.35, 0.55, 1);
      const stripes = [0xe6453a, 0xffd23f, 0x3d8bff, 0x7ed957, 0xff6bcb, 0xff8a3d], c = new THREE.Color(), cols = [], pa = dome.attributes.position;
      for (let i = 0; i < pa.count; i += 3) {
        const ang = Math.atan2(pa.getZ(i) + pa.getZ(i + 1) + pa.getZ(i + 2), pa.getX(i) + pa.getX(i + 1) + pa.getX(i + 2));
        c.set(stripes[Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 12) % 6]);
        for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
      }
      dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const chute = new THREE.Group(); chute.userData.dyn = true; worldGroup.add(chute);
      chute.add(new THREE.Mesh(dome, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
      const rope = new THREE.MeshLambertMaterial({ color: 0x3b4250 });
      for (const sx of [-1, 1]) chute.add(strut(V(sx * 5.5, 0.1, 0), V(0, -5.4, 0), 0.04, 0.04, rope));
      const flyer = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.85, 0.3), new THREE.MeshLambertMaterial({ color: 0xffd23f, flatShading: true })); flyer.position.y = -5.9; chute.add(flyer);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xd9a577, flatShading: true })); head.position.y = -5.3; chute.add(head);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1), rope); line.userData.dyn = true; worldGroup.add(line);
      para = { boat, chute, line, cx, cz, R, ph: rnd() * 6.28 };
      keep.push({ x: cx, z: cz, r: R + 12 });
    }
  }

  // ---- gulls wheeling over the beach and the bay ----
  const GULLS = 14, gl = new THREE.MeshLambertMaterial({ color: 0xf6f2e8, flatShading: true }), gw = new THREE.MeshLambertMaterial({ color: 0xc9ced6, flatShading: true });
  const gBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.22, 0.75), gl, GULLS);
  const gLeft = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.05, 0.42).translate(0.575, 0, 0), gw, GULLS);
  const gRight = new THREE.InstancedMesh(new THREE.BoxGeometry(1.15, 0.05, 0.42).translate(-0.575, 0, 0), gw, GULLS);
  for (const m of [gBody, gLeft, gRight]) { m.frustumCulled = false; m.userData.dyn = true; worldGroup.add(m); }
  const gulls = [];
  for (let k = 0; k < GULLS; k++) {
    const [cx, cz] = W(-200 + rnd() * 230, 15 + rnd() * 130), r = 8 + rnd() * 18, dir = rnd() < 0.5 ? 1 : -1;
    gulls.push({ cx, cz, r, h: L + 12 + rnd() * 16, sp: dir * (6 + rnd() * 3) / r, ph: rnd() * 6.28 });
  }
  const MB = new THREE.Matrix4(), MW = new THREE.Matrix4();

  // ---- and a cruise ship out on the horizon ----
  { const [x, z] = W(-150, 560), g = new THREE.Group();
    add(g, new THREE.BoxGeometry(24, 9, 105), 0xf6f2e8, 0, 1.5, -17.5);
    add(g, taperBox(24, 9, 40, [0.12, 1, 0.8], null), 0xf6f2e8, 0, 1.5, 55);
    add(g, new THREE.BoxGeometry(24.2, 2.6, 105), 0x1d2b5c, 0, 0.8, -17.5);
    add(g, new THREE.BoxGeometry(20, 5, 95), 0xf6f2e8, 0, 8.5, -15);
    add(g, new THREE.BoxGeometry(20.3, 1.4, 90), 0x26303f, 0, 8.6, -15);
    add(g, new THREE.BoxGeometry(17, 4.5, 75), 0xf6f2e8, 0, 13.2, -18);
    add(g, new THREE.BoxGeometry(17.3, 1.2, 70), 0x26303f, 0, 13.3, -18);
    add(g, new THREE.BoxGeometry(13, 4, 40), 0xf6f2e8, 0, 17.4, -12);
    add(g, taperBox(6, 10, 9, [0.85, 1, 0], null), 0xe6453a, 0, 24, -42);
    add(g, new THREE.BoxGeometry(6.1, 1.5, 9.1), 0x1d2230, 0, 28.5, -42);
    g.position.set(x, L - 0.5, z); g.rotation.y = along; worldGroup.add(g);
  }

  const tick = (t) => {
    for (const b of moored) place(b.m, b.i, b.x, L - 0.15 + Math.sin(t * 1.1 + b.ph) * 0.07, b.z, b.rot, Math.sin(t * 0.8 + b.ph) * 0.02, Math.sin(t * 0.9 + b.ph) * 0.04);
    for (const m of kinds) m.instanceMatrix.needsUpdate = true;
    for (const k of skis) {
      const u = t * k.sp + k.ph, [x, z] = skiAt(k, u), [x2, z2] = skiAt(k, u + 0.04), [x3, z3] = skiAt(k, u + 0.08);
      const h = Math.atan2(x2 - x, z2 - z), h2 = Math.atan2(x3 - x2, z3 - z2);
      let dh = h2 - h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      k.g.position.set(x, L - 0.05 + Math.sin(t * 7 + k.ph) * 0.05, z);
      k.g.rotation.set(-0.08, h, clamp(-dh * 9, -0.5, 0.5), 'YXZ');
    }
    if (para) {
      const a = para.ph + t * 8 / para.R, bx = para.cx + Math.cos(a) * para.R, bz = para.cz + Math.sin(a) * para.R, fx = -Math.sin(a), fz = Math.cos(a);
      para.boat.position.set(bx, L - 0.1 + Math.sin(t * 1.4) * 0.06, bz); para.boat.rotation.set(-0.05, Math.atan2(fx, fz), 0.05);
      para.chute.position.set(bx - fx * 42, L + 26 + Math.sin(t * 0.6) * 1.2, bz - fz * 42); para.chute.rotation.set(0.15, Math.atan2(fx, fz), Math.sin(t * 0.5) * 0.06, 'YXZ');
      const from = V(bx - fx * 3, L + 1.0, bz - fz * 3), to = V(bx - fx * 42, para.chute.position.y - 6.3, bz - fz * 42), d = to.clone().sub(from), len = d.length();
      para.line.position.copy(from).addScaledVector(d, 0.5); para.line.quaternion.setFromUnitVectors(_z, d.normalize()); para.line.scale.set(1, 1, len);
    }
    gulls.forEach((g, k) => {
      const a = g.ph + t * g.sp, s = Math.sign(g.sp), glide = Math.sin(t * 0.4 + g.ph) > 0.2, flap = glide ? 0.12 : Math.sin(t * 10 + g.ph) * 0.55;
      MB.compose(P.set(g.cx + Math.cos(a) * g.r, g.h + Math.sin(t * 0.7 + g.ph) * 1.5, g.cz + Math.sin(a) * g.r), Q.setFromEuler(E.set(0, Math.atan2(-Math.sin(a) * s, Math.cos(a) * s), -s * 0.3, 'YXZ')), ONE);
      gBody.setMatrixAt(k, MB);
      MW.makeRotationZ(flap).setPosition(0.14, 0.05, 0); gLeft.setMatrixAt(k, MW.premultiply(MB));
      MW.makeRotationZ(-flap).setPosition(-0.14, 0.05, 0); gRight.setMatrixAt(k, MW.premultiply(MB));
    });
    gBody.instanceMatrix.needsUpdate = gLeft.instanceMatrix.needsUpdate = gRight.instanceMatrix.needsUpdate = true;
  };
  tick(0); anim.push(tick); // placed now, so nothing waits at the origin for the first frame
  return keep;
}

// Noosa Heads's seaside: palms (in a row along the road, and in clumps), beach
// huts facing the sea, umbrellas and towels down by the water, a lighthouse
// on the headland and boats out at sea.
function buildBeach(track, rnd, randIn) {
  const { samples, N, hw } = track, sea = track.sea, lim = track.limit, solids = track.solids;
  const mats = new Map();
  const lam = (c) => { let m = mats.get(c); if (!m) mats.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; };
  const add = (g, geo, color, x, y, z) => { const m = new THREE.Mesh(geo, lam(color)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const M = new THREE.Matrix4();
  const people = makePeople(150, rnd);
  const keep = buildHarbour(track, rnd, add, people); // first, so the huts and umbrellas leave it room

  // ---- palms: a curving trunk and a crown of drooping fronds, drawn as instances ----
  const part = new THREE.Group();
  let tx = 0, ty = 0, lean = 0;
  for (let k = 0; k < 5; k++) {
    lean += 0.075;
    const seg = add(part, new THREE.CylinderGeometry(0.24 - k * 0.025, 0.3 - k * 0.025, 1.95, 5, 1, true), k % 2 ? 0x9a7a52 : 0x86683f, tx + Math.sin(lean) * 0.95, ty + Math.cos(lean) * 0.95, 0); // open ended: the joins hide the ends
    seg.rotation.z = -lean;
    tx += Math.sin(lean) * 1.9; ty += Math.cos(lean) * 1.9;
  }
  const leafGeo = taperBox(1.0, 0.1, 4.4, [0.15, 1, -1.5], [0.9, 1, 0]).translate(0, 0, 2.2);
  for (let k = 0; k < 8; k++) add(part, leafGeo, k % 2 ? 0x4f9a3a : 0x63ad45, tx, ty + 0.1, 0).rotation.set(-0.2 - (k % 3) * 0.12, (k / 8) * Math.PI * 2 + 0.3, 0, 'YXZ');
  for (let k = 0; k < 3; k++) add(part, new THREE.OctahedronGeometry(0.26, 0), 0x6b4a2a, tx + Math.cos(k * 2.1) * 0.35, ty - 0.35, Math.sin(k * 2.1) * 0.35);
  mergeStatic(part);
  const PALMS = 330;
  const palms = new THREE.InstancedMesh(part.children[0].geometry, mergedMat(THREE.FrontSide, 0), PALMS);
  palms.castShadow = true;
  let np = 0;
  const palm = (x, z, sc, solid = true) => {
    if (np >= PALMS) return;
    const gy = terrainHeight(x, z);
    M.makeRotationY(rnd() * 6.28); M.scale(V(sc, sc, sc)); M.setPosition(x, gy - 0.3, z);
    palms.setMatrixAt(np++, M);
    if (solid) { solids.push({ x, z, r: 0.4 * sc, y: gy }); claim(x, z, 1.6 * sc); }
  };
  // ---- beach huts in a row along the seafront, facing the sea ----
  const hutCols = [0x7ec8f0, 0xffd23f, 0xff8fb0, 0x8fe0b0, 0xf6f2e8, 0xff6a5a, 0xffa94d, 0xb79cff];
  const roofGeo = new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2); // ridge running front to back
  const bodyGeo = new THREE.BoxGeometry(2.4, 3.2, 2.2), doorGeo = new THREE.BoxGeometry(1.1, 1.9, 0.1), deckGeo = new THREE.BoxGeometry(2.6, 0.2, 1.1);
  let huts = 0, lastHut = -99;
  for (let i = 0; i < N && huts < 16; i++) for (const side of [1, -1]) {
    if (i - lastHut < 2 && huts) continue;
    const s = samples[i], at = (lat) => [s.p.x + s.left.x * side * lat, s.p.z + s.left.z * side * lat];
    const [x, z] = at(hw + 11), [fx, fz] = at(hw + 42);
    if (!wetAt(fx, fz) || !isFree(track, x, z, 2.2, hw + 8)) continue;
    const g = new THREE.Group(), col = hutCols[huts % hutCols.length];
    add(g, bodyGeo, col, 0, 1.3, 0);
    add(g, roofGeo, 0xf6f2e8, 0, 3.1, 0).scale.set(1.5, 0.8, 2.6);
    add(g, doorGeo, huts % 2 ? 0xf6f2e8 : 0x3b4250, 0, 1.0, 1.12);
    add(g, deckGeo, 0x9a6a3c, 0, 0.0, 1.6);
    const gy = terrainHeight(x, z);
    g.position.set(x, gy, z); g.rotation.y = Math.atan2(s.left.x * side, s.left.z * side); // the door faces away from the road, out to sea
    worldGroup.add(g);
    claim(x, z, 2.2); solids.push({ x, z, r: 1.5, y: gy });
    huts++; lastHut = i;
  }

  // ---- umbrellas and towels on the sand just above the water ----
  const spots = [];
  for (let x = lim.x - lim.r; x < lim.x + lim.r; x += 5) for (let z = lim.z - lim.r; z < lim.z + lim.r; z += 5) {
    const y = terrainHeight(x, z);
    if (y > sea.level + 0.35 && y < sea.level + 1.5 && (x - lim.x) ** 2 + (z - lim.z) ** 2 < (lim.r - 8) ** 2) spots.push([x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3]);
  }
  for (let k = spots.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [spots[k], spots[j]] = [spots[j], spots[k]]; }
  const brolly = [0xe6453a, 0xffd23f, 0x3d8bff, 0xf6f2e8, 0xff8a3d, 0x2ec4b6, 0xff6bcb], towel = [0xff6bcb, 0x3d8bff, 0xffd23f, 0x7ed957, 0xf6f2e8, 0xe6453a];
  const canopy = new THREE.ConeGeometry(1.6, 0.6, 8), pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), towelGeo = new THREE.BoxGeometry(0.9, 0.04, 1.8);
  let umbrellas = 0;
  for (const [x, z] of spots) {
    if (umbrellas >= 60) break;
    if (!isFree(track, x, z, 1.8, hw + 7)) continue;
    const g = new THREE.Group(), y = terrainHeight(x, z);
    add(g, pole, 0xf6f2e8, 0, 1.2, 0);
    add(g, canopy, brolly[umbrellas % brolly.length], 0, 2.5, 0).rotation.z = (rnd() - 0.5) * 0.25;
    add(g, towelGeo, towel[Math.floor(rnd() * towel.length)], 1.1, 0.05, 0.2).castShadow = false;
    g.position.set(x, y, z); g.rotation.y = rnd() * 6.28; worldGroup.add(g);
    claim(x, z, 1.8); solids.push({ x, z, r: 0.25, y });
    if (rnd() < 0.45) people.add(x + (rnd() - 0.5) * 3, y, z + (rnd() - 0.5) * 3, rnd() * 6.28);
    umbrellas++;
  }

  // ---- a lighthouse on the headland, the stretch of road furthest out to sea ----
  let tip = samples[0];
  for (const s of samples) if (s.p.z < tip.p.z) tip = s;
  const out = tip.left.z < 0 ? 1 : -1; // the side facing the open sea
  for (let lat = hw + 16; lat < hw + 40; lat += 4) {
    const x = tip.p.x + tip.left.x * out * lat, z = tip.p.z + tip.left.z * out * lat;
    if (!isFree(track, x, z, 6, hw + 10)) continue;
    const g = new THREE.Group(), y = terrainHeight(x, z);
    add(g, new THREE.CylinderGeometry(3.4, 3.8, 3, 10), 0x9a9a8c, 0, 0, 0);
    add(g, new THREE.CylinderGeometry(1.8, 2.7, 18, 10), 0xf6f2e8, 0, 10, 0);
    const rAt = (h) => 2.7 - (h - 1) * 0.05 + 0.06; // just outside the tower, which narrows as it goes up
    for (const h of [6, 12.5]) add(g, new THREE.CylinderGeometry(rAt(h + 1.3), rAt(h - 1.3), 2.6, 10), 0xe6453a, 0, h, 0);
    add(g, new THREE.CylinderGeometry(2.6, 2.6, 0.4, 10), 0x3b4250, 0, 19.2, 0);
    add(g, new THREE.ConeGeometry(1.9, 1.8, 10), 0xe6453a, 0, 22.6, 0);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.2, 10), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); lamp.position.y = 20.5; g.add(lamp);
    for (let k = 0; k < 4; k++) add(g, new THREE.BoxGeometry(0.18, 2.2, 0.18), 0x3b4250, Math.cos(k * 1.571 + 0.785) * 1.38, 20.5, Math.sin(k * 1.571 + 0.785) * 1.38); // the lantern's frame
    // the keeper's cottage
    const cot = new THREE.Group(); cot.position.set(9, 0, 0); g.add(cot);
    add(cot, new THREE.BoxGeometry(6, 6, 5), 0xf1e9d6, 0, 0.5, 0);
    add(cot, new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2).rotateZ(Math.PI / 2), 0x9c3b2e, 0, 3.85, 0).scale.set(6.8, 1.7, 3.1);
    // the cottage goes beside it, along the line of the road (whichever way has room)
    const dir = [1, -1].find(d => isFree(track, x + tip.th.x * 9 * d, z + tip.th.z * 9 * d, 4.5, hw + 8)) || 0;
    if (!dir) cot.visible = false;
    g.position.set(x, y, z); g.rotation.y = Math.atan2(-tip.th.z * (dir || 1), tip.th.x * (dir || 1)); worldGroup.add(g); // local +x along the road
    solids.push({ x, z, r: 3.6, y }); claim(x, z, 6);
    if (dir) { const cx = x + tip.th.x * 9 * dir, cz = z + tip.th.z * 9 * dir; solids.push({ x: cx, z: cz, r: 3.4, y }); claim(cx, cz, 4.5); }
    break;
  }

  // a row down both sides of the road, every 15 m or so where there's room
  for (let i = 0; i < N; i += 10) for (const side of [1, -1]) {
    const s = samples[i], lat = hw + 6 + rnd() * 3, x = s.p.x + s.left.x * side * lat, z = s.p.z + s.left.z * side * lat;
    if (isFree(track, x, z, 1.4, hw + 5)) palm(x, z, 0.85 + rnd() * 0.4);
  }

  // ---- palms in clumps all over the island, and more past the edge of the map ----
  for (let t = 0; np < PALMS - 110 && t < 3000; t++) {
    const [cx, cz] = randIn(10), n = 2 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (rnd() - 0.5) * 16, z = cz + (rnd() - 0.5) * 16, sc = 0.75 + rnd() * 0.55;
      if (isFree(track, x, z, 1.5 * sc, hw + 8)) palm(x, z, sc);
    }
  }
  for (let k = 0; k < 400 && np < PALMS; k++) {
    const a = rnd() * 6.2832, d = lim.r + 6 + rnd() * 90, x = lim.x + Math.cos(a) * d, z = lim.z + Math.sin(a) * d;
    if (!wetAt(x, z) && terrainHeight(x, z) > sea.level + 0.8) palm(x, z, 0.9 + rnd() * 0.6, false);
  }
  palms.count = np; worldGroup.add(palms);

  // ---- boats: sailing boats and a couple of motor boats going round out at sea ----
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.9, -1.2, 0, 0.9, 1.5, 0, 5.2, -1.0], 3));
  sailGeo.computeVertexNormals();
  const boats = [];
  for (let t = 0; t < 400 && boats.length < 9; t++) {
    const a = rnd() * 6.2832, d = lim.r * (0.45 + rnd() * 0.9), cx = lim.x + Math.cos(a) * d, cz = lim.z + Math.sin(a) * d, r = 14 + rnd() * 30;
    let deep = true;
    for (let k = 0; k < 8 && deep; k++) deep = terrainHeight(cx + Math.cos(k * 0.785) * r, cz + Math.sin(k * 0.785) * r) < sea.level - 2.5;
    if (!deep || boats.some(o => Math.hypot(o.cx - cx, o.cz - cz) < o.r + r + 12) || keep.some(o => Math.hypot(o.x - cx, o.z - cz) < o.r + r + 10)) continue;
    const b = new THREE.Group(), motor = boats.length % 4 === 3;
    if (motor) {
      add(b, taperBox(2.2, 0.9, 6, [0.2, 1, 0.25], [0.95, 1, 0]), 0xf6f2e8, 0, 0.3, 0);
      add(b, new THREE.BoxGeometry(1.7, 0.9, 2), 0x3d8bff, 0, 1.1, -0.6);
      add(b, new THREE.BoxGeometry(1.6, 0.5, 0.1), 0x26303f, 0, 1.3, 0.45);
    } else {
      add(b, taperBox(1.7, 0.8, 4.4, [0.25, 1, 0], [0.75, 1, 0]), [0xf6f2e8, 0x3d8bff, 0xe6453a][boats.length % 3], 0, 0.2, 0);
      add(b, new THREE.BoxGeometry(0.14, 5.4, 0.14), 0x7a4a2a, 0, 2.9, -1.1);
      b.add(new THREE.Mesh(sailGeo, new THREE.MeshLambertMaterial({ color: [0xf6f2e8, 0xffd23f, 0xff8fb0][boats.length % 3], side: THREE.DoubleSide, flatShading: true })));
    }
    b.userData.dyn = true; mergeStatic(b); worldGroup.add(b);
    boats.push({ b, cx, cz, r, sp: (motor ? 0.22 : 0.05 + rnd() * 0.05) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.28 });
  }
  anim.push((t) => {
    for (const o of boats) {
      const a = o.ph + t * o.sp;
      o.b.position.set(o.cx + Math.cos(a) * o.r, sea.level - 0.1 + Math.sin(t * 1.3 + o.ph) * 0.1, o.cz + Math.sin(a) * o.r);
      o.b.rotation.set(Math.sin(t * 1.1 + o.ph) * 0.05, Math.atan2(-Math.sin(a) * o.sp, Math.cos(a) * o.sp), Math.sin(t * 0.9 + o.ph) * 0.07);
    }
  });
  people.finish();
}

// Sydney CBD: offices and flats packed along the streets, a grid of blocks
// behind them, windows lit at random, neon over the shops and a skyline
// running off into the night. Every building is in one mesh (the windows are
// a texture) and the ones inside the map are solid.
// The Maccas' lettering, on one sheet: the golden arches (a red tile with the M on it in two strokes of gold),
// the name, and Jago's name tag. Drawn here, like the sponsors' boards: no picture file.
const MACCAS_ART = { arch: [0, 0, 256, 256], word: [0, 256, 512, 100], tag: [256, 0, 256, 128] };
function maccasTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#da291c'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#ffc72c'; x.lineWidth = 30; x.lineCap = 'butt'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(40, 216); x.bezierCurveTo(40, 96, 62, 42, 84, 42); x.bezierCurveTo(106, 42, 122, 112, 128, 186); x.bezierCurveTo(134, 112, 150, 42, 172, 42); x.bezierCurveTo(194, 42, 216, 96, 216, 216); x.stroke();
  x.fillStyle = '#da291c'; x.fillRect(0, 256, 512, 100);
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '900 76px "Segoe UI", Arial, sans-serif'; x.fillText("Macca's", 256, 310);
  x.fillStyle = '#ffffff'; x.fillRect(256, 0, 256, 128); x.strokeStyle = '#1d2230'; x.lineWidth = 8; x.strokeRect(266, 10, 236, 108);
  x.fillStyle = '#1d2230'; x.font = '900 70px "Segoe UI", Arial, sans-serif'; x.fillText('JAGO', 384, 68);
  return cleanTexture(c);
}
// A Maccas on the plot `m` (centre, heading along the road, which side of the road, the plot's depth and width):
// a low restaurant with a red fascia and lit windows, the arches on a tall pole where drivers coming up the
// straight see them, and a drive-through window on the side facing the road with Jago at it, name tag and all.
// One of the exceptions to "no real brands" that the owner asked for (CLAUDE.md). It's night, so everything is
// drawn in its own light: one mesh of flat colours (each face shaded by which way it looks) and one of lettering.
function buildMaccas(track, m) {
  track.maccas = m;
  const f = -m.side, cs = Math.cos(m.ry), sn = Math.sin(m.ry); // f: towards the road, along the plot's x (its z runs along the road, the way the cars go)
  const W = (x, y, z) => V(m.cx + x * cs + z * sn, m.y + y, m.cz - x * sn + z * cs);
  const pos = [], col = [], tint = new THREE.Color();
  const box = (w, h, d, hex, x, y, z) => {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h / 2, y1 = y + h / 2, z0 = z - d / 2, z1 = z + d / 2, q = (a, b, c, e, k) => pushQuad(pos, col, W(...a), W(...b), W(...c), W(...e), tint.set(hex).multiplyScalar(k).clone());
    q([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 1); q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0.5);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.9); q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 0.9);
    q([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], 0.74); q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.74);
  };
  const BD = 8, BL = Math.min(11, m.w - 3), H = 3.6, front = f * (m.d / 2 - 0.8), mid = front - f * BD / 2; // the restaurant: 8 m deep, 11 long, its front 0.8 m in from the plot's edge
  box(BD, H, BL, 0xb7ae98, mid, H / 2, 0);                                     // walls
  box(BD + 0.7, 0.9, BL + 0.7, 0xda291c, mid, H + 0.45, 0);                    // the red fascia
  box(BD - 0.6, 0.3, BL - 0.6, 0x23272f, mid, H + 1.05, 0);                    // roof
  box(BD + 1.3, 0.14, BL + 1.3, 0xffc72c, mid, H - 0.02, 0);                   // a gold line under it
  const face = front + f * 0.04;
  box(0.1, 1.7, 3.0, 0xffe7b0, face, 1.95, -0.2);                              // the dining room's window
  box(0.1, 2.3, 1.4, 0xffe7b0, face, 1.15, -BL / 2 + 1.5);                     // the door
  box(0.14, 2.4, 0.12, 0x5a5f6a, face, 1.2, -BL / 2 + 2.26); box(0.14, 2.4, 0.12, 0x5a5f6a, face, 1.2, -BL / 2 + 0.74);
  // the drive-through window, at the far end: a lit opening, a counter, a little red awning
  const wz = BL / 2 - 1.9;
  box(0.1, 1.3, 1.7, 0xfff1c9, face, 1.85, wz);
  box(0.6, 0.1, 1.9, 0x9aa0aa, front + f * 0.3, 1.16, wz);
  box(0.9, 0.12, 2.2, 0xda291c, front + f * 0.45, 2.66, wz);
  // Jago, leaning on the counter: dark shirt, red cap, a bag in his hand, his name on his chest
  const jx = front + f * 0.2;
  box(0.3, 0.72, 0.52, 0x3b4250, jx, 1.56, wz);                                // shirt
  box(0.3, 0.3, 0.3, 0xe0b592, jx, 2.07, wz);                                  // head
  box(0.34, 0.1, 0.34, 0xda291c, jx, 2.27, wz); box(0.16, 0.04, 0.3, 0xda291c, jx + f * 0.22, 2.23, wz); // cap and peak
  box(0.5, 0.12, 0.12, 0x3b4250, jx + f * 0.3, 1.5, wz + 0.3); box(0.12, 0.12, 0.12, 0xe0b592, jx + f * 0.58, 1.5, wz + 0.3); // an arm out of the window
  box(0.2, 0.3, 0.16, 0xb98a55, jx + f * 0.62, 1.32, wz + 0.3);                // and the bag
  // the pole for the arches, at the end of the plot the cars reach first
  const px = f * (m.d / 2 - 1.3), pz = -m.w / 2 + 1.5;
  box(0.36, 9.2, 0.36, 0x5a606b, px, 4.6, pz); box(3.4, 3.4, 0.4, 0xda291c, px, 10.9, pz);
  const body = flatMesh(pos, col, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); body.userData.dyn = true; worldGroup.add(body);
  // the lettering: a piece of the sheet on an upright rectangle, w wide and h high, centred on (x, y, z) and facing (nx, nz)
  const tp = [], tuv = [];
  const letter = ([ax, ay, aw, ah], x, y, z, nx, nz, w, h) => {
    const u0 = ax / 512, u1 = (ax + aw) / 512, v1 = 1 - ay / 512, v0 = 1 - (ay + ah) / 512, rx = nz * w / 2, rz = -nx * w / 2; // (rx, rz): half the width, to the right as you look at it
    const q = [[W(x - rx, y - h / 2, z - rz), u0, v0], [W(x + rx, y - h / 2, z + rz), u1, v0], [W(x + rx, y + h / 2, z + rz), u1, v1], [W(x - rx, y + h / 2, z - rz), u0, v1]];
    for (const k of [0, 1, 2, 0, 2, 3]) { tp.push(q[k][0].x, q[k][0].y, q[k][0].z); tuv.push(q[k][1], q[k][2]); }
  };
  letter(MACCAS_ART.tag, jx + f * 0.156, 1.7, wz - 0.08, f, 0, 0.3, 0.15);
  letter(MACCAS_ART.arch, front + f * 0.362, H + 0.45, -1.9, f, 0, 0.84, 0.84);
  letter(MACCAS_ART.word, front + f * 0.362, H + 0.45, 0.4, f, 0, 3.2, 0.62);
  for (const sd of [1, -1]) letter(MACCAS_ART.arch, px, 10.9, pz + sd * 0.212, 0, sd, 3.3, 3.3);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  const text = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: maccasTexture(), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })); // (drawn a touch nearer than what it sits on, so it never flickers)
  text.userData.dyn = true; worldGroup.add(text);
  // what's solid: the restaurant and the pole
  const cnr = [[mid - BD / 2, -BL / 2], [mid - BD / 2, BL / 2], [mid + BD / 2, BL / 2], [mid + BD / 2, -BL / 2]].map(([x, z]) => W(x, 0, z));
  for (let k = 0; k < 4; k++) track.walls.push({ ax: cnr[k].x, az: cnr[k].z, bx: cnr[(k + 1) % 4].x, bz: cnr[(k + 1) % 4].z, y: m.y });
  { const p = W(px, 0, pz); track.solids.push({ x: p.x, z: p.z, r: 0.5, y: m.y }); }
}

function buildCity(track, rnd) {
  const { samples, N, hw } = track, lim = track.limit, walls = track.walls;
  const BAY = 3.6, FLOOR = 3.3, CELLS = 8; // a window every 3.6 m along, a floor every 3.3 m up; the texture is 8 x 8 windows
  // ---- the windows: what the walls look like, and which panes are lit ----
  const cvA = document.createElement('canvas'), cvB = document.createElement('canvas');
  cvA.width = cvA.height = cvB.width = cvB.height = 256;
  const ca = cvA.getContext('2d'), cb = cvB.getContext('2d');
  ca.fillStyle = '#c3c7cf'; ca.fillRect(0, 0, 256, 256);
  cb.fillStyle = '#000'; cb.fillRect(0, 0, 256, 256);
  const lit = ['#ffd27a', '#ffc35e', '#ffe2a8', '#fff1d6', '#bfe2ff', '#9fd0ff'];
  for (let r = 0; r < CELLS; r++) {
    const busy = 0.12 + rnd() * 0.45; // how many on this floor have the lights on
    for (let c = 0; c < CELLS; c++) {
      const x = c * 32 + 5, y = r * 32 + 7;
      ca.fillStyle = rnd() < 0.5 ? '#2b3342' : '#343d4e'; ca.fillRect(x, y, 22, 17);
      if (rnd() < busy) {
        cb.fillStyle = lit[Math.floor(rnd() * lit.length)]; cb.fillRect(x, y, 22, 17);
        if (rnd() < 0.3) { cb.fillStyle = '#000'; cb.fillRect(x, y, 22, 5 + Math.floor(rnd() * 8)); } // blinds half down
      }
    }
  }
  const winMap = cleanTexture(cvA), winGlow = cleanTexture(cvB);
  for (const t of [winMap, winGlow]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } // crisp panes close up
  const ROOF = [2 / 256, 2 / 256]; // a bit of plain wall in the texture, for the roofs
  const TINTS = [0xd9d4c7, 0xb9c2cc, 0x8fa3b8, 0x7a9494, 0xc7a08a, 0x9a9aa6, 0xa9b7c9];
  const P = [], NR = [], UV = [], C = [];
  const tint = new THREE.Color(), roofTint = new THREE.Color();
  const vert = (p, n, uv, col) => { P.push(p[0], p[1], p[2]); NR.push(n[0], n[1], n[2]); UV.push(uv[0], uv[1]); C.push(col.r, col.g, col.b); };
  const boxes = [];   // where the buildings are, for spacing them out
  const blink = [];   // red lights on the tallest roofs
  const signs = [];   // neon signs: { c, n, w } centre, facing, width
  const boards = [];  // billboards: { c, n, w, h }
  const slab = [];    // pavement round each building

  // corners of a w x d footprint centred on (cx, cz), turned so local +z runs along `ry`,
  // in clockwise order seen from above (so each wall below faces outwards)
  const footprint = (cx, cz, hx, hz, ry) => {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    return [[-hx, -hz], [-hx, hz], [hx, hz], [hx, -hz]].map(([lx, lz]) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
  };
  const building = (pts, h, solid) => {
    let gy = Infinity, gtop = -Infinity;
    for (const [x, z] of pts) { const y = terrainHeight(x, z); gy = Math.min(gy, y); gtop = Math.max(gtop, y); }
    const base = gy - 1, top = gtop + h;
    tint.set(TINTS[Math.floor(rnd() * TINTS.length)]).multiplyScalar(0.85 + rnd() * 0.2);
    roofTint.copy(tint).multiplyScalar(0.42);
    const v0 = Math.floor(rnd() * CELLS) / CELLS, vb = v0 + (base - gtop) / FLOOR / CELLS, vt = v0 + h / FLOOR / CELLS;
    let u = Math.floor(rnd() * CELLS) / CELLS;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % 4], len = Math.hypot(bx - ax, bz - az), du = len / BAY / CELLS;
      const n = [-(bz - az) / len, 0, (bx - ax) / len];
      const q = [[ax, base, az, u, vb], [bx, base, bz, u + du, vb], [bx, top, bz, u + du, vt], [ax, top, az, u, vt]];
      for (const i of [0, 1, 2, 0, 2, 3]) vert(q[i], n, [q[i][3], q[i][4]], tint);
      u += du;
      if (solid) walls.push({ ax, az, bx, bz, y: gy });
    }
    for (const i of [0, 1, 2, 0, 2, 3]) vert([pts[i][0], top, pts[i][1]], [0, 1, 0], ROOF, roofTint);
    return { gy, gtop, top };
  };

  // ---- the road, bucketed, so "is this spot near the road?" is quick ----
  const BK = 24, bucket = new Map();
  for (const s of samples) { const k = Math.floor(s.p.x / BK) * 4096 + Math.floor(s.p.z / BK); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(s); }
  const nearRoad = (x, z, r) => {
    const bx = Math.floor(x / BK), bz = Math.floor(z / BK), r2 = r * r;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = bucket.get((bx + i) * 4096 + bz + j);
      if (l) for (const s of l) { const dx = s.p.x - x, dz = s.p.z - z; if (dx * dx + dz * dz < r2) return true; }
    }
    return false;
  };
  // can a building stand on these corners? Clear of the road by `margin`, of the
  // other buildings (a 2.5 m alley between neighbours, a street between a row
  // on the circuit and a block behind it) and of everything else placed so far
  const fits = (pts, margin, kind) => {
    for (let k = 0; k < 4; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % 4], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
      for (let t = 0; t < n; t++) if (nearRoad(ax + (bx - ax) * t / n, az + (bz - az) * t / n, margin)) return false;
    }
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]);
    const b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), kind };
    for (const o of boxes) { const g = o.kind === kind ? 2.5 : 7; if (b.x0 - g < o.x1 && b.x1 + g > o.x0 && b.z0 - g < o.z1 && b.z1 + g > o.z0) return false; }
    for (const o of occupied) if (o.x > b.x0 - o.r - 3 && o.x < b.x1 + o.r + 3 && o.z > b.z0 - o.r - 3 && o.z < b.z1 + o.r + 3) return false;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, rr = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2, d = Math.hypot(cx - lim.x, cz - lim.z);
    if (d + rr > lim.r - 6 && d - rr < lim.r + 6) return false; // not straddling the wall round the map
    return b;
  };
  const place = (pts, h, kind) => {
    const gs = pts.map(([x, z]) => terrainHeight(x, z));
    if (Math.max(...gs) - Math.min(...gs) > 2.5) return null; // not on the slope down from a raised road
    const b = fits(pts, kind === 'front' ? hw + 9 : hw + 13, kind);
    if (!b) return null;
    boxes.push(b);
    const inside = Math.hypot((b.x0 + b.x1) / 2 - lim.x, (b.z0 + b.z1) / 2 - lim.z) < lim.r;
    const r = building(pts, h, inside);
    if (inside) slab.push([pts, r.gy, r.gtop]);
    if (h > 55) blink.push(V(pts[0][0], r.top + 0.5, pts[0][1]), V(pts[2][0], r.top + 0.5, pts[2][1]));
    return r;
  };
  const floors = (lo, hi) => FLOOR * (lo + Math.floor(rnd() * (hi - lo + 1))) + 0.8; // whole floors and a parapet

  // ---- a row of buildings along each side of the circuit, fronts to the road ----
  let maccas = null; // (the plot kept for it: see below)
  const turn = samples.map((a, i) => { const b = samples[(i + 6) % N]; return Math.abs(a.th.x * b.th.z - a.th.z * b.th.x); });
  const gaps = track.gaps || [];
  const inGap = (side, i0, i1) => gaps.some(g => g.side === side && i1 >= g.a - 3 && i0 <= g.b + 3);
  for (const side of [1, -1]) {
    for (let i = 0; i < N;) {
      const w = BAY * (4 + Math.floor(rnd() * 5)), d = 12 + rnd() * 14, span = Math.ceil(w / 1.5);
      const c = (i + (span >> 1)) % N, s = samples[c];
      if (turn[i] > 0.04 || turn[(i + span) % N] > 0.04 || inGap(side, i, i + span)) { i += 2; continue; }
      const lat = hw + 9.6 + d / 2, cx = s.p.x + s.left.x * side * lat, cz = s.p.z + s.left.z * side * lat;
      const pts = footprint(cx, cz, d / 2, w / 2, Math.atan2(s.th.x, s.th.z));
      // The first plot past the start line is the Maccas'. A building goes up on it like any other, so the same
      // random numbers get used and the rest of the city comes out as it always has, and is then taken away again.
      const mark = !maccas && c >= 12 && c <= 150 ? [P.length, NR.length, UV.length, C.length, walls.length, blink.length, signs.length, boards.length] : null;
      const r = place(pts, floors(3, 16), 'front');
      if (!r) { i += 2; continue; }
      // neon over the shop on the ground floor, facing the road
      if (rnd() < 0.75) {
        const sw = Math.min(w - 1.5, 9 + rnd() * 5), y = r.gtop + 4 + rnd() * Math.min(4, r.top - r.gtop - 8.5);
        const f = lat - d / 2 - 0.14; // just off the front wall
        signs.push({ c: V(s.p.x + s.left.x * side * f, y, s.p.z + s.left.z * side * f), n: V(-s.left.x * side, 0, -s.left.z * side), w: sw });
      }
      // and now and then a billboard higher up
      if (r.top - r.gtop > 20 && w > 11 && rnd() < 0.4) {
        const bw = Math.min(w - 2, 12 + rnd() * 3), bh = bw * 0.3, y = r.gtop + 10.5 + bh / 2 + rnd() * Math.max(0, r.top - r.gtop - 13.5 - bh); // (a poster's shape)
        const f = lat - d / 2 - 0.45;
        boards.push({ c: V(s.p.x + s.left.x * side * f, y, s.p.z + s.left.z * side * f), n: V(-s.left.x * side, 0, -s.left.z * side), w: bw, h: bh });
      }
      if (mark) {
        P.length = mark[0]; NR.length = mark[1]; UV.length = mark[2]; C.length = mark[3]; walls.length = mark[4]; blink.length = mark[5]; signs.length = mark[6]; boards.length = mark[7];
        maccas = { cx, cz, ry: Math.atan2(s.th.x, s.th.z), side, d, w, y: r.gtop };
      }
      i += span + 2;
    }
  }
  // ---- then blocks on a grid, out past the wall round the map ----
  const PITCH = 56, reach = lim.r + 260;
  for (let gx = lim.x - reach; gx < lim.x + reach; gx += PITCH) for (let gz = lim.z - reach; gz < lim.z + reach; gz += PITCH) {
    if (Math.hypot(gx + 21.5 - lim.x, gz + 21.5 - lim.z) > reach) continue;
    const lots = rnd() < 0.24 ? [[gx + 21.5, gz + 21.5, 20.5, true]] : [[gx + 10, gz + 10, 10], [gx + 33, gz + 10, 10], [gx + 10, gz + 33, 10], [gx + 33, gz + 33, 10]];
    for (const [x, z, half, tower] of lots) {
      const hx = half - rnd() * 3, hz = half - rnd() * 3, near = 1 - Math.hypot(x - lim.x, z - lim.z) / reach;
      const h = tower ? FLOOR * (16 + Math.floor(rnd() * 22)) + 0.8 : floors(3, 7 + Math.round(near * 9));
      if (!place(footprint(x, z, hx, hz, 0), h, 'grid')) place(footprint(x, z, hx * 0.6, hz * 0.6, 0), h * 0.7, 'grid'); // a smaller one if it doesn't fit
    }
  }
  // ---- the Maccas, just past the start: the owner asked for one here, golden arches and all (drawn below, in
  // code, like the sponsors' boards: no picture file), with Jago serving at the drive-through window ----
  if (maccas) buildMaccas(track, maccas);
  // ---- and a skyline far off ----
  for (let k = 0; k < 70; k++) {
    const a = (k / 70) * 6.2832 + rnd() * 0.06, d = lim.r + 330 + rnd() * 600, hx = 14 + rnd() * 26, hz = 14 + rnd() * 26, bx = lim.x + Math.cos(a) * d, bz = lim.z + Math.sin(a) * d;
    const H = track.harbour, h = FLOOR * (20 + Math.floor(rnd() * 50)), ry = rnd() * 1.6;
    if (H && Math.hypot(bx - H.x, bz - H.z) < H.r + 60) continue; // not standing in the harbour
    building(footprint(bx, bz, hx, hz, ry), h, false);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(NR, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.computeBoundingSphere();
  const city = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: winMap, emissiveMap: winGlow, emissive: 0xffffff, vertexColors: true }));
  city.castShadow = city.receiveShadow = true;
  worldGroup.add(city);

  // pavements round the buildings inside the map
  const paveMat = new THREE.MeshLambertMaterial({ color: 0x5b606a, flatShading: true });
  slab.forEach(([pts, gy, gtop], k) => {
    // 1.2 m round each (less than half the narrowest alley, so no two overlap), each a centimetre or so higher than the last
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[1]), top = gtop + 0.12 + (k % 5) * 0.012, bot = gy - 0.8;
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(...xs) - Math.min(...xs) + 2.4, top - bot, Math.max(...zs) - Math.min(...zs) + 2.4), paveMat);
    m.position.set((Math.max(...xs) + Math.min(...xs)) / 2, (top + bot) / 2, (Math.max(...zs) + Math.min(...zs)) / 2);
    m.receiveShadow = true; worldGroup.add(m);
  });

  // ---- neon signs: one texture holds every word, all the signs are one mesh ----
  // (No CINEMA: the owner had that sign taken down, "just remove cinema". Its place in the list stays, empty, so that
  // every other sign keeps the word it had; a building that drew it has no sign.)
  const WORDS = ['NOODLES', 'HOTEL', 'ARCADE', 'PIZZA', 'OPEN 24/7', 'KARAOKE', 'DRIFT CLUB', '9MILE', 'SUSHI', 'DINER', 'CAFE', 'BAR', '', 'TACOS', 'RAMEN', 'BURGERS'];
  const NEON = ['#ff3d9a', '#3df2ff', '#ffe43d', '#7dff5a', '#ff8a3d', '#c77dff'];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  WORDS.forEach((w, k) => {
    const x = (k % 2) * 256 + 128, y = Math.floor(k / 2) * 64 + 33, col = NEON[k % NEON.length];
    ctx.font = `900 ${w.length > 7 ? 35 : 44}px "Segoe UI", Arial, sans-serif`;
    ctx.shadowColor = col; ctx.shadowBlur = 10; ctx.fillStyle = col;
    ctx.fillText(w, x, y); ctx.fillText(w, x, y);
    ctx.shadowBlur = 2; ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff4fa'; ctx.fillText(w, x, y); ctx.globalAlpha = 1; // the bright tube
  });
  const sp = [], suv = [];
  signs.forEach((g, k) => {
    const word = Math.floor(rnd() * WORDS.length), u0 = (word % 2) * 0.5, v1 = 1 - Math.floor(word / 2) / 8, v0 = v1 - 1 / 8;
    if (!WORDS[word]) return;
    const r = V(g.n.z, 0, -g.n.x).multiplyScalar(g.w / 2), up = V(0, g.w / 8, 0); // across the wall (reading left to right from the road), and up
    const c = [g.c.clone().sub(r).sub(up), g.c.clone().add(r).sub(up), g.c.clone().add(r).add(up), g.c.clone().sub(r).add(up)];
    const t = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v1], [u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { sp.push(c[i].x, c[i].y, c[i].z); suv.push(...t[i]); }
    void k;
  });
  if (sp.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
    const neon = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: cleanTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    neon.renderOrder = 2; worldGroup.add(neon);
  }

  // (The buildings along the circuit had billboards with the sponsors' posters on them: they came down with the
  // trackside ones. One random number each is still drawn, so everything after this comes out as it always has.)
  boards.forEach(() => { rnd(); });

  // ---- traffic: cars going round the blocks out past the wall round the map,
  // driving on the left, headlights on ----
  {
    const loops = [];
    for (let gx = lim.x - reach; gx < lim.x + reach; gx += PITCH) for (let gz = lim.z - reach; gz < lim.z + reach; gz += PITCH) {
      const x0 = gx - 3.5, x1 = gx + 46.5, z0 = gz - 3.5, z1 = gz + 46.5;
      const dNear = Math.hypot(clamp(lim.x, x0, x1) - lim.x, clamp(lim.z, z0, z1) - lim.z);
      const dFar = Math.max(...[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => Math.hypot(x - lim.x, z - lim.z)));
      if (dNear < lim.r + 12 || dFar > reach - 8) continue;
      // nothing standing in the lane round the block (its own buildings sit inside it)
      if (boxes.some(b => b.x0 < x1 + 2 && b.x1 > x0 - 2 && b.z0 < z1 + 2 && b.z1 > z0 - 2 && !(b.x0 > x0 + 2 && b.x1 < x1 - 2 && b.z0 > z0 + 2 && b.z1 < z1 - 2))) continue;
      if (occupied.some(o => o.r >= 10 && o.x > x0 - o.r && o.x < x1 + o.r && o.z > z0 - o.r && o.z < z1 + o.r)) continue; // nor round Sydney Tower or into the harbour
      loops.push({ x0, x1, z0, z1, d: dNear });
    }
    loops.sort((a, b) => a.d - b.d); loops.length = Math.min(loops.length, 60);
    // each loop as points about a metre apart: along each side with the block on
    // the left, and a quarter turn at each corner
    const RC = 5;
    const paths = loops.map(({ x0, x1, z0, z1 }) => {
      const pts = [];
      const line = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); };
      const arc = (cx, cz, a0) => { for (let k = 0; k < 8; k++) { const a = a0 - (k / 8) * Math.PI / 2; pts.push([cx + Math.cos(a) * RC, cz + Math.sin(a) * RC]); } };
      line(x1 - RC, z0, x0 + RC, z0); arc(x0 + RC, z0 + RC, -Math.PI / 2);
      line(x0, z0 + RC, x0, z1 - RC); arc(x0 + RC, z1 - RC, Math.PI);
      line(x0 + RC, z1, x1 - RC, z1); arc(x1 - RC, z1 - RC, Math.PI / 2);
      line(x1, z1 - RC, x1, z0 + RC); arc(x1 - RC, z0 + RC, 0);
      return pts.map(([x, z]) => [x, terrainHeight(x, z), z]);
    });
    const cars = [];
    paths.forEach((pts, k) => { for (let j = 0; j < 2; j++) cars.push({ pts, d: rnd() * pts.length, v: 9 + rnd() * 5 }); void k; });
    const n = cars.length;
    if (n) {
      const body = new THREE.Group();
      for (const [w, h, d, y, z, c] of [[1.8, 0.62, 4.2, 0.6, 0, 0xffffff], [1.6, 0.52, 2.1, 1.15, -0.3, 0x3a3f4a], [1.84, 0.32, 3.0, 0.22, 0, 0x16181d]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c, flatShading: true })); m.position.set(0, y, z); body.add(m);
      }
      mergeStatic(body);
      const COLS = [0xffd23f, 0xf6f2e8, 0xb9bdc5, 0xe6453a, 0x3d8bff, 0x2b2f38, 0xffd23f, 0x7a9494];
      const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.userData.dyn = true; worldGroup.add(m); return m; };
      const bodies = mk(body.children[0].geometry, mergedMat(THREE.FrontSide, 0));
      const heads = mk(new THREE.BoxGeometry(1.5, 0.16, 0.06).translate(0, 0.72, 2.11), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }));
      const tails = mk(new THREE.BoxGeometry(1.6, 0.18, 0.06).translate(0, 0.74, -2.11), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      const pools = mk(new THREE.PlaneGeometry(5.5, 12).rotateX(-Math.PI / 2).translate(0, 0.1, 8.5), lightMat(glowTexture(128, 128, 64, 64, 64), 0xffe6b0, 0.75));
      cars.forEach((c, i) => bodies.setColorAt(i, new THREE.Color(COLS[i % COLS.length])));
      const M = new THREE.Matrix4();
      const tick = (t, dt = 0) => {
        cars.forEach((c, i) => {
          const L = c.pts.length; c.d = (c.d + c.v * Math.min(dt || 0, 0.1)) % L;
          const k = Math.floor(c.d), f = c.d - k, a = c.pts[k], b = c.pts[(k + 1) % L];
          M.makeRotationY(Math.atan2(b[0] - a[0], b[2] - a[2]));
          M.setPosition(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
          bodies.setMatrixAt(i, M); heads.setMatrixAt(i, M); tails.setMatrixAt(i, M); pools.setMatrixAt(i, M);
        });
        for (const m of [bodies, heads, tails, pools]) m.instanceMatrix.needsUpdate = true;
      };
      tick(0); anim.push(tick);
    }
  }

  // ---- crowds behind the walls, up on a kerb so they can see over ----
  if (track.wallAt) {
    const crowd = makePeople(440, rnd), IN = hw + 3.4, kerb = new THREE.MeshLambertMaterial({ color: 0x4a4f5a, flatShading: true });
    const nearLamp = (i, side) => { const k = Math.round(i / 30); return Math.abs(i - k * 30) < 3 && (k % 2 ? 1 : -1) === side; }; // where buildNight puts its lamps
    for (const side of [1, -1]) {
      const has = track.wallAt[side];
      for (let i = 12; i < N - 12; i += 24) {
        if (rnd() < 0.35) continue;
        let ok = true;
        for (let j = i - 6; j <= i + 6 && ok; j++) ok = !!has[j] && track.vergeDrop[j] < 1.2;
        if (!ok) continue;
        for (let j = i - 5; j <= i + 5; j++) {
          const s = samples[j], rot = Math.atan2(-s.left.x * side, -s.left.z * side), at = (lat) => [s.p.x + s.left.x * side * lat, s.p.z + s.left.z * side * lat];
          const [kx, kz] = at(IN + 1.7), g = terrainHeight(kx, kz), top = s.p.y + 0.05;
          if (top - g > 1.5) continue;
          const k = new THREE.Mesh(new THREE.BoxGeometry(2.2, top - g + 0.3, 1.6), kerb);
          k.position.set(kx, (top + g - 0.3) / 2, kz); k.rotation.y = Math.atan2(s.th.x, s.th.z); k.receiveShadow = true; worldGroup.add(k);
          if (nearLamp(j, side)) continue;
          for (const row of [0, 1]) {
            if (rnd() < 0.2) continue;
            const [x, z] = at(IN + 1.15 + row * 0.95);
            if (!isFree(track, x, z, 0.3, hw + 4.2)) continue;
            crowd.add(x + s.th.x * row * 0.5, top, z + s.th.z * row * 0.5, rot, undefined, 1.4);
            claim(x, z, 0.3);
          }
        }
      }
    }
    crowd.finish();
  }

  // ---- red lights blinking on the tall roofs ----
  if (blink.length) {
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2a2a }), blink.length);
    blink.forEach((p, k) => { lights.setMatrixAt(k, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)); });
    lights.userData.dyn = true; worldGroup.add(lights);
    anim.push((t) => { lights.visible = t % 1.5 < 0.75; });
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
  if (isDriftKing(name)) colorIdx = KING; // (whatever colour they picked: the champion drives the champion's car)
  const color = CAR_COLORS[colorIdx] ?? CAR_COLORS[0];
  const king = colorIdx === KING;
  const livery = colorIdx === LIVERY; // racing green with lime trim
  const T = TEAM[colorIdx] || null;   // the colour's livery (none for brown, the secret livery and the Drift King's)
  const lightCar = king || luminance(color) > 0.6; // a pale car: its lettering and trim are dark
  const L = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const K = {
    g, lightCar, livery, king,
    body: L(color), accent: L(livery || king ? 0x16191f : T?.accent ?? (lightCar ? 0x1d2230 : 0xf6f2e8)), dark: L(0x1d2230), carbon: L(0x2b303b),
    tyre: L(0x15181f), rim: L(livery ? 0x1d2230 : king ? 0xd9a520 : T?.rim ?? 0xb9c0cc), glass: L(0x24303f), flap: L(0xb3261e),
    helmet: L(livery ? 0xd8e81c : king ? 0xb3261e : T?.helmet ?? (lightCar ? 0xff8a3d : 0xffd23f)), stripe: L(livery ? 0xc6f432 : T?.stripe ?? STRIPES[colorIdx] ?? 0xffffff),
    brake: new THREE.MeshLambertMaterial({ color: 0x6a1212, emissive: 0x000000, flatShading: true }),
    lamp: new THREE.MeshLambertMaterial({ color: 0xfff6cf, emissive: 0x6b6440, flatShading: true }),
  };
  // the livery's other colours (paintLivery, buildOpenBody)
  K.second = T ? L(T.second) : K.carbon; K.plain = !!T && T.second === color; K.plateInk = T && luminance(T.second) > 0.6 ? '#1d2230' : '#f2f5f0';
  K.tip = T?.tip != null ? L(T.tip) : K.stripe; K.air = T?.air != null ? L(T.air) : null; K.noseBand = T?.nose != null ? L(T.nose) : null; K.wing = T?.wing != null ? L(T.wing) : K.body;
  K.add = (geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; g.add(m); return m;
  };
  K.box = (w, h, d, mat, x, y, z, shadow = true) => K.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);
  K.rod = (a, b, th, mat) => { const m = strut(V(...a), V(...b), th, th, mat); g.add(m); return m; };

  const wheelSpec = cls === 'rally' ? buildRallyBody(K) : cls === 'camry' ? buildCamryBody(K) : buildOpenBody(K);
  if (king) { // the crown, on the highest part of the car behind the driver's head: a gold band, five points, a jewel on each
    const [y, z] = cls === 'rally' ? [1.5, -0.6] : cls === 'camry' ? [1.48, -0.35] : [1.36, -0.34], gold = L(0xffcc33);
    K.box(0.34, 0.08, 0.34, gold, 0, y + 0.04, z, false);
    for (const [px, pz, h] of [[-0.135, -0.135, 0.15], [0.135, -0.135, 0.15], [-0.135, 0.135, 0.15], [0.135, 0.135, 0.15], [0, 0, 0.23]]) {
      K.add(new THREE.ConeGeometry(0.055, h, 4), gold, px, y + 0.08 + h / 2, z + pz, false).rotation.y = Math.PI / 4;
      K.box(0.04, 0.04, 0.04, K.flap, px, y + 0.08 + h + 0.012, z + pz, false);
    }
  }
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
  // Your own open car is drawn twice from the cockpit (renderFrame): once with everything else, then again on its
  // own with the camera's near plane close in. Layer 1 is that second drawing.
  if (cockpit && !inside) g.traverse((o) => o.layers.enable(1));
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
  add(taperBox(0.21, 0.137, 0.22, [0.7, 0.7, -0.01], null), K.livery ? dark : K.tip, 0, 0.35, 3.36); // nose tip, in the stripe colour (or the livery's own)
  // front wing
  box(2.0, 0.045, 0.5, carbon, 0, 0.15, 3.15);
  for (const sx of [-1, 1]) {
    box(0.78, 0.04, 0.3, K.livery ? carbon : K.wing, sx * 0.6, 0.24, 3.02).rotation.x = -0.3;
    box(0.78, 0.035, 0.22, accent, sx * 0.6, 0.33, 2.9).rotation.x = -0.45;
    add(taperBox(0.05, 0.3, 0.62, [1, 0.6, -0.05], null), body, sx * 1.0, 0.27, 3.12);
    box(0.05, 0.16, 0.2, dark, sx * 0.09, 0.25, 3.18, false);              // wing pylons under the nose
  }
  // sidepods, intakes, floor fences
  for (const sx of [-1, 1]) {
    add(taperBox(0.62, 0.44, 1.45, null, [0.35, 0.5, -0.028]), body, sx * 0.7, 0.45, -0.375);
    box(0.46, 0.24, 0.05, dark, sx * 0.72, 0.5, 0.36, false);
    box(0.04, 0.26, 0.55, carbon, sx * 0.62, 0.33, 0.8, false);
    box(0.12, 0.2, 0.43, body, sx * 0.3, 0.84, 0.115, false);              // cockpit sides, up to the engine cover
    box(0.16, 0.09, 0.06, accent, sx * 0.56, 0.92, 0.7, false);            // mirror
    rod([sx * 0.3, 0.72, 0.7], [sx * 0.52, 0.9, 0.7], 0.035, dark);
  }
  // engine cover, and on it one spine: the airbox over the driver's head running
  // back into the fin, narrowing and dropping as it goes, sitting on the cover
  // all the way (the cover's top falls from 1.05 m to 0.66 m), with the intake
  // and the camera on it
  add(taperBox(0.56, 0.66, 2.1, null, [0.28, 0.3, -0.18]), body, 0, 0.72, -1.15);
  add(taperBox(0.34, 0.32, 2.0, null, [0.1, 0.469, -0.475]), body, 0, 1.2, -1.075);
  box(0.24, 0.2, 0.04, dark, 0, 1.22, -0.07, false);
  box(0.08, 0.07, 0.24, K.stripe, 0, 1.327, -0.3, false).rotation.x = -0.273; // camera, in the stripe colour
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
  box(1.16, 0.045, 0.3, K.livery ? carbon : K.wing, 0, 1.36, -2.4).rotation.x = 0.4;
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
  // dark writing, or light on a dark car colour (the black car's tag was unreadable)
  const [r, g, b] = [1, 3, 5].map(k => parseInt(color.slice(k, k + 2), 16));
  ctx.fillStyle = 0.2126 * r + 0.7152 * g + 0.0722 * b < 100 ? '#f6f2e8' : '#1d2230';
  ctx.fillText(text, 128, 33);
  const tex = cleanTexture(c);
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
  if (app.recGhost) { carsGroup.remove(app.recGhost.group); disposeTree(app.recGhost.group); app.recGhost = null; }
}

// Polytrack mode's rolling start: the grid moved well back from the line, to where a straight begins between 420
// and 600 m before it (480 if none does), so a car comes to its first lap the way it does to every other: through
// the last corners at racing speed. (It used to be 200 to 320 m back, on the last straight: from a standstill
// there a car crossed the line slower than on a flying lap, as a player pointed out.) Never more than 45% of a
// lap back: the lap starts once the car is in the first half of it. Pairs of cars 6 m apart, as on a grid.
function rollSlot(track, slot) {
  const { samples, N, hw } = track, step = track.length / N;
  const turn = (i) => { const a = samples[((i % N) + N) % N].th, b = samples[(((i + 14) % N) + N) % N].th; return Math.abs(a.x * b.z - a.z * b.x); };
  const most = Math.floor(N * 0.45) - 40, lo = Math.min(most, Math.round(420 / step)), hi = Math.min(most, Math.round(600 / step));
  let back = Math.min(most, Math.round(480 / step));
  for (let b = lo; b <= hi; b++) if (turn(-b - 16) >= 0.05 && turn(-b) < 0.05 && turn(-b + 14) < 0.05) { back = b; break; } // a bend just behind, 40 m of straight ahead
  const idx = (N - back - Math.floor(slot / 2) * 4 + N * 2) % N, s = samples[idx];
  const pos = s.p.clone().addScaledVector(s.left, (slot % 2 === 0 ? -1 : 1) * hw * 0.45);
  pos.y += 0.05;
  return { pos, heading: Math.atan2(s.th.x, s.th.z), idx };
}

function spawnLocal(slot, rolling) {
  const { pos, heading, idx } = (rolling ? rollSlot : startSlot)(app.track, slot);
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
  // (every car's power, drive and top speed went up 6% in 3.10 and another
  // 12% in 3.12; the server's TOP_SPEED goes up with them)
  power: 250000,     // W, engine power at the wheels
  maxDrive: 9500,    // N, torque limit at low speed
  topSpeed: 71.2,    // m/s, soft rev limiter (~256 km/h; drag holds it to about 240 flat out)
  reverseSpeed: 10.5, // m/s (about 38 km/h)
  brakeForce: 39000, // N, full pedal (ABS below keeps it within grip)
  brakeGrip: 1.15,   // the tyres' grip under braking, on top of the surface's: 15% more since 3.13, for the faster cars (corners and traction unchanged)
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
  latGrip: 1.39,     // sideways grip on top of the surface's (1 for the others): corners much harder; braking and traction unchanged. (1.35 until 3.80: players found the car understeered, "make the front end sharper", and the owner asked for a snappier front "but only by a little": 3% more bite at the front, the rear as it was)
  latGripRear: 1.5,  // a little more at the back, so the tail stays planted when you flick it left and right
  steerGain: 2.0,    // how much lock it asks for at speed (1.7 for the others)
  steerRate: 13.5,   // how fast the wheels turn when you steer (7 for the others; 12 until 3.80)
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
  power: 279000,
  maxDrive: 12400,
  topSpeed: 61.7,
  reverseSpeed: 10.5,
  brakeForce: 34500,
  brakeGrip: 1.15,
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
  power: 166000,
  maxDrive: 8050,
  topSpeed: 54.7,
  reverseSpeed: 9.5,
  brakeForce: 28750,
  brakeGrip: 1.15,
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
  app.camMode = app.camPref || camFor(cls); // (the camera picked in Settings or with its key, or else the one that suits the car)
}

function tyreForce(surf, Fz, alpha) {
  return -surf.mu * Fz * Math.sin(surf.C * Math.atan(surf.B * alpha));
}

// Going into a corner flat out and letting the wall turn you was quicker than
// braking. So a big hit on a wall slows the car for a second, like driving on
// the grass: the grass's rolling resistance, and the engine pulling only 60%
// as hard. A big hit is at least 18 m/s (65 km/h) straight into the wall, at
// a steep angle (at least 30% of the car's speed, about 17 degrees): brushing
// or tapping a wall isn't, and posts, trees and the like don't count.
// (3.9 to 3.14 deleted the lap instead; that was too harsh.)
const WALL_SLOW_HIT = 18, WALL_SLOW_ANGLE = 0.3, WALL_SLOW_MS = 1000, WALL_SLOW_PULL = 0.6;
function noteWallHit(car, impact, speed) {
  if (impact >= WALL_SLOW_HIT && impact >= WALL_SLOW_ANGLE * speed) car.slowUntil = performance.now() + WALL_SLOW_MS;
}

// Sector times in Polytrack mode: the lap in three, split at gates 2 and 4.
// The sector you're in counts up as you drive; one you've finished shows its
// time in purple if it's the best ever on this track, green if it's the best
// this session (anyone's), yellow if it's slower. The lap you've just finished
// stays up for a moment after the line.
function sectorDone(n, t) {
  const S = app.sec; t = Math.round(t); // whole milliseconds, as the server keeps them
  if (!S || !(t > 0)) return;
  S.cur[n] = t;
  if (S.session[n] == null || t < S.session[n]) { S.session[n] = t; send({ t: 'sector', n, time: t }); }
}
function newLapSectors(finished) {
  const S = app.sec; if (!S) return;
  S.prev = finished ? [...S.cur] : [null, null, null]; S.prevUntil = finished ? performance.now() + 2500 : 0;
  S.cur = [null, null, null];
}
function sectorColour(n, t) {
  // purple only for the fastest anyone has done: the record kept on the server,
  // or the best this session where that's quicker (a record only arrives with
  // a finished lap, so until there is one, a slower sector isn't purple)
  const S = app.sec, session = S.session[n] ?? Infinity, ever = Math.min(app.secRec[String(app.trackId)]?.[n]?.ms ?? Infinity, session);
  return t <= ever ? 'purple' : t <= session ? 'green' : 'yellow';
}
function renderSectors(now) {
  const S = app.sec, el = $('#sectors'), car = app.local; if (!S || !el || !car) return;
  const running = !car.armed && car.lapStart > 0;
  const at = S.cur[0] == null ? 0 : S.cur[1] == null ? 1 : 2; // the sector you're in
  [...el.children].forEach((pill, n) => {
    let text = '--', cls = '';
    if (S.cur[n] != null) { text = (S.cur[n] / 1000).toFixed(2); cls = sectorColour(n, S.cur[n]); }
    else if (running && n === at) { text = (Math.max(0, now - car.lapStart - (S.cur[0] ?? 0) - (S.cur[1] ?? 0)) / 1000).toFixed(1); cls = 'run'; }
    else if (now < S.prevUntil && S.prev[n] != null) { text = (S.prev[n] / 1000).toFixed(2); cls = sectorColour(n, S.prev[n]); }
    text = `S${n + 1} ${text}`;
    if (pill.textContent !== text) pill.textContent = text;
    if (pill.className !== cls) pill.className = cls;
  });
}

// Polytrack mode: back to your place on the grid for a fresh run. Your lap
// clock (and your ghost) wait at the start line until you cross it; the
// server restarts its clock for your lap then too, so the lap still counts.
function restartRun() {
  const car = app.local;
  if (!car || app.mode !== 'quali' || app.phase !== 'racing' || app.menuOpen) return;
  const slot = Math.max(0, gridOrder(app.room?.grid).findIndex(p => p.id === app.myId));
  const { pos, heading, idx } = rollSlot(app.track, slot);
  car.pos.copy(pos); car.h = heading;
  car.vx = car.vz = car.vy = car.speed = car.yawRate = car.steerAngle = car.ax = 0;
  car.airborne = false; car.stopTime = 0;
  car.idx = car.lastIdx = car.lastCpIdx = idx; // R before the first gate brings you back here
  car.nextCp = 1; car.missedGate = false; car.offTrackTimer = 0; car.fellTimer = 0; car.onTrack = true;
  car.armed = true; car.lapStart = 0;
  app.rec = []; app.recFrom = null; app.dI = 0; app.ghostI = 0; app.ghostDelta = null;
  newLapSectors(false);
  camInit = false;
  raceToast('Fresh run: your time starts at the line', 1800);
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
  const throttle = canDrive && held('up') ? 1 : 0;
  const brake = canDrive && held('down') ? 1 : 0;
  const steerIn = canDrive ? (held('left') ? 1 : 0) - (held('right') ? 1 : 0) : 0;
  const handbrake = canDrive && held('hand');

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
    const hF = groundAt(car.pos.x + fx * 1.5, car.pos.z + fz * 1.5, car.pos.y), hB = groundAt(car.pos.x - fx * 1.5, car.pos.z - fz * 1.5, car.pos.y);
    const hL = groundAt(car.pos.x + lx, car.pos.z + lz, car.pos.y), hR = groundAt(car.pos.x - lx, car.pos.z - lz, car.pos.y);
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
    const slowed = performance.now() < (car.slowUntil || 0); // just had a big hit on a wall
    if (throttle) {
      // the engine pushes forward whichever way the car is rolling, so going
      // from reverse back to forward is quick (it used to do nothing until the
      // car had coasted to a stop on its own)
      const powerLimited = CAR.power / Math.max(speedAbs, 4);
      Fdrive = Math.min(CAR.maxDrive, powerLimited) * clamp((CAR.topSpeed - vLong) / 6, 0, 1) * (slowed ? WALL_SLOW_PULL : 1);
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
    const bg = brake && vLong > 0.6 ? (CAR.brakeGrip || 1) : 1; // braking grip: more than the tyres give for anything else
    const frontLimit = capF * bg * (0.94 - 0.3 * Math.abs(steerIn)), rearLimit = capR * bg * 0.6;
    if (FbrakeF < -frontLimit) FbrakeF = -frontLimit;
    if (FbrakeR < -rearLimit) FbrakeR = -rearLimit;
    let FxF = FbrakeF + FdF, FxR = FdR + FbrakeR + Freverse;
    // latGrip widens the grip budget sideways only (an ellipse), so cornering
    // grip can go up without changing braking or traction
    const lg = CAR.latGrip || 1, lgR = CAR.latGripRear || lg;
    let FyF = tyreForce(surf, Fzf, alphaF) * lg;
    let FyR = tyreForce(surf, Fzr, alphaR) * lgR;
    if (handbrake) { FyR *= CAR.hbRearGrip ?? 0.25; locked = true; } // locked rears can't hold the corner
    const bxF = FxF < 0 ? bg : 1, bxR = FxR < 0 ? bg : 1; // (the grip ellipse is wider along the car while braking)
    const totF = Math.hypot(FxF / bxF, FyF / lg), totR = Math.hypot(FxR / bxR, FyR / lgR);
    if (totF > capF) { const s = capF / totF; FxF *= s; FyF *= s * 0.92; }
    if (totR > capR) { const s = capR / totR; FxR *= s; FyR *= s * 0.92; }

    // resistances and gravity along the slope
    const Froll = -(slowed ? Math.max(surf.roll, CAR.surf.grass.roll) : surf.roll) * m * g * clamp(vLong / 2, -1, 1);
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
  const vIn = Math.hypot(car.vx, car.vz); // speed going into anything this step
  car.wallHit = 0;
  for (let k = 0; k < steps; k++) {
    car.pos.x += car.vx * dt / steps;
    car.pos.z += car.vz * dt / steps;
    bump = Math.max(bump, collideWalls(car));
  }
  noteWallHit(car, car.wallHit, vIn); // (walls only: not posts, trees or other cars)
  bump = Math.max(bump, collideCars(car));
  if (bump > 0) {
    car.speed = car.vx * fx2 + car.vz * fz2;
    car.yawRate *= 0.8;
    if (bump > 3 && performance.now() - (car.lastBump || 0) > 250) { car.lastBump = performance.now(); beep(70 + Math.random() * 30, 0.16, Math.min(0.35, bump * 0.03)); }
  }

  // ---- wading through the lake or the sea: heavy drag and a lot of spray ----
  // (out at sea the car wades along at WADE deep, so the deeper it is the slower)
  const lake = app.track.lake, sea = app.track.sea;
  const inLake = !!lake && (car.pos.x - lake.x) ** 2 + (car.pos.z - lake.z) ** 2 < lake.r * lake.r && car.pos.y < lake.level - 0.12;
  const inSea = !!sea && car.pos.y < sea.level - 0.12;
  car.inWater = !car.airborne && (inLake || inSea);
  if (car.inWater) {
    const drag = Math.exp(-dt * (inSea ? 1.3 + (sea.level - car.pos.y) * 0.9 : 1.3));
    car.vx *= drag; car.vz *= drag;
    if (speedAbs > 2) { const y = car.pos.y; car.pos.y = inSea ? sea.level : lake.level; emitDust(car, clamp(speedAbs / 14, 0.3, 1), 'spray'); car.pos.y = y; }
  }

  // ---- vertical ----
  // Where is the surface under the car now that it has moved? (Reading it
  // from where the car was at the start of the frame left it a frame behind.)
  // Off the road the car rides the terrain; across the verge skirt it eases
  // from road height down to the grass, matching what's drawn.
  const vloc = locate(app.track, car.pos, car.idx, 30);
  const onRoadNow = !!vloc && Math.abs(vloc.lateral) <= app.track.hw + 1.6 && Math.abs(vloc.along) < 2.5 && Math.abs(vloc.y - car.pos.y) < 3.5;
  let groundY = groundAt(car.pos.x, car.pos.z, car.pos.y);
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
  if (loc && app.phase === 'racing' && !app.finished) {
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
        if (app.mode === 'quali' && !car.armed && car.lapStart && (car.nextCp === 2 || car.nextCp === 4)) { // the ends of sectors 1 and 2
          const so = performance.now() - car.lapStart;
          if (car.nextCp === 2) sectorDone(0, so); else if (app.sec?.cur[0] != null) sectorDone(1, so - app.sec.cur[0]);
        }
        if (car.nextCp === 0) {
          const nowP = performance.now();
          const lapTime = nowP - (car.lapStart || raceStartPerf());
          if (app.mode === 'quali' && app.sec?.cur[0] != null && app.sec.cur[1] != null) sectorDone(2, lapTime - app.sec.cur[0] - app.sec.cur[1]);
          const lapSec = app.mode === 'quali' && app.sec?.cur.every(x => x != null) ? [...app.sec.cur] : null;
          newLapSectors(true);
          car.lapStart = nowP;
          if (!app.bestLap || lapTime < app.bestLap) app.bestLap = lapTime;
          app.myLaps.push(lapTime);
          const lapRec = app.rec, bestEver = app.mode === 'quali' && (!app.allBest || lapTime < app.allBest);
          if (bestEver) { app.allBest = lapTime; app.ghostLap = lapRec; saveOwnBest(lapTime, lapRec); } // (your best ever here: the ghost from now on, and kept for next time)
          app.rec = []; app.recFrom = nowP; app.dI = 0;
          car.lap++;
          const path = app.mode === 'quali' && lapTime === app.bestLap ? packPath(lapRec) : null; // how it was driven, with your best lap: the leaderboard keeps it if the lap gets on
          send({ t: 'lap', time: Math.round(lapTime), sec: lapSec, ...(path ? { path } : {}) }); // for the leaderboard (and the best laps and sectors, in Polytrack mode)
          if (path) app.sentPath = { k: String(app.trackId), ms: Math.round(lapTime), p: path }; // (kept, with the server's signature, if it gets onto the board: 'pathkept')
          notePersonalBest(lapTime);
          if (app.mode === 'quali') raceToast(`Lap  ${fmtTime(lapTime)}${bestEver ? '  ★ your best ever' : lapTime === app.bestLap ? '  ★ best today' : ''}`, 2500);
          else if (car.lap > app.laps) finishRace();
          else raceToast(`Lap ${car.lap - 1}  ${fmtTime(lapTime)}${lapTime === app.bestLap && car.lap > 2 ? '  ★ best' : ''}`, 2200);
        }
        car.nextCp = (car.nextCp + 1) % CHECKPOINT_COUNT;
      }
    }
    // gone well past the next gate without going through it? The warning
    // stays up until you go back through it, or press R.
    // (Not on the run-up to a Polytrack lap: that starts far enough back to look like a lap with its first gate missed.)
    const past = (car.idx - app.track.cps[car.nextCp] + N) % N;
    if (past > 12 && past < N * 0.6 && !car.armed) car.missedGate = true;
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
try { const c = localStorage.getItem('dc-cam'); app.camPref = c === 'cockpit' || c === 'chase' ? c : null; } catch { app.camPref = null; } // the camera you chose, if you ever did
app.camMode = app.camPref || camFor('open');
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
    // A closed car's body comes within a hand's breadth of the eye, so the near plane has to be close in. The
    // open car is drawn a second time on its own for that (renderFrame), and the world gets the chase camera's
    // near plane: four times the depth to tell far-off things apart with, which is what stops them flickering.
    camera.near = car.mesh.interior ? COCKPIT_NEAR : 0.5;
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
  camPos.y = Math.max(camPos.y, groundAt(camPos.x, camPos.z, camPos.y) + 2.5); // (above the waves at sea, and a roof it's over)
  camera.position.lerp(camPos, camInit ? 1 - Math.exp(-dt * 7) : 1);
  camTarget.copy(car.pos).addScaledVector(fwd, 5).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(camTarget);
  camera.fov = lerp(camera.fov, 68 + speedK * 16, 1 - Math.exp(-dt * 4));
  camera.updateProjectionMatrix();
  camInit = true;
}

// ---------------------------------------------------------------------------
// a newer version
// ---------------------------------------------------------------------------
// A tab left open keeps running the game as it was when the tab was opened. The server says which version it is
// whenever a tab connects, and every tab reconnects after an update, because updating restarts the server: if
// the server's version is newer than this tab's, a notice with a Refresh button stays up on the menus (not
// while driving, or during the podium scene) until it's pressed. The tab says its own version too, first thing,
// so the server knows the tab looks after this itself: tabs from before 3.57 can't, and are sent the reminder
// as a message to pop up.
// Where the notice goes: on the home screen, above the What's new button; in the lobby, under the room code and
// the racers (measured, because the list of racers grows); with the results, top centre. Each is clear of the
// panels at every window size a laptop has.
const VERSION = UPDATES[0].v;
const vnum = (v) => { const [a, b = 0] = String(v).split('.').map(Number); return a * 1000 + b; }; // (3.9 comes before 3.16)
function onVersion(v) {
  app.stale = typeof v === 'string' && vnum(v) > vnum(VERSION); // (anything that isn't a version, or isn't newer: no notice)
  showStale();
}
function showStale() {
  if (!app.stale && !app.staleAt) return; // (up to date, and no notice to take down: nearly always)
  const quiet = !app.stale || app.phase === 'countdown' || app.phase === 'racing' || $('#screen-race').classList.contains('podium-on');
  const at = quiet ? '' : app.phase === 'home' || app.phase === 'lobby' ? app.phase : 'results', el = $('#update-note');
  if (at !== (app.staleAt || '')) { app.staleAt = at; el.classList.toggle('hidden', !at); el.dataset.at = at; el.style.top = ''; }
  if (at === 'lobby') { const y = Math.round($('.lobby-top').getBoundingClientRect().bottom + 10) + 'px'; if (el.style.top !== y) el.style.top = y; }
}

// ---------------------------------------------------------------------------
// networking
// ---------------------------------------------------------------------------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  app.ws = ws;
  ws.onopen = () => {
    ws.send(JSON.stringify({ t: 'ver', v: VERSION })); // (before anything else: see "a newer version")
    $('#btn-create').disabled = false; $('#btn-join').disabled = false;
    // our copy of the leaderboard: fills it back in if the server has restarted
    const seed = JSON.stringify({ t: 'lbseed', boards: app.lbKeep, sec: app.secKeep });
    if (seed.length > 30 && seed.length < 12000) ws.send(seed);
    sendVote(); // our answer to the vote that's on, again: the server may have forgotten it
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

// ---- the vote (POLL in updates.js). Asked when the game is opened, until this browser has answered; then the
// count is shown. The browser makes up an id for itself and keeps it with its answer, and sends the answer every
// time it connects (a server that has restarted without its database gets the votes back that way).
const voteKey = () => 'dc-vote-' + POLL.id;
const voter = () => {
  try {
    let id = localStorage.getItem('dc-voter');
    if (!/^[A-Za-z0-9_-]{12,40}$/.test(id || '')) { id = [...crypto.getRandomValues(new Uint8Array(15))].map((b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join(''); localStorage.setItem('dc-voter', id); }
    return id;
  } catch { return (app.voterId ??= 'tab' + String(Math.random()).slice(2, 14) + String(Math.random()).slice(2, 8)); } // (no storage: one for this tab)
};
function myVote() { if (!POLL) return ''; try { const c = localStorage.getItem(voteKey()) || app.voted || ''; return POLL.options.some(([k]) => k === c) ? c : ''; } catch { return app.voted || ''; } }
function sendVote() { const c = myVote(); if (c) send({ t: 'vote', poll: POLL.id, who: voter(), c }); }
function renderPoll() {
  if (!POLL) return;
  const mine = myVote(), n = app.pollCount;
  $('#poll-title').textContent = POLL.title; $('#poll-text').textContent = POLL.text;
  $('#poll-options').innerHTML = mine
    ? POLL.options.map(([k, label]) => `<div class="poll-count${k === mine ? ' mine' : ''}">${esc(label)}${k === mine ? '<small>Your vote</small>' : ''}<b>${n && Number.isInteger(n[k]) ? Math.max(n[k], k === mine ? 1 : 0) : k === mine ? 1 : '…'}</b></div>`).join('')
    : POLL.options.map(([k, label]) => `<button class="btn" data-vote="${esc(k)}">${esc(label)}</button>`).join(''); // (all alike: neither answer is the highlighted one)
  $('#btn-poll-close').classList.toggle('hidden', !mine);
}
function setupPoll() {
  if (!POLL) return;
  $('#poll-options').addEventListener('click', (e) => {
    const k = e.target.closest('[data-vote]')?.dataset.vote;
    if (!k || myVote()) return;
    app.voted = k; try { localStorage.setItem(voteKey(), k); } catch {}
    sendVote(); renderPoll();
  });
  $('#btn-poll-close').addEventListener('click', () => $('#poll').classList.add('hidden'));
  renderPoll();
  if (!myVote()) $('#poll').classList.remove('hidden'); // asked on opening the game, until answered
}

function handle(msg) {
  switch (msg.t) {
    case 'error': toast(msg.msg); break;
    case 'ver': onVersion(msg.v); break;
    case 'poll': if (POLL && msg.id === POLL.id && msg.n && typeof msg.n === 'object') { app.pollCount = msg.n; renderPoll(); } break;
    case 'joined':
      app.myId = msg.id;
      if (typeof msg.name === 'string' && msg.name !== app.name) {
        app.name = msg.name; $('#name').value = msg.name;
        try { localStorage.setItem('dc-name', msg.name); } catch {}
        toast(`That name isn't allowed, so you're racing as ${msg.name}.`);
      } else if (app.numTyped != null && msg.num != null && msg.num !== app.numTyped) {
        toast(`Someone here already has number ${app.numTyped}, so you're number ${msg.num}.`);
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
    case 'sector': if (app.sec && msg.n >= 0 && msg.n < 3 && (app.sec.session[msg.n] == null || msg.time < app.sec.session[msg.n])) app.sec.session[msg.n] = msg.time; break;
    case 'lbs': app.boards = msg.boards && typeof msg.boards === 'object' ? msg.boards : {}; keepBoards(app.boards); boardsChanged(); app.secRec = msg.sec && typeof msg.sec === 'object' ? msg.sec : {}; keepSectors(app.secRec); handBackLines(); break;
    case 'srec': if (typeof msg.k === 'string' && Array.isArray(msg.list)) { app.secRec[msg.k] = msg.list; keepSectors({ [msg.k]: msg.list }); } break;
    case 'lb': if (typeof msg.k === 'string') { app.boards[msg.k] = Array.isArray(msg.list) ? msg.list : []; keepBoards({ [msg.k]: app.boards[msg.k] }); boardsChanged(msg.k); wantRecordGhost(); handBackLines(); } break;
    case 'path': onPath(msg); break;
    case 'pathkept': if (app.sentPath && msg.k === app.sentPath.k && msg.ms === app.sentPath.ms) keepLine(msg.k, app.name, msg.ms, app.sentPath.p, msg.s, true); break;
    case 'record': {
      const where = TRACKS[msg.track]?.short || 'this track';
      if (msg.id === app.myId) raceToast(msg.place === 1 ? `New track record! ${fmtTime(msg.time)}` : `#${msg.place} on the ${where} leaderboard! ${fmtTime(msg.time)}`, 3500);
      else if (msg.place === 1) raceToast(`${msg.name} set a new track record: ${fmtTime(msg.time)}`, 3000);
      break;
    }
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
  app.myPlace = 0;
  app.bests = new Map();
  app.myLaps = [];
  app.rec = []; app.ghostLap = null; app.recFrom = null; app.dI = 0; app.ghostDelta = null;
  app.recLap = null; app.recKey = null; app.recI = 0; wantRecordGhost(); // (the record holder's ghost, if the leaderboard has their lap's path)
  app.joinedRaceAt = performance.now();
  $('#hud-time-label').textContent = app.mode === 'quali' ? 'Lap time' : 'Time';
  if (worldStale(msg.trackId, msg.car)) buildWorld(msg.trackId, msg.car || 'open');
  setCarClass(msg.car);
  clearCars();
  // A new race: everyone in the room is in it. (Only someone joining part-way
  // through, who gets msg.spectate, keeps the others' spectator flags.)
  if (!msg.spectate) for (const p of app.room.players) delete p.spec;
  const slot = Math.max(0, gridOrder(msg.grid).findIndex(p => p.id === app.myId));
  spawnLocal(slot, app.mode === 'quali');
  if (app.mode === 'quali') { app.local.armed = true; app.local.lastCpIdx = app.local.idx; } // the clock starts at the line
  app.sec = { cur: [null, null, null], prev: [null, null, null], prevUntil: 0, session: (msg.sectors || [null, null, null]).map(b => (b ? b.time : null)) };
  for (const p of app.room.players) if (p.id !== app.myId) ensureRemote(p);
  app.phase = 'countdown';
  app.bestLap = 0;
  app.allBest = 0;
  if (app.mode === 'quali') { const o = loadOwnBest(); if (o) { app.allBest = o.ms; app.ghostLap = o.lap; } } // (your best ever on this track: see loadOwnBest)
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
  $('#touch').classList.toggle('poly', app.mode === 'quali'); app.dropTouch?.();
  if (app.mode === 'quali') raceToast(`Polytrack mode: rolling start, your lap starts at the line!${app.bind.restart.length ? ` ${keyOf('restart')} restarts your run.` : ''}`, 4000);
  $('#sectors').classList.toggle('hidden', app.mode !== 'quali');
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
// The best time ever through each sector of each track (purple in Polytrack
// mode), signed by the server: kept here and handed back like the boards.
app.secRec = {};
app.secKeep = {};
try { const b = JSON.parse(localStorage.getItem('dc-sec') || '{}'); if (b && typeof b === 'object' && !Array.isArray(b)) app.secKeep = b; } catch {}
function keepSectors(recs) {
  let changed = false;
  for (const [k, list] of Object.entries(recs || {})) {
    if (!Array.isArray(list)) continue;
    const mine = app.secKeep[k] ||= [null, null, null];
    list.forEach((e, i) => { if (e && e.s && (!mine[i] || e.ms < mine[i].ms)) { mine[i] = e; changed = true; } });
  }
  if (changed) try { localStorage.setItem('dc-sec', JSON.stringify(app.secKeep)); } catch {}
}
// A track with a new layout ('v' in tracks.js) starts its times again: this
// browser's best and its copies of that board go (the server won't take the
// old ones back either).
try {
  const seen = JSON.parse(localStorage.getItem('dc-layouts') || '{}');
  let changed = false;
  TRACKS.forEach((d, i) => {
    if ((seen[i] || 1) === (d.v || 1)) return;
    for (const o of [app.pbs, app.boards, app.lbKeep, app.secKeep]) for (const k of Object.keys(o)) if (k.split(':')[0] === String(i)) delete o[k];
    seen[i] = d.v || 1; changed = true;
  });
  if (changed) {
    localStorage.setItem('dc-layouts', JSON.stringify(seen));
    localStorage.setItem('dc-pb', JSON.stringify(app.pbs)); localStorage.setItem('dc-lb', JSON.stringify(app.boards)); localStorage.setItem('dc-lb-keep', JSON.stringify(app.lbKeep)); localStorage.setItem('dc-sec', JSON.stringify(app.secKeep));
  }
} catch {}
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
  { const top = overallStandings()[0]; app.king = top && top.pts > 0 ? top.name.toLowerCase() : null; } // (whose car wears the Drift King's livery)
  if (!$('#board').classList.contains('hidden')) renderBoard(); // (whichever board changed: the Drift King is worked out from them all)
  renderRecord();
  renderSettings(); // (the record holder's ghost comes on offer, or goes, with the boards)
}
// The Drift King championship: every name's results over all the tracks' leaderboards. Each board's top ten score
// as in F1 (25 for the record, then 18, 15, 12, 10, 8, 6, 4, 2 and 1) and the points add up. Level on points, more
// records wins, then more second places, and so on down. Whoever leads is the Drift King. Racer, the name you get
// without picking one, is anybody, so it isn't in it. The leaderboard's Championship tab shows the whole table.
const KING_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const CROWN = '<svg class="crown" viewBox="0 0 32 26" aria-hidden="true"><path d="M3 20.5 2 6.5l8 6.5 6-10.5 6 10.5 8-6.5-1 14z"/><path d="M3 20.5h26V24H3z"/></svg>';
function overallStandings() {
  const by = new Map();
  for (let t = 0; t < TRACKS.length; t++) boardList(t).slice(0, KING_POINTS.length).forEach((e, i) => {
    const key = e.n.toLowerCase();
    if (key === 'racer') return;
    let who = by.get(key);
    if (!who) by.set(key, who = { name: e.n, pts: 0, tracks: 0, places: KING_POINTS.map(() => 0) });
    who.pts += KING_POINTS[i]; who.places[i]++; who.tracks++;
  });
  const onPlaces = (a, b) => { for (let i = 0; i < a.places.length; i++) if (a.places[i] !== b.places[i]) return b.places[i] - a.places[i]; return 0; };
  return [...by.values()].sort((a, b) => b.pts - a.pts || onPlaces(a, b) || a.name.localeCompare(b.name));
}
function notePersonalBest(lapTime) {
  const k = String(app.trackId), ms = Math.round(lapTime);
  if (app.pbs[k] && app.pbs[k] <= ms) return;
  app.pbs[k] = ms;
  try { localStorage.setItem('dc-pb', JSON.stringify(app.pbs)); } catch {}
}
// From the home screen it opens on the Championship; from the lobby, on the board of the track that's picked there
// (both the owner's choice). The rest are a tab away.
function openBoard(track = 'champ') {
  board.track = track;
  $('#board').classList.remove('hidden');
  renderBoard();
}
function renderBoard() {
  const champ = board.track === 'champ'; // the Championship tab, or a track's number
  $('#board-tracks').innerHTML = `<button data-t="champ" class="champ ${champ ? 'on' : ''}" title="Everyone's points over all the tracks">${CROWN}Championship</button>`
    + TRACKS.map((t, i) => `<button data-t="${i}" class="${i === board.track ? 'on' : ''}" title="${esc(t.name)}">${esc(t.short || t.name)}</button>`).join('');
  const me = (app.room ? app.name : $('#name').value.replace(/[^A-Za-z0-9 _\-]/g, '').trim().slice(0, 12) || 'Racer').toLowerCase();
  const table = overallStandings(), king = table[0], kingKey = king ? king.name.toLowerCase() : null;
  const kingEl = $('#board-king');
  kingEl.classList.toggle('hidden', !king || champ); // (on the championship the king is the top row already: no need to say it twice)
  if (king) {
    kingEl.innerHTML = `${CROWN}<div class="king-who"><span class="king-title">Drift King</span><b>${esc(king.name)}</b></div><div class="king-pts"><b>${king.pts}</b><span>points</span></div>`;
  }
  const crown = `<span class="king-mark" title="The Drift King">${CROWN}</span>`;
  if (champ) {
    // the championship: everyone with a point, the king first
    const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    $('#board-list').innerHTML = table.length
      ? table.map((w, i) => `<li class="${w.name.toLowerCase() === me ? 'me' : ''} ${i === 0 ? 'first' : ''}"><span class="place">${i + 1}</span>${i === 0 ? crown : ''}<span class="name">${esc(w.name)}</span><span class="car">${w.places[0] ? count(w.places[0], 'record') : ''}</span><span class="time">${w.pts}<small> ${w.pts === 1 ? 'pt' : 'pts'}</small></span></li>`).join('')
      : '<li class="empty">No laps yet. Set the first one!</li>';
    const mine = table.findIndex((w) => w.name.toLowerCase() === me);
    $('#board-pb').textContent = mine >= 0 ? `You: ${ordinal(mine + 1)}, with ${count(table[mine].pts, 'point')}` : table.length ? 'A top-ten lap on any track puts you in the championship.' : '';
    return;
  }
  const list = boardList(board.track);
  $('#board-list').innerHTML = list.length
    ? list.map((e, i) => `<li class="${e.n.toLowerCase() === me ? 'me' : ''} ${i === 0 ? 'first' : ''}"><span class="place">${i + 1}</span><span class="rnum" title="Race number">${Number.isInteger(e.num) ? e.num : ''}</span>${e.n.toLowerCase() === kingKey ? crown : ''}<span class="name">${esc(e.n)}</span>${e.g ? `<button class="linebtn" data-n="${esc(e.n)}" title="See how this lap was driven">line</button>` : ''}<span class="car">${CAR_NAMES[e.c] || ''}</span><span class="time">${fmtTime(e.ms)}</span></li>`).join('')
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

function showResults(results, quali) {
  app.phase = 'results';
  app.finished = true;
  if (quali) app.finishTime = 0;
  $('#results-title').textContent = quali ? 'Polytrack mode — best laps' : 'Race results';
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
  if (podiumTop.length) startPodium(podiumTop, () => $('#results').classList.remove('hidden'));
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
  const tex = cleanTexture(c);
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
function startPodium(top, done) {
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
  podium = { g, head, x: s.p.x, y: s.p.y, z: s.p.z, t0: performance.now(), done, skip, cars, blocks, beats, keys, winAt, top,
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
  podiumTitle(r.id === app.myId ? 'You win!' : `${r.name} wins!`);
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
  if (open) { app.keys = {}; app.dropTouch?.(); }
  $('#pause').classList.toggle('hidden', !open);
  if (open) {
    const poly = app.mode === 'quali' && app.phase === 'racing';
    $('#btn-restart').classList.toggle('hidden', !poly);
    $('#btn-recghost').classList.toggle('hidden', !poly || !recGhostReady()); ghostButton();
    $('#pause-hint').textContent = `Esc menu · ${keyOf('cam')} camera · ${keyOf('mute')} sound · ${keyOf('reset')} reset to last gate${poly ? ` · ${keyOf('restart')} restart your run` : ''}`;
  }
}
// The camera: chosen in Settings, or swapped with its key. Your choice is remembered, for every car.
function setCamera(mode) {
  app.camMode = app.camPref = mode === 'cockpit' ? 'cockpit' : 'chase';
  try { localStorage.setItem('dc-cam', app.camMode); } catch {}
  renderSettings();
  if (inRace()) raceToast(app.camMode === 'cockpit' ? 'Cockpit camera' : 'Chase camera', 1200);
}
function toggleCamera() { setCamera(app.camMode === 'cockpit' ? 'chase' : 'cockpit'); }

function goHome() {
  endPodium(false);
  setMenu(false);
  $('#results').classList.add('hidden');
  $('#lights').classList.add('hidden');
  $('#countdown').classList.add('hidden');
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
  requestAnimationFrame(sizeTrackCards);
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
  sizeTrackCards();
  // a new pick (or a new lobby): scroll the track list to show it, if it's out of view
  const tl = $('#track-list'), on = tl.querySelector('.trackcard.on');
  if (on && tl.clientHeight && r.trackId !== app.listTrack) {
    app.listTrack = r.trackId;
    if (on.offsetTop < tl.scrollTop || on.offsetTop + on.offsetHeight > tl.scrollTop + tl.clientHeight) tl.scrollTop = on.offsetTop - 3;
  }
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
    if (def.theme === 'beach') cv.style.background = '#8fd6e6';
    if (def.theme === 'city') cv.style.background = '#141a33';
    if (def.theme === 'mall') cv.style.background = '#aeb6c2';
    card._track = buildTrack(def);
    drawTrackPreview(cv, card._track);
    card.appendChild(cv);
    card.insertAdjacentHTML('beforeend', `<div class="tname">${def.name}</div>${def.was ? `<div class="twas">Formerly ${def.was}</div>` : def.fresh ? '<div class="twas tfresh">New track</div>' : ''}<div class="tblurb">${def.blurb}</div>`);
    card.addEventListener('click', () => {
      if (app.room?.hostId !== app.myId) return;
      send({ t: 'track', trackId: i });
    });
    list.appendChild(card);
  });
}

function drawTrackPreview(cv, track) {
  const ctx = cv.getContext('2d'), k = cv.height / 120; // lines and margins in step with the picture's size
  ctx.clearRect(0, 0, cv.width, cv.height);
  const b = track.bounds;
  const w = b.max.x - b.min.x, h = b.max.z - b.min.z;
  const sc = Math.min((cv.width - 24 * k) / w, (cv.height - 24 * k) / h); // the same scale both ways: never stretched
  const ox = (cv.width - w * sc) / 2 - b.min.x * sc, oz = (cv.height - h * sc) / 2 - b.min.z * sc;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  track.samples.forEach((s, i) => { const x = s.p.x * sc + ox, y = s.p.z * sc + oz; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 9 * k; ctx.stroke();
  ctx.strokeStyle = '#5b6472'; ctx.lineWidth = 6 * k; ctx.stroke();
  const s0 = track.samples[0];
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 2 * k;
  ctx.beginPath(); ctx.arc(s0.p.x * sc + ox, s0.p.z * sc + oz, 4 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
// The track pictures are drawn at the size they show at (the cards fill the
// row, so that changes with the window), and the list is one row high plus a
// slice of the next.
function sizeTrackCards() {
  const list = $('#track-list'); if (!list || !list.offsetParent) return; // not on screen
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let row = 0;
  list.querySelectorAll('.trackcard').forEach((card, i) => {
    const cv = card.querySelector('canvas'), w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w > 0 && h > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; drawTrackPreview(cv, card._track); }
    if (i < 4) row = Math.max(row, card.offsetHeight);
  });
  if (row) list.style.maxHeight = `${row + 40}px`;
}
window.addEventListener('resize', () => sizeTrackCards());

function buildSwatches() {
  const el = $('#colors');
  el.innerHTML = '';
  const shown = app.liveryOn ? [...PICKER_COLORS, LIVERY] : PICKER_COLORS; // the secret livery
  el.style.gridTemplateColumns = `repeat(${shown.length}, 1fr)`; // always one row
  shown.forEach((i) => {
    const css = COLOR_CSS[i];
    const s = document.createElement('div');
    s.className = 'swatch' + (i === app.color ? ' on' : '') + (i === LIVERY ? ' livery' : '');
    const T = TEAM[i]; // (a livery's swatch: its colour, its line, and what it sweeps into)
    s.style.background = i === LIVERY ? 'linear-gradient(135deg, #13806a 56%, #c6f432 56% 64%, #16191f 64%)' : T ? `linear-gradient(135deg, ${css} 56%, ${hex(T.stripe)} 56% 64%, ${hex(T.second)} 64%)` : css;
    s.title = i === LIVERY ? 'Racing green livery' : `Colour ${i + 1}`;
    s.addEventListener('click', () => {
      app.color = i;
      document.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === s));
      try { localStorage.setItem('dc-color', String(i)); } catch {}
    });
    el.appendChild(s);
  });
}

// the car number typed on the home screen (0 to 99), or null for a random one
function readNum() {
  const d = $('#num').value.replace(/\D/g, '').slice(0, 2), t = d && String(Number(d)); // 07 is 7
  $('#num').value = t;
  try { localStorage.setItem('dc-num', t); } catch {}
  return t ? Number(t) : null;
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
    const k = localStorage.getItem('dc-num'); if (k) $('#num').value = k.replace(/\D/g, '').slice(0, 2);
    const c = localStorage.getItem('dc-color'); if (c != null && (PICKER_COLORS.includes(+c) || (+c === LIVERY && app.liveryOn))) app.color = +c;
  } catch {}
  buildSwatches();
  buildTrackCards();

  const params = new URLSearchParams(location.search);
  const codeFromUrl = (params.get('room') || location.pathname.slice(1)).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (codeFromUrl.length === 4) { $('#code').value = codeFromUrl; $('#code').focus(); }

  // the number asked for: the one typed, or with the secret livery, its 18
  const wantNum = () => { app.numTyped = readNum(); return app.numTyped ?? (app.color === LIVERY ? 18 : undefined); };
  $('#btn-create').addEventListener('click', () => {
    app.name = readName();
    send({ t: 'create', name: app.name, color: app.color, num: wantNum() });
  });
  const join = () => {
    const code = $('#code').value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) return toast('Room codes are 4 letters.');
    app.name = readName();
    send({ t: 'join', code, name: app.name, color: app.color, num: wantNum() });
  };
  $('#btn-join').addEventListener('click', join);
  $('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('#name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-create').click(); });
  $('#num').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-create').click(); });
  $('#num').addEventListener('input', (e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 2); if (t !== e.target.value) e.target.value = t; });

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
  // what's new: behind its button, which shows a dot when there's an update someone coming back hasn't looked at;
  // what's new since they last looked is marked New. It doesn't open by itself (it did, once per update, until 4.3:
  // the owner, "dont auto bring up whats new anymore"). Someone here for the first time starts up to date.
  const latest = UPDATES[0].v, store = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const seen = store('dc-seen'), back = VISITED_BEFORE;
  const since = seen == null ? -1 : UPDATES.findIndex(u => vnum(u.v) <= vnum(seen)); // entries newer than the version they saw (never looked: just the latest)
  const fresh = (k) => seen !== latest && k < (since < 0 ? 1 : since);
  $('#ver').textContent = 'v' + latest;
  $('#updates-dot').classList.toggle('hidden', seen === latest);
  $('#updates-list').innerHTML = UPDATES.map((u, k) => `<h3>${fresh(k) ? '<span class="tagnew">New</span>' : ''}<span class="tagv">v${esc(u.v)}</span>${esc(u.title)}<small>${esc(u.date)}</small></h3><ul>${u.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('');
  const markSeen = () => { $('#updates-dot').classList.add('hidden'); try { localStorage.setItem('dc-seen', latest); } catch {} };
  const openUpdates = () => { $('#updates').classList.remove('hidden'); markSeen(); };
  $('#btn-updates').addEventListener('click', openUpdates);
  $('#btn-refresh').addEventListener('click', () => location.reload()); // (the notice of a newer version)
  if (seen !== latest && !back) markSeen();
  $('#btn-updates-close').addEventListener('click', () => $('#updates').classList.add('hidden'));
  setupPoll();
  $('#updates').addEventListener('click', (e) => { if (e.target.id === 'updates') $('#updates').classList.add('hidden'); });
  $('#btn-endq').addEventListener('click', (e) => { e.currentTarget.blur(); send({ t: 'endquali' }); });
  $('#lobby-tip').addEventListener('click', (e) => { e.currentTarget.blur(); showTip(); });
  $('#btn-leave').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-resume').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(false); });
  $('#btn-restart').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(false); restartRun(); });
  $('#btn-quit').addEventListener('click', () => { send({ t: 'leave' }); goHome(); });
  $('#btn-recghost').addEventListener('click', (e) => { e.currentTarget.blur(); setRecGhost(!app.recGhostOn); });
  // settings: graphics and the expanded map
  const openSettings = (e) => { e?.currentTarget?.blur?.(); $('#map-note').textContent = ''; renderSettings(); $('#settings').classList.remove('hidden'); };
  for (const id of ['#btn-settings', '#btn-settings-lobby', '#btn-settings-pause']) $(id).addEventListener('click', openSettings);
  $('#btn-settings-close').addEventListener('click', () => $('#settings').classList.add('hidden'));
  // ---- Settings > Change keys: click a key, then press the one you want ----
  const saveKeys = () => { try { localStorage.setItem('dc-keys', JSON.stringify(app.bind)); } catch {} };
  const renderKeys = () => {
    const el = $('#key-list');
    el.innerHTML = '';
    for (const [a, label] of ACTIONS) {
      const name = document.createElement('span'); name.textContent = label; el.appendChild(name);
      for (const i of [0, 1]) {
        const b = document.createElement('button'), code = app.bind[a][i];
        const listening = app.binding?.a === a && app.binding.i === i;
        b.textContent = listening ? 'Press a key…' : code ? keyName(code) : '+';
        b.className = listening ? 'listening' : code ? '' : 'empty';
        b.title = listening ? 'Press the key you want, or Esc to leave it' : code ? 'Click, then press another key' : 'Click, then press a key to add one';
        b.addEventListener('click', (e) => { e.currentTarget.blur(); app.binding = { a, i: Math.min(i, app.bind[a].length) }; renderKeys(); });
        el.appendChild(b);
      }
    }
  };
  // while waiting for a key, it goes here and nowhere else (Esc leaves it as it was)
  window.addEventListener('keydown', (e) => {
    if (!app.binding) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    const { a, i } = app.binding;
    if (e.code !== 'Escape' && !/^(Meta|OS)/.test(e.code) && /^[A-Za-z0-9]{1,24}$/.test(e.code)) {
      for (const k of Object.keys(app.bind)) app.bind[k] = app.bind[k].filter(c => c !== e.code); // a key does one thing
      const list = app.bind[a];
      if (i < list.length) list[i] = e.code; else list.push(e.code);
      saveKeys();
    }
    app.binding = null;
    renderKeys();
  }, true);
  $('#btn-keys').addEventListener('click', (e) => { e.currentTarget.blur(); app.binding = null; renderKeys(); $('#keys').classList.remove('hidden'); });
  $('#btn-keys-done').addEventListener('click', () => { app.binding = null; $('#keys').classList.add('hidden'); });
  $('#btn-keys-reset').addEventListener('click', (e) => { e.currentTarget.blur(); app.binding = null; app.bind = defaultBinds(); saveKeys(); renderKeys(); });
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').classList.add('hidden'); });
  document.querySelectorAll('#seg-gfx button').forEach(b => b.addEventListener('click', () => setGfxMode(b.dataset.v)));
  document.querySelectorAll('#seg-map button').forEach(b => b.addEventListener('click', () => setExpanded(b.dataset.v === 'on')));
  document.querySelectorAll('#seg-recghost button').forEach(b => b.addEventListener('click', () => setRecGhost(b.dataset.v === 'on')));
  document.querySelectorAll('#seg-cam button').forEach(b => b.addEventListener('click', () => setCamera(b.dataset.v)));
  // laps (host only)
  const setLaps = (e, d) => { e.currentTarget.blur(); if (app.room?.hostId === app.myId) send({ t: 'laps', laps: (app.room.laps || 3) + d }); };
  $('#laps-minus').addEventListener('click', (e) => setLaps(e, -1));
  $('#laps-plus').addEventListener('click', (e) => setLaps(e, 1));
  $('#btn-menu').addEventListener('click', (e) => { e.currentTarget.blur(); setMenu(true); });
  $('#btn-board').addEventListener('click', (e) => { e.currentTarget.blur(); openBoard(); });
  $('#btn-board-lobby').addEventListener('click', (e) => { e.currentTarget.blur(); openBoard(Number.isInteger(app.room?.trackId) ? app.room.trackId : 'champ'); });
  $('#btn-board-close').addEventListener('click', () => $('#board').classList.add('hidden'));
  $('#board-tracks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { board.track = b.dataset.t === 'champ' ? 'champ' : +b.dataset.t; renderBoard(); } });
  $('#board-king').addEventListener('click', () => { board.track = 'champ'; renderBoard(); }); // the king's banner opens the championship too
  $('#board-list').addEventListener('click', (e) => { const b = e.target.closest('.linebtn'); if (b && board.track !== 'champ') askLine(board.track, b.dataset.n); });
  $('#btn-line-close').addEventListener('click', () => $('#lineview').classList.add('hidden'));
  $('#lineview').addEventListener('click', (e) => { if (e.target.id === 'lineview') $('#lineview').classList.add('hidden'); });
  // feedback: one button, on the home screen beside Settings. (It was there, and in the pause menu, until 3.39; then
  // in Settings until 3.61, when the owner asked for it back beside Settings on the home screen.)
  $('#btn-feedback').classList.toggle('hidden', !FEEDBACK_URL);
  $('#btn-feedback').addEventListener('click', (e) => { e.currentTarget.blur(); window.open(FEEDBACK_URL, '_blank', 'noopener'); });
  $('#btn-lobby').addEventListener('click', () => send({ t: 'lobby' }));
  document.querySelectorAll('#seg-sound button').forEach(b => b.addEventListener('click', () => { initAudio(); setSound(b.dataset.v === 'on'); }));
  $('#vol').addEventListener('input', (e) => { initAudio(); setVolume(+e.target.value); });
  for (const id of ['#btn-create', '#btn-join']) $(id).addEventListener('click', initAudio);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Escape' && !$('#keys').classList.contains('hidden')) { $('#keys').classList.add('hidden'); return; }
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
    if (isKey('mute', e.code) && !e.repeat) { setSound(!audio.on); if (inRace()) raceToast(audio.on ? 'Sound on' : 'Sound off', 1000); }
    if (isKey('cam', e.code) && !e.repeat) toggleCamera();
    if (e.code === 'Escape' && !e.repeat && inRace()) { setMenu(!app.menuOpen); return; }
    if (app.menuOpen) return;
    app.keys[e.code] = true;
    if (app.touchOn && !e.repeat && ['up', 'down', 'left', 'right'].some((a) => isKey(a, e.code))) app.setTouch(false); // driving on the keys after all: the buttons go
    // arrows and Space would scroll the page; in a race, so might any other key you drive with
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) || (inRace() && ACTIONS.some(([a]) => isKey(a, e.code)))) e.preventDefault();
    if (isKey('reset', e.code) && app.local && (app.phase === 'racing' || app.phase === 'results')) respawn(app.local);
    if (isKey('restart', e.code) && !e.repeat) restartRun();
  });
  window.addEventListener('keyup', (e) => { app.keys[e.code] = false; });
  window.addEventListener('blur', () => { app.keys = {}; app.dropTouch?.(); });
  setupTouch();
}

// Touch controls, for phones and tablets: buttons over the race for what the keys do. Steering either way,
// the accelerator, the brake and the handbrake are held; Reset (and Restart, in Polytrack mode) are taps. The
// buttons show once the screen has been touched, or from the start on a touch-first device, never for a mouse,
// and go again if the driving keys are used. A finger is followed wherever it slides: across from one steering
// button to the other without lifting, or onto the edge between the accelerator and the handbrake, which holds
// both. (The owner asked for touch controls; until then the home screen said "Not for phones".)
function setupTouch() {
  const root = $('#touch'), fingers = new Map(); // (fingers: pointer id -> where it is now)
  const steer = root.querySelector('.steer'), pedals = [...root.querySelectorAll('.pedals [data-act]')], all = [...root.querySelectorAll('[data-act]')];
  const paint = () => { for (const b of all) b.classList.toggle('down', !!app.touch[b.dataset.act]); };
  const read = () => {
    const t = {}, [l, r] = ['left', 'right'].map((a) => steer.querySelector(`[data-act="${a}"]`).getBoundingClientRect());
    for (const f of fingers.values()) {
      if (f.pad === steer) t[f.x < (l.right + r.left) / 2 ? 'left' : 'right'] = true;                 // whichever half of the pair it is over
      else for (const b of pedals) { const q = b.getBoundingClientRect(), m = 9; if (f.x >= q.left - m && f.x <= q.right + m && f.y >= q.top - m && f.y <= q.bottom + m) t[b.dataset.act] = true; }
    }
    app.touch = app.menuOpen ? {} : t; paint();
  };
  app.dropTouch = () => { fingers.clear(); app.touch = {}; paint(); };
  app.setTouch = (on) => { if (!!app.touchOn === on) return; app.touchOn = on; document.body.classList.toggle('touch-on', on); if (!on) app.dropTouch(); };
  const tap = { reset: () => { if (app.local && !app.menuOpen && (app.phase === 'racing' || app.phase === 'results')) respawn(app.local); }, restart: () => restartRun() };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.tbtn'); if (!b) return;
    e.preventDefault(); initAudio();
    if (b.dataset.tap) { tap[b.dataset.tap](); return; }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, pad: b.closest('.pad') });
    try { b.setPointerCapture(e.pointerId); } catch {} // (so the finger is still ours when it slides off the button)
    read();
  });
  root.addEventListener('pointermove', (e) => { const f = fingers.get(e.pointerId); if (f) { f.x = e.clientX; f.y = e.clientY; read(); } });
  for (const ev of ['pointerup', 'pointercancel']) root.addEventListener(ev, (e) => { if (fingers.delete(e.pointerId)) read(); });
  root.addEventListener('contextmenu', (e) => e.preventDefault()); // (a long press is a held button, not a menu)
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') app.setTouch(true); }, true);
  if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) app.setTouch(true);
  // No zooming the page on a phone (see the viewport tag and `touch-action` on html): Safari's own pinch is turned
  // away here, where it tells us it has begun. And if the page is zoomed in all the same, it's put back: setting
  // the viewport again makes the browser lay the page out at the scale it allows. (A few times at most, a second
  // apart: a browser that won't be told is left alone.)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  const meta = document.querySelector('meta[name="viewport"]'), vv = window.visualViewport;
  let tries = 0, last = 0;
  const unzoom = () => {
    if (!vv || !meta || vv.scale < 1.02 || tries >= 6 || performance.now() - last < 1000) return;
    tries++; last = performance.now();
    const c = meta.getAttribute('content');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1');
    setTimeout(() => meta.setAttribute('content', c), 60);
  };
  vv?.addEventListener('resize', unzoom); window.addEventListener('orientationchange', () => setTimeout(unzoom, 300));
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
      if (!car.armed) car.lapStart = Math.max(raceStartPerf(), app.joinedRaceAt || 0); // (Polytrack mode's starts at the line)
      beep(1040, 0.6, 0.25);
      const el = $('#countdown');
      el.textContent = 'GO!'; el.classList.remove('hidden'); el.classList.add('go');
      setTimeout(() => { el.classList.add('hidden'); lights.classList.add('hidden'); }, 900);
    }
  }
  const hudBest = app.mode === 'quali' ? app.allBest || app.bestLap : app.bestLap; // (in Polytrack mode, your best ever on this track)
  setText('#hud-best', hudBest ? fmtTime(hudBest) : '--');
  if (app.mode === 'quali') renderSectors(performance.now());
  const gd = app.mode === 'quali' ? app.ghostDelta : null;
  setText('#hud-delta', gd == null ? '' : (gd >= 0 ? '+' : '\u2212') + Math.abs(gd).toFixed(2));
  if (gd != null) { const el = textCache.get('#hud-delta').el; el.classList.toggle('ahead', gd < 0); el.classList.toggle('behind', gd >= 0); }
  if (app.phase === 'racing' || app.phase === 'results') {
    // Polytrack mode: the lap you're on (nought until a fresh run reaches the line); a race: the race clock
    const t = app.mode === 'quali' ? (car.armed || !car.lapStart ? 0 : Math.max(0, now - car.lapStart)) : app.finished && !app.spectate ? app.finishTime : Math.max(0, now - raceStartPerf());
    setText('#hud-time', fmtTime(t));
  }
  setText('#hud-lap', app.mode === 'quali' ? car.lap : Math.min(car.lap, app.laps));
  const missed = !!car.missedGate && app.phase === 'racing' && !app.finished;
  $('#gate-nav').classList.toggle('hidden', !missed);
  if (missed) {
    const g = app.track.samples[app.track.cps[car.nextCp]].p, dx = g.x - car.pos.x, dz = g.z - car.pos.z;
    $('#gate-arrow').style.transform = `rotate(${(-(Math.atan2(dx, dz) - car.h)).toFixed(2)}rad)`; // points at the gate you missed
    setText('#gate-dist', Math.round(Math.hypot(dx, dz)) + ' m');
  }
  $('#respawn-tip').classList.toggle('hidden', car.onTrack || missed || app.phase === 'countdown');

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
      `<div class="standing${e.me ? ' me' : ''}${e.finished ? ' done' : ''}"><span class="n">${i + 1}</span><span class="dot" style="background:${COLOR_CSS[e.color]}"></span><span>${esc(e.name)}</span><span class="lap">${app.mode === 'quali' ? (e.best ? fmtTime(e.best) : '--') : e.finished ? 'FIN' : 'L' + Math.min(e.lap, app.laps)}</span></div>`
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
    mmCtx.fillStyle = css; mmCtx.fill(); mmCtx.strokeStyle = luminance(parseInt(css.slice(1), 16)) < 0.2 ? '#f6f2e8' : '#1d2230'; mmCtx.lineWidth = 2; mmCtx.stroke(); // (a pale ring round a dark car's dot: the navy and the black ones)
  };
  // your next gate: an orange bar across the track
  if (app.local && app.phase === 'racing' && !app.finished) {
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
  if (app.recOn && app.recGhost) { // the record holder's ghost: a gold dot with a dark ring
    const gp = app.recGhost.group.position;
    mmCtx.beginPath(); mmCtx.arc(gp.x * sc + ox, gp.z * sc + oz, 4.5, 0, Math.PI * 2);
    mmCtx.fillStyle = '#ffd23f'; mmCtx.fill(); mmCtx.strokeStyle = '#1d2230'; mmCtx.lineWidth = 2; mmCtx.stroke();
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
  const throttle = held('up') && app.phase !== 'countdown' ? 1 : 0;
  let rpm = 0.25 + 0.75 * clamp((v - lo) / (hi - lo), 0, 1);
  if (v < 1.5) rpm = 0.16 + (held('up') ? 0.5 : 0) * (0.6 + 0.4 * Math.sin(t * 18)); // blipping on the grid
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
  showStale(); // (the notice of a newer version comes and goes with the menus)

  if (app.local && (app.phase === 'countdown' || app.phase === 'racing' || app.phase === 'results')) {
    const canDrive = !app.menuOpen && (app.phase === 'racing' || (app.phase === 'results' && app.finished));
    stepLocal(app.local, dt, canDrive);
    stepRemotes(now, dt);
    if (app.mode === 'quali' && app.phase === 'racing') {
      // The ghost lap is timed from the start line, not from the grid: the
      // first lap only starts recording once the car has crossed the line.
      // (Recording from the grid made the ghost trail behind you, out of sight.)
      const c = app.local;
      if (app.recFrom == null && c.idx < app.track.N / 2) {
        app.recFrom = now; app.rec = [];
        if (c.armed) { c.armed = false; c.lapStart = app.recFrom = performance.now(); send({ t: 'restart' }); newLapSectors(false); } // a fresh run starts here
      }
      if (app.recFrom != null) {
        const r = app.rec, t = now - app.recFrom;
        if (!r.length || t - r[r.length - 1].t >= 50) r.push({ t, x: c.pos.x, y: c.pos.y, z: c.pos.z, h: c.h, i: c.idx });
      }
    }
    updateGhost(now); updateRecGhost(now);
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
const COCKPIT_NEAR = 0.12; // how close the cockpit camera has to see: the wheel and the cockpit's rim are a hand's breadth from the eye
function renderFrame() {
  renderer.render(scene, camera);
  if (!app.inCockpit || !app.local) return;
  // From the cockpit a second drawing goes over the first, with the depth cleared between: layer 1 only. In a
  // closed car that is the interior (dash, wheel, door panels), which the solid body would otherwise bury. In
  // the open car it is the car itself. A near plane 12 cm out leaves so little depth for the distance that two
  // faces 10 cm apart can't be told apart from 300 m, and far-off buildings flickered; so the first drawing has
  // its near plane half a metre out, which cuts off the nearest of the car, and this one puts the whole car back.
  const open = !app.local.mesh.interior, bg = scene.background;
  scene.background = null;
  renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
  renderer.clearDepth();
  camera.layers.set(1);
  if (open) { camera.near = COCKPIT_NEAR; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
  if (open) { camera.near = 0.5; camera.updateProjectionMatrix(); }
  camera.layers.set(0);
  renderer.autoClear = true; renderer.shadowMap.autoUpdate = true;
  scene.background = bg;
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
buildWorld(HOME_TRACK);
wireUI();
window.__dc = app; app.gfx = gfx; app.scene = scene; app.renderer = renderer; app.makeCarMesh = makeCarMesh; app.terrainHeight = terrainHeight; app.rollSlot = rollSlot; app.wantRecordGhost = wantRecordGhost; app.cityTowers = cityTowers; // handy for poking at the game from the console
$('#btn-create').disabled = true; $('#btn-join').disabled = true;
connect();
requestAnimationFrame(frame);
