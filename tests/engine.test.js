// Run with:  node tests/engine.test.js
// 1) replays Barros's worked example (Madrid 1587, Madrigal, fols. 44v–46r);
// 2) checks the particular cases and the edition's DECISIONS (game.js; about.html#about-rules);
// 3) plays 24,000 random games over every edition and rule option, checking after every throw
//    that money is conserved, that no two players share a square, and that every game ends.
const assert = require('assert');
const { Game } = require('../js/game.js');
const P = [{ name: 'Pedro', token: 'ring' }, { name: 'Diego', token: 'real' }, { name: 'Rodrigo', token: 'doblon' }];

const g = new Game(P, { edition: 'M' });
const pos = () => g.players.map(p => p.pos);
g.play([3, 3]);            // Pedro throws 6 → square 6
g.play([2, 2]);            // Diego throws 4 → Labour at 4 → square 8
g.play([2, 3]);            // Rodrigo throws 5 → square 5
assert.deepStrictEqual(pos(), [6, 8, 5]);
const pedroBefore = g.players[0].purse;
g.play([4, 5]);            // Pedro throws 9 → 15, Pass of Hope → 26, paying one stake at each
assert.deepStrictEqual(pos(), [26, 8, 5]);
assert.strictEqual(pedroBefore - g.players[0].purse, 2);
g.play([2, 3]);            // Diego throws 5 → 13
const rodBefore = g.players[2].purse, pedBefore2 = g.players[0].purse;
g.play([4, 6]);            // Rodrigo throws 10 → 15 → 26: takes Pedro's square; Pedro back to 5, pays one
assert.deepStrictEqual(pos(), [5, 13, 26]);
assert.strictEqual(rodBefore - g.players[2].purse, 2);
assert.strictEqual(pedBefore2 - g.players[0].purse, 1);
console.log('worked example: ok');

// Particular cases (DECISIONS documented on about.html#about-rules)
const two = P.slice(0, 2);
{ // Well: a newcomer displaces the first petitioner, who takes the newcomer's square and
  // still loses the round (DECISION, editor's ruling 6b)
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 29; g.players[1].pos = 27;
  g.play([1, 2]); assert.strictEqual(g.players[0].skip, 1);
  g.play([2, 3]); assert.deepStrictEqual(g.players.map(p => p.pos), [27, 32]);
  assert.strictEqual(g.players[0].skip, 1);
  const steps = g.play([6, 6]);                      // the displaced player's turn: no throw
  assert.strictEqual(steps[0].type, 'skip'); assert.strictEqual(g.players[0].pos, 27);
  assert.strictEqual(g.players[0].skip, 0);
}
{ // ACC-E-01: counting back onto Poverty costs nothing (M fol. 48r, "que no solo no paga"):
  // 61 + 5 → past the palm by 3 → 60, Poverty → 53, with one stake of alms from the other player
  const g = new Game(two, { edition: 'M' }); g.players[0].pos = 61; const b = g.players[0].purse;
  g.play([2, 3]); assert.strictEqual(g.players[0].pos, 53); assert.strictEqual(g.players[0].purse - b, 1);
  const h = new Game(two, { edition: 'G' }); h.players[0].pos = 61; const c = h.players[0].purse;
  h.play([2, 4]); assert.strictEqual(h.players[0].pos, 53); assert.strictEqual(h.players[0].purse - c, 1);
  const k = new Game(two, { edition: 'C' }); k.players[0].pos = 61; const d = k.players[0].purse;
  k.play([1, 3]); assert.strictEqual(k.players[0].pos, 61); assert.strictEqual(d - k.players[0].purse, 1);   // 61 + 4 → back to 61: one stake
}
{ // Pass of Hope: 15 → 26 costs the Hope rule's two stakes in all, not three
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 10; g.players[1].pos = 26;
  const a = g.players[0].purse, b = g.players[1].purse;
  g.play([2, 3]);                                    // Pedro 10 + 5 → 15 → 26; Diego displaced back to 10
  assert.deepStrictEqual(g.players.map(p => p.pos), [26, 10]);
  assert.strictEqual(a - g.players[0].purse, 2); assert.strictEqual(b - g.players[1].purse, 1);   // Diego: going back only
}
{ // A player displaced onto 26 pays nothing there: only the stake for going back (none under "overshoot only")
  for (const [backPay, cost] of [['all', 1], ['overshoot', 0]]) {
    const g = new Game(two, { edition: 'C', backPay }); g.players[0].pos = 26; g.players[1].pos = 29;
    const b = g.players[1].purse; g.play([1, 2]);   // Pedro 26 + 3 → 29; Diego takes 26
    assert.deepStrictEqual(g.players.map(p => p.pos), [29, 26]); assert.strictEqual(b - g.players[1].purse, cost);
  }
}
{ // Favourite: a direct landing on 26 pays one stake (DECISION, the board's "Paga")
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 20; const b = g.players[0].purse;
  g.play([3, 3]); assert.strictEqual(g.players[0].pos, 26); assert.strictEqual(b - g.players[0].purse, 1);
}
{ // … and so does a Labour move that ends on 26: 8 + 9 → 17 (oxen) → 26, one stake
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 8; const b = g.players[0].purse;
  g.play([4, 5]); assert.strictEqual(g.players[0].pos, 26); assert.strictEqual(b - g.players[0].purse, 1);
}
{ // G: Poverty on 59, 60 plain; C: Poverty on 60
  const g = new Game(two, { edition: 'G' }); g.players[0].pos = 50; g.play([4, 5]); assert.strictEqual(g.players[0].pos, 53);
  const h = new Game(two, { edition: 'G' }); h.players[0].pos = 50; h.play([4, 6]); assert.strictEqual(h.players[0].pos, 60);
  const c = new Game(two, { edition: 'C' }); c.players[0].pos = 50; c.play([4, 6]); assert.strictEqual(c.players[0].pos, 53);
}
{ // Death under "overshoot only": back to the gate, no stake
  const g = new Game(two, { edition: 'C', backPay: 'overshoot' }); g.players[0].pos = 40;
  const before = g.players[0].purse; g.play([3, 3]);
  assert.strictEqual(g.players[0].pos, 0); assert.strictEqual(g.players[0].purse, before);
}
{ // Labour chain ending on a send-back square: 34 + 7 → 41 → 48 → 55 → 20
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 34; g.play([3, 4]); assert.strictEqual(g.players[0].pos, 20);
}
{ // 57 + 12: counts back to 57 and stops on the oxen, paying one stake only
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 57; const d = g.players[0].purse;
  g.play([6, 6]); assert.strictEqual(g.players[0].pos, 57); assert.strictEqual(d - g.players[0].purse, 1);
}
{ // Fortune: an extra throw at once; 51 + 6 → Labour 57 → 63 wins
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 45; g.play([3, 3]);
  assert.strictEqual(g.players[0].pos, 51); assert.strictEqual(g.turn, 0);
  g.play([2, 4]); assert.ok(g.over); assert.strictEqual(g.winner, 0);
}
{ // Counting back onto the oxen at 57 moves forward again: 58 + 11 → 57 → 58, two stakes (CODE-07)
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 58; const d = g.players[0].purse;
  g.play([5, 6]); assert.strictEqual(g.players[0].pos, 58); assert.strictEqual(d - g.players[0].purse, 2);
}
{ // Fortune with two extra throws; an extra throw that ends in the Well loses the throw still owed (DECISION)
  const g = new Game(two, { edition: 'C', fortuneThrows: 2 }); g.players[0].pos = 45; g.play([3, 3]);
  assert.strictEqual(g.extra, 2); assert.strictEqual(g.turn, 0);
  g.play([2, 2]); assert.strictEqual(g.players[0].pos, 20); assert.strictEqual(g.extra, 1);   // 55, "I Thought…" → 20
  g.play([6, 6]); assert.strictEqual(g.players[0].pos, 32); assert.strictEqual(g.extra, 0);
  assert.strictEqual(g.players[0].skip, 1); assert.strictEqual(g.turn, 1);
}
{ // A rival displaced at the start goes back before the gate and pays one stake for going back
  const g = new Game(two, { edition: 'C' }); g.play([2, 3]); const b = g.players[0].purse;
  g.play([1, 4]); assert.deepStrictEqual(g.players.map(p => p.pos), [0, 5]); assert.strictEqual(b - g.players[0].purse, 1);
}
console.log('particular cases: ok');

// Random games over the full grid of editions and options; invariants checked after every throw.
for (const edition of ['C', 'M', 'G']) for (const backPay of ['all', 'overshoot']) for (const fortuneThrows of [1, 2]) {
  let turns = 0, maxTurns = 0;
  for (let i = 0; i < 2000; i++) {
    const n = 2 + (i % 5);
    const game = new Game(Array.from({ length: n }, (_, k) => ({ name: 'P' + k, token: 'ring' })),
      { edition, backPay, fortuneThrows, dice: i % 7 === 0 ? 1 : 2 });
    let t = 0;
    while (!game.over) {
      game.play(); if (++t > 20000) throw new Error('game did not end');
      // money is conserved
      assert.strictEqual(game.players.reduce((a, p) => a + p.purse, 0) + game.pot, n * 20);
      // no two players on one square
      const occ = game.players.filter(p => p.pos > 0).map(p => p.pos);
      assert.strictEqual(new Set(occ).size, occ.length);
      // at most one round to miss; extra throws only for the player to move
      assert.ok(game.players.every(p => p.skip === 0 || p.skip === 1));
      assert.ok(game.extra >= 0 && game.extra <= fortuneThrows);
    }
    assert.strictEqual(game.players[game.winner].pos, 63);
    turns += t; maxTurns = Math.max(maxTurns, t);
  }
  console.log(`${edition} backPay=${backPay} fortune=${fortuneThrows}: 2000 games ok, mean ${Math.round(turns / 2000)} throws, max ${maxTurns}`);
}
