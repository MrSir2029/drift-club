# Drift Club

A tiny multiplayer racing game you play in the browser with friends. One person
hosts, gets a 4-letter room code, and everyone else joins with the code or the
invite link. Up to 20 racers per room, 1 to 10 laps, four tracks, two car
classes (open seater and rally), qualifying sessions, low-poly 3D.

No accounts, no chat, no ads, no cookies, no downloads. Everything the game
needs is served from this folder, including the 3D library, so it works on a
LAN with no internet at all. (The one optional extra is Cloudflare Web
Analytics for counting visitors; see "Seeing who's playing".)

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

The game runs on Cloudflare's free plan (no card needed). It never goes to
sleep, every room runs on one server in Oceania (quick for Australia and New
Zealand), and it deploys by itself whenever `main` changes. `worker.js` and
`wrangler.toml` set it up.

1. Sign up at https://dash.cloudflare.com (free) and open **Workers & Pages**.
2. **Create** a Worker and choose to import a repository from Git. Connect
   GitHub, pick `drift-club`, and keep the name `drift-club` (it has to match
   `name` in `wrangler.toml`). Leave the build command empty; the deploy
   command is `npx wrangler deploy`. Then **Deploy**.
3. Cloudflare gives you an address like
   `https://drift-club.<your-subdomain>.workers.dev`. Share it.

From then on every merge to `main` is live a minute or two later. The
Worker's page in the dashboard shows each build under **Deployments**.

The free plan has daily limits (they reset at midnight UTC, which is mid
morning in Australia). Messages from players during a race are what count,
so cars send their position 30 times a second but two at a time. That's
plenty for groups of friends; if a big session ever hits the limit, the game
stops connecting until the reset, and Cloudflare's $5/month plan lifts it.

Still on an old host? Any host that runs Node also works (`npm start`; the
server reads `PORT`). To send players from an old address to the new one,
set `MOVED_TO` on the old host to the new address and every visit is
redirected there.

## Playing on a school or work network

Filters like Linewize and FortiGate decide what loads based on the site's
category and the network's policy. This game can't and doesn't try to get
around that. It uses ordinary HTTPS and a WebSocket on the same port, which
is the same thing Google Docs and most websites use. If it's blocked where you
are, the fix is to ask whoever runs the network to allow the URL. The things
that usually make that an easy "yes":

- no chat or free text between players (names are letters and numbers only)
- nothing the game needs is loaded from any third-party site (if you turn on
  Cloudflare Web Analytics, the page also loads Cloudflare's small counting
  script; if a filter blocks it, the game still works)
- no accounts, no cookies, nothing stored on the server
- the code is small enough to read in one sitting (`server/`, `worker.js`
  and `public/`)

Some networks block `workers.dev` addresses as a group. If yours does, ask
for the address to be allowed, or give the game its own domain (Cloudflare
sells them at cost, around $10 a year) and add it to the Worker under
**Settings → Domains & Routes**.

## Controls

| Key | Action |
| --- | --- |
| W / Up | accelerate |
| S / Down | brake, reverse |
| A / D or Left / Right | steer |
| Space | handbrake |
| R | reset to the last gate |
| C | chase / cockpit camera (every race starts in the cockpit in the open seater, outside in the others) |
| M | sound on / off |
| Esc | menu: resume, camera, graphics, leave |

Drift Club is made for a computer with a keyboard. There are no touch
controls, so phones and tablets get a "Not for phones" warning on the home
screen.

Drive through the orange gates in order. The glowing one is your next gate.
Cutting across the grass doesn't count. There is no automatic reset: drive
back on, or press R.

## Hosting a session

The host picks the track, the car class and the number of laps (1 to 10)
in the lobby, then either starts
a race or runs **Qualifying** first. Qualifying is four minutes of free
laps (the host can end it early); everyone's fastest lap sets the grid for
the next race. The results screen shows the order, the gaps, and every lap
you set, and the lobby keeps the grid and times on show.

## The map

Barriers, fences, buildings, trees, big rocks and posts are solid, and a
stone wall rings the edge of the map. Away from the circuit there are
places to find: a lake you can wade through, a castle, a fairground, a
village, a stone circle, a campsite, a windmill and a radio mast. Each
hides a gold star; the counter under the standings shows how many you've
found on that map. These are the **expanded map**, which is on by default;
players on slower computers can turn it off under Settings. The 9LAT2
building is always there. A TV helicopter follows the race leader.

Red Canyon (the second track) is a desert: sand and red rock, cacti, rock
spires and mesas, a stone arch over the road, and two jumps. Frost Pass (the
third) is the snowy one: white ground, snowy pines, snowmen, white mountains
and falling snow, with the bridge over the straight (railed, so you can't
drive off it). Switchback (the fourth) is raced at night, under floodlights.
A track's look
comes from `THEMES` in `game.js`, and jumps and the arch are set on the
track in `tracks.js`.

## Graphics

Graphics start on **high**. On **auto** the game watches its own frame rate and lowers
the detail until it runs smoothly. The Settings button (home screen, lobby,
or the Esc menu) sets graphics (auto, high, medium or low), sound, and
the expanded map.

Still scenery and each car's body are merged into a few big meshes when a
track loads (`mergeStatic` in `game.js`), because the number of separate
objects, not the resolution, is what slows weak laptops down. Anything that
moves is marked `userData.dyn` so it's left alone.

## Secrets

There's no button for these. The host opens the secrets panel by typing a
code on the keyboard while in the lobby (typing it again hides it); the code
is `SECRET_CODE` at the top of `public/game.js`. Inside: **Race to 9LAT2**
(no laps or gates, first car to reach the 9LAT2 building wins; follow the
arrow and the beam of light) and **Toyota Camry**, a car class where
everyone drives the same family saloon.

## Seeing who's playing

Open `/stats` on your site (for example
`https://drift-club.<your-subdomain>.workers.dev/stats`) for a live count:
how many people have the game open, how many are racing, in a lobby or on the
home screen, and how many rooms are open, plus the most online at once, the
times the game was opened and the races started. It refreshes itself every
30 seconds. On Cloudflare the totals are saved; on a plain Node server they
start again from zero when it restarts. `/stats.json` has the same numbers
for scripts.

For visitors over days and weeks, use Cloudflare Web Analytics. It's free and
sets no cookies, so it needs no cookie banner:

1. Sign in at https://dash.cloudflare.com (a free account is fine) and open
   **Web Analytics**. If it isn't in the sidebar, search for it.
2. **Add a site** and enter your game's address, e.g.
   `drift-club.<your-subdomain>.workers.dev`.
3. Cloudflare shows a snippet with `"token": "..."` in it. Copy the token, the
   long code between the quotes.
4. Open the `drift-club` Worker, go to **Settings → Variables and Secrets**,
   add a text variable called `CF_BEACON_TOKEN` with the token as its value,
   and deploy. (On a Node host, set the same environment variable instead.)
5. Play a race. Visits show up in Cloudflare within a few minutes.

The server only adds Cloudflare's script to the page when `CF_BEACON_TOKEN`
is set. If a school filter blocks the script, the game still works; those
visits just aren't counted.

## Telling players what's new

`public/updates.js` is the list behind the **What's new** button on the
home screen. Add an entry at the top whenever you ship something; players
get a red dot on the button until they've read it.

## How it works

- `server/core.js`: the game server: rooms, races, results and the `/stats`
  numbers. Each client records its car's position, velocity and a timestamp
  30 times a second and sends them two at a time; the server relays whatever
  arrived to the room at 30 Hz. Results are ordered by finish time.
- `worker.js` + `wrangler.toml`: runs it on Cloudflare. The Worker serves
  `public/` and passes game connections to one Durable Object (`GameServer`),
  which keeps the `/stats` totals in its storage.
- `server.js`: runs the same game server on Node (your own computer,
  Codespaces, or any Node host), over WebSockets with the `ws` package.
- Other players' cars are drawn a fraction of a second in the past, on a
  curve between two real positions, so they glide however unevenly the
  network delivers the packets. The delay adapts to the connection.
- `public/game.js`: Three.js scene, car physics, camera, HUD and networking.
- `public/tracks.js`: tracks are a list of control points. Add a new one by
  adding an entry to `TRACKS` and bumping `TRACK_COUNT` in `server/core.js`.
- `public/vendor/`: Three.js r187, copied from npm so nothing loads from a CDN.

Physics runs on each player's own computer (there are no car-to-car
collisions, so nobody can push you off). The server trusts clients for
positions, which is fine for racing friends.
