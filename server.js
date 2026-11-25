// Drift Club on Node: serves the game files and runs the game server
// (server/core.js) over WebSockets. Use this to play on your own computer or
// a LAN, in Codespaces, or on a Node host. On Cloudflare, worker.js does the
// same job.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, beaconTag, thisLayoutOnly } from './server/core.js';

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
// Cloudflare Web Analytics (counts visits, no cookies), set up for the game's
// Render address. CF_BEACON_TOKEN overrides the token; set it to nothing to
// switch analytics off.
const BEACON = beaconTag(process.env.CF_BEACON_TOKEN ?? '1492dde6fe6949b9a94cf5a39a022c3e');
const withBeacon = (html) => BEACON ? html.toString().replace('</body>', BEACON + '\n</body>') : html;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Files are kept in memory, gzipped once if they're text, and tagged (ETag)
// so a browser that already has the latest copy gets a tiny "not modified"
// instead of the whole game again. Each file is re-read if it changes.
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg']);
const fileCache = new Map();
function loadFile(full, cb) {
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return cb(err || new Error('not a file'));
    const hit = fileCache.get(full);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return cb(null, hit);
    fs.readFile(full, (err2, data) => {
      if (err2) return cb(err2);
      const ext = path.extname(full);
      const body = ext === '.html' ? Buffer.from(withBeacon(data)) : data;
      const tag = crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20);
      const f = { mtimeMs: st.mtimeMs, size: st.size, body, type: MIME[ext] || 'application/octet-stream', tag,
        gz: COMPRESS.has(ext) ? zlib.gzipSync(body, { level: 9 }) : null };
      fileCache.set(full, f);
      cb(null, f);
    });
  });
}
function sendFile(req, res, f) {
  const gzip = !!f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const etag = `"${f.tag}${gzip ? '-gz' : ''}"`;
  const headers = { 'Content-Type': f.type, 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' };
  if (f.gz) headers.Vary = 'Accept-Encoding';
  if ((req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(etag)) { res.writeHead(304, headers); return res.end(); }
  const body = gzip ? f.gz : f.body;
  if (gzip) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// The leaderboard lives in memory, and players' browsers keep copies to hand
// back after a restart. Each entry is signed with this key so a copy can't be
// edited. Set LB_SECRET on the host for a key of your own that isn't in the
// code (changing it wipes the boards).
const LB_KEY = process.env.LB_SECRET || 'drift-club-leaderboard';

// The leaderboard for good: with an Upstash Redis database (free at
// upstash.com), the boards are loaded when the server starts and saved soon
// after every new record, so they survive restarts and redeploys whoever
// visits first. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN on the
// host (the database's REST API details). Without them it works as before.
const KV_URL = process.env.UPSTASH_REDIS_REST_URL, KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KV_KEY = process.env.UPSTASH_KEY || 'drift-club:boards';
async function kv(command) {
  const res = await fetch(KV_URL, { method: 'POST', headers: { Authorization: `Bearer ${KV_TOKEN}` }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Upstash answered ${res.status}`);
  return (await res.json()).result;
}
// The leaderboard as it was at the last update (npm run save-boards writes it
// before a release): loaded at startup, so a redeploy doesn't start it empty.
let savedBoards = null;
try {
  const snap = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'server', 'boards.json'), 'utf8'));
  savedBoards = thisLayoutOnly(snap); // (without the times of a track that's been laid out again since)
  console.log(`Leaderboard: ${Object.values(snap.boards || {}).reduce((t, l) => t + l.length, 0)} lap times from server/boards.json`);
} catch {}
if (KV_URL && KV_TOKEN) {
  try {
    const text = await kv(['GET', KV_KEY]);
    const kept = text ? thisLayoutOnly(JSON.parse(text)) : null;
    const n = kept ? Object.values(kept.boards || {}).reduce((t, l) => t + l.length, 0) : 0;
    // both, if there are both: each name keeps its best (the game sorts that out)
    if (kept && savedBoards && kept.season === savedBoards.season) {
      for (const [k, list] of Object.entries(kept.boards || {})) savedBoards.boards[k] = [...(savedBoards.boards[k] || []), ...list];
    } else if (kept) savedBoards = kept;
    console.log(`Leaderboard: kept in Upstash, ${n} lap times loaded`);
  } catch (e) { console.warn(`Leaderboard: couldn't load from Upstash (${e.message}); players' browsers will fill it back in`); }
}
const saveBoards = KV_URL && KV_TOKEN
  ? (b) => kv(['SET', KV_KEY, JSON.stringify(b)]).catch((e) => console.warn(`Leaderboard: couldn't save to Upstash (${e.message})`))
  : null;
// How each lap on the leaderboard was driven (for ghost cars and racing lines): a hash beside the leaderboard,
// one field a lap, written when a lap gets onto a board and deleted when it leaves. Without Upstash they last
// until the server restarts.
let savedPaths = null;
if (KV_URL && KV_TOKEN) {
  try {
    const flat = await kv(['HGETALL', KV_KEY + ':paths']);
    savedPaths = {};
    for (let i = 0; i + 1 < (flat || []).length; i += 2) { try { savedPaths[flat[i]] = JSON.parse(flat[i + 1]); } catch {} }
    console.log(`Leaderboard: ${Object.keys(savedPaths).length} laps' paths loaded from Upstash`);
  } catch (e) { console.warn(`Leaderboard: couldn't load the laps' paths from Upstash (${e.message})`); }
}
const savePath = KV_URL && KV_TOKEN
  ? (key, g) => kv(g ? ['HSET', KV_KEY + ':paths', key, JSON.stringify(g)] : ['HDEL', KV_KEY + ':paths', key]).catch((e) => console.warn(`Leaderboard: couldn't save a lap's path to Upstash (${e.message})`))
  : null;
const game = createGame({
  note: 'The totals start again from zero whenever the server restarts.',
  sign: (text) => crypto.createHmac('sha256', LB_KEY).update(text).digest('base64url').slice(0, 12),
  boards: savedBoards,
  saveBoards,
  paths: savedPaths,
  savePath,
});

// ---------- static files, /stats ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url.pathname === '/stats.json') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(game.statsJson()));
  }
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(game.statsPage());
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  loadFile(full, (err, f) => {
    if (!err) return sendFile(req, res, f);
    // Unknown paths fall back to the app so room links like /ABCD work.
    loadFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
      if (e2) { res.writeHead(404); return res.end('not found'); }
      sendFile(req, res, html);
    });
  });
});

// ---------- the game, over WebSockets ----------
const wss = new WebSocketServer({ server, maxPayload: 16384 }); // the leaderboard copy a player sends back can be a few KB
wss.on('connection', (ws) => {
  const conn = game.connect({
    send: (text) => { if (ws.readyState === ws.OPEN) ws.send(text); },
    close: () => ws.terminate(),
  });
  ws.on('message', (raw) => conn.message(String(raw)));
  ws.on('close', () => conn.close());
  ws.on('error', () => conn.close());
  ws._alive = true;
  ws.on('pong', () => { ws._alive = true; });
});
// Ping everyone now and then: keeps proxies from closing quiet connections,
// and drops ones that have died without saying goodbye.
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._alive === false) { ws.terminate(); continue; }
    ws._alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`Drift Club running on http://localhost:${PORT}`);
});

// Shutting down (a redeploy, or the host putting it to sleep): save a
// leaderboard change that's still waiting first, giving it a few seconds.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    const pending = game.flushBoards();
    if (pending) await Promise.race([pending, new Promise((r) => setTimeout(r, 4000))]);
    process.exit(0);
  });
}
