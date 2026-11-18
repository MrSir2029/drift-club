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
import { createGame, beaconTag } from './server/core.js';

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
// Cloudflare Web Analytics: the token from Cloudflare's JS snippet.
const BEACON = beaconTag(process.env.CF_BEACON_TOKEN);
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

const game = createGame({
  qualiMs: +process.env.QUALI_MS || 240000,
  note: 'The totals start again from zero whenever the server restarts.',
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
const wss = new WebSocketServer({ server, maxPayload: 2048 });
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
