// Drift Club on Cloudflare. The Worker serves the game files (from public/,
// see wrangler.toml) and sends every game connection to one Durable Object,
// GameServer, which runs the game server (server/core.js). It's created in
// Oceania so races feel quick for players in Australia and New Zealand.
import { createGame, beaconTag } from './server/core.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/ws' || url.pathname === '/stats' || url.pathname === '/stats.json') {
      const id = env.GAME.idFromName('drift-club');
      return env.GAME.get(id, { locationHint: env.GAME_LOCATION || 'oc' }).fetch(request);
    }
    const res = await env.ASSETS.fetch(request);
    // Cloudflare Web Analytics: set CF_BEACON_TOKEN (the token from
    // Cloudflare's JS snippet) as a variable on the Worker.
    const beacon = beaconTag(env.CF_BEACON_TOKEN);
    if (!beacon || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    return new HTMLRewriter().on('body', { element(el) { el.append(beacon, { html: true }); } }).transform(res);
  },
};

export class GameServer {
  constructor(ctx, env) {
    this.ctx = ctx;
    // The totals on /stats are kept in the object's storage, so they survive
    // the object going to sleep when nobody's on.
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('stats');
      const boards = await ctx.storage.get('boards');
      this.game = createGame({
        stats: saved || null,
        saveStats: (s) => { ctx.storage.put('stats', s); },
        boards: boards || null,
        saveBoards: (b) => { ctx.storage.put('boards', b); },
        note: 'Totals are kept since the game moved to Cloudflare.',
        pairStates: true, // the free plan counts every message, so send half as many
        dropSilent: true, // nothing else here notices a connection that has died
      });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/stats.json') return Response.json(this.game.statsJson(), { headers: { 'Cache-Control': 'no-store' } });
    if (url.pathname === '/stats') return new Response(this.game.statsPage(), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('This is the game connection: open the game instead.', { status: 426 });
    const { 0: client, 1: socket } = new WebSocketPair();
    socket.accept();
    const conn = this.game.connect({
      send: (text) => socket.send(text),
      close: () => socket.close(1000, 'gone quiet'),
    });
    socket.addEventListener('message', (ev) => { if (typeof ev.data === 'string') conn.message(ev.data); });
    socket.addEventListener('close', () => { conn.close(); try { socket.close(1000); } catch {} }); // finish the goodbye
    socket.addEventListener('error', () => conn.close());
    return new Response(null, { status: 101, webSocket: client });
  }
}
