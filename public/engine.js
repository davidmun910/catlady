// Pure rules engine for Cat Lady. No I/O, no DOM. State is plain JSON.
import { CARDS, STRAY_IDS, deckForPlayers, FOOD_TYPES, TOY_TYPES, TOY_SCORES } from './cards.js';

export const LINES = [
  { kind: 'row', index: 0 }, { kind: 'row', index: 1 }, { kind: 'row', index: 2 },
  { kind: 'col', index: 0 }, { kind: 'col', index: 1 }, { kind: 'col', index: 2 },
];
export function lineSlots(line) {
  return line.kind === 'row' ? [0, 1, 2].map(c => line.index * 3 + c) : [0, 1, 2].map(r => r * 3 + line.index);
}
export function sameLine(a, b) { return !!a && !!b && a.kind === b.kind && a.index === b.index; }

// Deterministic PRNG (mulberry32) so a game can be replayed from its seed.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const clone = s => JSON.parse(JSON.stringify(s));
const emptyFood = () => ({ chicken: 0, tuna: 0, milk: 0, wild: 0 });
const total = f => f.chicken + f.tuna + f.milk + f.wild;

export class RuleError extends Error {}
function assert(cond, msg) { if (!cond) throw new RuleError(msg); }

export function newGame({ players, seed = Date.now() % 2147483647, startingPlayer = 0 }) {
  assert(players.length >= 2 && players.length <= 4, 'Cat Lady is for 2 to 4 players.');
  const rng = makeRng(seed);
  let deck = shuffle(deckForPlayers(players.length), rng);
  // Setup rule: after removing marked cards, remove 2 more at random without looking.
  const removed = deck.splice(0, 2);
  const grid = deck.splice(0, 9);
  const strayDeck = shuffle(STRAY_IDS, rng);
  const strays = strayDeck.splice(0, 3);
  const n = players.length;
  return {
    version: 1, seed, phase: 'placeToken', turnNumber: 0,
    players: players.map(p => ({ id: p.id, name: p.name, cats: [], hand: [], food: emptyFood(), vpTokens: 0, feedingDone: false, moonbeamUsed: 0 })),
    deck, removed, discard: [], grid, strays, strayDeck, vpTokensLeft: 6,
    token: null, current: startingPlayer, tokenPlacer: (startingPlayer - 1 + n) % n,
    turn: { taken: false, tookCards: [] }, endTriggered: false, results: null, log: [],
  };
}

function log(state, text) { state.log.push(text); if (state.log.length > 200) state.log.shift(); }
function name(state, i) { return state.players[i].name; }

export function availableLines(state) {
  return LINES.filter(l => !sameLine(l, state.token) && lineSlots(l).some(s => state.grid[s]));
}

export function applyAction(prev, playerIndex, action) {
  const state = clone(prev);
  const p = state.players[playerIndex];
  assert(p, 'Unknown player.');
  const handlers = { placeToken, take, spray, lostCats, endTurn, feed, unfeed, truffleType, moonbeam, autoFeed, feedingDone };
  const h = handlers[action.type];
  assert(h, `Unknown action ${action.type}`);
  h(state, playerIndex, action);
  return state;
}

function placeToken(state, pi, a) {
  assert(state.phase === 'placeToken', 'The cat token has already been placed.');
  assert(pi === state.tokenPlacer, `Only ${name(state, state.tokenPlacer)} may place the cat token.`);
  const line = LINES.find(l => l.kind === a.kind && l.index === a.index);
  assert(line, 'Choose a row or column.');
  state.token = line;
  state.phase = 'playing';
  state.turnNumber = 1;
  log(state, `${name(state, pi)} placed the cat token next to ${lineName(line)}. ${name(state, state.current)} goes first.`);
}

export function lineName(line) { return `${line.kind === 'row' ? 'row' : 'column'} ${line.index + 1}`; }

function requireTurn(state, pi) {
  assert(state.phase === 'playing', 'The game is not in the playing phase.');
  assert(pi === state.current, `It is ${name(state, state.current)}'s turn.`);
}

function take(state, pi, a) {
  requireTurn(state, pi);
  assert(!state.turn.taken, 'You already took cards this turn.');
  const line = LINES.find(l => l.kind === a.kind && l.index === a.index);
  assert(line, 'Choose a row or column.');
  assert(!sameLine(line, state.token), 'The cat token blocks that line.');
  const slots = lineSlots(line);
  const cards = slots.map(s => state.grid[s]).filter(Boolean);
  assert(cards.length > 0, 'That line is empty.');
  const p = state.players[pi];
  const gained = [];
  for (const s of slots) {
    const id = state.grid[s]; if (!id) continue;
    state.grid[s] = null;
    const c = CARDS[id];
    if (c.type === 'cat') { p.cats.push({ cardId: id, food: emptyFood(), truffleType: null }); gained.push(c.name); }
    else if (c.type === 'food') {
      p.food[c.food] += c.amount; state.discard.push(id);
      gained.push(c.amount === 2 ? `2 ${c.food}` : c.food);
    }
    else { p.hand.push(id); gained.push(c.name); }
  }
  state.token = line;
  state.turn.taken = true;
  state.turn.tookCards = cards;
  // Refill. The game ends when a slot needs refilling and the deck is empty.
  for (const s of slots) {
    if (state.grid[s]) continue;
    if (state.deck.length) state.grid[s] = state.deck.shift();
    else state.endTriggered = true;
  }
  log(state, `${name(state, pi)} took ${lineName(line)}: ${gained.join(', ')}.`);
  if (state.endTriggered) log(state, 'The deck is empty: this is the final turn.');
}

function spray(state, pi, a) {
  requireTurn(state, pi);
  const p = state.players[pi];
  const idx = p.hand.findIndex(id => CARDS[id].type === 'spray');
  assert(idx >= 0, 'You have no spray bottle.');
  const line = LINES.find(l => l.kind === a.kind && l.index === a.index);
  assert(line, 'Choose a row or column.');
  assert(!sameLine(line, state.token), 'The cat token is already there.');
  state.discard.push(p.hand.splice(idx, 1)[0]);
  state.token = line;
  log(state, `${name(state, pi)} used a spray bottle to move the cat token to ${lineName(line)}.`);
}

function lostCats(state, pi, a) {
  requireTurn(state, pi);
  const p = state.players[pi];
  const lost = p.hand.map((id, i) => [id, i]).filter(([id]) => CARDS[id].type === 'lost');
  assert(lost.length >= 2, 'You need 2 lost cat cards.');
  if (a.choice === 'vp') {
    assert(state.vpTokensLeft > 0, 'No VP tokens left.');
    state.vpTokensLeft--; p.vpTokens++;
    log(state, `${name(state, pi)} discarded 2 lost cats for a 2 VP token.`);
  } else if (a.choice === 'stray') {
    const si = state.strays.indexOf(a.cardId);
    assert(si >= 0, 'That stray cat is not available.');
    state.strays.splice(si, 1);
    p.cats.push({ cardId: a.cardId, food: emptyFood(), truffleType: null });
    log(state, `${name(state, pi)} discarded 2 lost cats and found ${CARDS[a.cardId].name}!`);
  } else assert(false, 'Choose a VP token or a stray cat.');
  // discard the two lost cat cards (highest indexes first so splices stay valid)
  const idxs = lost.slice(0, 2).map(([, i]) => i).sort((x, y) => y - x);
  for (const i of idxs) state.discard.push(p.hand.splice(i, 1)[0]);
}

function endTurn(state, pi) {
  requireTurn(state, pi);
  assert(state.turn.taken, 'Take a row or column first.');
  if (state.endTriggered || availableLines(state).length === 0) {
    state.phase = 'feeding';
    for (const p of state.players) applyAutoFeed(p);
    log(state, 'The game is over. Feed your cats!');
    return;
  }
  state.current = (state.current + 1) % state.players.length;
  state.turnNumber++;
  state.turn = { taken: false, tookCards: [] };
}

// ---------- Feeding ----------
export function catCapacity(cat) {
  const c = CARDS[cat.cardId];
  if (c.special === 'cow') return Infinity;
  if (c.special === 'waffle') return 4;
  if (c.special === 'truffle') return 1;
  return c.need.chicken + c.need.tuna + c.need.milk;
}
export function canAssign(cat, foodType) {
  const c = CARDS[cat.cardId];
  const f = cat.food;
  if (total(f) >= catCapacity(cat)) return false;
  if (c.special === 'cow' || c.special === 'truffle') return true;
  if (c.special === 'waffle') {
    if (foodType === 'wild') return true;
    return FOOD_TYPES.every(t => t === foodType || f[t] === 0);
  }
  if (foodType === 'wild') return true;
  return f[foodType] < c.need[foodType];
}
function requireFeeding(state, pi) { assert(state.phase === 'feeding', 'Feeding happens at the end of the game.'); assert(!state.players[pi].feedingDone, 'You already finished feeding. Undo first.'); }
function findCat(p, cardId) { const cat = p.cats.find(c => c.cardId === cardId); assert(cat, 'Not your cat.'); return cat; }

function feed(state, pi, a) {
  requireFeeding(state, pi);
  const p = state.players[pi]; const cat = findCat(p, a.cardId);
  assert(['chicken', 'tuna', 'milk', 'wild'].includes(a.food), 'Bad food type.');
  assert(p.food[a.food] > 0, `You have no ${a.food} left.`);
  assert(canAssign(cat, a.food), `${CARDS[cat.cardId].name} cannot take that food.`);
  p.food[a.food]--; cat.food[a.food]++;
}
function unfeed(state, pi, a) {
  requireFeeding(state, pi);
  const p = state.players[pi]; const cat = findCat(p, a.cardId);
  assert(cat.food[a.food] > 0, 'Nothing to take back.');
  cat.food[a.food]--; p.food[a.food]++;
}
function truffleType(state, pi, a) {
  requireFeeding(state, pi);
  const p = state.players[pi]; const cat = findCat(p, a.cardId);
  assert(CARDS[cat.cardId].special === 'truffle', 'Only Truffle needs a food type.');
  assert(FOOD_TYPES.includes(a.food), 'Bad food type.');
  cat.truffleType = a.food;
}
// Moonbeam: the player may treat any 2 of their food cubes as wild. We model this as converting cubes.
function moonbeam(state, pi, a) {
  requireFeeding(state, pi);
  const p = state.players[pi];
  assert(p.cats.some(c => CARDS[c.cardId].special === 'wilds'), 'You do not have Moonbeam.');
  if (a.undo) {
    assert(p.moonbeamUsed > 0 && p.food.wild > 0, 'Nothing to undo.');
    assert(FOOD_TYPES.includes(a.food), 'Bad food type.');
    p.food.wild--; p.food[a.food]++; p.moonbeamUsed--;
  } else {
    assert(p.moonbeamUsed < 2, 'Moonbeam only turns 2 food into wilds.');
    assert(FOOD_TYPES.includes(a.food) && p.food[a.food] > 0, `You have no spare ${a.food}.`);
    p.food[a.food]--; p.food.wild++; p.moonbeamUsed++;
  }
}
function autoFeed(state, pi) { requireFeeding(state, pi); applyAutoFeed(state.players[pi]); }
function feedingDone(state, pi, a) {
  assert(state.phase === 'feeding', 'Feeding happens at the end of the game.');
  const p = state.players[pi];
  p.feedingDone = !a.undo;
  if (state.players.every(x => x.feedingDone)) {
    state.results = computeScores(state);
    state.phase = 'ended';
    const r = state.results;
    log(state, r.winners.length === 1 ? `${name(state, r.winners[0])} wins with ${r.players[r.winners[0]].total} VP!` : 'The game ends in a tie!');
  }
}

// Greedy helper: return all cubes, feed cats in descending value order, fixed needs first with real food, wilds last.
export function applyAutoFeed(p) {
  for (const cat of p.cats) { for (const t of Object.keys(cat.food)) { p.food[t] += cat.food[t]; cat.food[t] = 0; } cat.truffleType = null; }
  const fixed = p.cats.filter(c => CARDS[c.cardId].need).sort((a, b) => estimateValue(b) - estimateValue(a));
  for (const cat of fixed) {
    const need = CARDS[cat.cardId].need;
    const short = FOOD_TYPES.reduce((s, t) => s + Math.max(0, need[t] - p.food[t]), 0);
    if (short > p.food.wild) continue; // cannot fully feed; leave hungry for now
    for (const t of FOOD_TYPES) { const use = Math.min(need[t], p.food[t]); p.food[t] -= use; cat.food[t] += use; const rest = need[t] - use; p.food.wild -= rest; cat.food.wild += rest; }
  }
  // Flexible strays: Waffle (3/food, max 4 of one type), Cow (2/food), Truffle (1 food).
  const waffle = p.cats.find(c => CARDS[c.cardId].special === 'waffle');
  if (waffle) {
    const best = FOOD_TYPES.map(t => [t, p.food[t]]).sort((a, b) => b[1] - a[1])[0];
    let n = Math.min(4, best[1]); p.food[best[0]] -= n; waffle.food[best[0]] += n;
    const w = Math.min(4 - n, p.food.wild); p.food.wild -= w; waffle.food.wild += w;
  }
  const truffle = p.cats.find(c => CARDS[c.cardId].special === 'truffle');
  if (truffle) {
    const t = FOOD_TYPES.filter(t => p.food[t] > 0).sort((a, b) => p.food[b] - p.food[a])[0];
    if (t) { p.food[t]--; truffle.food[t]++; truffle.truffleType = t; }
    else if (p.food.wild > 0) { p.food.wild--; truffle.food.wild++; truffle.truffleType = 'chicken'; }
  }
  const cow = p.cats.find(c => CARDS[c.cardId].special === 'cow');
  if (cow) for (const t of Object.keys(p.food)) { cow.food[t] += p.food[t]; p.food[t] = 0; }
}
function estimateValue(cat) { const c = CARDS[cat.cardId]; return (c.vp ?? 3) + (c.special ? 2 : 0); }

// ---------- Scoring ----------
export function catFedInfo(cat, player) {
  const c = CARDS[cat.cardId]; const f = cat.food; const tot = total(f);
  if (c.special === 'cow') return { fed: tot >= 1, eats: FOOD_TYPES.filter(t => f[t] > 0) };
  if (c.special === 'waffle') { const types = FOOD_TYPES.filter(t => f[t] > 0); return { fed: tot >= 1 && tot <= 4 && types.length <= 1, eats: types, count: tot }; }
  if (c.special === 'truffle') { const t = FOOD_TYPES.find(t => f[t] > 0) || cat.truffleType; return { fed: tot === 1 && !!t, eats: t ? [t] : [], truffleType: t }; }
  const need = c.need; const totalNeed = need.chicken + need.tuna + need.milk;
  const short = FOOD_TYPES.reduce((s, t) => s + Math.max(0, need[t] - f[t]), 0);
  const over = FOOD_TYPES.some(t => f[t] > need[t]);
  return { fed: !over && short <= f.wild && tot === totalNeed, eats: FOOD_TYPES.filter(t => need[t] > 0) };
}

function maxColorSets(fedCats) {
  // Max number of disjoint {black, orange, white} triples; each cat covers one of its colours per set.
  const cats = fedCats.map(cat => CARDS[cat.cardId].colors);
  const colors = ['B', 'O', 'W'];
  for (let k = Math.floor(cats.length / 3); k >= 1; k--) {
    // Bipartite matching: cats -> k slots per colour.
    const slots = []; for (const col of colors) for (let i = 0; i < k; i++) slots.push(col);
    const match = new Array(slots.length).fill(-1);
    const tryCat = (ci, seen) => {
      for (let s = 0; s < slots.length; s++) {
        if (seen[s] || !cats[ci].includes(slots[s])) continue;
        seen[s] = true;
        if (match[s] === -1 || tryCat(match[s], seen)) { match[s] = ci; return true; }
      }
      return false;
    };
    let matched = 0;
    for (let ci = 0; ci < cats.length; ci++) if (tryCat(ci, new Array(slots.length).fill(false))) matched++;
    if (matched === slots.length) return k;
  }
  return 0;
}

export function computeScores(state) {
  const per = state.players.map(p => {
    const cats = p.cats.map(cat => ({ cat, card: CARDS[cat.cardId], info: catFedInfo(cat, p) }));
    const fedCats = cats.filter(x => x.info.fed);
    return { p, cats, fedCats, fedCount: fedCats.length };
  });
  const maxFed = Math.max(...per.map(x => x.fedCount));
  const mostFedCount = per.filter(x => x.fedCount === maxFed).length;
  const costumeCounts = per.map(x => x.p.hand.filter(id => CARDS[id].type === 'costume').length);
  const maxCostumes = Math.max(...costumeCounts);
  const costumeLeaders = costumeCounts.filter(c => c === maxCostumes && c > 0).length;
  const leftovers = per.map(x => total(x.p.food));
  const maxLeft = Math.max(...leftovers);

  const results = per.map((x, i) => {
    const p = x.p; const lines = [];
    const colorFed = { B: 0, O: 0, W: 0 };
    for (const fc of x.fedCats) for (const col of fc.card.colors) colorFed[col]++;
    const toys = p.hand.filter(id => CARDS[id].type === 'toy').length;
    const costumes = costumeCounts[i];
    let catnipCount = p.hand.filter(id => CARDS[id].type === 'catnip').length;
    let catPoints = 0;
    const catDetails = x.cats.map(({ cat, card, info }) => {
      let vp;
      if (!info.fed) vp = -2;
      else if (card.special === 'perColor:O:2') vp = 2 * colorFed.O;
      else if (card.special === 'perColor:W:2') vp = 2 * colorFed.W;
      else if (card.special === 'perColor:B:2') vp = 2 * colorFed.B;
      else if (card.special === 'perColor:O:1') vp = colorFed.O;
      else if (card.special === 'perColor:W:1') vp = colorFed.W;
      else if (card.special === 'perColor:B:1') vp = colorFed.B;
      else if (card.special === 'colorSets') vp = 4 * maxColorSets(x.fedCats.map(f => f.cat));
      else if (card.special === 'perCostume') vp = 2 * costumes;
      else if (card.special === 'perToy') vp = toys;
      else if (card.special === 'mostFed') vp = (x.fedCount === maxFed && mostFedCount === 1) ? 7 : 3;
      else if (card.special === 'waffle') vp = 3 * info.count;
      else if (card.special === 'cow') vp = 2 * total(cat.food);
      else if (card.special === 'truffle') vp = 2 * x.fedCats.filter(o => o.cat !== cat && o.info.eats.includes(info.truffleType)).length;
      else vp = card.vp;
      if (card.special === 'catnip' && info.fed) catnipCount++;
      catPoints += vp;
      return { cardId: cat.cardId, name: card.name, fed: info.fed, vp, food: cat.food };
    });
    lines.push({ label: 'Cats', vp: catPoints });
    const foodPenalty = (maxLeft > 0 && leftovers[i] === maxLeft) ? -2 : 0;
    lines.push({ label: `Leftover food (${leftovers[i]})`, vp: foodPenalty });
    let costumeVp = 0;
    if (costumes === 0) costumeVp = -2; else if (costumes === maxCostumes) costumeVp = Math.floor(6 / costumeLeaders);
    lines.push({ label: `Costumes (${costumes})`, vp: costumeVp });
    let catnipVp = 0;
    if (catnipCount === 1) catnipVp = -2; else if (catnipCount >= 4) catnipVp = 2 * x.fedCount; else if (catnipCount >= 2) catnipVp = x.fedCount;
    lines.push({ label: `Catnip (${catnipCount})`, vp: catnipVp });
    const toyCounts = TOY_TYPES.map(t => p.hand.filter(id => CARDS[id].toy === t).length);
    let toyVp = 0; const sets = [];
    for (let k = 1; ; k++) { const size = toyCounts.filter(c => c >= k).length; if (!size) break; sets.push(size); toyVp += TOY_SCORES[size]; }
    lines.push({ label: `Toys (${sets.length ? 'sets of ' + sets.join(', ') : 'none'})`, vp: toyVp });
    lines.push({ label: `VP tokens (${p.vpTokens})`, vp: 2 * p.vpTokens });
    const totalVp = lines.reduce((s, l) => s + l.vp, 0);
    return { name: p.name, cats: catDetails, lines, total: totalVp, fedCount: x.fedCount, leftover: leftovers[i] };
  });
  const best = Math.max(...results.map(r => r.total));
  let winners = results.map((r, i) => [r, i]).filter(([r]) => r.total === best).map(([, i]) => i);
  if (winners.length > 1) { const bestFed = Math.max(...winners.map(i => results[i].fedCount)); winners = winners.filter(i => results[i].fedCount === bestFed); }
  return { players: results, winners };
}

// View of the state for one seat: other players' hands are hidden until the game ends.
export function redact(state, seat) {
  const s = clone(state);
  if (s.phase !== 'ended') for (let i = 0; i < s.players.length; i++) if (i !== seat) { s.players[i].handCount = s.players[i].hand.length; s.players[i].hand = null; }
  delete s.deck; s.deckCount = state.deck.length; delete s.removed; delete s.strayDeck; s.strayDeckCount = state.strayDeck.length;
  return s;
}
