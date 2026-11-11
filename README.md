# Drift Club

A tiny multiplayer racing game you play in the browser with friends. One person
hosts, gets a 4-letter room code, and everyone else joins with the code or the
invite link. Up to 20 racers per room, three laps, three tracks, low-poly 3D.

No accounts, no chat, no ads, no trackers, no downloads. Everything the game
needs is served from this folder, including the 3D library, so it works on a
LAN with no internet at all.

## Run it on your computer

```bash
npm install
npm start
```

Open http://localhost:3000. Friends on the same wifi can join at
`http://<your-computer's-IP>:3000` (find it with `ipconfig` on Windows or
`ifconfig` on Mac). Windows may ask to allow Node through the firewall the
first time.

## Play from GitHub Codespaces (needs nothing but GitHub)

Good when hosting sites are blocked on your network but github.com works.
Only the host does this; friends just open the link.

1. Open https://github.com/MrSir2029/drift-club, click the green **Code**
   button, pick the **Codespaces** tab, then **Create codespace on main**.
   The first time takes a minute or two. After that it reopens in seconds.
2. The game server starts by itself. A **Ports** tab appears at the bottom
   of the editor with a row called **Drift Club** on port 3000.
3. Right-click that row, choose **Port Visibility**, then **Public**.
   (Without this, friends get a GitHub sign-in page instead of the game.)
4. Hover the row, click the globe icon to open the game, and copy the URL.
   It looks like `https://something-3000.app.github.dev`. Share that, or
   host a race and share the invite link.

Keep the codespace tab open while you play. It stops after 30 minutes of
no activity in the editor, which ends the game server; reopen it to play
again. Free personal accounts get 60 hours a month at this size.

## Run it on the internet (so friends can join from anywhere)

The server is one Node process with no database, so any host that runs Node
works. Render's free tier is the simplest:

1. Push this folder to a GitHub repo.
2. On https://render.com create a **Web Service** from that repo.
   Build command: `npm install`. Start command: `npm start`.
3. Render gives you a URL like `https://drift-club.onrender.com`. Share it.

Railway, Fly.io and Glitch work the same way. The server reads the `PORT`
environment variable, which all of them set for you. Free tiers go to sleep
when idle, so the first visit after a while takes ~30 seconds to wake up.

## Playing on a school or work network

Filters like Linewize and FortiGate decide what loads based on the site's
category and the network's policy. This game can't and doesn't try to get
around that. It uses ordinary HTTPS and a WebSocket on the same port, which
is the same thing Google Docs and most websites use. If it's blocked where you
are, the fix is to ask whoever runs the network to allow the URL. The things
that usually make that an easy "yes":

- no chat or free text between players (names are letters and numbers only)
- nothing is loaded from any third-party site
- no accounts, no personal data collected, nothing stored on the server
- the code is small enough to read in one sitting (`server.js` and `public/`)

## Controls

| Key | Action |
| --- | --- |
| W / Up | accelerate |
| S / Down | brake, reverse |
| A / D or Left / Right | steer |
| R | respawn at the last checkpoint |

Drive through the orange gates in order. The glowing one is your next gate.
Cutting across the grass doesn't count. Off the track for a while, or falling
off the bridge, puts you back at your last gate automatically.

## How it works

- `server.js`: static files + WebSocket rooms. Each client sends its car
  position 20 times a second; the server relays everyone's positions to the
  room at 20 Hz. Finish order is decided by the order finish messages arrive.
- `public/game.js`: Three.js scene, car physics, camera, HUD and networking.
- `public/tracks.js`: tracks are a list of control points. Add a new one by
  adding an entry to `TRACKS` and bumping `TRACK_COUNT` in `server.js`.
- `public/vendor/`: Three.js r187, copied from npm so nothing loads from a CDN.

Physics runs on each player's own computer (there are no car-to-car
collisions, so nobody can push you off). The server trusts clients for
positions, which is fine for racing friends.
