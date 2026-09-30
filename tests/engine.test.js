// Run with:  node tests/engine.test.js
// 1) replays Barros's worked example (Madrid 1587, Madrigal, fols. 44v–46r);
// 2) plays 5,000 random games in each edition to check that every game ends.
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
{ // Well: a newcomer displaces the first petitioner, who is out of the Well and plays next round
  const g = new Game(two, { edition: 'C' }); g.players[0].pos = 29; g.players[1].pos = 27;
  g.play([1, 2]); assert.strictEqual(g.players[0].skip, 1);
  g.play([2, 3]); assert.deepStrictEqual(g.players.map(p => p.pos), [27, 32]);
  assert.strictEqual(g.players[0].skip, 0);
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
console.log('particular cases: ok');

for (const edition of ['C', 'M', 'G']) {
  let turns = 0, maxTurns = 0;
  for (let i = 0; i < 5000; i++) {
    const n = 2 + (i % 5);
    const game = new Game(Array.from({ length: n }, (_, k) => ({ name: 'P' + k, token: 'ring' })), { edition, dice: i % 7 === 0 ? 1 : 2 });
    let t = 0;
    while (!game.over) { game.play(); t++; if (t > 20000) throw new Error('game did not end'); }
    // money is conserved
    const sum = game.players.reduce((a, p) => a + p.purse, 0) + game.pot;
    assert.strictEqual(sum, n * 20);
    // no two players on one square
    const occ = game.players.filter(p => p.pos > 0).map(p => p.pos);
    assert.strictEqual(new Set(occ).size, occ.length);
    turns += t; maxTurns = Math.max(maxTurns, t);
  }
  console.log(`${edition}: 5000 games ok, mean ${Math.round(turns / 5000)} throws, max ${maxTurns}`);
}
