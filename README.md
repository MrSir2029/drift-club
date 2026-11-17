# Drift Club

A tiny multiplayer racing game you play in the browser with friends. One person
hosts, gets a 4-letter room code, and everyone else joins with the code or the
invite link. Up to 20 racers per room, 1 to 10 laps, four tracks, two car
classes (open seater and rally), qualifying sessions, low-poly 3D.

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
| Space | handbrake |
| R | reset to the last gate |
| C | chase / cockpit camera (each car remembers its own; the open seater starts in the cockpit) |
| M | sound on / off |
| Esc | menu: resume, camera, graphics, leave |

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
found on that map. These are the **expanded map**, which is off unless a
player turns it on under Settings, because it can slow older computers
down. The 9LAT2 building is always there. A TV helicopter follows the race leader.

## Graphics

On **auto** (the default) the game watches its own frame rate and lowers
the detail until it runs smoothly. The Settings button (home screen, lobby,
or Graphics & map in the Esc menu) switches between auto, high, medium and
low, and turns the expanded map on or off.

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

## Telling players what's new

`public/updates.js` is the list behind the **What's new** button on the
home screen. Add an entry at the top whenever you ship something; players
get a red dot on the button until they've read it.

## How it works

- `server.js`: static files + WebSocket rooms. Each client sends its car
  position, velocity and a timestamp 30 times a second; the server batches
  whatever changed and relays it to the room at 30 Hz. Finish order is
  decided by the order finish messages arrive.
- Other players' cars are drawn a fraction of a second in the past, on a
  curve between two real positions, so they glide however unevenly the
  network delivers the packets. The delay adapts to the connection.
- `public/game.js`: Three.js scene, car physics, camera, HUD and networking.
- `public/tracks.js`: tracks are a list of control points. Add a new one by
  adding an entry to `TRACKS` and bumping `TRACK_COUNT` in `server.js`.
- `public/vendor/`: Three.js r187, copied from npm so nothing loads from a CDN.

Physics runs on each player's own computer (there are no car-to-car
collisions, so nobody can push you off). The server trusts clients for
positions, which is fine for racing friends.
