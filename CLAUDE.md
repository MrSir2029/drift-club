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
  README. Cars only carry made-up sponsor names, never real brands.
- **Testing:** headless Playwright (SwiftShader). Run the server with
  `CF_BEACON_TOKEN=` so the analytics script doesn't hang page loads.
