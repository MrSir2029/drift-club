// Saves the live leaderboard into server/boards.json, to commit with an
// update: a redeploy restarts the server, and it loads that file at startup,
// so the times are there straight away whoever visits first.
//   DRIFT_CLUB_URL=https://your-game.onrender.com npm run save-boards
// It merges with the file that's already there (each name keeps its best).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { thisLayoutOnly, TRACK_VERSION } from '../server/core.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'boards.json');
const PATHS = path.join(path.dirname(FILE), 'paths.json'); // how the laps that have a racing line were driven: saved beside the boards
const site = process.env.DRIFT_CLUB_URL || process.argv[2];
if (!site) { console.error('Say which game: DRIFT_CLUB_URL=https://your-game.onrender.com npm run save-boards'); process.exit(1); }
const url = site.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';

// behind a proxy (some cloud machines), use one if https-proxy-agent is installed
let agent;
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
if (proxy) try { const { HttpsProxyAgent } = await import('https-proxy-agent'); agent = new HttpsProxyAgent(proxy); } catch {}

const livePaths = {}; // 'track|name' -> { ms, p }, for every lap the live game holds the path of
let live = await new Promise((resolve, reject) => {
  const ws = new WebSocket(url, { agent });
  const timer = setTimeout(() => reject(new Error('no answer in 60 s (is the game asleep? open it once and try again)')), 60000);
  let got = null, want = [];
  const done = () => { clearTimeout(timer); ws.close(); resolve(got); };
  const next = () => { const w = want.shift(); if (!w) return done(); ws.send(JSON.stringify({ t: 'path', k: w[0], n: w[1] })); setTimeout(next, 200); }; // (the game answers one every 120 ms at most)
  // (a track that this code lays out differently from the live game: its live times are for the old circuit, and are left behind)
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'lbs' && !got) {
      got = thisLayoutOnly({ boards: m.boards || {}, sec: m.sec || {}, lay: m.lay });
      for (const [k, list] of Object.entries(got.boards)) for (const e of list) if (e.g) want.push([k, e.n]);
      clearTimeout(timer); setTimeout(next, 50); setTimeout(done, 400 + want.length * 260); // then the paths, and done when the last has had time to come
    } else if (m.t === 'path' && typeof m.p === 'string' && Number.isInteger(m.ms)) livePaths[`${m.k}|${String(m.n).toLowerCase()}`] = { ms: m.ms, p: m.p };
  });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'ver', v: 'save-boards' }))); // (not a tab running an old version: no reminder to refresh, thanks)
  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
});

const old = thisLayoutOnly(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { season: 1, boards: {} });
const liveSec = live.sec; live = live.boards;
const merged = {};
for (const k of new Set([...Object.keys(old.boards || {}), ...Object.keys(live)])) {
  const best = new Map();
  for (const { g, ...e } of [...(old.boards?.[k] || []), ...(live[k] || [])]) { // (g: the live game's mark for a lap it holds the path of; the file doesn't keep paths)
    const name = e.n.toLowerCase();
    if (!best.has(name) || best.get(name).ms > e.ms) best.set(name, e);
  }
  merged[k] = [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, 10);
}
// the best time through each sector of each track: the quicker of the two
const sec = { ...(old.sec || {}) };
for (const [k, list] of Object.entries(liveSec)) sec[k] = [0, 1, 2].map(i => { const a = sec[k]?.[i], b = list?.[i]; return !a ? b || null : !b ? a : (b.ms < a.ms ? b : a); });
fs.writeFileSync(FILE, JSON.stringify({ season: old.season || 1, lay: [...TRACK_VERSION], boards: merged, sec }, null, 1) + '\n');
// the paths: the live game's, and the file's own for laps the live game has lost the path of (it restarts without
// them if it has no database); only for laps that are on the merged boards with that very time
let oldPaths = {}; try { oldPaths = JSON.parse(fs.readFileSync(PATHS, 'utf8')); } catch {}
const keptPaths = {};
for (const [key, g] of Object.entries({ ...oldPaths, ...livePaths })) {
  const at = key.indexOf('|');
  if (g && Number.isInteger(g.ms) && typeof g.p === 'string' && (merged[key.slice(0, at)] || []).some((e) => e.n.toLowerCase() === key.slice(at + 1) && e.ms === g.ms)) keptPaths[key] = { ms: g.ms, p: g.p };
}
fs.writeFileSync(PATHS, JSON.stringify(keptPaths, null, 0).replace(/\},"/g, '},\n"') + '\n');
const n = Object.values(merged).reduce((t, l) => t + l.length, 0);
console.log(`Saved ${n} lap times on ${Object.keys(merged).length} tracks to server/boards.json (${Object.values(live).reduce((t, l) => t + l.length, 0)} from the live game), and ${Object.keys(keptPaths).length} racing lines to server/paths.json (${Object.keys(livePaths).length} from the live game).`);
