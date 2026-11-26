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
| C | chase / cockpit camera (also in **Settings**; the choice is remembered. Until a player chooses, the open seater starts in the cockpit and the others outside) |
| M | sound on / off |
| Esc | menu: resume, restart your run and the record ghost's switch (Polytrack mode), settings, leave |

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
After a race there's a podium ceremony just past the
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

**Ghosts and racing lines.** A lap set in Polytrack mode goes to the server
with how it was driven (`packPath` in `game.js`: ten samples a second of
where the car was and which way it pointed, about 4 KB as text). The server
keeps the path of every lap that is on a board (`paths` in `server/core.js`,
dropped when the lap leaves the board) and marks those laps `g: 1`. Anyone
can ask for one (`path` message): the leaderboard shows a **line** button on
those laps, which draws the track from above with the lap on it, red where
it's slow through to green where it's fast; and in Polytrack mode, for a
player who has switched the record holder's ghost on (it is off by default,
3.51), the record, the lap at the top of the track's board, drives round
with them as a gold see-through car with its driver's name over it, and as
a gold dot on the minimap. A message says whose lap it is when it joins. Its
switch is in Settings and in the Polytrack pause menu, which also says whose
ghost it is. The ghost is only on offer once the record of every track has
its path (`recGhostReady`): until then the switches are hidden and nothing
is chased. (Before 3.65 it chased the fastest lap that had a path, which on
most tracks was not the record; the owner asked for it to wait.) A lap's
path is only sent in Polytrack mode, so a record set in an ordinary race
has none.
Your own best-lap ghost gives way wherever the two are in the same place
(3.49: drawn through each other they flickered). With Upstash
the paths are kept in a hash beside the leaderboard (`drift-club:boards:paths`,
one field a lap). Without it the server forgets them whenever it restarts,
which on Render is every update and every wake from sleep, and gets them
back two ways (3.53; before that they simply vanished): `npm run save-boards`
asks the live game for each lap's path and writes them to `server/paths.json`
beside `server/boards.json`, which the server loads at startup; and the
browser of anyone who set, watched or chased a lap keeps a copy with the
server's signature (`dc-lines`, 16 at most, its own laps first) and hands it
back when the lap is on the board without its line (`pathseed`: taken only
if the signature fits the name, the time and every character of the path).
Laps from before 3.34, or set in a race, have none.

**The Drift King championship** ranks every name by its results over all the
boards. Each board's top ten score as in F1 (25 for the record, then 18, 15,
12, 10, 8, 6, 4, 2 and 1) and the points add up across the tracks; level on
points, more records wins, then more second places, and so on. Whoever leads
is the Drift King: shown with a crown at the top of the leaderboard and beside
that name in every list, and their car wears the Drift King's livery (colour
13, `KING` in `game.js`: gold over black with a crimson line, a crown behind
the driver and DRIFT KING on the rear wing). Nobody picks it: `makeCarMesh`
puts it on any car whose driver's name is the leader's, whatever colour they
chose, and it passes on when someone else takes the lead. The leaderboard
opens on the Championship tab: the whole table, with your own place under it
(the owner wanted it there, and the panel kept plain: no small print, and no
king's banner on that tab, where the king is the top row anyway; on a track's
tab the banner is a way back to it). Racer, the name
you get without picking one, isn't in it. It's all worked out in the browser
from the boards everyone already has (`overallStandings` in `game.js`), so the
server doesn't know about it.

**The cars' colours** are liveries (4.0; the owner: "have every livery look
like famous f1 team"). Each of the eleven a player can pick is painted in a
famous Formula 1 team's colours (`TEAM` in `game.js`, beside the paint
itself in `paintLivery`): red with black and white (Ferrari), papaya into
anthracite with a blue line (McLaren), yellow and black (Jordan), bright
green into black (Sauber), silver into black with a teal line (Mercedes),
blue and white with a red line (Williams), navy with red and a yellow nose
(Red Bull), pink into blue (Alpine's pink car), white into black with a red
line (Haas), black and gold (Lotus), sky blue into yellow (Renault's 2005 and
2006 cars). It is the paint and where it goes, nothing more: no team's name,
badge or sponsors is on a car, which carries DRIFT CLUB, the driver's name
and the race number as before. The swatches on the home screen show each
livery's three colours. The colours' numbers are what they were (a player's
saved choice still means the same swatch); two changed hue, teal to silver
and purple to navy. A dark car's dot has a pale ring on the minimap.

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
down in low ground, with a sign you only make out up close (a painted sign,
lit by the sun like the walls: it glowed until 3.59, when the owner asked
for it not to be illuminated). A TV
helicopter follows the race leader.

Centennial Park (the second track) runs through a forest: thick with dark pines,
ferns and mossy rocks, with a stone arch over the road. In the open seater (or
the Camry) it's a tarmac road; in the rally car it turns back into a gravel
stage with two jumps (`trackDef` in `game.js`). Thredbo (the
third) is the snowy one: white ground, snowy pines, snowmen, white mountains
and falling snow, with the bridge over the straight (railed, so you can't
drive off it). Pinto Speedway (the fourth; Mount Panorama until 3.55) is raced at night, under floodlights,
with fireworks overhead, searchlights sweeping the sky and glowing studs
along the track edges. On a night track the pit garages beside the grid are
lit from inside, all but a couple, with a strip of lamps under the roof
(3.69: unlit, the pit building was a black slab 52 m long). Noosa Heads (the fifth) is an island: along the seafront, up a clifftop
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
circuit, lead off into the city, each one closed off by the wall for the
race. Each has its
street (`buildSideStreets` in `game.js`, 3.71): asphalt from the track's kerb
out as far as the ground stays level and clear, a line down each side, dashes
down the middle, a line across where it meets the track, and two lamps with
their pools of light. It leaves at an angle where a bank is in the way: the
first one, just past the bridge, runs along the foot of the flyover's bank.
They are built last, so nothing else in the city moves for them.
The side streets were openings in the wall at first, the way off the circuit
for Race to 9LAT2. Nothing was drawn in an opening and no lamp reached it, and
a driver's eyes are about as high as the wall's top, so the dark ground behind
filled just the band a wall would: the owner took the first one for a "random
black wall", and once he saw what it was, for a hole ("a piece of wall is
missing, just add it back"). In 3.72 they became gates, shut for everything
but that mode; in 3.73 the mode was taken out (see Secrets) and the wall
simply runs across them, banners and all (`buildStreetWalls`; those lengths
are in `track.walls` with `mouth` set, so the street behind is still laid).
The wall also carries on under
the flyover, on both sides: it used to stop short of the bridge and take up
again past it, because the road overhead counted as road too near the wall
(`levelGap` counts only road on the wall's own level). And where a run of
wall ends at a bridge deck it turns in to meet the end of the deck's railing.
Its only landmarks are 9LAT2,
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
card in the lobby. It isn't walled in all round: like the older tracks it gets
rails on the outside of corners, marshal posts and spectators behind
short fences. Its straights have race barriers (3.41, at the owner's asking:
"more of the new barriers", meaning Westfield's): a sandstone block with a
wire catch fence on top, in 4.5 m bays, along the land side of the start
straight (run in to the pit wall, which carries the fence past the garages),
the outside of Heartbreak Hill, both sides of the straight along the top and
of the shops' street, the inside of the corner after it, and the shops' side
of the hill down, run in to the tunnel's wall (so it is unbroken on that side
from the second hairpin to the tunnel: "there should be a fence on the inside
here", 3.46), and on from the tunnel's far end round the chicane to the
barrier along the start straight (3.75: the owner sent a picture of the fence
on the hill down, "put this wired fence in the other side" of the
InterContinental; the short rail that stood there came away). The crowd stands behind them on two stone steps wherever
nothing else is in the way, or on the footpath in front of the shops; it is a
set of people of its own with its own random numbers, so the rest of the bay
stays put. Where a barrier comes to a corner's rail it is run in to meet the
rail's end (`railAt` finds it), so there is no way between the two (3.48).
The outside of the top straight is one unbroken length (3.74): it was in
three, with two 12 m ways through for Race to 9LAT2 to leave the road by,
until that mode went and the owner asked for them closed ("please fix these
two big ones"). Then there are the barriers a car needs so as
not to end up somewhere it can't be: a low sandstone wall along the harbour side
of the quay (the promenade is paving over ground that slopes into the sea, so
a car on it would sink through), the tunnel's own walls, and a stone wall along the
top of the bank behind the shops (without it you could leave the first
hairpin, drop down the bank and miss out the second). `quay` in its `sea`
keeps the usual trackside furniture away from the water, and `blocks` keeps it
off the tunnel and the lookout. Its background is a town (`suburbs: true` in
`tracks.js` leaves out the usual bare hills): four streets of houses and
blocks of flats just beyond the circuit, six hills further off with houses up
them and apartment towers along the top (the tallest cluster stands in for
Bondi Junction), a lighthouse on the far head, a row of houses along the north
shore and extra towers in the city. The houses and flats are two shapes drawn
as instances (`suburbGeometry`), the towers the same `cityTower` as the city's;
none of it can be reached, so none of it is solid.
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
more shoppers, a skylight, boards hanging over the road, escalators (each a
landing on the floor, steps at 30 degrees between glass balustrades with dark
handrails, and a landing where a piece of the gallery's floor comes out to
meet it: until 3.77 each was one bare slab, and the owner asked why it was
"slanted for no reason"), benches
and plants; tables, a juice bar and palms in the middle of the food-court
hairpin, behind a glass screen; and a crowd barrier outside every other shop
with people behind it. It's dressed as a race track (the owner: "remember
this is a racing track"): race barrier (`raceFence`: a concrete block with a
wire catch fence on top) with the crowd behind it, unbroken down both sides
of the start straight from the top of the ramp to the corner at the far end
(the owner didn't want it cut off between the stands) and down the outside
of each of Oxford Street's two carriageways, from the hairpin to where the
two legs part (one unbroken run each side since 3.76: it came in four lengths
of 24 m with 12 m of nothing between, and the owner asked why there were
"random holes"); a grandstand each side just past the line,
and a crowd round the hairpin. Where the lap leaves the west doors, crosses
Oxford Street and climbs the ramp, there was nothing either side (the owner:
"this whole area should have barriers"): now the barrier runs down both
sides, in from each edge of the doorway, across the street with the crowd on
two steps behind it, and in again to the foot of the ramp, where a concrete
parapet carries on up each edge as far as the ramp's own rails
(`raceFenceTo`, the same barrier between any two points). The ramp the lap
comes down on at the east end has the same parapet down both edges from its
rails to the height bar (3.78: a car could run off the side of the ramp
there and end up beside the bar, off the track, and the owner sent a photo
from the spot, "Fence here"); on the outside it turns out to meet the first
post of the rail round the corner, and on the inside it goes on round the
corner to the end of the race barrier along Oxford Street.
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
streets and to 9LAT2. The town's fairground isn't built here (the owner found
it out of place at a shopping centre): its spot behind the car park is
still picked and kept clear, so the mast and the streets stay where they
were, and `buildMall` plants a park on it. The shops' signs are real names
only, in plain lettering: eight shops and four places to eat, each several
times over, in an order that never puts two the same next door or facing
each other (`turn`). There were made-up names among them until 3.64, when
the owner asked for those to go and the real ones to be repeated. (Rose
Bay's shops went the same way in 3.67: four real names, each shop's
different from its neighbours'. The plain FOOD COURT and JUICE BAR signs
came down then too.) There are no
walls along the road: the car park roof is open to drive on,
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
Thredbo; campers round their fires at Pinto Speedway (it was Mount Panorama until 3.55, and had
that mountain's corner names on signs until 3.56, when the owner had them taken down); surfers and koalas at Noosa Heads; Sydney Tower, the Harbour Bridge
and the Opera House around Sydney CBD, and a Maccas just past its start line
(`buildMaccas`: the owner asked for it, golden arches and all, drawn in code;
it takes the first plot in the row of buildings there, and the building that
would have stood on it is put up and taken away again so the rest of the city
comes out as it always has. Jago serves at the drive-through window).
The posters, and the banners on walls, carry the trackside sponsors, which
the owner chose: 9 Meter, PWD and Glory Dates (puns on Nine Mile, PwC and
Glory Days), and Tenth Floor Chambers and Frangos as themselves, each in its
company's own colours and lettering (`SPONSOR_ART` in `game.js`). They are on
every billboard and on Sydney CBD's lit boards. A billboard has one poster,
on the face turned to the road and the cars coming; its back is the back of
a sign, on its posts and rails (until 3.58 the back carried a second poster:
the owner asked for single-sided signs). Banners go on solid walls only, one every 20 m or so: six along the
pit wall, Sydney CBD's walls (about 95 round the lap), Rose Bay's harbour
wall, the stone wall behind its shops and the blocks of its race barriers
(one every 80 m there), and at Westfield the sides of
Oxford Street's median, every other length of race barrier, and the wall
round the roof where the cars drive straight at it (the end of the start
straight and the top of the ramp up). Rails on posts, fences and the railings of bridges and ramps
are left bare. On the race barriers a sponsor isn't a banner but paint
(`paintBarrier`, 3.68): the barrier's face in the sponsor's colours, with
the name all the way along it and a little plain paint between, as on the
barriers at a grand prix (the owner sent a picture of one and asked for the
barriers' sponsors to look like it; then, in 3.79, for "groups of 3 not 2";
then, in 4.7, for "long rows": a length now carries the name as many times
as fit). At Westfield that is the whole of every other length on the roof
and 54 m in every 96 m down Oxford Street; at Rose Bay, up to 44 m with the
name six times, every 80 m. The banners on the other walls come six of one
name in a row (Sydney CBD's walls, the pit wall, Westfield's median, Rose
Bay's two sandstone walls), with a plain stretch about as long between rows.
From 4.8 each track also has two sponsor bridges (`buildSponsorBridges`): a
steel gantry over the road with one name three times across it, as over the
straights at a grand prix. They go up after everything else, where the road
runs straight or nearly, at least 55 m from the start line and every gate,
a third of a lap from each other, and clear of the track's `blocks`, of
anything that has claimed the ground, and of the circuit's other parts; they
claim no ground themselves, so nothing else moves for them, and their legs
aren't solid. A track can name its own spots instead, as `sponsorBridges:
[[x, z], …]` in `tracks.js` (the nearest point of the lap to each):
Westfield does, for Oxford Street, where the rules find no room. Every other
checkpoint gate carries a name three times across its top as well (every
gate did from 4.5 to 4.8): of the two ways of taking every other gate, the
one that keeps the names further from the bridges. By day the signs
are lit and shadowed by the scene like the
walls they hang on (3.50; lit from inside they looked stuck on), and at night
they glow. Nothing is a picture: the boards are drawn in the browser, in
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

**Far-off things and depth.** A graphics card tells two surfaces apart by
depth only down to a step that grows with the square of the distance and
shrinks with the camera's near plane: with the near plane at 0.5 m the step
is about 2 cm at 400 m and 12 cm at a kilometre. Two faces closer together
than that flicker ("City flickers from far away" was the owner's report,
3.43). So:

- Scenery meant to be seen from far off has nothing lying just in front of
  anything else. A distant tower (`cityTower`) is one skin with its windows
  as lengths of the wall, a top the same size as what it stands on, and a fin
  outside the wall; the suburbs' houses and flats (`suburbGeometry`) are the
  same. Towers are also moved a few metres as they are placed, so that no
  wall stands within `CITY_GAP` of a neighbour's that faces the same way and
  overlaps it (`cityTowers` keeps the blocks placed so far).
- From the open seater's cockpit the world is drawn with the chase camera's
  near plane (0.5 m), and the car itself is drawn again afterwards, with the
  depth cleared and the near plane at 12 cm (`renderFrame`: layer 1, the same
  second drawing that puts a closed car's interior over its body). With the
  near plane at 12 cm for everything, the step was four times coarser.
- The centre line's dashes are drawn with a polygon offset, and cut along the
  same diagonal as the road's triangles so they lie flat on it
  (`centreDashes`): laid straight from sample to sample, the road stood proud
  of them round a hairpin on a slope and buried bits of them (3.44).

To look for surfaces that fight, draw a view with the near plane made 4 and
16 times smaller (the same as a depth buffer that much coarser) and see what
changes.

## Secrets

There's no button for these. The host opens the secrets panel by typing a
code on the keyboard while in the lobby (typing it again hides it); the code
is `SECRET_CODE` at the top of `public/game.js`. Inside: **Toyota Camry**, a
car class where everyone drives the same family saloon. (Until 3.73 there
was also **Race to 9LAT2**: no laps or gates, first car to reach the 9LAT2
building wins. It needed ways off the circuit left open in the barriers of
the walled tracks, the owner took those for holes, and he had the mode
binned so they could be closed: "let's bin the 9LAT2 mode so we can patch
the holes". The building is still there. The server knows two modes, race
and Polytrack; a tab on an older version that asks for the third gets a
race.)

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

**Feedback**, beside Settings on the home screen, opens a page in a new tab: set `FEEDBACK_URL` at the top of
`public/game.js` to its link. A Google Form works well: make one at
https://forms.google.com with a paragraph question, set it to not collect
email addresses, and use its share link. Replies show up in the form's
**Responses** tab. The button stays hidden while `FEEDBACK_URL` is empty. (It was in Settings from 3.39 to
3.60; the owner asked for it back on the home screen.)

## Tips

Guests waiting in the lobby for the host to start see a tip under the waiting
message; clicking it shows another. The tips are `TIPS` near the top of
`public/game.js`.

## Telling players what's new

`public/updates.js` is the list behind the **What's new** button on the
home screen. Add an entry at the top whenever you ship something; players
get a red dot on the button until they've read it.

Its top entry is also the game's version, shown small beside the game's name
on the home screen (it was on the What's new button until 3.60), and that is
how a tab that has been left open finds out there's an update. A tab keeps running the game as
it was when it was opened. Updating restarts the server, so every open tab
reconnects, and the server tells each one which version it is (`ver`). A tab
that is behind puts up "A new update is out" with a Refresh button: on the
home screen, in the lobby and with the results, never while driving
(`onVersion` and `showStale` in `game.js`). Tabs from before 3.57 have no
notice of their own. They are the ones that don't say which version they are
when they connect, so the server sends them the reminder as an `error`
message, which they pop up for a few seconds: when they connect, when they
get into a room and after each session (`nudge` in `server/core.js`). So an
update only reaches the tabs that are already open if it has a new version
at the top of the list.

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
