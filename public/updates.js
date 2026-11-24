// What's new: one entry per day, newest first. When the game changes, add
// the change to today's entry and bump its version (or start a new entry on a
// new day): players see the list behind the "What's new" button on the home
// screen, it opens by itself for anyone coming back after the top version
// changed, and the button shows a dot until they've seen it. Each entry says
// where things ended up that day, not every step on the way.
export const UPDATES = [
  {
    v: '3.19', date: '25 Nov 2026', title: 'Rose Bay and Westfield',
    items: [
      'A new track, Rose Bay Harbour Circuit: Sydney\'s own Monaco. Along the quay past the superyachts, up Heartbreak Hill, round two hairpins, down past the shops and through the tunnel under the hotel.',
      'On the way down the hill, look left: the city, the Opera House and the Harbour Bridge across the water. There\'s also a ferry calling at the wharf, seaplanes landing in the bay, Catalina on its stilts, Shark Island, and a few shops you might know.',
      'And another, Westfield Mall Circuit: start on the roof of the car park, down the ramp, across Oxford Street, in through the doors and flat out between the shops, round the food court and back up the other ramp, with the Harbour Bridge dead ahead. The 333 is waiting at its stop.',
      'The leaderboard has a tab for each of the eight tracks, in two rows.',
      'The chairlift at Thredbo crosses over the track now: you drive under the chairs just after the start.',
    ],
  },
  {
    v: '3.16', date: '24 Nov 2026', title: 'Aussie tracks, faster cars',
    items: [
      'Every track has an Australian name, with its old one under it in the lobby: Queens Park GP, Centennial Park Raceway, Thredbo Alpine Circuit, Mount Panorama Circuit, Noosa Heads Circuit and Sydney CBD Street Circuit.',
      'And a bit of the real place: a footy field, a cricket match and Moreton Bay figs at Queens Park; the Federation Pavilion, horses and black swans at Centennial Park; a chairlift and skiers at Thredbo; the real corner names on signs and campers round their fires at Mount Panorama; surfers and koalas at Noosa Heads; Sydney Tower, the Harbour Bridge and the Opera House at Sydney CBD.',
      'Noosa Heads and Sydney CBD have new layouts, with a bridge, a flyover, hairpins and a chicane, and they\'re busier: a marina, swimmers, jet skis and a parasail in the harbour; traffic, crowds and billboards in the city. Their leaderboards started again with the new layouts.',
      'The cars are faster: about 19% more power and top speed (the open seater does about 240 km/h flat out), and they brake about 15% harder. Corners are the same as before.',
      'Polytrack mode has a rolling start, so your first lap counts like the rest, and F1 sector times that count up as you drive, low in the middle of the screen: purple is the best ever on that track, green the best this session, yellow slower.',
      'A big hit on a wall slows you down for a second, like driving on the grass, so going into a corner flat out and letting the wall turn you is no quicker than braking. Brushing a wall doesn\'t. Times set using the walls came off the leaderboard.',
      'Race numbers on the leaderboard, next to each name.',
      'Tell us what you think: Feedback on the home screen, or Send feedback in the Esc menu. And What\'s new opens by itself when there\'s something new.',
      'Also: the race number on the nose reads from in front, like on a real F1 car; the castles are gone; the sea and the chequered banner over the start line don\'t flicker; the track cards in the lobby fill their row; and names with swear words spelt wrong to sneak past are caught.',
    ],
  },
  {
    v: '3.3', date: '23 Nov 2026', title: 'Two new tracks and your keys',
    items: [
      'Two new tracks. Palm Bay (now Noosa Heads): along the seafront, out round the lighthouse and back through the palms, with beach huts, umbrellas and boats, and you can drive into the sea (it\'s slow going). Neon City (now Sydney CBD): a street circuit at night between walls, with lit-up office blocks, neon signs and side streets out into the city.',
      'Change your keys: Settings, then Change keys. Pick any key for accelerating, braking, steering, the handbrake, reset and more, two keys each if you like.',
      'Polytrack mode: restart your run with Backspace (or Restart your run in the Esc menu), and the clock shows the lap you\'re on. Both ideas from TheBearKing, who holds most of the lap records. Thanks!',
      'The landmarks are still there to explore, but the stars to find are gone. Smaller track cards in the lobby, four to a row.',
    ],
  },
  {
    v: '3.1', date: '22 Nov 2026', title: 'Liveries',
    items: [
      'Every car colour has its own livery now: black underneath, a pinstripe that stands out, your name on the sidepods, your race number on the engine cover and in front of you in the cockpit, and DRIFT CLUB on the rear wing.',
      'Type your car number in the Number box next to your name, or leave it empty for a random one.',
      'Fixed on Macs: coloured specks under the floodlights and gaps in the lettering. The car park and pit wall don\'t flicker any more.',
    ],
  },
  {
    v: '3.0', date: '21 Nov 2026', title: 'Drift Club 3.0',
    items: [
      'Pinewood replaces Red Canyon: a fast tarmac road through a thick pine forest, with ferns, mossy rocks and the stone arch still over the road.',
      'A proper podium ceremony after every race: cinema bars and a drumroll, third and second crash down onto their steps, and the winner slams onto the top one with a flash, a fanfare, a confetti cannon and fireworks. Click to skip.',
      'Polytrack mode has no time limit and stands on its own: drive as many laps as you like until the host ends it, and its times don\'t set the grid for the next race.',
      'See for miles: the haze starts about three times further away, the ground carries on to the horizon with hills all round, and there\'s a new Max graphics setting. Auto no longer leaves the game blurry after a slow moment, and Pinewood runs much faster.',
      'Players who join part-way through a race drive round as see-through ghosts until the next one. The minimap marks your next gate, and the arrows to a missed gate and to 9LAT2 point the right way.',
      'A volume slider in Settings, tips in the lobby while you wait for the host, the Leaderboard in its own bubble on the home screen, a tidier lobby, and everyone races the open seater for now.',
      'Names with bad words in them are swapped for "Racer", everywhere. And leaderboard times are safer: your browser keeps a copy that a server restart can\'t wipe, and hands it back.',
    ],
  },
  {
    v: '2.8', date: '20 Nov 2026', title: 'Leaderboard and podium',
    items: [
      'A live leaderboard: the ten fastest laps on every track, in any car, with the car each was set in. Every lap counts, in races and qualifying, under the name you race with. Find it on the home screen and in the lobby, where the lap time record for the track shows too.',
      'A podium after every race: the top three on the steps, with confetti.',
      'Qualifying is now Polytrack mode: free laps against your ghost, which shows on the minimap.',
      'Switchback at night: fireworks, searchlights sweeping the sky, and glowing studs along the track edges.',
      'Gates are easier to hit: a wheel or two on the grass still counts. Miss one and a "Missed a gate!" banner points you back. The race standings are fixed, and in a big room they show the top eight plus you.',
    ],
  },
  {
    v: '2.4', date: '18 Nov 2026', title: 'Drift Club 2.0',
    items: [
      'The open seater handles like a race car at last: it turns in quicker, corners about 40% tighter, and stays planted when you flick it left and right.',
      'The game loads about 4 times faster, and almost instantly after the first time.',
      'Reversing is quicker on every car, the open seater lost its halo, and in a one-lap race your lap time and race time match exactly.',
      'The expanded map and its Easter eggs are back on for everyone (you can still turn them off in Settings), and tips show on the home screen.',
    ],
  },
  {
    v: '1.18', date: '17 Nov 2026', title: 'New tracks and a night race',
    items: [
      'Red Canyon: a desert stage with red rock, cacti, mesas, a stone arch over the road and two jumps.',
      'Frost Pass (now Thredbo): snow everywhere, snowy pines, snowmen, white mountains and falling snow, with railings along the bridge.',
      'Switchback (now Mount Panorama) is a night race: floodlights over the track, glowing tail lights, stars and a moon.',
      'The qualifying ghost starts from the line with you, tinted blue, with a live gap to it under your best lap.',
      'A tidier cockpit: the whole steering wheel on a proper column, dials in the dash, door mirrors on arms. Each car remembers its own camera, and the open seater starts in the cockpit.',
      'Full-strength brakes, and the open seater\'s handbrake stops you hard instead of spinning you round. Brake lights stay on when you brake to a stop, and accelerating while rolling backwards drives you forward straight away.',
      'Graphics start on High with the expanded map on, What\'s new lives in the bottom-left corner, and the sound switch moved into Settings.',
      'Drift Club is made for a computer with a keyboard: phones and tablets show a warning.',
    ],
  },
  {
    v: '1.5', date: '16 Nov 2026', title: 'Contact, and a bigger world',
    items: [
      'Cars are solid now: you can bump, block and get knocked wide. Trees, rocks, buildings and posts are solid too, and a wall rings the map.',
      'Qualifying shows a ghost of your best lap to chase.',
      'Places to find: a lake, a castle, a fairground, a village, a stone circle, a campsite, a windmill and a radio mast. And there are secrets, for hosts who know where to look.',
      'Much smoother: other players\' cars glide instead of stuttering, the game runs far better on school laptops, and graphics have a medium setting and adjust themselves to keep things smooth.',
      'Hosts choose how many laps a race has, from 1 to 10, and a Settings button for graphics and the map.',
      'The helicopter follows the race leader, and results show the gaps and every lap you set.',
      'Proper cockpit views in every car, and this What\'s new list.',
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
