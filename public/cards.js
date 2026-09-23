// Card database for Cat Lady (AEG, Josh Wood). 102 game cards + 13 stray cats.
// `minPlayers` mirrors the "3+" / "4" marker printed in a card's corner:
// cards marked 3+ are removed for 2 players, cards marked 4 for 2 and 3 players.

export const FOOD_TYPES = ['chicken', 'tuna', 'milk'];
export const TOY_TYPES = ['mouse', 'yarn', 'feather', 'tower', 'post'];
export const TOY_NAMES = { mouse: 'Mouse Toy', yarn: 'Yarn Ball', feather: 'Feather Wand', tower: 'Cat Tower', post: 'Scratching Post' };
export const TOY_SCORES = [0, 1, 3, 5, 8, 12]; // by number of unique toys in a set
export const COLOR_NAMES = { B: 'black', O: 'orange', W: 'white' };

const cards = [];
let n = 0;
function add(card) { card.id = `${card.type}-${++n}`; cards.push(card); return card; }

function cat(name, colors, vp, need, opts = {}) {
  const fullNeed = { chicken: 0, tuna: 0, milk: 0, ...need };
  return add({ type: 'cat', name, colors: colors.split('+'), vp, need: fullNeed, stray: false,
    minPlayers: opts.minPlayers || 2, special: opts.special || null, text: opts.text || null });
}
function stray(name, colors, vp, need, special, text) {
  const fullNeed = need ? { chicken: 0, tuna: 0, milk: 0, ...need } : null;
  return add({ type: 'cat', name, colors: colors.split('+'), vp, need: fullNeed, stray: true, minPlayers: 2, special, text });
}

// ---- 22 cats ----
// black
cat('Shadow', 'B', 1, { tuna: 1 });
cat('Jazz', 'B', 1, { tuna: 1 });
cat('Lily', 'B', 2, { milk: 1 }, { minPlayers: 3 });
cat('Blackberry', 'B', 3, { chicken: 2 });
cat('Keaton', 'B', 4, { milk: 2 });
cat('Pablo Picatso', 'B', 6, { tuna: 3 });
// orange
cat('Chester', 'O', 1, { tuna: 1 }, { minPlayers: 3 });
cat('Bell', 'O', 1, { chicken: 1 });
cat('Bronte', 'O', 3, { tuna: 2 });
cat('Zeus', 'O', 3, { chicken: 2 });
cat('Pumpkin', 'O', 6, { chicken: 2, milk: 1 });
cat('Chairman Meow', 'O', 6, { chicken: 3 });
// white
cat('Cooper', 'W', 1, { chicken: 1 }, { minPlayers: 3 });
cat('Gershon', 'W', 1, { chicken: 1 });
cat('Snowflake', 'W', 2, { milk: 1 });
cat('Sparkle', 'W', 3, { tuna: 2 });
cat('Sir Cuddleface', 'W', 4, { milk: 2 });
cat('Sox', 'W', 6, { tuna: 2, milk: 1 });
// multi-coloured
cat('Alvin', 'B+O', null, { tuna: 1, milk: 1 }, { minPlayers: 3, special: 'perColor:O:1', text: 'Alvin is worth 1 point for each orange cat you feed.' });
cat('Dinah', 'O+W', null, { chicken: 1, milk: 1 }, { minPlayers: 3, special: 'perColor:W:1', text: 'Dinah is worth 1 point for each white cat you feed.' });
cat('Luna', 'B+W', null, { tuna: 1, chicken: 1 }, { minPlayers: 3, special: 'perColor:B:1', text: 'Luna is worth 1 point for each black cat you feed.' });
cat('Henriette Van Weelde', 'B+O+W', 5, { tuna: 1, chicken: 1, milk: 1 }, { minPlayers: 4, text: 'Henriette is all colors.' });

// ---- 13 stray cats ----
stray('Florence', 'O', null, { chicken: 1, milk: 1 }, 'perColor:O:2', 'Florence is worth 2 points for each orange cat you feed.');
stray('Antoinette', 'W', null, { tuna: 1, milk: 1 }, 'perColor:W:2', 'Antoinette is worth 2 points for each white cat you feed.');
stray('Eliot', 'B', null, { tuna: 1, chicken: 1 }, 'perColor:B:2', 'Eliot is worth 2 points for each black cat you feed.');
stray('LeVar Purrton', 'W', null, { tuna: 1, chicken: 1 }, 'colorSets', 'LeVar is worth 4 points for each set of black/orange/white cats you feed.');
stray('Zoroaster', 'B', null, { chicken: 2 }, 'perCostume', 'Zoroaster is worth 2 points for each costume you have.');
stray('Penny', 'O', null, { milk: 1 }, 'perToy', 'Penny is worth 1 point for each toy you have.');
stray('Macak', 'O', 2, { milk: 1 }, 'catnip', 'If you feed Macak, you may gain 1 catnip.');
stray('Hemingway', 'B', null, { milk: 1 }, 'mostFed', 'If you feed the most cats Hemingway is worth 7 VP, otherwise he is worth 3 VP.');
stray('Sweetheart', 'B+O+W', 5, { tuna: 1, chicken: 1 }, null, 'Sweetheart is all colors.');
stray('Moonbeam', 'W', 3, { tuna: 1, chicken: 1 }, 'wilds', 'You may use any 2 food as wilds.');
stray('Waffle', 'O', null, null, 'waffle', 'Feed Waffle 1, 2, 3 or 4 food of one type (chicken, tuna or milk). He is worth 3 VP for each food you feed him.');
stray('Cow', 'W', null, null, 'cow', 'You may feed Cow any number of food and she is worth 2 VP for each.');
stray('Truffle', 'B', null, null, 'truffle', 'Feed Truffle 1 chicken, tuna or milk. She is worth 2 VP for each other cat you feed that eats that food.');

// ---- 34 food cards ----
function food(kind, amount, count, markers = []) {
  for (let i = 0; i < count; i++) add({ type: 'food', name: kind === 'wild' ? 'Wild' : kind[0].toUpperCase() + kind.slice(1) + (amount === 2 ? ' x2' : ''), food: kind, amount, minPlayers: markers[i] || 2 });
}
food('chicken', 1, 8, [4, 3, 3]);
food('chicken', 2, 3, [4]);
food('tuna', 1, 8, [4, 3, 3]);
food('tuna', 2, 3, [3]);
food('milk', 1, 8, [4, 4, 3, 3]);
food('milk', 2, 1);
food('wild', 1, 3, [4]);

// ---- 15 toys (3 of each, one of each marked 4) ----
for (const t of TOY_TYPES) for (let i = 0; i < 3; i++) add({ type: 'toy', name: TOY_NAMES[t], toy: t, minPlayers: i === 0 ? 4 : 2 });

// ---- 9 costumes ----
for (const [name, mp] of [['Bunny', 2], ['Pirate', 2], ['Superhero', 2], ['Alien Suit', 2], ['Sailor Outfit', 2], ['Fancy Suit', 2], ['Crown', 2], ['Frog', 3], ['Duck Hat', 4]])
  add({ type: 'costume', name, minPlayers: mp });

// ---- 7 catnip, 5 spray bottles, 10 lost cats ----
[4, 4, 3, 3, 2, 2, 2].forEach(mp => add({ type: 'catnip', name: 'Catnip', minPlayers: mp }));
[4, 2, 2, 2, 2].forEach(mp => add({ type: 'spray', name: 'Spray Bottle', minPlayers: mp }));
[4, 4, 3, 3, 2, 2, 2, 2, 2, 2].forEach(mp => add({ type: 'lost', name: 'Lost Cat', minPlayers: mp }));

export const CARDS = Object.fromEntries(cards.map(c => [c.id, c]));
export const ALL_CARDS = cards;
export const STRAY_IDS = cards.filter(c => c.type === 'cat' && c.stray).map(c => c.id);
export const GAME_CARD_IDS = cards.filter(c => !(c.type === 'cat' && c.stray)).map(c => c.id);

export function deckForPlayers(count) {
  return GAME_CARD_IDS.filter(id => CARDS[id].minPlayers <= count);
}
export function card(id) { return CARDS[id]; }
