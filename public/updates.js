// What's new. Add a new entry at the TOP of this list whenever the game is
// updated: players see it behind the "What's new" button on the home screen,
// and the button shows a dot until they've opened the latest one. Keep it
// short: fold small changes into the next big entry.
export const UPDATES = [
  {
    v: '3.14', date: '24 Nov 2026', title: 'Only crashes delete laps',
    items: [
      'Clipping a checkpoint post, or brushing or tapping a wall, no longer deletes your lap. Only a real crash into a wall does: going into it hard, at an angle.',
    ],
  },
  {
    v: '3.13', date: '24 Nov 2026', title: 'Stronger brakes',
    items: [
      'Every car brakes about 15% harder, to go with the extra speed: 200 to 100 km/h takes 1.3 seconds instead of 1.5. Cornering and acceleration are the same.',
    ],
  },
  {
    v: '3.12', date: '24 Nov 2026', title: 'Even faster cars',
    items: [
      'Every car has another 12% more power and a higher top speed: the open seater does about 240 km/h flat out now. Corners and braking are the same, so brake a little earlier.',
    ],
  },
  {
    v: '3.11', date: '24 Nov 2026', title: 'Fairer wall rule',
    items: [
      'Brushing along a wall no longer deletes your lap, even flat out. Only a proper hit does: going into the wall at an angle, not just scraping it.',
    ],
  },
  {
    v: '3.10', date: '24 Nov 2026', title: 'Faster cars',
    items: [
      'Every car has 6% more power and a 6% higher top speed, so the times on the leaderboard can be beaten. Corners and braking are the same as before.',
    ],
  },
  {
    v: '3.9', date: '24 Nov 2026', title: 'No wall-riding',
    items: [
      'Hit a wall (or anything solid) hard and that lap is deleted, like a lap deleted for track limits in F1: it won\'t go on the leaderboard or count as your best lap, and its sectors go grey. Brushing along a wall is fine, and races work the same as before.',
      'Times set by using the walls to get round corners have come off the leaderboard.',
    ],
  },
  {
    v: '3.8', date: '24 Nov 2026', title: 'The real places',
    items: [
      'Every track has a bit of the real place now. Queens Park: a footy field (NSW against QLD), a cricket match and big Moreton Bay figs. Centennial Park: the Federation Pavilion, horses in a paddock and black swans on the pond.',
      'Thredbo: a chairlift up the mountain with skiers coming down, and A-frame lodges. Mount Panorama: every corner has its real name on a sign (Hell Corner, Skyline, The Dipper, The Chase and the rest), and campers sit round their fires on the mountain.',
      'Noosa Heads: surfers riding the waves in along the headland, and koalas in the gum trees. Sydney CBD: Sydney Tower at the end of the main straight, and the Harbour Bridge and the Opera House across the water.',
      'The chequered banner over the start line doesn\'t flicker any more, and the Feedback button looks like Settings.',
    ],
  },
  {
    v: '3.7', date: '24 Nov 2026', title: 'Aussie tracks',
    items: [
      'Every track has an Australian name: Queens Park GP, Centennial Park Raceway, Thredbo Alpine Circuit, Mount Panorama Circuit, Noosa Heads Circuit and Sydney CBD Street Circuit. The lobby shows their old names underneath.',
      'The harbour at Noosa Heads is busy now: a marina full of boats, a swimming beach between the flags with a lifeguard tower, jet skis, a parasail, gulls and a cruise ship on the horizon.',
      'Sydney CBD has traffic in the streets, crowds behind the walls and lit-up billboards.',
      'The race number on the nose reads from in front, like on a real F1 car. The castles are gone, and the track cards in the lobby fill their row.',
      'Polytrack sector times sit low in the middle of the screen, and a sector only goes purple when it really is the fastest. The message at the start no longer covers the start lights.',
      'Tell us what you think: Feedback on the home screen, or Send feedback in the Esc menu.',
    ],
  },
  {
    v: '3.6', date: '24 Nov 2026', title: 'Sector times',
    items: [
      'Polytrack sector times count up as you drive each part of the lap.',
      'Purple now means the best ever on that track, by anyone. Green is the best this session, yellow is slower.',
    ],
  },
  {
    v: '3.5', date: '24 Nov 2026', title: 'New layouts',
    items: [
      'Palm Bay climbs the cliffs to a hairpin round the lighthouse, comes back down over the start straight on a bridge, and winds back through the palms.',
      'Neon City has a hairpin at the end of the main straight, a flyover that crosses above it, and a chicane past the fairground.',
      'Their leaderboards start again, as they\'re new tracks.',
    ],
  },
  {
    v: '3.4', date: '24 Nov 2026', title: 'Polytrack timing',
    items: [
      'Polytrack mode has a rolling start: you start back down the straight and your first lap starts as you cross the line, so it counts like all the others. Restarting your run puts you back there too.',
      'Sector times, like F1: each lap in three parts. Purple is the best anyone has done this session, green is your own best, yellow is slower.',
      'The sea on Palm Bay doesn\'t flicker any more, and names with swear words spelt wrong to sneak past are caught now.',
    ],
  },
  {
    v: '3.3', date: '23 Nov 2026', title: 'Your keys',
    items: [
      'Change your keys: Settings, then Change keys. Pick any key for accelerating, braking, steering, the handbrake, reset and more, two keys each if you like.',
      'Polytrack mode: restart your run with Backspace (or Restart your run in the Esc menu). You go back to the grid and your lap clock starts again at the line.',
      'In Polytrack mode the clock now shows the lap you\'re on.',
      'Both ideas from TheBearKing, who holds most of the lap records. Thanks!',
    ],
  },
  {
    v: '3.2', date: '23 Nov 2026', title: 'Two new tracks',
    items: [
      'Palm Bay: along the seafront, out round the lighthouse and back through the palms. Beach huts, umbrellas and boats, and you can drive into the sea (it\'s slow going).',
      'Neon City: a street circuit at night between walls, with square corners, a chicane, lit-up office blocks and neon signs. Side streets lead out into the city.',
      'The landmarks are still there to explore, but the stars to find are gone.',
      'Smaller track cards in the lobby, the right shape now: four to a row, and the list scrolls for the rest.',
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
      'A live leaderboard: the ten fastest laps on every track, in any car. Every lap you drive counts. Find it on the home screen and in the lobby.',
      'A podium ceremony after every race: drumroll, the top three crash onto their steps, then confetti and fireworks for the winner. Click to skip.',
      'Qualifying is now Polytrack mode: free laps against your ghost, as long as you like.',
      'Pinewood replaces Red Canyon: a fast road through a pine forest. Switchback at night has fireworks and glowing road studs.',
      'Gates are easier to hit, a "Missed a gate!" arrow points you back, the minimap shows your next gate, and the race standings are fixed.',
      'Clearer graphics in the distance, a new Max setting, and Auto no longer leaves the game blurry.',
      'A volume slider, tips in the lobby, a tidier home screen and lobby, and a filter for rude names.',
    ],
  },
  {
    v: '2.0', date: '18 Nov 2026', title: 'Drift Club 2.0',
    items: [
      'The open seater handles like a race car at last: it turns in quicker, corners tighter, and stays planted when you flick it left and right.',
      'Plus everything since 1.0: four tracks (a snowy pass and a night race among them), a ghost car to chase, a big map to explore, and a secret or two.',
    ],
  },
  { v: '1.0', date: '11 Nov 2026', title: 'Drift Club opens', items: ['Host a room, share the code, race your friends.'] },
];
