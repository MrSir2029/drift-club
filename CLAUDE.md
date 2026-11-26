# Notes for Claude

- **Shipping:** commit on the session branch, open a PR and merge it. The
  owner deploys by hand on Render (Manual Deploy → Deploy latest commit).
- **Before every update that will be deployed, save the live leaderboard**,
  so the redeploy doesn't start it empty:
  `DRIFT_CLUB_URL=https://drift-club-mvq1.onrender.com npm run save-boards`,
  then commit `server/boards.json` and `server/paths.json` (the laps' racing
  lines: without them every update wiped the lines and the record ghost)
  with the update. Behind a proxy (cloud
  sessions), run `npm i --no-save https-proxy-agent` first. If the game is
  asleep and doesn't answer, ship anyway: players' browsers hand their copies
  back.
- The car colours are liveries in famous F1 teams' colours (`TEAM` in
  `game.js`; the owner: "have every livery look like famous f1 team"): the
  paint and where it goes only. No team's name, badge or sponsor goes on a
  car. Keep the colours' numbers (players' saved choices).
- The open seater's front end was sharpened once, a little (3.80: front
  grip 1.35 to 1.39, steering rate 12 to 13.5; the owner: "the snappier
  front but only by a little"). Any more makes the records fall: ask first.
- The secret livery (colour 12) and its code stay out of What's new and the
  README. Cars only carry made-up sponsor names, never real brands. Three
  exceptions, all at the owner's request:
  - Shop signs at Rose Bay and Westfield, and the hotel over Rose Bay's tunnel
    (The InterContinental): real local names in plain lettering, never logos.
    Every shop at Westfield and at Rose Bay has a real name, the same ones
    repeated: the owner had the made-up ones taken out ("remove all the
    stores in Westfield with names you made up and just add duplicates of
    the other real ones", then the same for Rose Bay), and Westfield's plain
    FOOD COURT and JUICE BAR signs with them. Don't add made-up shop names
    or put those signs back.
  - The Maccas on Sydney CBD, just past the start (`buildMaccas` in
    `game.js`): the golden arches, drawn in code like the sponsors' boards
    (never a picture file), "Macca's" in plain lettering, and Jago serving at
    the drive-through window with his name on his name tag (first name only:
    a player asked for him, and the owner said yes). No other real
    restaurants or real people unless the owner asks.
  - The trackside sponsors on posters and wall banners (`SPONSOR_ART` in
    `game.js`): 9 Meter, PWD and Glory Dates (puns on Nine Mile, PwC and Glory
    Days), and Tenth Floor Chambers and Frangos as themselves, each drawn in
    its company's own colours and lettering (in code and open-licence fonts,
    never a picture file). 9 Meter is in Nine Mile's own lettering: the m and
    e traced from the logo the owner sent, the 9, t and r drawn to match.
    Don't swap them for made-up names, or add others, unless asked.
  - The owner wants a middling number of ads, and none on fences: posters on
    the billboards, and banners only on solid walls (the pit wall, Sydney
    CBD's walls, Rose Bay's two sandstone walls, and at Westfield the wall
    round the roof, the sides of the Oxford Street median and the concrete
    blocks of the race barriers), one every 20 m or so. One every 9 m was far too many ("we don't
    need THIS many"), one every 60 m too few ("not that little"), and one
    every 30 m nearly right ("you can have a bit more"). Never on a rail on
    posts (the owner calls those fences), a fence, or the railings of a
    bridge or ramp, and only where a driver can see the whole banner (not
    behind parked cars or another wall).
  - By day the signs take the scene's light and shadow (they were lit from
    inside, and the owner found them "way too intrusive and out of place");
    at night they still glow. Rose Bay's race barriers have one every 80 m.
  - On a race barrier (Westfield's concrete ones, Rose Bay's sandstone ones)
    a sponsor is painted along the barrier, not hung on it as a banner: the
    face in the sponsor's colours with the name all the way along it and a
    little plain paint between (`paintBarrier`). The owner sent a picture of
    a grand prix barrier, yellow with the name along it: "can the barrier
    sponsors look somewhat like this?"; then "the barrier adds should be in
    groups of 3 not 2"; then, in 4.7, "long rows" (below).
  - No billboards (4.4): the owner had the sponsors' posters on boards beside
    the tracks taken down ("please remove the signs with sponsors on side of
    track"), and the ones on Sydney CBD's buildings with them. Don't put
    them back. Sponsors go in two places only: "just have them on the
    barriers and those big overhang things that go over the track", "ideally
    in rows of 3 or more". The checkpoint gates carry no sponsor: each had
    a name across its top from 4.5 (the "overhang things" were taken to mean
    the gates), every other one in 4.9 ("not over every single gate mate"),
    and none from 4.10 ("why are they over checkpoints"). Don't put a
    sponsor on a checkpoint gate or the start arch. And no wall or barrier carries a
    single banner. From 4.7 the rows are long ("keep all the advertisements
    on barriers but have them in long rows, you can add more if you need"):
    one name six times or more along a stretch (six on the walls, nine down
    Oxford Street's barriers), then a plain stretch about as long. Don't go
    back to threes or singles, and don't cover a barrier end to end.
  - Sponsor bridges (4.8): "you can have some that hang over the track like
    irl". Two a lap on every track (`buildSponsorBridges` in `game.js`): a
    steel gantry with one name three times across, facing the cars coming,
    at least 170 m from the start line ("why is the meadow gp one so close
    to the start line": Queens Park's first stood 57 m past it) and well
    away from the gates. Its legs aren't solid (like the gates'). Westfield's two are side by side over Oxford Street
    (`sponsorBridges` in `tracks.js`). Two is "some": ask before adding more.
  - The 9LAT2 building's name signs are not lit from inside ("make 9 lat 2
    not illuminated"): they take the scene's light, dim at night.
  - The owner likes the sandstone walls at Rose Bay: a wall in that style is
    welcome there where a barrier is needed, in place of a rail on posts.
    Its straights have Westfield's race barrier in that sandstone, with the
    crowd on steps behind (the owner: "need more of the new barriers at rose
    bay"). Not all the way round: walls on both sides of the whole lap were
    "way too many barriers". Corners keep their rails (but the inside of the
    corner after the shops' street has the barrier: "there should be a fence
    on the inside here"), and a barrier that comes to a rail runs in to meet
    its end, with no way between them ("gap between fence and barrier
    here"); the harbour and the lookout keep their view. The outside of the
    top straight is one unbroken barrier: it had two ways through for Race
    to 9LAT2, and the owner took them for holes ("please fix these two big
    ones"). And the fenced barrier carries on past the tunnel under the
    InterContinental, round the chicane to the start straight's ("put this
    wired fence in the other side").
- **What's new** (`public/updates.js`): one entry per version, newest first.
  **One version per merge request.** Everything that ships together in one
  merge request is one version with one entry, its changes as the entry's
  items. The owner, 26 Nov 2026: "when I said 1 update per version I meant
  don't condense all changes from multiple batches into one, not to
  decompress every patch into one, just put things together by merge
  request." So don't fold several merge requests into one entry, and don't
  give every small change in a merge request its own version number (3.17
  to 4.1 were split that finely; the entries before 3.17 are a day each).
  It never opens by itself ("dont auto bring up whats new anymore"): the
  button in the corner shows a dot instead. Player-facing wording, and
  say whose idea it was only by their in-game name. The top entry is also
  the game's version: the server tells tabs running an older one to refresh
  (the owner asked: "remind people to refresh the tab for new updates"), so
  a change shipped without a new version never reaches the tabs already open.
- **Players' ideas:** run them by the owner before building any ("run
  everything by me first").
- **A new layout for a track** restarts its leaderboard (and its Drift King
  points): say so before doing it. Bump `v` in `tracks.js`, and
  `TRACK_VERSION` and `TRACK_LENGTH` in `server/core.js`; the saved copies
  look after themselves (README, "Changing a track's layout").
- Westfield follows the real one at Bondi Junction (the owner asked: "look
  at real westfield images and map layouts"): two buildings either side of
  Oxford Street, the glazed bridge over it, the bus stop outside. But it is
  a race track first ("remember this is a racing track, add more fences and
  barrier and add way more spectator spots"): race barriers with catch
  fences, grandstands and crowds, not a car park. The barrier down the start
  straight is unbroken ("it just cut off between grandstands" was a
  complaint about gaps in it), so is the one down each side of Oxford
  Street ("These should all be one long barrier why tf are there random
  holes"), and the crossing from the west doors over
  Oxford Street to the ramp has it down both sides, joined to the doorway
  and to the ramp ("this whole area should have barriers"). No fairground
  at Westfield ("seems out of place"): a park stands on its spot. Parked cars stay back from
  the road and must look like cars (the owner called the boxy ones "buns").
  The escalators are proper ones, with steps, balustrades and landings: a
  bare sloping slab read as "slanted for no reason". Both car park ramps
  have a concrete parapet down each edge from their own rails to the foot,
  joined to what stands there ("Fence here": a car ran off the side of the
  east ramp).
- No tyre stacks on corners: the owner had them taken out on every track
  ("the little black pole things on all the corners"). The rails and their
  posts stay.
- The owner likes a built-up background: the detailed city and Opera House
  across the water, and at Rose Bay "some buildings in it like what we did
  with opera house but more" (its suburbs: `suburbs` in `tracks.js`). Bare
  hills read as unfinished.
- On night tracks the pit garages are lit from inside (the owner approved
  the lighting when shown it).
- **Nobody sees anyone else's racing line or ghost** (4.1): the owner had
  the leaderboard's racing lines and the record holder's ghost switched
  off, because "people leak the methods". The server ticks no lap as
  having a line and hands none out (`server/core.js`); the buttons and the
  record ghost's switch hide themselves. Don't bring them back unasked.
  Your own best lap's ghost in Polytrack stays, and from 4.2 it is your
  best ever on that track, kept in the browser (`loadOwnBest` in `game.js`:
  "start off polytrack mode with their own best times for that track all
  time not just in that session").
- **Race to 9LAT2 mode is gone** (3.73): the owner had it binned, "so we
  can patch the holes" it needed left in the barriers of the walled tracks.
  Don't bring it back, and don't leave an opening in a barrier or fence for
  it. The 9LAT2 building stays. But don't seal a track all the way round
  either: "dont shut every way off, just the random ones that look ugly like
  those I mentioned" (a barrier or fence that stops and starts for no
  visible reason). The older tracks stay open country.
- Sydney CBD's barriers have no holes in them. The owner's "random black
  wall in cbd start", "right after the bridge to the left", was the opening
  for a side street (not the pit building and not the flyover, both of which
  were tried first), and once he saw what it was: "See these random holes at
  start of track in the barriers at cbd. Fix that! A piece of wall is
  missing just add it back right!" So the wall carries on under the bridge
  and across the mouth of each side street (`buildStreetWalls` in
  `game.js`). The streets behind are still paved, lined and lit
  (`buildSideStreets`), as closed-off city streets.
- No CINEMA neon sign at Sydney CBD: the owner had it taken down ("just
  remove cinema": a lit window behind it, its blind half down, showed
  through the sign as a white line). Its place in the list of words stays
  empty so the other signs keep theirs.
- Two tracks were built and taken out the same day, before any player saw
  them: Circuit de Double Bay (the beach, the shops on New South Head Road,
  through Cranbrook) and Eastgate Circuit (a figure of eight at sunset over
  the centre's roof). The owner had asked for both, played them, and said
  "both suck pls remove". Don't bring either back unasked, and if he asks
  again, show him the layout and pictures before building the scenery. They
  were built from memory, not from the "real images" he asked for, which is
  likely part of why. (The code is in the history: the merge of 26 Nov 2026
  titled "Two new tracks".)
- The fourth track is Pinto Speedway (the owner's name for it; it was Mount
  Panorama Circuit). The signs with Mount Panorama's corner names came down
  at the owner's request ("Remove them pls"): don't put them back.
- The home screen opens on Rose Bay (`HOME_TRACK` in `game.js`): the owner
  asked for it behind the name and car colour panel.
  That panel is 420px wide ("doesn't need to be so wide now that the
  version has moved"). Each colour swatch has a black border and the picked
  one an orange border with a dark ring (he found the old dark-and-pale
  ring "ugly"). The game's version is on the What's new button
  in the corner of the home screen: it was moved beside the DRIFT CLUB name
  in 3.60 at the owner's request, and he asked for it back ("put the version
  number back in the corner").
- The owner wants panels plain: no small print or hint paragraphs ("a lot
  of the grey text at the bottom and top is irrelevant"). The leaderboard
  opens on the Championship from the home screen, and on the picked track's
  board from the lobby. Camera lives in Settings, not on the home screen
  or the pause menu (the owner asked). Feedback is on the home screen
  beside Settings: it went into Settings with Camera for a while, and the
  owner asked for it back ("Put feedback next to settings in the Home
  Screen again"). The record
  ghost's switch sits near the top of Settings and in the Polytrack pause
  menu ("too hard to find" where it was, low down in Settings). The record
  ghost is off by default (the owner asked), and not on offer at all until
  the lap at the top of every track's board has its racing line ("don't
  offer the fastest lap option until every track's genuine fastest lap has
  the data"). Lines are saved with laps set in Polytrack mode only.
- **Nothing a few centimetres in front of something else on far-off
  scenery** (window panes on a wall, a band round a tower): from a few
  hundred metres the two flicker, and the test renderer doesn't show it
  ("City flickers from far away"). Make the detail part of the surface
  (README, "Far-off things and depth").
- **Testing:** headless Playwright (SwiftShader). Run the server with
  `CF_BEACON_TOKEN=` so the analytics script doesn't hang page loads.
- **Trying a build before deploying:** the owner likes to play an update
  before pressing Deploy. `npm run build-preview` writes `preview-build/` (not
  committed): the game with its server inside the page, one player, starting
  from the saved leaderboard and never touching the live one. Publish `preview-build/index.html` with the
  files beside it (all but `local.html`) as a private artifact. There is one
  already, called Drift Club Preview: find it in the artifact list and update
  it by its URL instead of making another.
