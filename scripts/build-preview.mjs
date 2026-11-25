// Builds a copy of Drift Club that needs no server, for trying a build before it is deployed:
//   npm run build-preview            (writes preview-build/, which isn't committed)
// The game's own server code (server/core.js) runs inside the page, behind something that looks like a WebSocket
// to the game: one player, and nothing leaves the browser. Its leaderboard starts as the live one was when it was
// last saved (server/boards.json) and is the page's own from there: laps set in a preview stay in the preview.
// Three.js comes from a public CDN, so the page does need the internet.
//
// index.html is written the way a Claude artifact page is (no doctype, head or body of its own: the publisher
// wraps it), to publish with the files beside it. local.html is the same page wrapped, for opening yourself:
//   cd preview-build && python3 -m http.server 8080      then http://localhost:8080/local.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.argv[2] || path.join(repo, 'preview-build'));
fs.rmSync(out, { recursive: true, force: true });
const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
const write = (f, text) => { fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true }); fs.writeFileSync(path.join(out, f), text); };
const swap = (text, from, to, name) => { if (!text.includes(from)) throw new Error(`build-preview: "${from}" is not in ${name} any more`); return text.split(from).join(to); };

// ---- the game's own files, with the addresses that assumed its server made relative
// Three.js comes from the public CDN such a page may load scripts from. It is the same release, byte for byte, as
// the copy in public/vendor (keep the two in step: the number here is that copy's REVISION).
const rev = (read('public/vendor/three.core.js').match(/REVISION = '(\d+)'/) || [])[1];
if (!rev) throw new Error('build-preview: no REVISION in public/vendor/three.core.js');
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@0.${rev}.0/build/three.module.js`;
let game = read('public/game.js');
game = swap(game, "from 'three'", `from '${THREE_URL}'`, 'game.js');
game = swap(game, "from '/tracks.js'", "from './tracks.js'", 'game.js');
game = swap(game, "from '/updates.js'", "from './updates.js'", 'game.js');
game = swap(game, '`url(/vendor/fonts/${file})`', '`url(${window.DC_FONTS[file]})`', 'game.js'); // the typefaces come with the page (fonts.js)
write('game.js', game);
write('tracks.js', swap(read('public/tracks.js'), "from 'three'", `from '${THREE_URL}'`, 'tracks.js'));
write('updates.js', read('public/updates.js'));
write('style.css', read('public/style.css'));
// The server's code, without what the live server keeps to itself: the name filter's word lists and the renames and
// removals made by hand for particular players. A preview has one player and a board of its own, so it needs none.
let core = read('server/core.js');
const cutFrom = core.indexOf('// Names with these in them stay off the leaderboard'), cutTo = core.indexOf('// stats: totals saved last time');
if (cutFrom < 0 || cutTo < cutFrom) throw new Error('build-preview: the name filter is not where it was in server/core.js');
core = core.slice(0, cutFrom) + `// (The live server's name filter, and its renames and removals made by hand, are left out of the preview.)
const renamed = (n) => n;
const DROPPED = new Set();
const nameAllowed = () => true;

` + core.slice(cutTo);
for (const word of ['rot13', 'BLOCKED_', 'RENAMED', 'LucaC', 'beaconTag']) if (core.includes(word)) throw new Error(`build-preview: "${word}" is still in the preview's core.js`);
write('core.js', core);

// ---- the typefaces, inside a script (a page like this can't count on fetching font files)
const fonts = {};
for (const f of fs.readdirSync(path.join(repo, 'public/vendor/fonts')).filter((f) => f.endsWith('.woff2'))) fonts[f] = 'data:font/woff2;base64,' + fs.readFileSync(path.join(repo, 'public/vendor/fonts', f)).toString('base64');
write('fonts.js', `// the sponsors' typefaces (see public/vendor/fonts in the repository for what they are and their licences)\nwindow.DC_FONTS = ${JSON.stringify(fonts)};\n`);

// ---- the server, in the page
let saved = null, savedPaths = null;
try { saved = JSON.parse(read('server/boards.json')); } catch {}
try { savedPaths = JSON.parse(read('server/paths.json')); } catch {} // (the racing lines saved with them)
write('local-server.js', `// Drift Club's server, running in this page. The game opens a WebSocket to its server; here that "socket" hands
// each message straight to the server's own code (core.js). One player, and nothing leaves the browser: the
// leaderboard starts as the live one was when last saved, and is this page's own from there.
import { createGame } from './core.js';
const SAVED = ${JSON.stringify(saved)}, SAVED_PATHS = ${JSON.stringify(savedPaths)};
const sign = (text) => { let a = 2166136261, b = 5381; for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) + c) | 0; } return ((a >>> 0).toString(36) + (b >>> 0).toString(36)).padStart(12, '0').slice(0, 12); };
const game = createGame({ note: 'A preview: these totals are this page\\'s own.', sign, boards: SAVED, paths: SAVED_PATHS });
class LocalSocket {
  constructor() {
    this.readyState = 0; this.onopen = this.onclose = this.onmessage = this.onerror = null;
    setTimeout(() => {
      this.conn = game.connect({ send: (text) => setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: text }); }, 0), close: () => this.close() });
      this.readyState = 1; if (this.onopen) this.onopen({});
    }, 0);
  }
  send(text) { if (this.readyState === 1) setTimeout(() => { if (this.readyState === 1) this.conn.message(String(text)); }, 0); }
  close() { if (this.readyState === 3) return; this.readyState = 3; if (this.conn) this.conn.close(); setTimeout(() => { if (this.onclose) this.onclose({ code: 1000 }); }, 0); }
}
LocalSocket.CONNECTING = 0; LocalSocket.OPEN = 1; LocalSocket.CLOSING = 2; LocalSocket.CLOSED = 3;
window.WebSocket = LocalSocket;
`);

// ---- the page: the game's own, as an artifact page (no doctype, head or body of its own: the publisher wraps it)
const html = read('public/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script type="module" src="/game.js">'));
const version = (read('public/updates.js').match(/v: '([\d.]+)'/) || [])[1] || '';
const page = `<title>Drift Club Preview</title>
<link rel="stylesheet" href="style.css">
<style>
  /* preview only: a tag on the home screen that says what this is */
  #preview-tag { display: none; position: fixed; left: max(12px, env(safe-area-inset-left, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); z-index: 60; padding: 5px 10px; border-radius: 999px;
    background: #1d2230; color: #f6f2e8; font: 700 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; letter-spacing: 0.04em; pointer-events: none; }
  #screen-home:not(.hidden) ~ #preview-tag { display: block; }
</style>
${body.trim()}

<div id="preview-tag">PREVIEW ${version ? 'OF v' + version : 'BUILD'} · solo · not the live game</div>

<script>
  // Preview only. Storage that can't be used becomes storage that forgets; the address bar is left alone (the game
  // would put its room code there); and the keep-awake call to the server, which isn't there, quietly succeeds.
  (function () {
    try { localStorage.setItem('dc-preview', '1'); localStorage.removeItem('dc-preview'); }
    catch (e) { const m = new Map(), s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; try { Object.defineProperty(window, 'localStorage', { value: s, configurable: true }); } catch (e2) {} }
    try { History.prototype.replaceState = function () {}; History.prototype.pushState = function () {}; } catch (e) {}
    const realFetch = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = (url, opts) => (String(url) === '/healthz' || !realFetch ? Promise.resolve(new Response('ok')) : realFetch(url, opts));
  })();
</script>
<script src="fonts.js"></script>
<script type="module" src="local-server.js"></script>
<script type="module" src="game.js"></script>
`;
write('index.html', page);
// the same page as the publisher will wrap it, for trying it locally (not published)
write('local.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>\n${page}</body></html>\n`);
const files = fs.readdirSync(out, { recursive: true }).filter((f) => fs.statSync(path.join(out, f)).isFile());
console.log(`preview of v${version}: ${files.length} files, ${(files.reduce((t, f) => t + fs.statSync(path.join(out, f)).size, 0) / 1e6).toFixed(2)} MB in ${out}`);
