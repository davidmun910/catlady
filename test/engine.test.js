import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, applyAction, availableLines, computeScores, lineSlots, RuleError, applyAutoFeed } from '../public/engine.js';
import { CARDS, ALL_CARDS, deckForPlayers } from '../public/cards.js';

const two = () => newGame({ players: [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }], seed: 42, startingPlayer: 0 });
const byName = n => ALL_CARDS.find(c => c.name === n).id;
const cat = (n, food = {}) => ({ cardId: byName(n), food: { chicken: 0, tuna: 0, milk: 0, wild: 0, ...food }, truffleType: null });
function fakeState(players) {
  return { phase: 'feeding', players: players.map((p, i) => ({ id: String(i), name: p.name || 'P' + i, cats: p.cats || [], hand: p.hand || [], food: { chicken: 0, tuna: 0, milk: 0, wild: 0, ...(p.food || {}) }, vpTokens: p.vpTokens || 0, feedingDone: true })) };
}

test('deck composition by player count', () => {
  assert.equal(deckForPlayers(4).length, 102);
  assert.equal(deckForPlayers(3).length, 84);
  assert.equal(deckForPlayers(2).length, 66);
  const s = two();
  assert.equal(s.deck.length + s.grid.length + s.removed.length, 66);
  assert.equal(s.grid.length, 9); assert.equal(s.strays.length, 3); assert.equal(s.strayDeck.length, 10);
  assert.ok(s.grid.every(id => CARDS[id].minPlayers <= 2));
});

test('token placement then blocked line and refill', () => {
  let s = two();
  assert.equal(s.tokenPlacer, 1);
  assert.throws(() => applyAction(s, 0, { type: 'placeToken', kind: 'row', index: 0 }), RuleError);
  s = applyAction(s, 1, { type: 'placeToken', kind: 'row', index: 0 });
  assert.equal(s.phase, 'playing');
  assert.throws(() => applyAction(s, 0, { type: 'take', kind: 'row', index: 0 }), /blocks/);
  assert.throws(() => applyAction(s, 1, { type: 'take', kind: 'col', index: 0 }), /turn/);
  const before = s.deck.length;
  s = applyAction(s, 0, { type: 'take', kind: 'col', index: 2 });
  assert.equal(s.deck.length, before - 3);
  assert.ok(lineSlots({ kind: 'col', index: 2 }).every(i => s.grid[i]));
  assert.deepEqual(s.token, { kind: 'col', index: 2 });
  assert.throws(() => applyAction(s, 0, { type: 'take', kind: 'row', index: 1 }), /already/);
  s = applyAction(s, 0, { type: 'endTurn' });
  assert.equal(s.current, 1);
  assert.equal(availableLines(s).length, 5);
});

test('cards go to the right places', () => {
  let s = two();
  s = applyAction(s, 1, { type: 'placeToken', kind: 'row', index: 0 });
  s.grid = [null, null, null, byName('Bronte'), byName('Chicken x2'), byName('Bunny'), null, null, null];
  s = applyAction(s, 0, { type: 'take', kind: 'row', index: 1 });
  const p = s.players[0];
  assert.equal(p.cats.length, 1); assert.equal(p.food.chicken, 2); assert.deepEqual(p.hand.map(id => CARDS[id].name), ['Bunny']);
  assert.ok(s.discard.includes(byName('Chicken x2')));
});

test('spray bottle and lost cats', () => {
  let s = two();
  s = applyAction(s, 1, { type: 'placeToken', kind: 'row', index: 0 });
  s.players[0].hand = ALL_CARDS.filter(c => c.type === 'spray').slice(0, 1).map(c => c.id).concat(ALL_CARDS.filter(c => c.type === 'lost').slice(0, 4).map(c => c.id));
  s = applyAction(s, 0, { type: 'spray', kind: 'col', index: 1 });
  assert.deepEqual(s.token, { kind: 'col', index: 1 });
  s = applyAction(s, 0, { type: 'take', kind: 'row', index: 0 }); // row 0 is now free
  const stray = s.strays[0];
  s = applyAction(s, 0, { type: 'lostCats', choice: 'stray', cardId: stray });
  assert.equal(s.strays.length, 2); assert.ok(s.players[0].cats.some(c => c.cardId === stray));
  s = applyAction(s, 0, { type: 'lostCats', choice: 'vp' });
  assert.equal(s.players[0].vpTokens, 1); assert.equal(s.vpTokensLeft, 5);
  assert.throws(() => applyAction(s, 0, { type: 'lostCats', choice: 'vp' }), /2 lost cat/);
});

test('game ends when the deck cannot refill, then feeding and scoring', () => {
  let s = two();
  s = applyAction(s, 1, { type: 'placeToken', kind: 'row', index: 0 });
  let turns = 0;
  while (s.phase === 'playing') {
    const line = availableLines(s)[0];
    s = applyAction(s, s.current, { type: 'take', ...line });
    s = applyAction(s, s.current, { type: 'endTurn' });
    turns++;
  }
  assert.equal(s.phase, 'feeding');
  assert.ok(turns >= 18, 'turns ' + turns);
  s = applyAction(s, 0, { type: 'feedingDone' });
  assert.equal(s.phase, 'feeding');
  s = applyAction(s, 1, { type: 'feedingDone' });
  assert.equal(s.phase, 'ended');
  assert.ok(s.results.players.length === 2);
  assert.ok(typeof s.results.players[0].total === 'number');
});

test('scoring: basic cats, unfed penalty, food penalty', () => {
  const st = fakeState([
    { cats: [cat('Bronte', { tuna: 2 }), cat('Shadow')], food: { chicken: 1 } },
    { cats: [cat('Sox', { tuna: 1, milk: 1, wild: 1 })], food: {} },
  ]);
  const r = computeScores(st);
  assert.equal(r.players[0].cats[0].vp, 3); assert.equal(r.players[0].cats[1].vp, -2);
  assert.equal(r.players[0].lines[1].vp, -2); // most leftover food
  assert.equal(r.players[1].cats[0].vp, 6); assert.equal(r.players[1].lines[1].vp, 0);
  // both have costumes 0 -> -2 each
  assert.equal(r.players[0].lines[2].vp, -2);
  assert.deepEqual(r.winners, [1]);
});

test('scoring: toys, costumes, catnip, tokens', () => {
  const toy = t => ALL_CARDS.filter(c => c.toy === t).map(c => c.id);
  const st = fakeState([
    { cats: [cat('Snowflake', { milk: 1 }), cat('Bell', { chicken: 1 })], hand: [...toy('feather').slice(0, 1), ...toy('tower').slice(0, 2), ...toy('mouse').slice(0, 3), byName('Bunny'), ...ALL_CARDS.filter(c => c.type === 'catnip').slice(0, 2).map(c => c.id)], vpTokens: 1 },
    { cats: [], hand: [byName('Pirate')] },
  ]);
  const r = computeScores(st);
  const p0 = r.players[0];
  assert.equal(p0.lines.find(l => l.label.startsWith('Toys')).vp, 5 + 3 + 1); // rulebook example
  assert.equal(p0.lines.find(l => l.label.startsWith('Costumes')).vp, 3); // tie for most: 6 split
  assert.equal(r.players[1].lines.find(l => l.label.startsWith('Costumes')).vp, 3);
  assert.equal(p0.lines.find(l => l.label.startsWith('Catnip')).vp, 2); // 2 catnip x 2 fed cats
  assert.equal(p0.lines.find(l => l.label.startsWith('VP tokens')).vp, 2);
  assert.equal(p0.lines[1].vp, 0); // nobody has leftover food -> no penalty
});

test('catnip: one is a penalty, four or more doubles; Macak counts', () => {
  const nip = ALL_CARDS.filter(c => c.type === 'catnip').map(c => c.id);
  let r = computeScores(fakeState([{ cats: [cat('Bell', { chicken: 1 })], hand: nip.slice(0, 1) }, { cats: [] }]));
  assert.equal(r.players[0].lines[3].vp, -2);
  r = computeScores(fakeState([{ cats: [cat('Bell', { chicken: 1 }), cat('Macak', { milk: 1 })], hand: nip.slice(0, 3) }, { cats: [] }]));
  assert.equal(r.players[0].lines[3].vp, 4); // 3 catnip + Macak = 4 -> 2 VP x 2 fed cats
});

test('stray abilities', () => {
  const st = fakeState([{
    cats: [cat('Florence', { chicken: 1, milk: 1 }), cat('Bronte', { tuna: 2 }), cat('Alvin', { tuna: 1, milk: 1 }),
      cat('LeVar Purrton', { tuna: 1, chicken: 1 }), cat('Sir Cuddleface', { milk: 2 }), cat('Hemingway', { milk: 1 }),
      cat('Zoroaster', { chicken: 2 }), cat('Penny', { milk: 1 }), cat('Waffle', { tuna: 3 }), cat('Cow', { chicken: 2, wild: 1 }), cat('Truffle', { tuna: 1 })],
    hand: [byName('Bunny'), byName('Pirate'), ...ALL_CARDS.filter(c => c.toy === 'yarn').map(c => c.id)],
  }, { cats: [cat('Shadow', { tuna: 1 })] }]);
  const r = computeScores(st);
  const v = n => r.players[0].cats.find(c => c.name === n).vp;
  // orange fed: Florence, Bronte, Alvin(B+O), Penny, Waffle = 5
  assert.equal(v('Florence'), 10);
  assert.equal(v('Alvin'), 5);
  // sets: blacks {Alvin, Hemingway, Zoroaster, Truffle}, oranges {Florence, Bronte, Alvin, Penny, Waffle}, whites {LeVar, Sir Cuddleface, Cow} -> 3 sets
  assert.equal(v('LeVar Purrton'), 12);
  assert.equal(v('Hemingway'), 7);
  assert.equal(v('Zoroaster'), 4);
  assert.equal(v('Penny'), 3);
  assert.equal(v('Waffle'), 9);
  assert.equal(v('Cow'), 6);
  // Truffle fed tuna: other fed cats that eat tuna: Bronte, Alvin, LeVar, Waffle(tuna) = 4 -> 8
  assert.equal(v('Truffle'), 8);
});

test('Hemingway is 3 on a tie; Waffle mixed food is unfed', () => {
  const r = computeScores(fakeState([{ cats: [cat('Hemingway', { milk: 1 })] }, { cats: [cat('Shadow', { tuna: 1 }), cat('Waffle', { tuna: 1, milk: 1 })] }]));
  assert.equal(r.players[0].cats[0].vp, 3);
  assert.equal(r.players[1].cats[1].vp, -2);
});

test('feeding actions validate capacity and Moonbeam wilds', () => {
  let s = two();
  s.phase = 'feeding';
  s.players[0].cats = [cat('Bronte'), cat('Moonbeam')];
  s.players[0].food = { chicken: 3, tuna: 1, milk: 0, wild: 0 };
  s = applyAction(s, 0, { type: 'feed', cardId: byName('Bronte'), food: 'tuna' });
  assert.throws(() => applyAction(s, 0, { type: 'feed', cardId: byName('Bronte'), food: 'chicken' }), /cannot take/);
  s = applyAction(s, 0, { type: 'moonbeam', food: 'chicken' });
  s = applyAction(s, 0, { type: 'moonbeam', food: 'chicken' });
  assert.throws(() => applyAction(s, 0, { type: 'moonbeam', food: 'chicken' }), /only turns 2/);
  assert.equal(s.players[0].food.wild, 2);
  s = applyAction(s, 0, { type: 'feed', cardId: byName('Bronte'), food: 'wild' });
  s = applyAction(s, 0, { type: 'feed', cardId: byName('Moonbeam'), food: 'chicken' });
  s = applyAction(s, 0, { type: 'feed', cardId: byName('Moonbeam'), food: 'wild' });
  s = applyAction(s, 0, { type: 'feedingDone' }); s = applyAction(s, 1, { type: 'feedingDone' });
  assert.equal(s.results.players[0].cats[0].vp, 3); assert.equal(s.results.players[0].cats[1].vp, 3);
});

test('auto feed feeds what it can', () => {
  const p = { cats: [cat('Sox'), cat('Shadow'), cat('Cow')], food: { chicken: 0, tuna: 3, milk: 1, wild: 0 }, hand: [] };
  applyAutoFeed(p);
  assert.equal(p.cats[0].food.tuna, 2); assert.equal(p.cats[0].food.milk, 1); assert.equal(p.cats[1].food.tuna, 1);
  assert.equal(p.food.tuna, 0);
});
