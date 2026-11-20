# Drift Club

A tiny multiplayer racing game you play in the browser with friends. One person
hosts, gets a 4-letter room code, and everyone else joins with the code or the
invite link. Up to 20 racers per room, 1 to 10 laps, four tracks, two car
classes (open seater, plus a hidden rally car), Polytrack mode, low-poly 3D.

No accounts, no chat, no ads, no cookies, no downloads. Everything the game
needs is served from this folder, including the 3D library, so it works on a
LAN with no internet at all. (The one extra is Cloudflare Web Analytics for
counting visitors, which uses no cookies; see "Seeing who's playing".)

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

The game runs on Render's free plan, as one Node process (`npm start`; the
server reads `PORT`), set up by `render.yaml`:

1. On https://render.com create a **Web Service** from this repo. Build
   command: `npm install`. Start command: `npm start`.
2. Render gives you a URL like `https://drift-club.onrender.com`. Share it.
3. After merging changes, deploy them with **Manual Deploy → Deploy latest
   commit** (unless Render's auto-deploy is working for you).

The free plan goes to sleep after 15 minutes with nobody on, so the first
visit after that takes about a minute to wake it.

### Cloudflare (ready, on hold)

The repo can also run on Cloudflare's free plan, which never sleeps, runs
every room on one server in Oceania, and deploys by itself on every push.
`worker.js` and `wrangler.toml` set it up: in the Cloudflare dashboard,
**Workers & Pages → Create → import a repository**, pick `drift-club`, keep
the name `drift-club`, leave the build command empty and deploy. Its address
looks like `https://drift-club.<your-subdomain>.workers.dev`.

The free plan has daily limits (they reset at midnight UTC, mid morning in
Australia) that count every message players send during a race, so on
Cloudflare the server asks cars to send their positions two at a time. A
room made on one host can't be joined from the other, so keep everyone on
one address.

## Playing on a school or work network

Filters like Linewize and FortiGate decide what loads based on the site's
category and the network's policy. This game can't and doesn't try to get
around that. It uses ordinary HTTPS and a WebSocket on the same port, which
is the same thing Google Docs and most websites use. If it's blocked where you
are, the fix is to ask whoever runs the network to allow the URL. The things
that usually make that an easy "yes":

- no chat or free text between players (names are letters and numbers only)
- nothing the game needs is loaded from any third-party site (the page also
  loads Cloudflare's small visit-counting script; if a filter blocks it, the
  game still works)
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
Going through one a little wide (a wheel on the grass, or just outside a
post) still counts, but a shortcut that skips a gate doesn't: a yellow
"Missed a gate!" banner points back to it until you drive through it or press
R. The minimap marks your next gate with an orange bar (red once you've missed
it). There is no automatic reset: drive back on, or press R.

The standings count each car's progress only as far as its next gate, so a
car that missed one stays there in the order. Players who join part-way
through a race can drive around while they wait, but only as a see-through
ghost: nobody can hit them, and they aren't in the standings. They race
properly from the next race. In a room of more than ten, the standings show
the top eight plus you.

## Hosting a session

The host picks the track, the car class and the number of laps (1 to 10)
in the lobby, then starts either a race or **Polytrack mode**. Polytrack
mode is free laps against your ghost with no time limit, until the host ends
it (if the host leaves, whoever becomes host can end it); the results list
everyone's best lap. It stands on its own: its times don't change the grid
for a race. A race's results show the order, the gaps, and every lap you set.
After a race (or a Race to 9LAT2) the top three stand on a podium just past
the finish line, with confetti, for a few seconds before the results; any
key or click skips it. In qualifying your ghost (your best lap so far) also
shows on the minimap.

## Leaderboard

Every lap anyone drives, in races and in qualifying, counts for the
leaderboard: the ten fastest names on each track, in any car (each time shows
the car it was set in). Open it from the home screen or the lobby; the lobby
also shows the lap time record for the track that's picked, and setting a time on the
board pops up a message.

There are no accounts: it goes by the name you race with, one line per name.
The server keeps the boards in memory, so on a host that restarts or sleeps
(Render's free plan) they would be lost; instead every player's browser keeps
a copy, signed by the server so it can't be edited, and hands it back when it
next connects, which fills the boards in again. Laps quicker than any car
could manage, or that don't match the server's own clock, are ignored, and
names on a short blocklist stay off the board. To wipe the boards and start a
new season, bump `BOARD_SEASON` in `server/core.js`. Set `LB_SECRET` on the
host for a signing key of your own (changing it also wipes the boards).

## The map

Barriers, fences, buildings, trees, big rocks and posts are solid, and a
stone wall rings the edge of the map. Away from the circuit there are
places to find: a lake you can wade through, a castle, a fairground, a
village, a stone circle, a campsite, a windmill and a radio mast. Each
hides a gold star; the counter under the standings shows how many you've
found on that map. These are the **expanded map**, which is on by default;
players on slower computers can turn it off under Settings. The 9LAT2
building is always there, hidden as far from the roads as the map allows,
down in low ground, with a sign you only make out up close. A TV
helicopter follows the race leader.

Red Canyon (the second track) is a desert: sand and red rock, cacti, rock
spires and mesas, a stone arch over the road, and two jumps. Frost Pass (the
third) is the snowy one: white ground, snowy pines, snowmen, white mountains
and falling snow, with the bridge over the straight (railed, so you can't
drive off it). Switchback (the fourth) is raced at night, under floodlights,
with fireworks overhead, searchlights sweeping the sky and glowing studs
along the track edges.
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

The rally car is hidden the same way: the host types `RALLY` in the lobby
(`RALLY_CODE` in `public/game.js`) and a Cars row appears with the open seater
and the rally car. Typing it again hides it and switches back to the open
seater. The browser remembers. Without it, the lobby has no Cars row at all.

## Seeing who's playing

Open `/stats` on your site (for example
`https://drift-club.onrender.com/stats`) for a live count:
how many people have the game open, how many are racing, in a lobby or on the
home screen, and how many rooms are open, plus the most online at once, the
times the game was opened and the races started. It refreshes itself every
30 seconds. On Cloudflare the totals are saved; on a plain Node server they
start again from zero when it restarts. `/stats.json` has the same numbers
for scripts.

For visitors over days and weeks, the game uses Cloudflare Web Analytics.
It's free and sets no cookies, so it needs no cookie banner. It's set up for
the game's Render address: the token is in `server.js`, and visits show up in
the Cloudflare dashboard under **Web Analytics** within a few minutes. To use
a different site's token, set `CF_BEACON_TOKEN` on the host (an empty value
switches analytics off). If a school filter blocks Cloudflare's script, the
game still works; those visits just aren't counted.

## Feedback

The **Feedback** button on the home screen and **Send feedback** in the Esc
menu open a page in a new tab: set `FEEDBACK_URL` at the top of
`public/game.js` to its link. A Google Form works well: make one at
https://forms.google.com with a paragraph question, set it to not collect
email addresses, and use its share link. Replies show up in the form's
**Responses** tab. The buttons stay hidden while `FEEDBACK_URL` is empty.

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
  Codespaces, or any Node host), over WebSockets with the `ws` package. It
  gzips the game's files and tags them, so a returning browser gets a tiny
  "not modified" instead of downloading everything again.
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
