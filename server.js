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
const TOTAL_LAPS = 3;
const TRACK_COUNT = 3;
const RESULTS_GRACE_MS = 45000; // after the first finisher, wait this long for the rest
const BROADCAST_HZ = 20;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- static file server ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
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
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
});

// ---------- rooms ----------
const rooms = new Map();
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
    phase: room.phase,
    laps: TOTAL_LAPS,
    maxPlayers: MAX_PLAYERS,
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
    phase: 'lobby', // lobby | countdown | racing | results
    players: new Map(),
    startAt: 0,
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
  player.room = null;
  if (room.players.size === 0) {
    if (room.resultsTimer) clearTimeout(room.resultsTimer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === player.id) {
    room.hostId = room.players.keys().next().value;
  }
  broadcast(room, { t: 'left', id: player.id });
  broadcast(room, roomSnapshot(room));
  if (room.phase === 'racing') maybeFinishRace(room);
}

function startRace(room) {
  room.phase = 'countdown';
  room.results = [];
  room.lastStates.clear();
  for (const p of room.players.values()) p.finished = false;
  room.startAt = Date.now() + 4000;
  broadcast(room, { t: 'start', startAt: room.startAt, trackId: room.trackId, laps: TOTAL_LAPS, now: Date.now() });
  setTimeout(() => { if (room.phase === 'countdown') room.phase = 'racing'; }, 4000);
}

function maybeFinishRace(room) {
  const everyoneDone = [...room.players.values()].every(p => p.finished);
  if (everyoneDone) showResults(room);
}

function showResults(room) {
  if (room.phase !== 'racing') return;
  room.phase = 'results';
  if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
  const dnf = [...room.players.values()].filter(p => !p.finished).map(p => ({ id: p.id, name: p.name, color: p.color, time: null }));
  broadcast(room, { t: 'results', results: [...room.results, ...dnf] });
}

// ---------- websocket handling ----------
const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', (ws) => {
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
        player.finished = target.phase === 'racing' || target.phase === 'countdown'; // late joiners spectate
        addPlayer(target, player);
        if (target.phase === 'countdown' || target.phase === 'racing') {
          send(ws, { t: 'start', startAt: target.startAt, trackId: target.trackId, laps: TOTAL_LAPS, now: Date.now(), spectate: true });
        }
        break;
      }
      case 'track': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        const id = Number(msg.trackId);
        if (Number.isInteger(id) && id >= 0 && id < TRACK_COUNT) {
          room.trackId = id;
          broadcast(room, roomSnapshot(room));
        }
        break;
      }
      case 'start': {
        if (!room || room.hostId !== player.id || room.phase !== 'lobby') return;
        startRace(room);
        break;
      }
      case 'state': {
        if (!room || (room.phase !== 'racing' && room.phase !== 'countdown')) return;
        if (++player.stateCount > 40) return; // per-second budget, reset by the ticker
        const s = {
          id: player.id,
          x: +msg.x || 0, y: +msg.y || 0, z: +msg.z || 0,
          h: +msg.h || 0, v: +msg.v || 0,
          lap: Math.max(0, Math.min(TOTAL_LAPS + 1, (msg.lap | 0))),
          cp: Math.max(0, msg.cp | 0),
          pr: Math.max(0, Math.min(1, +msg.pr || 0)),
        };
        room.lastStates.set(player.id, s);
        break;
      }
      case 'finish': {
        if (!room || room.phase !== 'racing' || player.finished) return;
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

// Position broadcast tick: everyone in a racing room gets everyone else's last state.
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== 'racing' && room.phase !== 'countdown') continue;
    if (room.lastStates.size === 0) continue;
    broadcast(room, { t: 'states', s: [...room.lastStates.values()] });
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
