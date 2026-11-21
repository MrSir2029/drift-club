// What's new. Add a new entry at the TOP of this list whenever the game is
// updated: players see it behind the "What's new" button on the home screen,
// and the button shows a dot until they've opened the latest one.
export const UPDATES = [
  {
    v: '2.19', date: '21 Nov 2026', title: 'Volume and clearer arrows',
    items: [
      'A volume slider in Settings, under Sound.',
      'The arrows to 9LAT2 and back to a missed gate are proper arrows now, with a point at the front, so it\'s clear which way they point.',
    ],
  },
  {
    v: '2.18', date: '21 Nov 2026', title: 'Tips are back',
    items: [
      'While you wait in the lobby for the host to start, there\'s a tip under the waiting message. Click it for another.',
    ],
  },
  {
    v: '2.17', date: '21 Nov 2026', title: 'Pinewood on tarmac',
    items: [
      'In the open seater, Pinewood is now tarmac with no jumps, so the road is the quick way round again (on gravel it was faster across the grass).',
    ],
  },
  {
    v: '2.16', date: '21 Nov 2026', title: 'See for miles',
    items: [
      'Things in the distance look much better on High: the haze starts about three times further away, so the far side of the track, the scenery and the hills stay clear.',
      'The ground now carries on to the horizon, with big hills far off in every direction.',
      'New Max graphics (Settings): no limits. Drawn at twice your screen\'s resolution or more, almost no haze, sharper shadows over a wider area, and crowds however far away they are. For computers that can take it.',
    ],
  },
  {
    v: '2.15', date: '21 Nov 2026', title: 'Smoother again',
    items: [
      'Fixed: with Graphics on Auto, a slow moment made the game lower its detail, and it never came back up, so everything stayed blurry. It now goes back to full detail once the game runs smoothly.',
      'Pinewood runs much faster: about half as many trees. And on every track, trees, bushes and rocks no longer poke into each other.',
      'Leaderboard times are safer: your browser keeps its own copy that a server restart can\'t wipe, and hands it back to fill the boards in again.',
    ],
  },
  {
    v: '2.14', date: '21 Nov 2026', title: 'Pinewood',
    items: [
      'Red Canyon is now Pinewood: the desert is gone, and the same gravel stage runs through a thick pine forest with ferns and mossy rocks. The jumps and the rock arch are still there, and so are your lap times on the leaderboard.',
    ],
  },
  {
    v: '2.13', date: '21 Nov 2026', title: 'Bug fixes',
    items: [
      'Players who join part-way through a race now drive around as see-through ghosts until the next race: nobody can crash into them, and they stay out of the standings.',
      'Fixed: someone who joined part-way through a race could be left out of the standings for the whole of the next race too.',
      'The minimap marks your next gate with an orange bar. It turns red if you miss it.',
      'Polytrack mode results no longer say "You start 1st" (it doesn\'t set the grid): they show your best lap and where it ranks.',
    ],
  },
  {
    v: '2.12', date: '21 Nov 2026', title: 'Just the open seater',
    items: [
      'The rally car is hidden for now, so the lobby is simpler: everyone races the open seater. Hosts who know the code can still bring it back.',
    ],
  },
  {
    v: '2.11', date: '21 Nov 2026', title: 'Leaderboard bubble',
    items: [
      'The Leaderboard button has its own bubble on the home screen, under the main one.',
    ],
  },
  {
    v: '2.10', date: '21 Nov 2026', title: 'Polytrack mode, no time limit',
    items: [
      'Polytrack mode has no time limit: drive as many laps as you like until the host ends it. The clock counts up.',
      'Polytrack mode stands on its own now: its times no longer set the grid for the next race.',
      'If the host leaves during Polytrack mode, the new host can end it.',
      'No more tips on the home screen, to keep it clean.',
    ],
  },
  {
    v: '2.9', date: '21 Nov 2026', title: 'A tidier lobby',
    items: [
      'The lobby is simpler: the room code and the racers sit in one short strip at the top, so you can see more of the map.',
      'Track and car cards just show their names (hover over one for its description).',
      'Settings and Leave room share a row under the Leaderboard button.',
    ],
  },
  {
    v: '2.8', date: '20 Nov 2026', title: 'Polytrack mode',
    items: [
      'Qualifying is now called Polytrack mode: free laps against your ghost.',
      'A bigger, bolder Leaderboard button on the home screen and in the lobby.',
      'The lobby now says "Lap time record" above the tracks, so it\'s clear what the record is.',
    ],
  },
  {
    v: '2.7', date: '20 Nov 2026', title: 'Gates and standings fixed',
    items: [
      'Gates are easier to hit: going through one a little wide, with a wheel or two on the grass, now counts. Before, running wide at a gate could miss it without you noticing.',
      'Miss a gate and a yellow "Missed a gate!" banner pops up, with an arrow and the distance back to it. Drive back through it, or press R.',
      'The standings during a race are fixed: a car that missed a gate stays where it missed it instead of jumping about, the order is right at the start, and players who join part-way through a race (to watch) are left out.',
      'In a big room the standings show the top eight, plus you.',
    ],
  },
  {
    v: '2.6', date: '20 Nov 2026', title: 'One leaderboard per track',
    items: [
      'The leaderboard is one list per track now, whatever car you drive: the ten fastest laps on each track, with the car each one was set in shown next to it.',
      'Times already on the per-car boards carry over, so nobody loses theirs.',
    ],
  },
  {
    v: '2.5', date: '20 Nov 2026', title: 'Leaderboard and podium',
    items: [
      'A live leaderboard: the ten fastest laps on every track, for each car. Every lap counts, in races and qualifying, under the name you race with. Find it on the home screen and in the lobby.',
      'A podium after every race: the top three on the steps, with confetti. Press any key to skip.',
      'In qualifying, your ghost shows on the minimap.',
      'Switchback at night: fireworks, searchlights sweeping the sky, and glowing studs along the track edges.',
      'Fixed: joining a session part-way through now times your first lap properly.',
    ],
  },
  {
    v: '2.4', date: '18 Nov 2026', title: 'Quicker reverse, no halo',
    items: [
      'Reversing is a little quicker on every car: up to about 38 km/h, and it gets there sooner.',
      'The open seater no longer has the halo bar over the cockpit.',
      'Tips sit at the bottom of the home screen, under the controls.',
    ],
  },
  {
    v: '2.3', date: '18 Nov 2026', title: 'Tips on the home screen',
    items: [
      'No more loading screen: races go straight to the start lights again.',
      'Tips now show on the home screen. Click one for another.',
    ],
  },
  {
    v: '2.2', date: '18 Nov 2026', title: 'Faster loading',
    items: [
      'The game loads about 4 times faster, and almost instantly after the first time.',
      'In a one-lap race, your lap time and race time now match exactly.',
    ],
  },
  {
    v: '2.1', date: '18 Nov 2026', title: 'Loading screen',
    items: [
      'A loading screen as you head into a race: a shot of the pack on that track and a racing tip. The start lights come straight after it.',
      'The expanded map and its Easter eggs are switched back on for everyone. You can still turn them off in Settings.',
    ],
  },
  {
    v: '2.0', date: '18 Nov 2026', title: 'Drift Club 2.0',
    items: [
      'The open seater handles like a race car at last: it turns in quicker, corners about 40% tighter, and stays planted when you flick it left and right. Braking and the handbrake feel the same.',
      'Plus everything since 1.0: four tracks (a desert stage, a snowy pass and a night race), qualifying with a ghost car, three cars, a big map to explore, and a secret or two.',
    ],
  },
  {
    v: '1.18', date: '17 Nov 2026', title: 'Not for phones',
    items: [
      'The touch controls are gone: Drift Club is made for a computer with a keyboard. Phones and tablets now show a warning on the home screen.',
    ],
  },
  {
    v: '1.17', date: '17 Nov 2026', title: 'Touch buttons on phones only',
    items: [
      'The touch buttons only appear on phones and tablets, never on a computer, even one with a touchscreen.',
    ],
  },
  {
    v: '1.16', date: '17 Nov 2026', title: 'Touch controls',
    items: [
      'Race on a phone or tablet: steer with the arrows on the left; gas, brake and handbrake on the right; Reset and Camera above the arrows. You can slide your thumb from one button to the next without lifting it.',
      'The buttons appear when you touch the screen and hide again when you use the keyboard.',
      'On a phone held sideways, the home screen and lobby now scroll, so Start is always in reach.',
    ],
  },
  {
    v: '1.15', date: '17 Nov 2026', title: 'Car lights',
    items: [
      'Car lights are back to how they were: no headlight beams or glows at night, and tail lights only light up when you brake.',
    ],
  },
  {
    v: '1.14', date: '17 Nov 2026', title: 'Brakes and handbrake',
    items: [
      'Open seater brakes are back to full strength: from 180 km/h you stop in under 80 m again.',
      'The open seater\'s handbrake now stops you hard (100 km/h to nothing in about 30 m) and only steps the tail out a little, instead of spinning you half way round.',
      'The rally car and Camry brake and handbrake just as they always did, tail swinging round for drifts.',
    ],
  },
  {
    v: '1.13', date: '17 Nov 2026', title: 'Ghost and sound',
    items: [
      'The qualifying ghost now starts from the line with you, instead of trailing behind from the grid where you could never see it. It\'s tinted blue.',
      'A live gap to your ghost shows under your best lap: green with a minus when you\'re ahead, red when you\'re behind.',
      'The sound switch moved into Settings. M still toggles it.',
    ],
  },
  {
    v: '1.12', date: '17 Nov 2026', title: 'Night race',
    items: [
      'Switchback is now a night race: floodlights over the track, headlight beams on every car, glowing tail lights, stars and a moon.',
      'Railings along the Frost Pass bridge, so you can\'t drive off the edge.',
    ],
  },
  {
    v: '1.11', date: '17 Nov 2026', title: 'Brake lights',
    items: [
      'Brake lights stay on when you brake to a stop: the car holds still for a moment before it starts to reverse, instead of slipping straight into reverse with the lights off.',
    ],
  },
  {
    v: '1.10', date: '17 Nov 2026', title: 'Cockpit start and gentler brakes',
    items: [
      'The open seater always starts in the cockpit. C still switches camera for that race.',
      'Open seater brakes are much gentler: about 1 g at most, building up over a moment.',
      'The What\'s new button is solid.',
    ],
  },
  {
    v: '1.9', date: '17 Nov 2026', title: 'Frost Pass',
    items: [
      'Overpass is now Frost Pass: snow everywhere, snowy pine trees, snowmen, white mountains and falling snow.',
      'New blue tab icon.',
      'Less shimmer in the distance: smoother ground colours, a bit more haze far away, and far-off crowds no longer sparkle.',
      'Holding accelerate while rolling backwards now drives you forward straight away (it used to keep coasting backwards).',
    ],
  },
  {
    v: '1.8', date: '17 Nov 2026', title: 'Red Canyon',
    items: [
      'Ridge Rally is now Red Canyon: a desert stage with sand and red rock, cacti, mesas, a stone arch over the road and two jumps.',
      'Graphics start on high with the expanded map and Easter eggs on. Everyone\'s settings were reset once to these; change them any time in Settings.',
      'What\'s new lives in the bottom-left corner of the home screen now.',
      'Fixed the road height just before the top of a hill, which could throw cars into the air.',
    ],
  },
  {
    v: '1.7', date: '17 Nov 2026', title: 'Cockpit tidy-up',
    items: [
      'The steering wheel sits on a proper column instead of floating, and the dials are set into the dash where you can see them through the wheel.',
      'The rally car lost its roll cage: from inside it looked like a second roof.',
      'Door mirrors are attached to the doors on arms instead of floating beside the car.',
      'Each car remembers its own camera (C): the open seater starts in the cockpit, the rally car and the Camry start outside.',
    ],
  },
  {
    v: '1.6', date: '17 Nov 2026', title: 'Cockpit and lights',
    items: [
      'Cockpit view: the whole steering wheel shows now, in front of a proper dashboard instead of half buried in it, and the view looks a touch lower so the roof takes up less of the screen.',
      'Headlights, tail lights and the Camry grille sit flush on the bodywork instead of floating in front of it.',
    ],
  },
  {
    v: '1.5', date: '16 Nov 2026', title: 'Much smoother, plus laps and settings',
    items: [
      'Big speed-up: the map and cars are now drawn in far fewer pieces, so the game runs much smoother on school laptops.',
      'New Settings button (home screen, lobby and Esc menu) for graphics and the map.',
      'The expanded map and Easter eggs (lake, castle, fairground, village, hidden stars) are now optional and off unless you turn them on, because they can slow older computers down.',
      'Hosts choose how many laps a race has, from 1 to 10.',
      'Open seater brakes are gentler and build up over a moment instead of slamming on.',
      'Fixed the rear wing side plates glitching through the rear tyres.',
      'Cars no longer sink into the road on hills, and only the body leans (outwards in corners, nose down under braking) while the wheels stay on the road.',
      'Medium graphics are much sharper: full screen resolution with smooth edges, so the distant ground no longer looks pixelated. Auto no longer blurs the picture when that would not make the game faster.',
      'Proper cockpit view in the rally car and the Camry: you sit behind a dashboard with dials and a steering wheel that turns as you steer, and the view stays steadier in corners.',
      'The Settings and Leave room buttons in the lobby are solid now, so you can actually see them.',
    ],
  },
  {
    v: '1.4', date: '16 Nov 2026', title: 'Contact!',
    items: [
      'Cars are solid now: you can bump, block and get knocked wide.',
      'Qualifying shows a ghost of your best lap to chase.',
    ],
  },
  {
    v: '1.3', date: '16 Nov 2026', title: 'Secrets, medium graphics, and this list',
    items: [
      'There are secrets now, for hosts who know where to look.',
      'Graphics now has a medium setting between high and low (Esc menu).',
      'This "What\'s new" list, so you can see what changed and when.',
    ],
  },
  {
    v: '1.2', date: '16 Nov 2026', title: 'Smooth multiplayer and a bigger world',
    items: [
      'Other players\' cars now glide instead of stuttering.',
      'Trees, rocks, buildings and posts are solid, and a wall rings the map.',
      'New places to find: lake, castle, fairground, village, stone circle, campsite, windmill, radio mast. Each hides a gold star.',
      'The helicopter follows the race leader.',
      'Results show gaps and every lap you set. The lobby keeps the qualifying grid.',
      'Graphics adjust themselves to keep the game running smoothly.',
    ],
  },
  {
    v: '1.1', date: '12 Nov 2026', title: 'Rally cars and qualifying',
    items: [
      'Rally car class that loves gravel.',
      'Qualifying sessions that set the grid.',
      'Four longer tracks, cockpit camera (C), Esc menu.',
      'Engine sound, start lights, new driving physics.',
    ],
  },
  { v: '1.0', date: '11 Nov 2026', title: 'Drift Club opens', items: ['Host a room, share the code, race your friends.'] },
];
