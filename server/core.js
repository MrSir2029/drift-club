// The game server itself: rooms, races, and relaying car positions between
// everyone in a room. It doesn't know what it runs on: server.js (Node, for
// running it on your own computer or a Node host) and worker.js (Cloudflare)
// hand it connections, each with a send() and a close().

const MAX_PLAYERS = 20;
const TOTAL_LAPS = 3; // default; the host can pick 1 to MAX_LAPS
const MAX_LAPS = 10;
const TRACK_COUNT = 8;
const RESULTS_GRACE_MS = 45000; // after the first finisher, wait this long for the rest
const COUNTDOWN_MS = 4000; // the start lights
const BROADCAST_HZ = 30;
const SILENT_MS = 150000; // a connection that sends nothing at all (clients send a heartbeat every 25 s) is dropped
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, they look like 1 and 0
const CAR_CLASSES = ['open', 'rally', 'camry'];

// ---- leaderboard settings ----
const BOARD_SIZE = 10;
// Bump this to wipe every leaderboard and start a new season: boards saved
// under an older season are ignored.
const BOARD_SEASON = 1;
// The leaderboard ignores laps no car could manage: quicker than flat out at
// top speed the whole way round (with 10% in hand for cutting the corners).
// Lengths in metres, one per track in tracks.js; top speeds in m/s, as in
// CAR_CLASSES in game.js.
const TRACK_LENGTH = [1510, 1867, 1715, 1488, 1423, 1429, 1575, 1776];
// Each track's layout, as 'v' in tracks.js. A new layout starts its board again:
// the layout goes into each time's signature, so old copies don't come back.
const TRACK_VERSION = [1, 1, 1, 1, 2, 2, 1, 2];
// A saved leaderboard (the file in the repo, the copy kept in Upstash) says which layouts its times were set on,
// as 'lay'. One saved before that was written into them (25 Nov 2026) was on these:
const LAYOUTS_UNMARKED = [1, 1, 1, 1, 2, 2, 1, 1];
// A saved leaderboard without the boards and sector records of any track that has been laid out again since it
// was saved: those laps were round a different circuit. (A board's key starts with its track's number.)
export function thisLayoutOnly(snap) {
  if (!snap || typeof snap !== 'object') return snap;
  const lay = Array.isArray(snap.lay) ? snap.lay : LAYOUTS_UNMARKED;
  const keep = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k]) => (lay[+String(k)[0]] || 1) === (TRACK_VERSION[+String(k)[0]] || 1)));
  return { ...snap, boards: keep(snap.boards), sec: keep(snap.sec), lay: [...TRACK_VERSION] };
}
export { TRACK_VERSION };
const TOP_SPEED = { open: 71.2, rally: 61.7, camry: 54.7 };
const minLapMs = (t, c) => 900 * TRACK_LENGTH[t] / TOP_SPEED[c];
// Names with these in them stay off the leaderboard (everyone sees it, not
// just the room). The lists are rot13'd so the code isn't full of swear words:
// the first matches anywhere in a name, the second only as a whole word.
const rot13 = (s) => s.replace(/[a-z]/g, (ch) => String.fromCharCode((ch.charCodeAt(0) - 84) % 26 + 97));
const BLOCKED_ANYWHERE = rot13('shpx fuvg ovgpu phag avtt sntt jnax fyhg juber encvfg anmv uvgyre cbea cravf intva qvyqb obbo chffl ergneq qvpx cvff onfgneq crqbcu cnrqb nffubyr nefrubyr wvmm genaal puvax xvxr spx fulg').split(' ');
const BLOCKED_WORDS = new Set(rot13('nff nefr pbpx pbpxf phz gvg gvgf gjng nahf nany frk frkl encr encre crqb xlf pbba snt fcnm ubzb qvx nmm ubr').split(' '));
const unleet = (s) => s.toLowerCase().replace(/0/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/9/g, 'g');
// Misspellings made to slip past (Fuker, Phuck, Fvck, Fuuuck): the name squashed
// down, letters that sound alike made the same (ph is f; ck, q and a c that isn't
// ch are k; v is u) and doubled letters made single, then checked for these, squashed the same
// way. Only words that can't turn up inside ordinary names once squashed: piss,
// say, would squash to pis and catch Episode.
const squash = (s) => unleet(s).replace(/[^a-z]/g, '').replace(/ph/g, 'f').replace(/ck|c(?!h)|q/g, 'k').replace(/v/g, 'u').replace(/(.)\1+/g, '$1');
const BLOCKED_SQUASHED = rot13('shpx phag ovngpu chffl sphx').split(' ').map(squash);
// Spoonerisms (PhatNucker): the first sounds of two words side by side swapped
// over. Words break at spaces and the like and where a capital starts one; a
// word is also tried split at every letter, in case it's all run together
// (phatnucker). Only the -ucker word is checked after the swap: a short one like
// -uck would catch ordinary names (LuckyFox swaps to Fucky Lox).
const BLOCKED_SPOONER = squash(rot13('shpxre'));
const swapStarts = (a, b) => {
  const [, ca, ra] = a.match(/^([^aeiou]*)(.*)$/), [, cb, rb] = b.match(/^([^aeiou]*)(.*)$/);
  return ca && cb && ra && rb ? cb + ra + ca + rb : '';
};
function spoonerisms(name) {
  const words = String(name).replace(/[0-9!]/g, (d) => unleet(d)).replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z]+/).filter(Boolean).map(w => w.toLowerCase());
  const out = [];
  for (let i = 0; i + 1 < words.length; i++) out.push(swapStarts(words[i], words[i + 1]));
  for (const w of words) for (let k = 2; k <= w.length - 2; k++) out.push(swapStarts(w.slice(0, k), w.slice(k)));
  return out.filter(Boolean);
}
// The n-word with its gg swapped for ck, kk, cc, qq or bb, or one g (PhatNicker,
// Nikka, Niger): not straight after an s or a k, so Snickers and Knickers are
// fine, and not Nigeria. Checked on the name with its doubled vowels made single.
const N_WORD = new RegExp(rot13('(^|[^fx])av(?:tt|xx|pp|dd|px|oo|t)(?:n|hu|re(?!vn))'));
// Players renamed by hand, their times kept under the new name: the name they
// raced under (rot13'd, lower case) and the one shown instead. Applied to saved
// times, to copies browsers hand back, and when someone joins with that name.
const RENAMED = new Map([[rot13('cungavpxre'), 'JacksonP'], [rot13('cungahpxre'), 'JacksonP']]);
const renamed = (n) => RENAMED.get(String(n).toLowerCase()) || n;
// Times taken off the board by hand ('name|track|ms', and 'name|track|s<n>|ms'
// for a sector), so the copies kept in browsers and in storage don't bring them
// back; a new time by the same player still counts. LucaC's were set using the
// walls to get round corners, before a lap with a hard wall hit was deleted
// (his lap at Pinto Speedway, Mount Panorama as it was then, stays).
const DROPPED = new Set(['LucaC|1|44251', 'LucaC|4|33400', 'LucaC|5|36485', 'LucaC|5|s0|11484', 'LucaC|5|s1|11799', 'LucaC|5|s2|12600']);
function nameAllowed(name) {
  // (words break at a capital too, so a word hidden in BigAss is found)
  const words = unleet(String(name).replace(/([a-z])([A-Z])/g, '$1 $2')).split(/[^a-z]+/).filter(Boolean), joined = words.join(''), squashed = squash(name);
  return !BLOCKED_ANYWHERE.some(w => joined.includes(w)) && !words.some(w => BLOCKED_WORDS.has(w)) && !BLOCKED_WORDS.has(joined)
    && !BLOCKED_SQUASHED.some(w => squashed.includes(w)) && !N_WORD.test(joined.replace(/([aeiou])\1+/g, '$1'))
    && !spoonerisms(name).some(s => squash(s).includes(BLOCKED_SPOONER));
}

// The Cloudflare Web Analytics beacon for a token (letters and digits only).
export function beaconTag(token) {
  const t = String(token || '').replace(/[^A-Za-z0-9]/g, '');
  return t ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${t}"}'></script>` : '';
}

// stats: totals saved last time (if the host keeps
// them). saveStats(stats): called now and then with the totals to keep.
// note: a line for the bottom of the /stats page about how the totals behave.
// boards / saveBoards(boards): the leaderboard, for hosts that can keep it.
// sign(text): for hosts that can't keep it. It returns a short signature only
// this server can make, which lets players' browsers hold copies of the
// leaderboard and hand them back after a restart without being able to
// change them.
// dropSilent: drop connections that send nothing for a while, for hosts that
// can't tell when a connection has died.
// pairStates: ask clients to send their positions two at a time (half the
// messages, a little less smooth), for hosts that count every message.
// version: the game's version (the top entry of What's new). Every tab is told
// it when it connects, so that one left open since before an update can ask
// its player to refresh (see "old tabs" below). Without it nobody is told.
export function createGame({ stats: savedStats = null, saveStats = null, note = '', pairStates = false, boards: savedBoards = null, saveBoards = null, paths: savedPaths = null, savePath = null, sign = null, dropSilent = false, version = '', poll = null, votes: savedVotes = null, saveVote = null } = {}) {
  const rooms = new Map();
  const conns = new Set();
  let nextPlayerId = 1;
  let tickTimer = null, sweepTimer = null;

  // ---------- the vote ----------
  // poll: { id, options: [[key, label], …] }, the vote that's on (public/updates.js), or null. One answer for each
  // browser, which makes up an id for itself and keeps it; the answer can be sent again (a browser sends its own
  // every time it connects, so a server that has forgotten the votes gets them back as the players return).
  // votes: { who: key } as last saved; saveVote(who, key): for hosts that can keep them.
  const pollKeys = poll ? poll.options.map(([k]) => k) : [];
  const votes = new Map(Object.entries(savedVotes || {}).filter(([who, c]) => /^[A-Za-z0-9_-]{12,40}$/.test(who) && pollKeys.includes(c)));
  const tally = () => { const n = Object.fromEntries(pollKeys.map((k) => [k, 0])); for (const c of votes.values()) n[c]++; return n; };

  // ---------- who's playing ----------
  const stats = { since: Date.now(), visits: 0, races: 0, peak: 0, peakAt: Date.now(), ...(savedStats || {}) };
  let statsSavedAt = 0, statsDirty = false;
  function statsChanged(now = false) {
    statsDirty = true;
    if (saveStats && (now || Date.now() - statsSavedAt > 60000)) { statsSavedAt = Date.now(); statsDirty = false; saveStats({ ...stats }); }
  }
  function liveCounts() {
    let inRooms = 0, racing = 0;
    for (const r of rooms.values()) {
      inRooms += r.players.size;
      if (r.phase === 'countdown' || r.phase === 'racing') racing += r.players.size;
    }
    const online = conns.size;
    return { online, racing, lobby: inRooms - racing, home: Math.max(0, online - inRooms), rooms: rooms.size };
  }
  const statsJson = () => ({ ...liveCounts(), since: stats.since, peak: stats.peak, peakAt: stats.peakAt, visits: stats.visits, races: stats.races, ...(poll ? { vote: { id: poll.id, ...tally() } } : {}) });

  // ---------- leaderboard: the best laps on each track (any car), by name ----------
  // No accounts: a name is a name, and anyone can race under any name. A host
  // that can store things saves the boards (Cloudflare's storage, or on Node an
  // Upstash Redis database: see server.js). Without one, a host that forgets
  // everything when it sleeps (Render's free plan) still has every player's
  // browser keeping a copy to hand back on connecting ('lbseed'); each entry
  // carries the server's signature, so a copy can be returned but not edited.
  const boards = new Map(); // 'track' -> [{ n: name, ms, c: car, num: race number, s: signature }], fastest first
  const boardKey = (t) => String(t);
  const layoutTag = (k) => ((TRACK_VERSION[+k] || 1) > 1 ? 'v' + TRACK_VERSION[+k] : '');
  // (a time with the race number it was set with has that signed on the end too)
  const signature = (k, n, ms, c, num) => sign(`${BOARD_SEASON}|${k}${layoutTag(k)}|${n}|${ms}|${c}${num != null ? '|' + num : ''}`);
  const raceNum = (num) => (Number.isInteger(num) && num >= 0 && num <= 99 ? num : null);
  // A board's key, read as [track, car]. The car is null for today's boards
  // (one per track, any car); boards from v2.5 were kept per car, 'track:car'.
  function readKey(k) {
    const m = /^(\d)(?::(open|rally|camry))?$/.exec(String(k));
    return m && +m[1] < TRACK_COUNT ? [+m[1], m[2] || null] : null;
  }
  // Puts a lap on the board if it's good enough; returns its place (1..10) or 0.
  function addLap(name, t, c, ms, num) {
    ms = Math.round(ms);
    if (!CAR_CLASSES.includes(c) || !(ms >= minLapMs(t, c) && ms < 3600000) || !nameAllowed(name)) return 0;
    const k = boardKey(t), list = boards.get(k) || [], low = name.toLowerCase();
    const old = list.findIndex(e => e.n.toLowerCase() === low);
    if (old >= 0 && list[old].ms <= ms) return 0; // one line per name: their best
    if (old < 0 && list.length >= BOARD_SIZE && list[list.length - 1].ms <= ms) return 0;
    if (old >= 0) list.splice(old, 1);
    const entry = { n: name, ms, c }, rn = raceNum(num);
    if (rn != null) entry.num = rn; // the race number they set it with, shown next to their name
    if (sign) entry.s = signature(k, name, ms, c, entry.num);
    list.push(entry);
    list.sort((a, b) => a.ms - b.ms);
    if (list.length > BOARD_SIZE) list.length = BOARD_SIZE;
    boards.set(k, list);
    return list.indexOf(entry) + 1;
  }
  // ---------- how each lap on the leaderboard was driven ----------
  // 'track|name' -> { ms, p }: the path of that lap, as the browser that set it recorded it (base64: a four-byte
  // header, then five bytes a sample; game.js packs and unpacks it). Kept only for laps that are on a board, so
  // anyone can watch them: as a ghost car in Polytrack mode, as a line on the leaderboard. Not signed: a path
  // proves nothing, it's only to look at. Each is saved on its own (savePath), not with the boards.
  const PATH_MAX = 12400; // characters: about three minutes at ten samples a second
  const paths = new Map();
  const pathKey = (k, name) => `${k}|${String(name).toLowerCase()}`;
  const goodPath = (p) => typeof p === 'string' && p.length >= 24 && p.length <= PATH_MAX && /^[A-Za-z0-9+/]+={0,2}$/.test(p);
  // (A path the server has kept is signed like a lap, so that a browser can hand its copy back after a restart:
  // the signature covers whose lap, its time and every character of the path.)
  const pathSignature = (k, n, ms, p) => sign(`${BOARD_SEASON}|path|${k}${layoutTag(k)}|${String(n).toLowerCase()}|${ms}|${p}`);
  const onBoard = (key, ms) => { const at = key.indexOf('|'), list = boards.get(key.slice(0, at)) || []; return list.some((e) => e.n.toLowerCase() === key.slice(at + 1) && e.ms === ms); };
  // tick the laps on board k that have a path (g: 1), and forget the paths of laps that have left it
  function tidyPaths(k) {
    for (const e of boards.get(k) || []) delete e.g; // (4.1: nobody can see anyone else's racing line or ghost any more, so no lap is ticked as having one. The owner: people leak the methods.)
    for (const [key, g] of paths) if (key.startsWith(k + '|') && !onBoard(key, g.ms)) { paths.delete(key); if (savePath) savePath(key, null); }
  }
  // ---------- the best time ever through each third of each track ----------
  // Purple in Polytrack mode's sector times. They only come with laps that
  // count for the leaderboard (on this server's clock, and adding up to the
  // lap), and are kept and handed back the same way as the boards, signed.
  const secRecs = new Map(); // 'track' -> [{ n: name, ms, s: signature } or null] for sectors 1, 2 and 3
  const secSignature = (k, i, n, ms) => sign(`${BOARD_SEASON}|sector|${k}${layoutTag(k)}|${i}|${n}|${ms}`);
  function addSector(t, i, name, ms, c) {
    ms = Math.round(ms);
    if (!(i === 0 || i === 1 || i === 2) || !(t >= 0 && t < TRACK_COUNT) || !(ms >= minLapMs(t, c) / 3 && ms < 1200000) || !nameAllowed(name)) return false;
    const k = boardKey(t), list = secRecs.get(k) || [null, null, null];
    if (list[i] && list[i].ms <= ms) return false;
    list[i] = { n: name, ms };
    if (sign) list[i].s = secSignature(k, i, name, ms);
    secRecs.set(k, list);
    return true;
  }
  function sectorsChanged(k) {
    const data = JSON.stringify({ t: 'srec', k, list: secRecs.get(k) });
    for (const p of conns) { try { p.sock.send(data); } catch {} }
    if (saveBoards) boardsTimer ??= setTimeout(() => { boardsTimer = null; boardsNow(); }, 20000);
  }
  let boardsTimer = null;
  const boardsNow = () => saveBoards({ season: BOARD_SEASON, lay: [...TRACK_VERSION], boards: Object.fromEntries(boards), sec: Object.fromEntries(secRecs) });
  function boardChanged(k) {
    tidyPaths(k);
    const data = JSON.stringify({ t: 'lb', k, list: boards.get(k) });
    for (const p of conns) { try { p.sock.send(data); } catch {} }
    if (saveBoards) boardsTimer ??= setTimeout(() => { boardsTimer = null; boardsNow(); }, 20000);
  }
  savedBoards = thisLayoutOnly(savedBoards);
  if (savedBoards && savedBoards.season === BOARD_SEASON) {
    for (const [k, list] of Object.entries(savedBoards.boards || {})) {
      const kv = readKey(k);
      if (kv && Array.isArray(list)) for (const e of list) if (e && typeof e.n === 'string' && !DROPPED.has(`${cleanName(e.n)}|${kv[0]}|${+e.ms}`)) addLap(renamed(cleanName(e.n)), kv[0], kv[1] || e.c, +e.ms, e.num);
    }
    for (const [k, list] of Object.entries(savedBoards.sec || {})) {
      if (Array.isArray(list)) list.forEach((e, i) => { if (e && typeof e.n === 'string' && !DROPPED.has(`${cleanName(e.n)}|${+k}|s${i}|${+e.ms}`)) addSector(+k, i, renamed(cleanName(e.n)), +e.ms, 'open'); });
    }
  }
  // the saved paths, for the laps that are still on a board (one whose lap has gone is deleted from the store too)
  if (savedPaths && typeof savedPaths === 'object') {
    for (const [key, g] of Object.entries(savedPaths)) {
      if (g && Number.isInteger(g.ms) && goodPath(g.p) && key.includes('|') && onBoard(key, g.ms)) paths.set(key, { ms: g.ms, p: g.p });
      else if (savePath) savePath(key, null);
    }
    for (const k of boards.keys()) tidyPaths(k);
  }

  // ---------- helpers ----------
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
  // a name with a bad word in it (the same list the leaderboard uses) becomes Racer
  function safeName(raw) {
    const n = renamed(cleanName(raw));
    return nameAllowed(n) ? n : 'Racer';
  }
  // the car number a player asked for: a whole number 0 to 99, or null for a random one
  function cleanNum(raw) {
    return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 99 ? raw : null;
  }
  function cleanColor(raw) {
    const n = Number(raw);
    // 12 is the secret livery; a random one is never that or brown (10), which
    // isn't on the home screen any more
    return Number.isInteger(n) && n >= 0 && n < 13 ? n : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11][Math.floor(Math.random() * 11)];
  }
  // [t, x, y, z, heading, vx, vz, yawRate, groundPitch, groundRoll, lap, nextGate, progress, flags, bodyPitch, bodyRoll]
  // t is the sender's own clock: receivers use it to space the positions out
  // evenly however unevenly the network delivers them.
  function cleanState(id, a) {
    if (!Array.isArray(a) || a.length < 14) return null;
    const n = (i, lo, hi) => { const v = +a[i]; return v >= lo && v <= hi ? v : 0; };
    return [
      id, n(0, 0, 1e12),
      n(1, -5000, 5000), n(2, -500, 500), n(3, -5000, 5000),
      n(4, -1e4, 1e4), n(5, -200, 200), n(6, -200, 200), n(7, -20, 20), n(8, -2, 2), n(9, -2, 2),
      Math.max(0, Math.min(999, a[10] | 0)), Math.max(0, Math.min(99, a[11] | 0)), n(12, 0, 1), a[13] & 7,
      n(14, -1, 1), n(15, -1, 1),
    ];
  }
  function send(p, msg) {
    try { p.sock.send(JSON.stringify(msg)); } catch {}
  }
  function broadcast(room, msg) {
    const data = JSON.stringify(msg);
    for (const p of room.players.values()) { try { p.sock.send(data); } catch {} }
  }

  // ---------- old tabs ----------
  // A tab left open keeps running the game as it was when it was opened, and
  // updating the game restarts the server, so after an update every open tab
  // reconnects still running the old one. From 3.57 a tab says which version it
  // is first thing ('ver'), is told the server's, and puts up its own notice
  // with a Refresh button if it's behind. Tabs from before 3.57 say nothing,
  // and the only words they can be made to show are an 'error' message, which
  // they pop up for a few seconds: so that is how they're reminded, when they
  // connect, when they get into a room and after each session.
  const REFRESH = 'A new update is out. Refresh this tab to get it.';
  function nudge(p) {
    if (!version || p.ver !== undefined) return;
    p.nudged = true;
    send(p, { t: 'error', msg: REFRESH });
  }
  function roomSnapshot(room) {
    return {
      t: 'room', code: room.code, hostId: room.hostId, trackId: room.trackId, car: room.car, phase: room.phase, laps: room.laps,
      maxPlayers: MAX_PLAYERS, grid: room.grid,
      times: room.gridTimes, // best qualifying lap per player id, for the lobby
      // spec: joined a race part-way through, so watching it, not racing
      players: [...room.players.values()].map(p => (p.spec ? { id: p.id, name: p.name, color: p.color, num: p.num, spec: 1 } : { id: p.id, name: p.name, color: p.color, num: p.num })),
    };
  }

  // ---------- rooms ----------
  function createRoom(host) {
    const code = makeCode();
    if (!code) return null;
    const room = {
      code, hostId: host.id, trackId: 0,
      car: 'open',    // open | rally | camry: everyone in the room drives the same class
      laps: TOTAL_LAPS,
      phase: 'lobby', // lobby | countdown | racing | results
      players: new Map(), startAt: 0,
      mode: 'race',   // race | quali
      grid: null,     // player ids in qualifying order, used for the next race start
      gridTimes: null,
      dirty: new Set(), // players with positions waiting to go out
      endTimer: null, results: [], resultsTimer: null,
    };
    rooms.set(code, room);
    return room;
  }
  function addPlayer(room, p) {
    // the race number on the car: the one they asked for if nobody here has
    // it, or else a random one from 2 to 99 that nobody here has
    const used = new Set([...room.players.values()].map(o => o.num));
    if (p.wantNum != null && !used.has(p.wantNum)) p.num = p.wantNum;
    else do p.num = 2 + Math.floor(Math.random() * 98); while (used.has(p.num) && used.size < 98);
    room.players.set(p.id, p);
    p.room = room;
    // their times on the board from before race numbers were kept there take this one
    for (const [k, list] of boards) {
      const e = list.find(x => x.n.toLowerCase() === p.name.toLowerCase());
      if (e && e.num == null && p.name !== 'Racer') { e.num = p.num; if (sign) e.s = signature(k, e.n, e.ms, e.c, e.num); boardChanged(k); }
    }
    send(p, { t: 'joined', id: p.id, code: room.code, pair: pairStates, name: p.name, num: p.num });
    broadcast(room, roomSnapshot(room));
  }
  function removePlayer(p) {
    const room = p.room;
    if (!room) return;
    room.players.delete(p.id);
    room.dirty.delete(p.id);
    p.room = null; p.q.length = 0;
    if (room.players.size === 0) {
      if (room.resultsTimer) clearTimeout(room.resultsTimer);
      if (room.endTimer) clearTimeout(room.endTimer);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === p.id) room.hostId = room.players.keys().next().value;
    broadcast(room, { t: 'left', id: p.id });
    broadcast(room, roomSnapshot(room));
    if (room.phase === 'racing' && room.mode !== 'quali') maybeFinishRace(room);
  }
  function resetPositions(room) {
    room.dirty.clear();
    for (const p of room.players.values()) { p.q.length = 0; p.lastT = 0; }
  }
  function startRace(room, mode) {
    room.mode = mode === 'quali' ? 'quali' : 'race'; // (there was a third, a dash to the 9LAT2 building: a tab still running that version gets a race)
    room.phase = 'countdown';
    room.results = [];
    resetPositions(room);
    for (const p of room.players.values()) { p.finished = false; p.spec = false; p.best = null; p.lapAt = 0; }
    room.sectors = [null, null, null]; // Polytrack mode: the best time through each third of the lap this session
    room.startAt = Date.now() + COUNTDOWN_MS;
    stats.races++; statsChanged(true);
    broadcast(room, startMessage(room));
    setTimeout(() => { if (room.phase === 'countdown') room.phase = 'racing'; }, COUNTDOWN_MS);
    if (room.endTimer) clearTimeout(room.endTimer);
    room.endTimer = null; // Polytrack mode ('quali') runs until the host ends it
    tickTimer ??= setInterval(tick, 1000 / BROADCAST_HZ);
  }
  function startMessage(room, extra) {
    return { t: 'start', mode: room.mode, startAt: room.startAt, trackId: room.trackId, car: room.car, laps: room.laps, grid: room.mode !== 'quali' ? room.grid : null, sectors: room.mode === 'quali' ? room.sectors : null, now: Date.now(), ...extra };
  }
  // Polytrack mode ends when the host ends it: fastest lap first, no-time drivers at the back.
  function endQualifying(room) {
    if (room.mode !== 'quali' || (room.phase !== 'racing' && room.phase !== 'countdown')) return;
    room.endTimer = null;
    room.phase = 'results';
    const order = [...room.players.values()].sort((a, b) => (a.best ?? Infinity) - (b.best ?? Infinity));
    // Polytrack mode stands on its own: its times don't set the grid for a race
    broadcast(room, { t: 'results', quali: true, results: order.map(p => ({ id: p.id, name: p.name, color: p.color, time: p.best ?? null })) });
    for (const p of room.players.values()) nudge(p);
  }
  function maybeFinishRace(room) {
    if ([...room.players.values()].every(p => p.finished)) showResults(room);
  }
  function showResults(room) {
    if (room.phase !== 'racing' || room.mode === 'quali') return;
    room.phase = 'results';
    if (room.resultsTimer) { clearTimeout(room.resultsTimer); room.resultsTimer = null; }
    const dnf = [...room.players.values()].filter(p => !p.finished).map(p => ({ id: p.id, name: p.name, color: p.color, time: null }));
    // a photo finish is decided by the times, not by whose message arrived first
    const done = [...room.results].sort((a, b) => a.time - b.time);
    broadcast(room, { t: 'results', mode: room.mode, results: [...done, ...dnf] });
    for (const p of room.players.values()) nudge(p);
  }

  // ---------- messages ----------
  function handle(player, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    // which version the tab is (see "old tabs"): a tab that starts with anything else is from before 3.57
    if (msg.t === 'ver') { player.ver = typeof msg.v === 'string' ? msg.v.slice(0, 12) : ''; return; }
    // (told at its first words, unless it's on its way into a room: then once it's in, so the reminder is the last thing it's shown)
    if (!player.nudged && msg.t !== 'create' && msg.t !== 'join') nudge(player);
    const room = player.room;
    switch (msg.t) {
      case 'create': {
        if (room) removePlayer(player);
        player.name = safeName(msg.name);
        player.color = cleanColor(msg.color);
        player.wantNum = cleanNum(msg.num);
        const newRoom = createRoom(player);
        if (!newRoom) return send(player, { t: 'error', msg: 'Server is full, try again later.' });
        addPlayer(newRoom, player);
        nudge(player);
        break;
      }
      case 'join': {
        if (room) removePlayer(player);
        const code = String(msg.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        const target = rooms.get(code);
        if (!target) return send(player, { t: 'error', msg: `No room called ${code || '?'}. Check the code and try again.` });
        if (target.players.size >= MAX_PLAYERS) return send(player, { t: 'error', msg: 'That room is full (20 racers max).' });
        player.name = safeName(msg.name);
        player.color = cleanColor(msg.color);
        player.wantNum = cleanNum(msg.num);
        player.best = null;
        player.lapAt = Math.max(Date.now(), target.startAt); // their first lap runs from now, not from the start of the session
        player.finished = target.mode !== 'quali' && (target.phase === 'racing' || target.phase === 'countdown'); // late joiners spectate a race, but can join qualifying
        player.spec = player.finished;
        addPlayer(target, player);
        if (target.phase === 'countdown' || target.phase === 'racing') send(player, startMessage(target, { spectate: target.mode !== 'quali' }));
        nudge(player);
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
        // a lap in Polytrack mode or in a race; either way it
        // can go on the leaderboard
        if (!room || room.phase !== 'racing') return;
        const time = +msg.time, now = Date.now();
        if (!(time > 5000 && time < 3600000) || player.finished) return;
        // For the leaderboard, the lap has to match this server's own clock:
        // about as long as the time since the player's last lap (or the start).
        const since = now - (player.lapAt || room.startAt);
        player.lapAt = now;
        if (room.mode === 'quali' && (player.best == null || time < player.best)) {
          player.best = Math.round(time);
          broadcast(room, { t: 'best', id: player.id, time: player.best });
        }
        if (Math.abs(time - since) > 3000) return;
        // its three sectors, if they add up to it, for the best-ever sector times
        if (room.mode === 'quali' && Array.isArray(msg.sec) && msg.sec.length === 3) {
          const sec = msg.sec.map(x => Math.round(+x));
          if (sec.every(x => x > 0) && Math.abs(sec[0] + sec[1] + sec[2] - time) <= 50) {
            let better = false;
            sec.forEach((ms, i) => { if (addSector(room.trackId, i, player.name, ms, room.car)) better = true; });
            if (better) sectorsChanged(boardKey(room.trackId));
          }
        }
        const place = addLap(player.name, room.trackId, room.car, time, player.num);
        if (place) {
          // how it was driven, if the browser sent that: kept while the lap is on the board
          if (goodPath(msg.path)) {
            const k = boardKey(room.trackId), key = pathKey(k, player.name), g = { ms: Math.round(time), p: msg.path }; paths.set(key, g); if (savePath) savePath(key, g);
            if (sign) send(player, { t: 'pathkept', k, ms: g.ms, s: pathSignature(k, player.name, g.ms, g.p) }); // (theirs to keep, and hand back if this server forgets it)
          }
          boardChanged(boardKey(room.trackId));
          broadcast(room, { t: 'record', id: player.id, name: player.name, place, time: Math.round(time), track: room.trackId, car: room.car });
        }
        break;
      }
      case 'sector': {
        // Polytrack mode: someone's time through a third of the lap. The best
        // this session goes to everyone, for the purple sectors.
        if (!room || room.phase !== 'racing' || room.mode !== 'quali' || !room.sectors) return;
        const n = msg.n, time = Math.round(+msg.time);
        if (!(n === 0 || n === 1 || n === 2) || !(time > 1000 && time < 600000)) return;
        if (room.sectors[n] && room.sectors[n].time <= time) return;
        room.sectors[n] = { time, id: player.id };
        broadcast(room, { t: 'sector', n, time, id: player.id });
        break;
      }
      case 'restart': {
        // Polytrack mode: the player went back to the grid for a fresh run and
        // has just crossed the line, so their lap starts now
        if (!room || room.phase !== 'racing' || room.mode !== 'quali' || player.finished) return;
        player.lapAt = Date.now();
        break;
      }
      case 'vote': { // their answer to the vote that's on
        if (!poll || msg.poll !== poll.id || !pollKeys.includes(msg.c) || typeof msg.who !== 'string' || !/^[A-Za-z0-9_-]{12,40}$/.test(msg.who)) return;
        if (player.voter && player.voter !== msg.who) return;      // one voter to a connection
        if (!votes.has(msg.who) && votes.size >= 5000) return;     // (and no end of them)
        player.voter = msg.who;
        if (votes.get(msg.who) !== msg.c) { votes.set(msg.who, msg.c); if (saveVote) saveVote(msg.who, msg.c); }
        send(player, { t: 'poll', id: poll.id, n: tally() });
        break;
      }
      case 'path': { // someone wants to watch a lap that's on the leaderboard
        const now = Date.now();
        if (typeof msg.k !== 'string' || typeof msg.n !== 'string' || now - (player.pathAt || 0) < 120) return;
        player.pathAt = now;
        const k = msg.k.slice(0, 8), n = msg.n.slice(0, 16), g = paths.get(pathKey(k, n));
        void g; send(player, { t: 'path', k, n, ms: 0, p: null }); // (4.1: lines are no longer handed out)
        break;
      }
      case 'pathseed': {
        // A browser's copy of a lap's path, handed back: a server that forgets everything when it restarts (Render's
        // free plan, with no database) loses every path, and with them the racing lines and the record's ghost.
        // Taken only if this server signed it, the lap is still on the board, and the board has no path for it.
        const now = Date.now();
        if (!sign || typeof msg.k !== 'string' || typeof msg.n !== 'string' || typeof msg.s !== 'string' || !Number.isInteger(msg.ms) || !goodPath(msg.p) || now - (player.seedAt || 0) < 200) return;
        player.seedAt = now;
        const k = msg.k.slice(0, 8), n = msg.n.slice(0, 16), key = pathKey(k, n);
        if (paths.get(key)?.ms === msg.ms || !onBoard(key, msg.ms) || msg.s !== pathSignature(k, n, msg.ms, msg.p)) return;
        const g = { ms: msg.ms, p: msg.p }; paths.set(key, g); if (savePath) savePath(key, g);
        boardChanged(k);
        break;
      }
      case 'lbseed': {
        // a returning player's copy of the boards (see the leaderboard above):
        // only entries this server signed are taken back
        if (!sign || player.seeded || !msg.boards || typeof msg.boards !== 'object') return;
        player.seeded = true;
        const changed = new Set();
        let n = 0;
        for (const [k, list] of Object.entries(msg.boards)) {
          const kv = readKey(k);
          if (!kv || !Array.isArray(list)) continue;
          const [t, oldCar] = kv;
          for (const e of list.slice(0, BOARD_SIZE)) {
            if (++n > 200) break;
            if (!e || typeof e.n !== 'string' || typeof e.s !== 'string' || !Number.isInteger(e.ms) || e.n !== cleanName(e.n)) continue;
            const c = oldCar || e.c;
            // a v2.5 copy (per car) was signed without the car on the end
            if (!CAR_CLASSES.includes(c) || e.s !== (oldCar ? sign(`${BOARD_SEASON}|${k}|${e.n}|${e.ms}`) : signature(k, e.n, e.ms, c, raceNum(e.num)))) continue;
            if (DROPPED.has(`${e.n}|${t}|${e.ms}`)) continue;
            if (addLap(renamed(e.n), t, c, e.ms, raceNum(e.num))) changed.add(boardKey(t));
          }
        }
        for (const k of changed) boardChanged(k);
        // and their copy of the best sectors
        if (msg.sec && typeof msg.sec === 'object') for (const [k, list] of Object.entries(msg.sec)) {
          if (!/^\d$/.test(k) || !Array.isArray(list)) continue;
          let better = false;
          list.slice(0, 3).forEach((e, i) => {
            if (!e || typeof e.n !== 'string' || typeof e.s !== 'string' || !Number.isInteger(e.ms) || e.n !== cleanName(e.n) || e.s !== secSignature(k, i, e.n, e.ms)) return;
            if (DROPPED.has(`${e.n}|${+k}|s${i}|${e.ms}`)) return;
            if (addSector(+k, i, renamed(e.n), e.ms, 'open')) better = true;
          });
          if (better) sectorsChanged(k);
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
        // A position (s), or two when pairStates is on (q, then s).
        if (!room || (room.phase !== 'racing' && room.phase !== 'countdown')) return;
        const now = Date.now();
        if (now - player.budgetAt >= 1000) { player.budgetAt = now; player.stateCount = 0; }
        if (++player.stateCount > 70) return; // per-second budget
        for (const a of [msg.q, msg.s]) {
          const st = cleanState(player.id, a);
          if (!st || st[1] <= player.lastT) continue; // missing, or older than one already passed on
          player.lastT = st[1];
          player.q.push(st);
          if (player.q.length > 4) player.q.shift();
        }
        if (player.q.length) room.dirty.add(player.id);
        break;
      }
      case 'finish': {
        if (!room || room.phase !== 'racing' || room.mode === 'quali' || player.finished) return;
        const time = Math.max(0, Math.min(3600000, +msg.time || 0));
        player.finished = true;
        room.results.push({ id: player.id, name: player.name, color: player.color, time });
        broadcast(room, { t: 'finished', id: player.id, time, place: room.results.length });
        if (room.results.length === 1) room.resultsTimer = setTimeout(() => showResults(room), RESULTS_GRACE_MS);
        maybeFinishRace(room);
        break;
      }
      case 'lobby': {
        if (!room || room.hostId !== player.id || room.phase !== 'results') return;
        room.phase = 'lobby';
        resetPositions(room);
        for (const p of room.players.values()) p.spec = false; // they only watched the race they joined in the middle of
        broadcast(room, roomSnapshot(room));
        break;
      }
      case 'leave': {
        if (room) removePlayer(player);
        break;
      }
      // 'hb' (the heartbeat) needs nothing: any message counts as a sign of life
    }
  }

  // ---------- timers ----------
  // Position broadcast: everyone in a racing room gets the positions that
  // arrived since the last tick, in one small message. Runs only while a
  // race is on.
  function tick() {
    let live = 0;
    for (const room of rooms.values()) {
      const racing = room.phase === 'racing' || room.phase === 'countdown';
      if (racing) live++;
      if (!room.dirty.size) continue;
      if (racing) {
        const list = [];
        for (const id of room.dirty) { const p = room.players.get(id); if (p && p.q.length) { list.push(...p.q); p.q.length = 0; } }
        if (list.length) broadcast(room, { t: 's', s: list });
      }
      room.dirty.clear();
    }
    if (!live) { clearInterval(tickTimer); tickTimer = null; }
  }
  // Drop connections that have gone silent, and save the totals now and then.
  function sweep() {
    const now = Date.now();
    if (dropSilent) for (const p of conns) if (now - p.seen > SILENT_MS) { try { p.sock.close(); } catch {} drop(p); }
    if (statsDirty) statsChanged();
  }
  function drop(p) {
    if (!conns.delete(p)) return;
    removePlayer(p);
    if (!conns.size) {
      clearInterval(sweepTimer); sweepTimer = null;
      if (statsDirty) statsChanged(true);
    }
  }

  return {
    // A new connection. sock: { send(text), close() }. Returns the handlers
    // to call when it sends a message or closes.
    connect(sock) {
      const p = { id: nextPlayerId++, sock, name: 'Racer', color: 0, room: null, finished: false, best: null, stateCount: 0, budgetAt: 0, seen: Date.now(), q: [], lastT: 0 };
      conns.add(p);
      stats.visits++;
      if (conns.size > stats.peak) { stats.peak = conns.size; stats.peakAt = Date.now(); }
      statsChanged();
      sweepTimer ??= setInterval(sweep, 20000);
      if (version) send(p, { t: 'ver', v: version }); // (a tab that's behind asks its player to refresh: see "old tabs")
      send(p, { t: 'lbs', boards: Object.fromEntries(boards), sec: Object.fromEntries(secRecs), lay: TRACK_VERSION }); // the leaderboard (and best sectors), to start with, and the layouts they're for
      if (poll) send(p, { t: 'poll', id: poll.id, n: tally() }); // the vote that's on, and how it stands
      return {
        message(raw) {
          p.seen = Date.now();
          if (raw.length > 16384) return;
          try { handle(p, raw); } catch (err) { console.error('message failed:', err); } // one bad message must never take the server down
        },
        close() { drop(p); },
      };
    },
    statsJson,
    statsPage: () => statsPage(liveCounts(), stats, note, poll ? { poll, n: tally() } : null),
    // save a leaderboard change that's still waiting (when the server is shutting down)
    flushBoards() {
      if (!boardsTimer) return null;
      clearTimeout(boardsTimer); boardsTimer = null;
      return boardsNow();
    },
  };
}

function ago(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 86400)} days`;
}

function statsPage(c, stats, note, vote) {
  const box = (n, label) => `<div class="box"><b>${n}</b><span>${label}</span></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30"><title>Who's playing</title>
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
<h2>Totals, counted for ${ago(stats.since)}</h2>
<ul><li>Most online at once: <b>${stats.peak}</b>${stats.peak ? ` (${ago(stats.peakAt)} ago)` : ''}</li><li>Times the game was opened: <b>${stats.visits}</b></li><li>Races started: <b>${stats.races}</b></li></ul>
${vote ? `<h2>${vote.poll.title}</h2><ul>${vote.poll.options.map(([k, label]) => `<li>${label}: <b>${vote.n[k]}</b></li>`).join('')}</ul>` : ''}
<p class="note">Updates by itself every 30 seconds. ${note} For visitors over days and weeks, see Cloudflare Web Analytics.</p>
</main></body></html>`;
}
