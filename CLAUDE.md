# Notes for Claude

- **Shipping:** commit on the session branch, open a PR and merge it. The
  owner deploys by hand on Render (Manual Deploy → Deploy latest commit).
- **Before every update that will be deployed, save the live leaderboard**,
  so the redeploy doesn't start it empty:
  `DRIFT_CLUB_URL=https://drift-club-mvq1.onrender.com npm run save-boards`,
  then commit `server/boards.json` with the update. Behind a proxy (cloud
  sessions), run `npm i --no-save https-proxy-agent` first. If the game is
  asleep and doesn't answer, ship anyway: players' browsers hand their copies
  back.
- The secret livery (colour 12) and its code stay out of What's new and the
  README. Cars only carry made-up sponsor names, never real brands. Two
  exceptions, both at the owner's request:
  - Shop signs at Rose Bay and Westfield, and the hotel over Rose Bay's tunnel
    (The InterContinental): real local names in plain lettering, never logos.
  - The trackside sponsors on posters and wall banners (`SPONSOR_ART` in
    `game.js`): 9 Meter, PWD and Glory Dates (puns on Nine Mile, PwC and Glory
    Days), and Tenth Floor Chambers and Frangos as themselves, each drawn in
    its company's own colours and lettering (in code and open-licence fonts,
    never a picture file). 9 Meter is in Nine Mile's own lettering: the m and
    e traced from the logo the owner sent, the 9, t and r drawn to match.
    Don't swap them for made-up names, or add others, unless asked.
  - The owner wants a middling number of ads, and none on fences: posters on
    the billboards, and banners only on solid walls (the pit wall, Sydney
    CBD's walls, Rose Bay's two sandstone walls, the wall round Westfield's
    roof and the sides of its Oxford Street median), one every 20 m or so. One every 9 m was far too many ("we don't
    need THIS many"), one every 60 m too few ("not that little"), and one
    every 30 m nearly right ("you can have a bit more"). Never on a rail on
    posts (the owner calls those fences), a fence, or the railings of a
    bridge or ramp, and only where a driver can see the whole banner (not
    behind parked cars or another wall).
  - The owner likes the sandstone walls at Rose Bay: a wall in that style is
    welcome there where a barrier is needed, in place of a rail on posts.
- **What's new** (`public/updates.js`): one entry per version, newest first.
  Every change gets its own version and its own entry (the owner asked for
  this; the entries before 3.17 are a day each). Player-facing wording, and
  say whose idea it was only by their in-game name.
- **Players' ideas:** run them by the owner before building any ("run
  everything by me first").
- **A new layout for a track** restarts its leaderboard (and its Drift King
  points): say so before doing it. Bump `v` in `tracks.js`, and
  `TRACK_VERSION` and `TRACK_LENGTH` in `server/core.js`; the saved copies
  look after themselves (README, "Changing a track's layout").
- Westfield follows the real one at Bondi Junction (the owner asked: "look
  at real westfield images and map layouts"): two buildings either side of
  Oxford Street, the glazed bridge over it, the bus stop outside.
- **Testing:** headless Playwright (SwiftShader). Run the server with
  `CF_BEACON_TOKEN=` so the analytics script doesn't hang page loads.
- **Trying a build before deploying:** the owner likes to play an update
  before pressing Deploy. `npm run build-preview` writes `preview-build/` (not
  committed): the game with its server inside the page, one player, starting
  from the saved leaderboard and never touching the live one. Publish `preview-build/index.html` with the
  files beside it (all but `local.html`) as a private artifact. There is one
  already, called Drift Club Preview: find it in the artifact list and update
  it by its URL instead of making another.
