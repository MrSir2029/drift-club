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
  - Signs are single sided (the owner asked): a billboard has one poster, on
    the face turned to the road and the cars coming, and nothing on its back.
  - The 9LAT2 building's name signs are not lit from inside ("make 9 lat 2
    not illuminated"): they take the scene's light, dim at night. The finish
    pad and the beam of light in Race to 9LAT2 mode are still there.
  - The owner likes the sandstone walls at Rose Bay: a wall in that style is
    welcome there where a barrier is needed, in place of a rail on posts.
    Its straights have Westfield's race barrier in that sandstone, with the
    crowd on steps behind (the owner: "need more of the new barriers at rose
    bay"). Not all the way round: walls on both sides of the whole lap were
    "way too many barriers". Corners keep their rails (but the inside of the
    corner after the shops' street has the barrier: "there should be a fence
    on the inside here"), and a barrier that comes to a rail runs in to meet
    its end, with no way between them ("gap between fence and barrier
    here"); the harbour and the lookout keep their view, and the two ways through on the outside of the
    top straight stay open (Race to 9LAT2 leaves the road there).
- **What's new** (`public/updates.js`): one entry per version, newest first.
  Every change gets its own version and its own entry (the owner asked for
  this; the entries before 3.17 are a day each). Player-facing wording, and
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
  complaint about gaps in it), and the crossing from the west doors over
  Oxford Street to the ramp has it down both sides, joined to the doorway
  and to the ramp ("this whole area should have barriers"). No fairground
  at Westfield ("seems out of place"): a park stands on its spot. Parked cars stay back from
  the road and must look like cars (the owner called the boxy ones "buns").
- No tyre stacks on corners: the owner had them taken out on every track
  ("the little black pole things on all the corners"). The rails and their
  posts stay.
- The owner likes a built-up background: the detailed city and Opera House
  across the water, and at Rose Bay "some buildings in it like what we did
  with opera house but more" (its suburbs: `suburbs` in `tracks.js`). Bare
  hills read as unfinished.
- The fourth track is Pinto Speedway (the owner's name for it; it was Mount
  Panorama Circuit). The signs with Mount Panorama's corner names came down
  at the owner's request ("Remove them pls"): don't put them back.
- The home screen opens on Rose Bay (`HOME_TRACK` in `game.js`): the owner
  asked for it behind the name and car colour panel.
  That panel is 520px wide, with the game's version beside the DRIFT CLUB
  name (26px: the owner asked for it bigger than it first was) and not on
  the What's new button (the owner: "Make this wider
  and put the version next to the name, remove it from the what's new").
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
