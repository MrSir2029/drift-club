# Drift Club

A tiny multiplayer racing game you play in the browser with friends. One person
hosts, gets a 4-letter room code, and everyone else joins with the code or the
invite link. Up to 20 racers per room, 1 to 10 laps, eight tracks, two car
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
| Backspace | Polytrack mode: restart your run (back to the grid; the lap clock starts at the line) |
| C | chase / cockpit camera (every race starts in the cockpit in the open seater, outside in the others) |
| M | sound on / off |
| Esc | menu: resume, restart your run (Polytrack mode), camera, graphics, leave |

Players can change any of these but Esc under **Settings → Change keys**
(up to two keys each; kept in their browser, `ACTIONS` in `game.js`).

Drift Club is made for a computer with a keyboard. There are no touch
controls, so phones and tablets get a "Not for phones" warning on the home
screen.

Drive through the orange gates in order. The glowing one is your next gate.
Going through one a little wide (a wheel on the grass, or just outside a
post) still counts, and the posts aren't solid, so clipping one costs
nothing. A shortcut that skips a gate doesn't count: a yellow
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
for a race. It has a rolling start (the grid moves about 480 m back from the
line, so you come to your first lap through the last corners at full speed
like any other, and your clock starts at the line) and sector times: each lap in three, counting
up as you drive, purple for the best ever on that track, green for the best
this session, yellow slower. The best-ever sectors are kept like the
leaderboard (signed, in the snapshot, handed back by browsers), and only come
from laps that count for it. A race's results show the order, the gaps, and every lap you set.
After a race (or a Race to 9LAT2) there's a podium ceremony just past the
finish line before the results: cinema bars and a drumroll, third and second
crash down onto their steps, then the winner lands on the top step with a
flash and a fanfare, a confetti cannon and fireworks while the
camera circles. Any key or click skips it. In qualifying your ghost (your best lap so far) also
shows on the minimap.

## Leaderboard

Every lap anyone drives, in races and in qualifying, counts for the
leaderboard: the ten fastest names on each track, in any car (each time shows
the car it was set in, and the race number it was set with: times from
before numbers were kept take the player's number the next time they join a
room). Open it from the home screen or the lobby; the lobby
also shows the lap time record for the track that's picked, and setting a time on the
board pops up a message.

**The Drift King championship** ranks every name by its results over all the
boards. Each board's top ten score as in F1 (25 for the record, then 18, 15,
12, 10, 8, 6, 4, 2 and 1) and the points add up across the tracks; level on
points, more records wins, then more second places, and so on. Whoever leads
is the Drift King: shown with a crown at the top of the leaderboard and beside
that name in every list, and their car wears the Drift King's livery (colour
13, `KING` in `game.js`: gold over black with a crimson line, a crown behind
the driver and DRIFT KING on the rear wing). Nobody picks it: `makeCarMesh`
puts it on any car whose driver's name is the leader's, whatever colour they
chose, and it passes on when someone else takes the lead. The Championship tab (or a click on the king's
banner) shows the whole table, with your own place under it. Racer, the name
you get without picking one, isn't in it. It's all worked out in the browser
from the boards everyone already has (`overallStandings` in `game.js`), so the
server doesn't know about it.

There are no accounts: it goes by the name you race with, one line per name. Names with a
bad word in them (a short blocklist in `server/core.js`) are swapped for
"Racer" everywhere, not just on the board. The blocklist also catches
misspellings made to sneak past it (a slur with ck or kk in place of gg, say),
and two words with their first letters swapped over. To take a name off the board, add it (or the word in it) to the
list and deploy: the server checks every saved time against the list when it
starts, so theirs drop off. To keep someone's times under another name instead,
add them to `RENAMED` in `server/core.js`: their saved times, the copies browsers
hand back, and the name they join with all become the new one.
The server keeps the boards in memory, so on a host that restarts or sleeps
(Render's free plan) they would be lost; instead every player's browser keeps
a copy, signed by the server so it can't be edited, and hands it back when it
next connects, which fills the boards in again. Laps quicker than any car
could manage, or that don't match the server's own clock, are ignored, and
names on a short blocklist stay off the board. A big hit on a wall (hard, at
an angle; brushing it doesn't count) slows the car for a second, like driving
on the grass (`noteWallHit` in `game.js`), because going into a corner flat
out and letting the wall turn you was quicker than braking. To take
particular times off the board by hand, list them in `DROPPED` in
`server/core.js`. To wipe the boards and start a
new season, bump `BOARD_SEASON` in `server/core.js`. Set `LB_SECRET` on the
host for a signing key of your own (changing it also wipes the boards).

Before deploying an update, save the live boards into the code so the
restart doesn't start them empty:
`DRIFT_CLUB_URL=https://your-game.onrender.com npm run save-boards` writes
`server/boards.json` (merged with what's there, each name keeping its best);
commit it with the update. The server loads it at startup.

### Keeping the leaderboard for good (Upstash, free)

Browser copies come back only when someone who has one visits, so a new
device, or Safari (which clears a site's storage after a week away), can see an
empty board for a while. To keep the boards for good, give the server a small
free database:

1. Sign up at https://upstash.com and create a **Redis** database (the free
   plan is plenty; pick the region nearest your Render service).
2. On the database's page, under **REST API**, copy the
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values.
3. In Render, open the service, go to **Environment**, add both as variables
   with exactly those names, and save. Render redeploys.

The log then says `Leaderboard: kept in Upstash, N lap times loaded` at
startup. The boards are saved 20 seconds after each new record, and straight
away when the server shuts down. The token is a password: keep it in Render's
settings, never in the code. Without the two variables the server works as
before.

## The map

Barriers, fences, buildings, trees, big rocks and posts are solid, and a
stone wall rings the edge of the map. (The checkpoint gates and the arch over
the start line are the exception: a car goes straight through their posts.)
Away from the circuit there are
places to explore: a lake you can wade through, a fairground, a
village, a stone circle, a campsite, a windmill and a radio mast. These
are the **expanded map**, which is on by default;
players on slower computers can turn it off under Settings. The 9LAT2
building is always there, hidden as far from the roads as the map allows,
down in low ground, with a sign you only make out up close. A TV
helicopter follows the race leader.

Centennial Park (the second track) runs through a forest: thick with dark pines,
ferns and mossy rocks, with a stone arch over the road. In the open seater (or
the Camry) it's a tarmac road; in the rally car it turns back into a gravel
stage with two jumps (`trackDef` in `game.js`). Thredbo (the
third) is the snowy one: white ground, snowy pines, snowmen, white mountains
and falling snow, with the bridge over the straight (railed, so you can't
drive off it). Mount Panorama (the fourth) is raced at night, under floodlights,
with fireworks overhead, searchlights sweeping the sky and glowing studs
along the track edges. Noosa Heads (the fifth) is an island: along the seafront, up a clifftop
headland to a hairpin round the lighthouse, back down and over the start
straight on a bridge, then through the palms past the village. Sand, palms,
beach huts and umbrellas, and boats out at sea. The bay by the start straight
is a harbour (`buildHarbour` in `game.js`): a marina under the headland with
boats moored at its pontoons, a swimming beach between red and yellow flags
with a lifeguard tower, swimmers and buoys, jet skis, a parasail, gulls and a
cruise ship on the horizon. The track's `sea` in
`tracks.js` sets where the sea starts; you can drive into it (slowly), and
buoys mark the edge of the map out on the water. It has no lake.
Sydney CBD (the sixth) is a street circuit at night: concrete walls down both
sides (`walls` in `tracks.js`), a hairpin at the end of the main straight, a
flyover that crosses above it, and a chicane; office blocks with lit windows,
neon signs, lit billboards for the trackside sponsors and a skyline, crowds behind the
walls, and traffic going round the blocks out past the edge of the map. A few
side streets, always on the outside of the
circuit, lead out into the city and to 9LAT2. Its only landmarks are 9LAT2,
the fairground and the radio mast.
Rose Bay (the seventh) is Sydney's own Monaco, by day (`buildRoseBay` in
`game.js`): a street circuit along a harbour quay, up Heartbreak Hill,
round two hairpins, down a street of shops and through a tunnel under a hotel
(signed The InterContinental, at the owner's request)
back onto the quay. Along the quay there's a sea wall with a wide promenade,
Norfolk pines and marquees, superyachts moored stern-on, a marina, the seaplane
base (one plane flies a circuit and lands in the bay), a ferry that calls at
the wharf, Catalina on its stilts and Shark Island. Up the hill: big houses
with pools, the convent school with its tower, and a golf course in the
middle. Across the water to the north-west, placed so they're in view on the
way down the hill (whose outer side is left open as a lookout): the city, the
Opera House (sails that are solid shapes, glazed at the mouth) and the Harbour
Bridge (`buildSydneyIcons`, shared with Sydney
CBD). The shops' signs are made-up local names plus a few real Rose Bay ones in
plain lettering, which the owner asked for; cars still only carry made-up
names. Its `sea` in `tracks.js` also says how high the land sits inland
(`base`, `hills`), how far above the water the sand goes (`sand`, `fade`) and
that no islands get dotted over the water (`clear`); `urban` keeps the
landmarks to the ones that fit in a town, and `fresh` puts "New track" on its
card in the lobby. It has no walls round it: like the older tracks it gets
rails and tyres on the outside of corners, marshal posts and spectators behind
short fences, with barriers of its own only where a car would otherwise end up
somewhere it can't be. Those are a low sandstone wall along the harbour side
of the quay (the promenade is paving over ground that slopes into the sea, so
a car on it would sink through), the tunnel's own walls, and a stone wall along the
top of the bank behind the shops (without it you could leave the first
hairpin, drop down the bank and miss out the second). `quay` in its `sea`
keeps the usual trackside furniture away from the water, and `blocks` keeps it
off the tunnel and the lookout.
Westfield (the eighth) is a shopping centre you race through (`buildMall` in
`game.js`, theme `mall`), laid out after the real one at Bondi Junction: the
two buildings either side of Oxford Street, the glazed bridge between them
over the street, and the bus stop outside. The lap starts on the roof of the
car park, comes down the ramp, turns left along Oxford Street under the
bridge to a hairpin at the 333's stop, comes back under the bridge, goes in
through the doors and along the mall between the shops, round the food court
and back out, across Oxford Street and up the other ramp, with the Harbour
Bridge and the city dead ahead as you come back onto the roof. Inside: tiled
walkways, shopfronts (windows with mannequins and goods on show, doorways
taped off with shoppers watching from them, signs), a gallery above them with
more shoppers, a skylight, boards hanging over the road, escalators, benches
and plants; tables, a juice bar and palms in the middle of the food-court
hairpin, behind a glass screen; and a crowd barrier outside every other shop
with people behind it. It's dressed as a race track (the owner: "remember
this is a racing track"): lengths of race barrier (`raceFence`: a concrete
block with a wire catch fence on top) with the crowd behind them down both
sides of the start straight and of Oxford Street's two carriageways, a
grandstand each side just past the line, and a crowd round the hairpin.
Outside: a row of parked cars each side of the roof, back behind the crowd,
and more on the main roof (`parkedCarGeometry`: one shape for all of them, a
body, a glasshouse and wheels, after the owner called the old boxes buns),
shade sails, stair towers, the lifts and a boom gate at the top of each ramp;
columns and parapets in the open decks below; Oxford Street with a
carriageway each way where the lap runs along it, a planted median between
them (its concrete sides are the barrier between cars going opposite ways,
and carry banners), shop windows, awnings and names along the mall's side, a
walkway overhead, the 333 at its stop with traffic held up behind it, and
blocks of shops and flats all round. The
median and the bridge are in the track's `blocks`, after the car park and the
mall, so nothing else is put on them. Oxford Street is the way out to the
streets and to 9LAT2. As at Rose
Bay, the signs are a mix of made-up names and real ones in plain lettering,
and there are no walls along the road: the car park roof is open to drive on,
out to the low wall round its edge (parked cars, lamps and the lifts are
solid), the ramps have railings because they're bridges, the shopfronts are
the walls inside, and the glass screen keeps cars out of the food court. In
`tracks.js`: `deckAbove` puts road above that height on piers (the ground
stays flat under the roof and the ramps), `roofs` are the car park's flat
roofs, which a car up at their level drives on (`surfaceAt` in `game.js`),
`blocks` are the two buildings' footprints and `streets` is Oxford Street
(nothing else gets put on them), and `bare` leaves out the grandstands, pits
and paddock.
Each track also has a bit of the real place it's named after (`local` in
`tracks.js`, built by `buildLocal` in `game.js`): a footy field, a cricket
match and Moreton Bay figs at Queens Park; the Federation Pavilion, horses and
black swans at Centennial Park; a chairlift across the track, skiers and A-frame lodges at
Thredbo; the real corner names on signs and campers round their fires at Mount
Panorama; surfers and koalas at Noosa Heads; Sydney Tower, the Harbour Bridge
and the Opera House around Sydney CBD, and a Maccas just past its start line
(`buildMaccas`: the owner asked for it, golden arches and all, drawn in code;
it takes the first plot in the row of buildings there, and the building that
would have stood on it is put up and taken away again so the rest of the city
comes out as it always has. Jago serves at the drive-through window).
The posters, and the banners on walls, carry the trackside sponsors, which
the owner chose: 9 Meter, PWD and Glory Dates (puns on Nine Mile, PwC and
Glory Days), and Tenth Floor Chambers and Frangos as themselves, each in its
company's own colours and lettering (`SPONSOR_ART` in `game.js`). They are on
every billboard (each turned to face the cars coming) and on Sydney CBD's lit
boards. Banners go on solid walls only, one every 20 m or so: six along the
pit wall, Sydney CBD's walls (about 95 round the lap), Rose Bay's harbour
wall and the stone wall behind its shops, and at Westfield the sides of
Oxford Street's median, every other length of race barrier, and the wall
round the roof where the cars drive straight at it (the end of the start
straight and the top of the ramp up). Rails on posts, fences and the railings of bridges and ramps
are left bare. Nothing is a picture: the boards are drawn in the browser, in
open-licence typefaces from `public/vendor/fonts`, onto two sheets that every
poster and banner in the world shares (each sponsor's artwork kept apart on
its sheet, and drawn a touch nearer than it is, so nothing flickers from far
off). 9 Meter is in Nine Mile's own lettering: the m and e traced from the
logo the owner sent, the 9, t and r drawn to match (`NM_LETTERS`). Cars still
only carry made-up names.
A track's look
comes from `THEMES` in `game.js`, and jumps and the arch are set on the
track in `tracks.js`.

## Graphics

Graphics start on **high**, which keeps the haze far off so the whole track
and the hills on the horizon stay clear. **Max** takes every limit off: it
draws at twice the screen's resolution or more, with almost no haze, sharper
shadows over a wider area and crowds at any distance. On **auto** the game
watches its own frame rate, lowers the detail until it runs smoothly, and
raises it again once it can. The Settings button (home screen, lobby,
or the Esc menu) sets graphics (auto, max, high, medium or low), sound, the
volume (a slider; turning it up also turns the sound on), and the expanded map.

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

## Tips

Guests waiting in the lobby for the host to start see a tip under the waiting
message; clicking it shows another. The tips are `TIPS` near the top of
`public/game.js`.

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
  adding an entry to `TRACKS`, bumping `TRACK_COUNT` in `server/core.js` and
  adding its length to `TRACK_LENGTH` there (the leaderboard's check for
  impossible laps). Changing a track's layout? Bump its `v` in `tracks.js` and
  in `TRACK_VERSION` in `server/core.js`, and put its new length in
  `TRACK_LENGTH`: its leaderboard starts again. Old times don't come back from
  players' browsers (the layout is in each time's signature), nor from the
  saved copies: `server/boards.json` and the copy in Upstash say which layouts
  their times were set on (`lay`), and `thisLayoutOnly` leaves out a track
  that's been laid out again since. `npm run save-boards` does the same with
  the live game's times.
- `public/vendor/`: Three.js r187, and in `fonts/` the typefaces the sponsors'
  boards are lettered in, all copied from npm so nothing loads from a CDN.
- `scripts/build-preview.mjs` (`npm run build-preview`): writes
  `preview-build/`, a copy of the game that needs no server, for trying a
  build before it's deployed. The server's own code runs inside the page (one
  player; the leaderboard starts as the live one was when last saved, and laps
  set in a preview stay there), the live server's name filter is left out, and
  Three.js comes from a public CDN. Serve the folder
  with any file server and open `local.html`, or publish `index.html` with
  the files beside it as a private page.

Physics runs on each player's own computer (there are no car-to-car
collisions, so nobody can push you off). The server trusts clients for
positions, which is fine for racing friends.
