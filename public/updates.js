// What's new: one entry per version, newest first. One version per merge
// request: what ships together is one entry, with its changes as the items.
// (The owner, 26 Nov 2026: don't fold several batches into one entry, and
// don't give every small change its own version either. The entries from 3.17
// to 4.1 were split one change each; the ones before 3.17 are a day each.)
// Players see the list behind the "What's new" button on the home screen. The
// button shows a dot until they've looked at the newest entry. It no longer
// opens by itself (4.3: the owner asked).
export const UPDATES = [
  {
    v: '4.4', date: '26 Nov 2026', title: 'The sponsors\' billboards come down',
    items: [
      'The billboards with sponsors\' posters beside the tracks are gone, on every track, and so are the ones on the buildings at Sydney CBD. The sponsors painted on walls and barriers are still there.',
    ],
  },
  {
    v: '4.3', date: '26 Nov 2026', title: 'What\'s new waits to be asked',
    items: [
      'This list no longer opens by itself after an update. The What\'s new button in the corner shows a dot when there is something you haven\'t read.',
    ],
  },
  {
    v: '4.2', date: '26 Nov 2026', title: 'Your best lap, kept',
    items: [
      'Polytrack mode now starts with your own best lap on that track: your best ever time is on the screen, and the ghost you race is that lap. It is kept between visits, on this device, for each track and car. Beat it and the new lap takes over.',
      'The version number is back in the corner of the home screen, on the What\'s new button.',
    ],
  },
  {
    v: '4.1', date: '26 Nov 2026', title: 'Racing lines are private again',
    items: [
      'You can no longer see other players\' racing lines on the leaderboard, or race the record holder\'s ghost. People were leaking each other\'s methods. In Polytrack mode you still race the ghost of your own best lap.',
    ],
  },
  {
    v: '4.0', date: '26 Nov 2026', title: 'Liveries in famous F1 colours',
    items: [
      'Every car colour is now a livery in a famous Formula 1 team\'s colours: Ferrari red, McLaren papaya, Jordan yellow, Sauber green, Mercedes silver, Williams blue, Red Bull navy, Alpine pink, Haas white, Lotus black and gold, and Renault sky blue and yellow. The colours only: your name, your number and DRIFT CLUB are still what\'s written on the car.',
      'The colour you had picked is still picked. Two have changed: the teal car is now the silver one and the purple car is now the navy one.',
    ],
  },
  {
    v: '3.80', date: '26 Nov 2026', title: 'A slightly sharper front end',
    items: [
      'The open seater turns in a little more sharply: a touch more grip at the front and quicker steering. Thanks to archer and the others who said it understeered.',
    ],
  },
  {
    v: '3.79', date: '26 Nov 2026', title: 'Sponsors on the barriers in threes',
    items: [
      'On the painted race barriers at Rose Bay and Westfield each sponsor\'s name now comes three times in a row. It came twice on most of them.',
    ],
  },
  {
    v: '3.78', date: '26 Nov 2026', title: 'A wall down Westfield\'s car park ramp',
    items: [
      'At Westfield the ramp down from the car park roof has a concrete wall down both edges to the bottom. On one side it meets the rail round the corner, and on the other it carries on round the corner to the race barrier along Oxford Street. A car could run off the side of the ramp there.',
    ],
  },
  {
    v: '3.77', date: '26 Nov 2026', title: 'Proper escalators at Westfield',
    items: [
      'The escalators in the mall are escalators now: steps going up between glass sides with handrails, a landing at the bottom, and a landing at the top where the gallery comes out to meet it. Each one was a bare sloping slab.',
    ],
  },
  {
    v: '3.76', date: '26 Nov 2026', title: 'One long barrier down Oxford Street',
    items: [
      'At Westfield the race barrier down each side of Oxford Street is one unbroken run, from the hairpin to where the two roads part. It came in lengths with gaps between them. The spectators who stood in the gaps are behind the barrier now.',
    ],
  },
  {
    v: '3.75', date: '26 Nov 2026', title: 'Rose Bay\'s fence carries on past the hotel',
    items: [
      'At Rose Bay the barrier with the wire fence now carries on out of the tunnel under The InterContinental, round the chicane and up to the start straight, with the crowd behind it. That side had only grass and a short rail.',
    ],
  },
  {
    v: '3.74', date: '26 Nov 2026', title: 'No holes along Rose Bay\'s top straight',
    items: [
      'At Rose Bay the barrier along the outside of the top straight is one unbroken length. It had two wide openings onto the grass. The crowd stands on steps behind where they were.',
    ],
  },
  {
    v: '3.73', date: '26 Nov 2026', title: 'Race to 9LAT2 is gone',
    items: [
      'Race to 9LAT2 mode has been taken out. It needed gaps left in the barriers for cars to leave the circuit by, and those gaps are being closed. The 9LAT2 building is still out there.',
      'At Sydney CBD the wall now runs across the two side streets for good, sponsors\' banners and all.',
    ],
  },
  {
    v: '3.72', date: '26 Nov 2026', title: 'No more holes in Sydney CBD\'s barriers',
    items: [
      'The barriers at Sydney CBD have no holes in them now. The wall carries on under the bridge on both sides of the start straight, where it used to stop and start again, and it runs across the two side streets. Up on the flyover it turns in to meet the railing.',
      'In Race to 9LAT2 the wall across the two side streets comes away: they are the way off the circuit.',
    ],
  },
  {
    v: '3.71', date: '26 Nov 2026', title: 'Side streets at Sydney CBD',
    items: [
      'The two openings in Sydney CBD\'s walls are proper side streets now: asphalt with lines, and street lamps lighting them. Nothing was drawn in them before and no lamp reached them, so from the driver\'s seat the first one, on the left just past the bridge, looked like a stretch of wall painted black.',
    ],
  },
  {
    v: '3.70', date: '26 Nov 2026', title: 'The CINEMA sign comes down',
    items: [
      'Sydney CBD\'s pink CINEMA neon signs are gone. The one past the start had a white line across it: a lit window behind the sign, with its blind half down.',
    ],
  },
  {
    v: '3.69', date: '26 Nov 2026', title: 'The pits light up at night',
    items: [
      'On the night tracks, Sydney CBD and Pinto Speedway, the pit garages beside the grid are lit from inside, with a strip of lamps under the roof. Unlit, the pit building was a long black wall next to the start.',
    ],
  },
  {
    v: '3.68', date: '26 Nov 2026', title: 'Painted barriers',
    items: [
      'The sponsors on the race barriers at Westfield and Rose Bay are painted along the barrier now, as they are at a grand prix: the barrier in the sponsor\'s colours with the name repeated along it. Before, each was one small banner on bare concrete.',
    ],
  },
  {
    v: '3.67', date: '26 Nov 2026', title: 'The last made-up signs come down',
    items: [
      'Rose Bay\'s shops have real names only now, like Westfield\'s. And Westfield\'s Food Court and Juice Bar signs are gone.',
    ],
  },
  {
    v: '3.66', date: '26 Nov 2026', title: 'A bigger version number',
    items: [
      'The version number beside the game\'s name on the home screen is bigger.',
    ],
  },
  {
    v: '3.65', date: '26 Nov 2026', title: 'The record ghost waits for the real records',
    items: [
      'The Record holder\'s ghost option is hidden for now. On most tracks the game doesn\'t have the racing line of the real record yet, so the ghost wasn\'t always the fastest lap. It comes back by itself once every track\'s record has its line: laps set in Polytrack mode save theirs.',
    ],
  },
  {
    v: '3.64', date: '26 Nov 2026', title: 'Real shops at Westfield',
    items: [
      'Every shop at Westfield has a real name now. The made-up ones are gone, so you\'ll pass Myer, Kmart, JB Hi-Fi and the rest more than once.',
    ],
  },
  {
    v: '3.63', date: '26 Nov 2026', title: 'No fairground at Westfield',
    items: [
      'The fairground behind Westfield\'s car park is gone: a big wheel and a circus tent looked out of place at a shopping centre. There\'s a small park there now.',
    ],
  },
  {
    v: '3.62', date: '26 Nov 2026', title: 'Barriers at Westfield\'s street crossing',
    items: [
      'At Westfield, the stretch where you leave the shops, cross Oxford Street and head up the ramp to the roof used to have nothing either side. Now race barriers run down both sides, with a crowd behind them, and a wall carries on up each edge of the ramp.',
    ],
  },
  {
    v: '3.61', date: '26 Nov 2026', title: 'Feedback is back on the home screen',
    items: [
      'The Feedback button is next to Settings on the home screen again. It had been inside Settings.',
    ],
  },
  {
    v: '3.60', date: '26 Nov 2026', title: 'A wider home screen',
    items: [
      'The panel on the home screen is wider, and the game\'s version now sits beside its name instead of on the What\'s new button.',
    ],
  },
  {
    v: '3.59', date: '26 Nov 2026', title: 'The 9LAT2 signs stop glowing',
    items: [
      'The signs on the 9LAT2 building aren\'t lit up any more. They catch the daylight like the walls around them, and go dark at night.',
    ],
  },
  {
    v: '3.58', date: '26 Nov 2026', title: 'One-sided billboards',
    items: [
      'The billboards beside the track have their poster on one side only now: the side that faces the road. From behind, a billboard is just the back of a sign.',
    ],
  },
  {
    v: '3.57', date: '26 Nov 2026', title: 'A reminder to refresh',
    items: [
      'When an update comes out while your tab is open, the game now tells you, with a Refresh button. Until now an open tab just kept running the old version.',
    ],
  },
  {
    v: '3.56', date: '26 Nov 2026', title: 'Pinto Speedway\'s old signs come down',
    items: [
      'The signs at Pinto Speedway still had Mount Panorama\'s corner names on them. They\'ve been taken down.',
    ],
  },
  {
    v: '3.55', date: '26 Nov 2026', title: 'Pinto Speedway',
    items: [
      'Mount Panorama Circuit is Pinto Speedway now. Same track, same lap times.',
    ],
  },
  {
    v: '3.54', date: '26 Nov 2026', title: 'The leaderboard opens where you are',
    items: [
      'In the lobby, the Leaderboard button opens on the board of the track that\'s picked. From the home screen it still opens on the Championship.',
    ],
  },
  {
    v: '3.53', date: '26 Nov 2026', title: 'Racing lines that last',
    items: [
      'The racing lines on the leaderboard, and the record ghost that follows them, used to vanish every time the game was updated. Now they\'re kept with the leaderboard, and your browser hands back the lines of your own laps if the game ever loses them.',
      'The lines from before this are gone, sorry: set a lap in Polytrack mode and yours is back for good.',
    ],
  },
  {
    v: '3.52', date: '26 Nov 2026', title: 'Rose Bay on the home screen',
    items: [
      'Rose Bay is the track behind the home screen when the game opens: the harbour, the yachts and the city across the water.',
    ],
  },
  {
    v: '3.51', date: '26 Nov 2026', title: 'The record ghost starts switched off',
    items: [
      'The record holder\'s ghost is off unless you switch it on: in Settings, or in the pause menu in Polytrack mode. If you had already switched it on yourself, it stays on.',
    ],
  },
  {
    v: '3.50', date: '26 Nov 2026', title: 'Quieter sponsors\' signs',
    items: [
      'By day the sponsors\' posters and banners take the light and shade of wherever they are, like the walls they hang on. They used to glow the same whichever way they faced, which made them jump out.',
      'Rose Bay\'s race barriers carry half as many banners.',
    ],
  },
  {
    v: '3.49', date: '26 Nov 2026', title: 'The record ghost stops flickering',
    items: [
      'In Polytrack mode your own best-lap ghost and the record holder\'s gold ghost set off together, and where their laps ran together the two see-through cars flickered through each other. Yours now gives way wherever they\'re in the same place.',
      'The tag over the record ghost is just the name.',
    ],
  },
  {
    v: '3.48', date: '26 Nov 2026', title: 'No way round the barriers\' ends',
    items: [
      'At Rose Bay, where a race barrier came to a corner\'s rail the two passed side by side with room for a car between them. Each barrier now runs in to meet the end of the rail, at all five places, so there\'s no gap to slip through.',
    ],
  },
  {
    v: '3.47', date: '26 Nov 2026', title: 'No more tyre stacks',
    items: [
      'The stacks of two tyres that stood in front of the barrier on the sharp corners have gone, on every track.',
    ],
  },
  {
    v: '3.46', date: '26 Nov 2026', title: 'No gap on the way to Rose Bay\'s tunnel',
    items: [
      'The race barrier at Rose Bay carries on round the inside of the corner at the end of the shops\' street, so it runs unbroken from the second hairpin all the way down to the tunnel.',
    ],
  },
  {
    v: '3.45', date: '26 Nov 2026', title: 'Rose Bay\'s tunnel ceiling',
    items: [
      'In Rose Bay\'s tunnel the ceiling sat at exactly the height of the hotel\'s floor above it, so the two flickered and a pale wedge of the hotel showed through near the way in. The ceiling hangs a little lower now and both are gone.',
    ],
  },
  {
    v: '3.44', date: '26 Nov 2026', title: 'The centre line, whole again',
    items: [
      'The white dashes down the middle of the road had bits missing on corners that climb or drop, like Rose Bay\'s second hairpin. They follow the road properly now, on every track.',
    ],
  },
  {
    v: '3.43', date: '26 Nov 2026', title: 'No more flicker in the distance',
    items: [
      'The city across the water at Rose Bay, the suburbs round the bay and Westfield\'s skyline flickered from far away. The windows of those towers and houses are part of their walls now, and towers that stood through one another have been moved apart.',
      'From the open seater\'s cockpit everything far off is steadier too: the game tells distant things apart four times better there than it did.',
    ],
  },
  {
    v: '3.42', date: '26 Nov 2026', title: 'Balloons with their baskets tied on',
    items: [
      'The hot-air balloons\' baskets hang from them by ropes now, with a burner in between, instead of floating a little way underneath.',
    ],
  },
  {
    v: '3.41', date: '26 Nov 2026', title: 'Race barriers at Rose Bay',
    items: [
      'Rose Bay has race barriers like Westfield\'s, in the bay\'s own sandstone: a block with a wire catch fence on top. They line the start straight, Heartbreak Hill, both sides of the straight along the top and of the shops\' street, and the run down to the tunnel.',
      'The crowd stands on stone steps behind them, where you can see them over the wall, and the pit wall has the fence along its top.',
      'The corners keep their rails and the harbour keeps its view. On the top straight there are two ways through the barrier, for Race to 9LAT2.',
    ],
  },
  {
    v: '3.40', date: '26 Nov 2026', title: 'The record ghost, easier to find',
    items: [
      'The record holder\'s ghost has its switch near the top of Settings now, and in Polytrack mode there\'s one in the pause menu too, which says whose ghost you\'re chasing.',
      'When the ghost joins you a message says whose lap it is, and it shows as a gold dot on the minimap.',
      'A track whose record is from before ghosts came in used to have no ghost at all. Now you chase the fastest lap that has one.',
    ],
  },
  {
    v: '3.39', date: '26 Nov 2026', title: 'Camera and Feedback, in Settings',
    items: [
      'Camera is in Settings, at the top: pick Cockpit or Chase and the game remembers it, for every car and every race. The camera key still swaps it while you drive.',
      'Feedback is in Settings too, instead of on the home screen and in the pause menu.',
    ],
  },
  {
    v: '3.38', date: '26 Nov 2026', title: 'Westfield\'s start straight, walled in',
    items: [
      'At Westfield the race barrier runs unbroken down both sides of the start straight now, through the grid and the line to the corner at the far end, with the crowd behind it all the way.',
    ],
  },
  {
    v: '3.37', date: '25 Nov 2026', title: 'A tidier leaderboard',
    items: [
      'The leaderboard opens on the Championship, and has lost its small print: the tabs, the table and your own place, and that\'s it.',
    ],
  },
  {
    v: '3.36', date: '25 Nov 2026', title: 'Rose Bay gets its suburbs',
    items: [
      'There\'s a town round Rose Bay now, where there were only bare hills: streets of houses and flats beyond the circuit, and hills behind them with houses up the sides and apartment towers along the top.',
      'A lighthouse stands on the head at the far end of the bay, there are houses along the north shore, and the city across the water has more towers.',
    ],
  },
  {
    v: '3.35', date: '25 Nov 2026', title: 'Rose Bay\'s tunnel floor',
    items: [
      'The floor on the left as you come out of Rose Bay\'s tunnel doesn\'t flicker any more.',
    ],
  },
  {
    v: '3.34', date: '25 Nov 2026', title: 'Ghosts on the leaderboard',
    items: [
      'In Polytrack mode the record holder\'s ghost drives round with you: a gold see-through car with their name and time over it. Settings turns it off.',
      'On the leaderboard, a lap with a line button shows how it was driven: the track from above with the lap drawn on it, red where it\'s slow and green where it\'s fast.',
      'Only laps set from now on in Polytrack mode have one, so the old records get theirs when someone beats them or sets them again. Thanks to the players who asked.',
    ],
  },
  {
    v: '3.33', date: '25 Nov 2026', title: 'Westfield, the race track',
    items: [
      'Westfield looks like a race track now: lengths of race barrier with catch fences, a grandstand each side of the start line, and crowds down the roof straight, along both sides of Oxford Street, round the hairpin and behind barriers inside the mall.',
      'The parked cars are proper cars, and they\'ve moved back from the road to make room for the crowd.',
    ],
  },
  {
    v: '3.32', date: '25 Nov 2026', title: 'A Maccas at Sydney CBD',
    items: [
      'There\'s a Maccas on the right just past the start line at Sydney CBD, golden arches up on a pole and all.',
      'Jago is on the drive-through window. Pull up and say hello.',
    ],
  },
  {
    v: '3.31', date: '25 Nov 2026', title: 'The Drift King\'s car',
    items: [
      'Whoever leads the Drift King championship now drives the Drift King\'s car: gold over black with a crimson line, a crown behind the driver and DRIFT KING on the rear wing.',
      'It goes with the name, whatever colour you picked, and passes on when someone else takes the lead.',
    ],
  },
  {
    v: '3.30', date: '25 Nov 2026', title: 'A longer run-up in Polytrack mode',
    items: [
      'Polytrack mode starts about 480 m before the line, up from 200 to 320: you come to your first lap through the last corners at full speed, like any other lap. Thanks to the players who asked.',
    ],
  },
  {
    v: '3.29', date: '25 Nov 2026', title: 'More to see at Westfield',
    items: [
      'The shops have proper fronts: windows with mannequins and goods on show, and doorways taped off for the race, with shoppers watching from inside.',
      'The car park roof is full: cars parked along both sides of the start straight, and a few people standing on theirs for a better view. There are two stair towers up there now, and a boom gate at the top of each ramp.',
      'You can see the cars parked in the lower decks from the ramps and from Oxford Street, and the mall has shop windows, awnings and names along the street.',
      'Traffic is held up behind the 333 while the race is on.',
    ],
  },
  {
    v: '3.28', date: '25 Nov 2026', title: 'Westfield takes Oxford Street',
    items: [
      'Westfield Mall Circuit has a new section, after the real place: down the ramp, left along Oxford Street between the car park and the mall, under the Westfield bridge, round a hairpin at the 333\'s bus stop, back under the bridge and in through the doors.',
      'A planted median runs between the two carriageways, with a wall each side to keep cars going opposite ways apart.',
      'The lap is longer for it (about 1.8 km), so Westfield\'s leaderboard starts again, as Noosa Heads\' and Sydney CBD\'s did. Its Drift King points start again with it.',
    ],
  },
  {
    v: '3.27', date: '25 Nov 2026', title: 'Banners on the walls',
    items: [
      'More sponsors\' banners than 3.26 had, and fewer than before it: about one every 20 m on the walls at Sydney CBD and along Rose Bay\'s harbour wall.',
      'Six along the pit wall on the older tracks, and a few on the wall round Westfield\'s roof, where you drive straight at it.',
      'Still none on a fence or a rail.',
    ],
  },
  {
    v: '3.26', date: '25 Nov 2026', title: 'Fewer ads, a proper Opera House',
    items: [
      'Far fewer sponsors\' banners, and only on solid walls: none on fences, rails or the railings of bridges.',
      'The billboards and banners don\'t flicker from far off any more.',
      'The first sponsor\'s board now reads 9 meter, in the same lettering.',
      'The Opera House has proper sails, and the city behind it has windows: across the water from Rose Bay, on the horizon at Westfield and at Sydney CBD.',
      'Rose Bay has a low sandstone wall along the harbour, where the guard rail was.',
      'The InterContinental\'s name sits on the front of the hotel, clear of the wall.',
    ],
  },
  {
    v: '3.25', date: '25 Nov 2026', title: 'The InterContinental',
    items: [
      'The hotel over Rose Bay\'s tunnel is the InterContinental, and says so.',
    ],
  },
  {
    v: '3.24', date: '25 Nov 2026', title: 'The Drift King',
    items: [
      'The Drift King championship: every track\'s top ten scores like F1 (25 for the record, 18 for second, down to 1 for tenth), and the points add up over all eight tracks.',
      'Whoever leads is the Drift King and wears the crown on the leaderboard, where the new Championship tab shows everyone\'s points.',
    ],
  },
  {
    v: '3.23', date: '25 Nov 2026', title: 'Sponsors in their own lettering',
    items: [
      'The first sponsor\'s board is drawn in its own lettering.',
      'Banners only go on barriers: none on the railings of bridges and ramps.',
    ],
  },
  {
    v: '3.22', date: '25 Nov 2026', title: 'Trackside sponsors',
    items: [
      'New trackside sponsors on every billboard and along the barriers: nine kilometre, pwd, Glory Dates, Tenth Floor Chambers and Frangos.',
      'The billboards are turned to face you as you drive up to them.',
      'You can\'t crash into a checkpoint any more: clip a gate post, or a post of the start arch, and you go straight through it.',
    ],
  },
  {
    v: '3.21', date: '25 Nov 2026', title: 'Open ground at Rose Bay and Westfield',
    items: [
      'Neither track has walls all the way round any more: like the older tracks, there are rails on the outside of corners and open ground everywhere else.',
      'Rose Bay keeps a guard rail along the harbour, and at Westfield you can drive all over the car park roof.',
    ],
  },
  {
    v: '3.20', date: '25 Nov 2026', title: 'Race barriers',
    items: [
      'Rose Bay and Westfield have proper race barriers: white, with a red band along the top.',
      'A lamp post that stood on the road at the top of Westfield\'s ramp is gone.',
    ],
  },
  {
    v: '3.19', date: '25 Nov 2026', title: 'Westfield Mall Circuit',
    items: [
      'A new track, Westfield Mall Circuit: start on the roof of the car park, down the ramp, across Oxford Street, in through the doors and flat out between the shops, round the food court and back up the other ramp, with the Harbour Bridge dead ahead. The 333 is waiting at its stop.',
      'The leaderboard has a tab for each of the eight tracks, in two rows.',
    ],
  },
  {
    v: '3.18', date: '25 Nov 2026', title: 'Rose Bay Harbour Circuit',
    items: [
      'A new track, Rose Bay Harbour Circuit: Sydney\'s own Monaco. Along the quay past the superyachts, up Heartbreak Hill, round two hairpins, down past the shops and through the tunnel under the hotel.',
      'On the way down the hill, look left: the city, the Opera House and the Harbour Bridge across the water. There\'s also a ferry calling at the wharf, seaplanes landing in the bay, Catalina on its stilts, Shark Island, and a few shops you might know.',
    ],
  },
  {
    v: '3.17', date: '25 Nov 2026', title: 'Thredbo\'s chairlift',
    items: [
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
