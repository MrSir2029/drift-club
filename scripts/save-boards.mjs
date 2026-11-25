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
const site = process.env.DRIFT_CLUB_URL || process.argv[2];
if (!site) { console.error('Say which game: DRIFT_CLUB_URL=https://your-game.onrender.com npm run save-boards'); process.exit(1); }
const url = site.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';

// behind a proxy (some cloud machines), use one if https-proxy-agent is installed
let agent;
const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
if (proxy) try { const { HttpsProxyAgent } = await import('https-proxy-agent'); agent = new HttpsProxyAgent(proxy); } catch {}

let live = await new Promise((resolve, reject) => {
  const ws = new WebSocket(url, { agent });
  const timer = setTimeout(() => reject(new Error('no answer in 60 s (is the game asleep? open it once and try again)')), 60000);
  // (a track that this code lays out differently from the live game: its live times are for the old circuit, and are left behind)
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'lbs') { clearTimeout(timer); ws.close(); resolve(thisLayoutOnly({ boards: m.boards || {}, sec: m.sec || {}, lay: m.lay })); } });
  ws.on('error', (e) => { clearTimeout(timer); reject(e); });
});

const old = thisLayoutOnly(fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { season: 1, boards: {} });
const liveSec = live.sec; live = live.boards;
const merged = {};
for (const k of new Set([...Object.keys(old.boards || {}), ...Object.keys(live)])) {
  const best = new Map();
  for (const e of [...(old.boards?.[k] || []), ...(live[k] || [])]) {
    const name = e.n.toLowerCase();
    if (!best.has(name) || best.get(name).ms > e.ms) best.set(name, e);
  }
  merged[k] = [...best.values()].sort((a, b) => a.ms - b.ms).slice(0, 10);
}
// the best time through each sector of each track: the quicker of the two
const sec = { ...(old.sec || {}) };
for (const [k, list] of Object.entries(liveSec)) sec[k] = [0, 1, 2].map(i => { const a = sec[k]?.[i], b = list?.[i]; return !a ? b || null : !b ? a : (b.ms < a.ms ? b : a); });
fs.writeFileSync(FILE, JSON.stringify({ season: old.season || 1, lay: [...TRACK_VERSION], boards: merged, sec }, null, 1) + '\n');
const n = Object.values(merged).reduce((t, l) => t + l.length, 0);
console.log(`Saved ${n} lap times on ${Object.keys(merged).length} tracks to server/boards.json (${Object.values(live).reduce((t, l) => t + l.length, 0)} from the live game).`);
