// Drift Club server: serves the game files and relays car positions between
// everyone in a room. Rooms are identified by a short 4-letter code.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_PLAYERS = 20;
const TOTAL_LAPS = 3; // default; the host can pick 1 to MAX_LAPS
const MAX_LAPS = 10;
const TRACK_COUNT = 4;
const RESULTS_GRACE_MS = 45000; // after the first finisher, wait this long for the rest
const BROADCAST_HZ = 30;
const QUALI_MS = +process.env.QUALI_MS || 240000; // qualifying session length

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Cloudflare Web Analytics: put the token from Cloudflare's JS snippet in the
// CF_BEACON_TOKEN environment variable (on Render: the service's Environment
// tab) and every page loads Cloudflare's beacon, which counts visits without
// cookies. With no token set, nothing is added.
const CF_TOKEN = String(process.env.CF_BEACON_TOKEN || '').replace(/[^A-Za-z0-9]/g, '');
const BEACON = CF_TOKEN ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_TOKEN}"}'></script>\n` : '';
const withBeacon = (html) => BEACON ? html.toString().replace('</body>', BEACON + '</body>') : html;

// ---------- static file server ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url.pathname === '/stats.json') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ...liveCounts(), since: stats.since, peak: stats.peak, peakAt: stats.peakAt, visits: stats.visits, races: stats.races }));
  }
  if (url.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    return res.end(statsPage());
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      // Unknown paths fall back to the app so room links like /ABCD work.
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(withBeacon(html));
      });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(path.extname(full) === '.html' ? withBeacon(data) : data);
  });
});

// ---------- rooms ----------
const rooms = new Map();

// ---------- who's playing: /stats ----------
// Live counts, plus totals since the server started. Nothing is stored, so
// the totals reset whenever the server restarts.
const stats = { since: Date.now(), visits: 0, races: 0, peak: 0, peakAt: Date.now() };
function liveCounts() {
  let inRooms = 0, racing = 0;
  for (const r of rooms.values()) {
    inRooms += r.players.size;
    if (r.phase === 'countdown' || r.phase === 'racing') racing += r.players.size;
  }
  const online = wss.clients.size;
  return { online, racing, lobby: inRooms - racing, home: Math.max(0, online - inRooms), rooms: rooms.size };
}
function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 86400)} days`;
}
function statsPage() {
  const c = liveCounts();
  const box = (n, label) => `<div class="box"><b>${n}</b><span>${label}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10"><title>Who's playing</title>
<style>
body { margin: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; background: #8ad4f5; color: #1d2230; }
main { max-width: 560px; margin: 24px auto; padding: 20px; background: #fffaf0; border: 3px solid #1d2230; border-radius: 16px; box-shadow: 0 6px 0 #1d2230; }
h1 { margin: 0 0 14px; font-size: 26px; } h2 { font-size: 15px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
.big { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; } .big b { font-size: 64px; line-height: 1; color: #ff8a3d; -webkit-text-stroke: 2px #1d2230; }
.big span { font-size: 20px; font-weight: 800; }
.row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.box { border: 3px solid #1d2230; border-radius: 12px; padding: 8px 10px; background: #fff; } .box b { display: block; font-size: 26px; } .box span { font-size: 13px; font-weight: 700; color: #6b7280; }
ul { margin: 0; padding-left: 20px; line-height: 1.7; font-weight: 600; } .note { font-size: 13px; color: #6b7280; font-weight: 600; margin: 18px 0 0; }
</style></head><body><main>
<h1>Drift Club: who's playing</h1>
<div class="big"><b>${c.online}</b><span>${c.online === 1 ? 'person' : 'people'} online now</span></div>
<div class="row">${box(c.racing, 'racing')}${box(c.lobby, 'in a lobby')}${box(c.home, 'on the home screen')}${box(c.rooms, c.rooms === 1 ? 'room open' : 'rooms open')}</div>
<h2>Since the server started, ${ago(stats.since)} ago</h2>
<ul><li>Most online at once: <b>${stats.peak}</b>${stats.peak ? ` (${ago(stats.peakAt)} ago)` : ''}</li><li>Times the game was opened: <b>${stats.visits}</b></li><li>Races started: <b>${stats.races}</b></li></ul>
<p class="note">Updates by itself every 10 seconds. The totals start again from zero whenever the server restarts (after a deploy, or when Render's free plan puts it to sleep because nobody's on). For visitors over days and weeks, see Cloudflare Web Analytics.</p>
</main></body></html>`;
}
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0

function makeCode() {
  for (let tries = 0; tries < 50; tries++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  return null;
}

function cleanName(raw) {
  const s = String(raw || '').replace(/[^A-Za-z0-9 _\-]/g, '').trim().slice(0, 12);
  return s || 'Racer';
}

function cleanColor(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 12 ? n : Math.floor(Math.random() * 12);
}

let nextPlayerId = 1;

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function roomSnapshot(room) {
  return {
    t: 'room',
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    car: room.car,
    phase: room.phase,
    laps: room.laps,
    maxPlayers: MAX_PLAYERS,
    grid: room.grid,
    times: room.gridTimes, // best qualifying lap per player id, for the lobby
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color })),
  };
}

function createRoom(hostPlayer) {
  const code = makeCode();
  if (!code) return null;
  const room = {
    code,
    hostId: hostPlayer.id,
    trackId: 0,
    car: 'open',    // open | rally | camry: everyone in the room drives the same class
    laps: TOTAL_LAPS,
    phase: 'lobby', // lobby | countdown | racing | results
    players: new Map(),
    startAt: 0,
    mode: 'race',   // race | quali | dash
    grid: null,     // player ids in qualifying order, used for the next race start
    gridTimes: null,
    dirty: new Set(), // players whose position changed since the last broadcast
    endTimer: null,
    results: [],
    resultsTimer: null,
    lastStates: new Map(),
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, player) {
  room.players.set(player.id, player);
  player.room = room;
  send(player.ws, { t: 'joined', id: player.id, code: room.code });
  broadcast(room, roomSnapshot(room));
}

function removePlayer(player) {
  const room = player.room;
  if (!room) return;
  room.players.delete(player.id);
  room.lastStates.delete(player.id);
  room.dirty.delete(player.id);
  player.room = null;
  if (room.players.size === 0) {
    if (room.resultsTimer) clearTimeout(room.resultsTimer);
    if (room.endTimer) clearTimeout(room.endTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) {
    room.hostId = room.players.keys().next().value;
  }
  broadcast(room, { t: 'left', id: player.id });
  broadcast(room, roomSnapshot(room));
  if (room.phase === 'racing' && room.mode !== 'quali') maybeFinishRace(room);
}

function startRace(room, mode) {
  room.mode = mode === 'quali' || mode === 'dash' ? mode : 'race'; // dash = first to the 9LAT2 building
  room.phase = 'countdown';
  room.results = [];
  room.lastStates.clear();
  room.dirty.clear();
  for (const p of room.players.values()) { p.finished = false; p.best = null; }
  room.startAt = Date.now() + 4000;
  stats.races++;
  broadcast(room, startMessage(room));
  setTimeout(() => { if (room.phase === 'countdown') room.phase = 'racing'; }, 4000);
  if (room.endTimer) clearTimeout(room.endTimer);
  room.endTimer = room.mode === 'quali' ? setTimeout(() => endQualifying(room), 4000 + QUALI_MS) : null;
}

function startMessage(room, extra) {
  return { t: 'start', mode: room.mode, startAt: room.startAt, endAt: room.startAt + QUALI_MS, trackId: room.trackId, car: room.car, laps: room.laps, grid: room.mode !== 'quali' ? room.grid : null, now: Date.now(), ...extra };
}

// Qualifying ends on the clock: fastest lap first, no-time drivers at the back.
function endQualifying(room) {
  if (room.mode !== 'quali' || (room.phase !== 'racing' && room.phase !== 'countdown')) return;
  room.endTimer = null;
  room.phase = 'results';
  const order = [...room.players.values()].sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
  room.grid = order.map(p => p.id);
  room.gridTimes = {};
  for (const p of order) if (p.best != null) room.gridTimes[p.id] = p.best;
  broadcast(room, { t: 'results', quali: true, results: order.map(p => ({ id: p.id, name: p.name, color: p.color, time: p.best ?? null })) });
}

function maybeFinishRace(room) {
  const everyoneDone = [...room.players.values()].every(p => p.finished);
  if (everyoneDone) showResults(room);
}

function showResults(room) {
  if (room.phase !== 'racing' || room.mode === 'quali') return;
  room.phase = 'results';
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
  const dnf = [...room.players.values()].filter(p => !p.finished).map(p => ({ id: p.id, name: p.name, color: p.color, time: null }));
  // a photo finish is decided by the times, not by whose message arrived first
  const done = [...room.results].sort((a, b) => a.time - b.time);
  broadcast(room, { t: 'results', mode: room.mode, results: [...done, ...dnf] });
}

// ---------- websocket handling ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', (ws) => {
  stats.visits++;
  if (wss.clients.size > stats.peak) { stats.peak = wss.clients.size; stats.peakAt = Date.now(); }
  const player = { id: nextPlayerId++, ws, name: 'Racer', color: 0, room: null, finished: false, stateCount: 0, alive: true };

  ws.on('pong', () => { player.alive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = player.room;

    switch (msg.t) {
      case 'create': {
        if (room) removePlayer(player);
        player.name = cleanName(msg.name);
        player.color = cleanColor(msg.color);
        const newRoom = createRoom(player);
        if (!newRoom) return send(ws, { t: 'error', msg: 'Server is full, try again later.' });
        addPlayer(newRoom, player);
        break;
      }
      case 'join': {
        if (room) removePlayer(player);
        const code = String(msg.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        const target = rooms.get(code);
        if (!target) return send(ws, { t: 'error', msg: `No room called ${code || '?'}. Check the code and try again.` });
        if (target.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'That room is full (20 racers max).' });
        player.name = cleanName(msg.name);
        player.color = cleanColor(msg.color);
        player.best = null;
        player.finished = target.mode !== 'quali' && (target.phase === 'racing' || target.phase === 'countdown'); // late joiners spectate a race, but can join qualifying
        addPlayer(target, player);
        if (target.phase === 'countdown' || target.phase === 'racing') {
          send(ws, startMessage(target, { spectate: target.mode !== 'quali' }));
        }
        break;
      }
      case 'track': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        const id = Number(msg.trackId);
        if (Number.isInteger(id) && id >= 0 && id < TRACK_COUNT) {
          if (room.trackId !== id) room.grid = room.gridTimes = null; // a grid only counts for the track it was set on
          room.trackId = id;
          broadcast(room, roomSnapshot(room));
        }
        break;
      }
      case 'car': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        const car = msg.car === 'rally' || msg.car === 'camry' ? msg.car : 'open';
        if (room.car !== car) { room.car = car; room.grid = room.gridTimes = null; broadcast(room, roomSnapshot(room)); }
        break;
      }
      case 'laps': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        const n = msg.laps | 0;
        if (n >= 1 && n <= MAX_LAPS && n !== room.laps) { room.laps = n; broadcast(room, roomSnapshot(room)); }
        break;
      }
      case 'start': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        startRace(room, msg.mode);
        break;
      }
      case 'lap': {
        if (!room || room.mode !== 'quali' || room.phase !== 'racing') return;
        const time = +msg.time;
        if (!(time > 5000 && time < 3600000)) return;
        if (player.best == null || time < player.best) {
          player.best = Math.round(time);
          broadcast(room, { t: 'best', id: player.id, time: player.best });
        }
        break;
      }
      case 'endquali': {
        if (!room || room.hostId !== player.id) return;
        if (room.endTimer) clearTimeout(room.endTimer);
        endQualifying(room);
        break;
      }
      case 'state': {
        // [t, x, y, z, heading, vx, vz, yawRate, groundPitch, groundRoll, lap, nextGate, progress, flags, bodyPitch, bodyRoll]
        // t is the sender's own clock: receivers use it to space the positions
        // out evenly however unevenly the network delivers them.
        if (!room || (room.phase !== 'racing' && room.phase !== 'countdown')) return;
        if (++player.stateCount > 70) return; // per-second budget, reset by the ticker
        const a = msg.s;
        if (!Array.isArray(a) || a.length < 14) return;
        const n = (i, lo, hi) => { const v = +a[i]; return v >= lo && v <= hi ? v : 0; };
        room.lastStates.set(player.id, [
          player.id, n(0, 0, 1e12),
          n(1, -5000, 5000), n(2, -500, 500), n(3, -5000, 5000),
          n(4, -1e4, 1e4), n(5, -200, 200), n(6, -200, 200), n(7, -20, 20), n(8, -2, 2), n(9, -2, 2),
          Math.max(0, Math.min(999, a[10] | 0)), Math.max(0, Math.min(99, a[11] | 0)), n(12, 0, 1), a[13] & 7,
          n(14, -1, 1), n(15, -1, 1),
        ]);
        room.dirty.add(player.id);
        break;
      }
      case 'finish': {
        if (!room || room.phase !== 'racing' || room.mode === 'quali' || player.finished) return;
        const time = Math.max(0, Math.min(3600000, +msg.time || 0));
        player.finished = true;
        room.results.push({ id: player.id, name: player.name, color: player.color, time });
        broadcast(room, { t: 'finished', id: player.id, time, place: room.results.length });
        if (room.results.length === 1) {
          room.resultsTimer = setTimeout(() => showResults(room), RESULTS_GRACE_MS);
        }
        maybeFinishRace(room);
        break;
      }
      case 'lobby': {
        if (!room || room.hostId !== player.id || room.phase !== 'results') return;
        room.phase = 'lobby';
        room.lastStates.clear();
        room.dirty.clear();
        broadcast(room, roomSnapshot(room));
        break;
      }
      case 'leave': {
        if (room) removePlayer(player);
        break;
      }
    }
  });

  ws.on('close', () => removePlayer(player));
  ws.on('error', () => removePlayer(player));
});

// Position broadcast tick: everyone in a racing room gets the positions that
// changed since the last tick, in one small message.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.dirty.size === 0) continue;
    if (room.phase === 'racing' || room.phase === 'countdown') {
      const list = [];
      for (const id of room.dirty) { const s = room.lastStates.get(id); if (s) list.push(s); }
      if (list.length) broadcast(room, { t: 's', s: list });
    }
    room.dirty.clear();
  }
}, 1000 / BROADCAST_HZ);

// Reset per-second message budgets and drop dead connections.
setInterval(() => {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) p.stateCount = 0;
  }
}, 1000);

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._alive === false) { ws.terminate(); continue; }
    ws._alive = false;
    ws.ping();
  }
}, 15000);
wss.on('connection', (ws) => { ws._alive = true; ws.on('pong', () => { ws._alive = true; }); });

server.listen(PORT, () => {
  console.log(`Drift Club running on http://localhost:${PORT}`);
});
