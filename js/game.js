/* =========================================================================
   game.js — the rules of Barros's game, as pure logic (no DOM).

   The engine resolves one throw at a time and returns a list of *steps*: each
   step is one thing that happened (a throw, a move, arriving on a square, a
   payment, a bump…) with a snapshot of the game after it. The page (play.js)
   shows the steps one by one, so a player sent from square to square reads each
   square in turn, as Barros's players did with the book open beside the sheet.

   Sources for every rule (see about.html#about-rules for the full discussion):
     C = Naples 1588, "EL YVEGO SE juega en esta forma" (pdf 66–69) + Cartaro's labels
     M = Madrid 1587 (Madrigal), "Declaración del juego y orden de jugarle"
     G = Madrid 1587 (princeps), as quoted by Lucero (Criticón 2016; Romance Notes 2019)

   Where the sources are silent, the decision is ours and is marked DECISION.
   ========================================================================= */
(function (root) {
  'use strict';

  const LABOUR = [4, 12, 17, 23, 30, 34, 41, 48, 57];     // the oxen (all editions; C board)
  const SEND_BACK = { 36: 28, 39: 7, 43: 10, 55: 20 };    // C pdf 67–68; M fol. 47r–v
  const HOPE = 15, FAVOURITE = 26, WELL = 32, DEATH = 46, FORTUNE = 51, DICE53 = 53, GOAL = 63;

  const DEFAULTS = {
    edition: 'C',        // 'C' | 'M' | 'G'
    dice: 2,             // M: "dos dados"; G and C say "el dado" — DECISION: two by default, one optional
    backPay: 'all',      // 'all': every move back costs one stake (M's example); 'overshoot': only the rebound
    fortuneThrows: 1,    // DECISION: House of Fortune gives one extra throw (see about-rules)
    purse: 20,           // DECISION: no source gives a purse; balances may go negative
    stake: 1,            // M: each player first puts "un tanto" in the pot; every payment is counted in stakes
  };
  // The square of Poverty in each edition (G: 59, Lucero 2016, 2019; M and C: 60). Read by play.js too.
  const POVERTY = { C: 60, M: 60, G: 59 };

  class Game {
    constructor(players, options = {}) {
      this.opt = Object.assign({}, DEFAULTS, options);
      this.players = players.map((p, i) => ({
        id: i, name: p.name, token: p.token, color: p.color,
        pos: 0, purse: this.opt.purse, skip: 0, paid: 0, received: 0,
      }));
      this.pot = 0;
      this.turn = 0;            // index of the player to move
      this.round = 1;
      this.extra = 0;           // extra throws owed by Fortune
      this.over = false; this.winner = null;
      this.history = [];
      // Opening stakes (M fol. 43v: "habiendo puesto cada uno … un tanto")
      this.players.forEach(p => this.pay(p, 'pot', this.opt.stake, null));
    }

    get poverty() {                       // the site's table (FC.EDITION_RULES, common.js) when loaded; ours in Node
      const r = root.FC && root.FC.EDITION_RULES && root.FC.EDITION_RULES[this.opt.edition];
      return r && r.poverty ? r.poverty : POVERTY[this.opt.edition] || 60;
    }
    get stake() { return this.opt.stake; }
    get current() { return this.players[this.turn]; }

    /** What kind of square n is under the current edition. */
    kind(n) {
      if (n === GOAL) return 'goal';
      if (LABOUR.includes(n)) return 'labour';
      if (n === this.poverty) return 'poverty';
      if (n === HOPE) return 'hope';
      if (n === FAVOURITE) return 'favourite';
      if (n === WELL) return 'well';
      if (n === DEATH) return 'death';
      if (n === FORTUNE) return 'fortune';
      if (SEND_BACK[n]) return 'back';
      return 'plain';
    }

    snapshot() {
      return { pot: this.pot, players: this.players.map(p => ({ id: p.id, pos: p.pos, purse: p.purse, skip: p.skip })) };
    }

    /** Move stakes. to: a player, 'pot', or 'others' (one each to every other player). */
    pay(from, to, amount, steps, why) {
      if (to === 'others') {
        this.players.filter(q => q !== from).forEach(q => this.pay(from, q, amount, steps, why));
        return;
      }
      const src = from === 'pot' ? null : from;
      if (src) { src.purse -= amount; src.paid += amount; } else this.pot -= amount;
      if (to === 'pot') this.pot += amount; else { to.purse += amount; to.received += amount; }
      if (steps) steps.push(this.step('pay', { from: src ? src.id : 'pot', to: to === 'pot' ? 'pot' : to.id, amount, why }));
    }

    step(type, data = {}) {
      return Object.assign({ type, player: this.current.id }, data, { state: this.snapshot() });
    }

    occupant(n, except) { return n > 0 ? this.players.find(p => p !== except && p.pos === n) : null; }

    /** Roll the dice (values supplied for testing, or drawn at random). */
    roll(values) {
      const d = values || Array.from({ length: this.opt.dice }, () => rand(6));
      return { dice: d, total: d.reduce((a, b) => a + b, 0) };
    }

    /**
     * Play the current player's turn. Returns the list of steps.
     * If the player must miss a round (Well of Oblivion), the steps say so.
     */
    play(values) {
      if (this.over) return [];
      const p = this.current, steps = [];
      if (p.skip > 0 && !this.extra) {
        p.skip -= 1;
        steps.push(this.step('skip', { square: p.pos }));
        this.advance(steps);
        return this.record(steps);
      }
      const r = this.roll(values);
      steps.push(this.step('throw', { dice: r.dice, total: r.total, extra: this.extra > 0 }));
      if (this.extra > 0) this.extra -= 1;
      const start = p.pos;
      this.moveBy(p, start, r.total, steps, { total: r.total, prev: start, via: 'throw' });
      if (!this.over) {
        if (this.extra > 0) steps.push(this.step('again', { square: p.pos, left: this.extra }));
        else this.advance(steps);
      }
      return this.record(steps);
    }

    record(steps) { this.history.push(...steps); return steps; }

    advance(steps) {
      this.turn = (this.turn + 1) % this.players.length;
      if (this.turn === 0) this.round += 1;
      steps.push(this.step('next', { next: this.turn }));
    }

    /**
     * Count `by` squares forward from `from`. Past 63 the excess is counted back
     * ("buelue atras los que sobran, pagando vn tanto", C pdf 68–69; all editions).
     */
    moveBy(p, from, by, steps, ctx, depth = 0) {
      let to = from + by, bounce = 0;
      if (to > GOAL) { bounce = to - GOAL; to = GOAL - bounce; }
      p.pos = to;
      steps.push(this.step('move', { from, to, by, bounce, via: ctx.via }));
      if (bounce) {
        steps.push(this.step('rebound', { square: to, bounce, poor: to === this.poverty }));
        // one stake for going back, except onto Poverty: M fol. 48r, "salvo, el que da en la casa
        // de la pobreza, que no solo no paga, sino que todos le dan cada uno un tanto"
        if (to !== this.poverty) this.pay(p, 'pot', this.stake, steps, 'rebound');
      }
      this.arrive(p, to, steps, Object.assign({}, ctx, { bounced: !!bounce }), depth);
    }

    /** Apply the square the player has come to by throw, by Labor or by rebound. */
    arrive(p, n, steps, ctx, depth) {
      const k = this.kind(n);
      if (k === 'goal') return this.win(p, steps);
      steps.push(this.step('arrive', { square: n, kind: k, via: ctx.via }));

      switch (k) {
        case 'labour': {
          // "si da en los bueyes, passa otras tantas casas adelante, como puntos echo" (C pdf 66)
          // M: "esta regla se ha de guardar todas cuantas veces se diere en trabajo"
          // DECISION: Labor reached by counting back also moves forward ("adelante"), so it may pass
          // the palm again and pay a second stake (58 + 11 → 57 → 58).
          const ahead = n + ctx.total, next = ahead > GOAL ? 2 * GOAL - ahead : ahead;
          if (depth > 6 || next === n || (ctx.seen && ctx.seen.includes(n))) {   // DECISION: stop a loop (e.g. 57 + 12)
            steps.push(this.step('loop', { square: n }));
            return this.settle(p, n, steps, ctx);
          }
          const seen = (ctx.seen || []).concat(n);
          return this.moveBy(p, n, ctx.total, steps, Object.assign({}, ctx, { via: 'labour', seen }), depth + 1);
        }
        case 'hope': {
          // 15 → 26, "pagando vn tanto por cada vna" (C); M: "por cada una de las dos"
          this.pay(p, 'pot', this.stake, steps, 'hope');
          p.pos = FAVOURITE;
          steps.push(this.step('transfer', { from: HOPE, to: FAVOURITE }));
          steps.push(this.step('arrive', { square: FAVOURITE, kind: 'favourite', via: 'transfer' }));
          this.pay(p, 'pot', this.stake, steps, 'favourite');
          return this.settle(p, FAVOURITE, steps, ctx);
        }
        case 'favourite': {
          // DECISION: a direct landing on 26 (by a throw or by Labor) also pays one stake,
          // following the board's label "Paga" and Collar de Cáceres 2009, 94; the books name a
          // payment here only for the player sent on from the Pass of Hope.
          this.pay(p, 'pot', this.stake, steps, 'favourite');
          return this.settle(p, n, steps, ctx);
        }
        case 'well': {
          // pays one to each player and two to the pot "para sogas", misses a round (C pdf 67)
          this.pay(p, 'others', this.stake, steps, 'well');
          this.pay(p, 'pot', 2 * this.stake, steps, 'well-ropes');
          p.skip = 1;
          this.extra = 0;                                   // DECISION: Fortune's extra throws end in the Well
          steps.push(this.step('skipset', { square: n }));
          return this.settle(p, n, steps, ctx);
        }
        case 'back': {
          const dest = SEND_BACK[n];
          if (this.opt.backPay === 'all') this.pay(p, 'pot', this.stake, steps, 'back');
          p.pos = dest;
          steps.push(this.step('transfer', { from: n, to: dest }));
          steps.push(this.step('arrive', { square: dest, kind: 'destination', via: 'transfer' }));
          return this.settle(p, dest, steps, ctx);          // DECISION: a transfer's destination does not act again
        }
        case 'death': {
          // "buelue a començar el juego de nueuo" (C pdf 68)
          if (this.opt.backPay === 'all') this.pay(p, 'pot', this.stake, steps, 'back');
          p.pos = 0;
          steps.push(this.step('transfer', { from: n, to: 0 }));
          return;
        }
        case 'fortune': {
          // "juegue dos uezes" (C pdf 47): an extra throw at once
          this.extra += this.opt.fortuneThrows;
          this.settle(p, n, steps, ctx);
          return;
        }
        case 'poverty': {
          // to the Dice at 53 "y danle limosna" (C, G); M: "un tanto cada uno", and that player pays nothing to go back
          this.players.filter(q => q !== p).forEach(q => this.pay(q, p, this.stake, steps, 'alms'));
          p.pos = DICE53;
          steps.push(this.step('transfer', { from: n, to: DICE53 }));
          steps.push(this.step('arrive', { square: DICE53, kind: 'destination', via: 'transfer' }));
          return this.settle(p, DICE53, steps, ctx);
        }
        default:
          return this.settle(p, n, steps, ctx);
      }
    }

    /**
     * One player to a square: "si dos dan en vna casa, se queda el segundo, y el primero
     * toma la que el otro dexo" (C pdf 66). M: at the start the first is left "sin casa";
     * in M's example the displaced player pays one stake "porque volvió atrás".
     */
    settle(p, n, steps, ctx) {
      const q = this.occupant(n, p);
      if (!q) return;
      const to = ctx.prev;                         // the square the mover left before this throw
      const back = to < n;
      q.pos = to;
      // DECISION: a player displaced from the Well keeps the lost round (q.skip is left as it is):
      // Barros's Well is paid for with ropes, not left when another falls in, as in the goose game
      // (Collar de Cáceres 2009, 95). The square a displaced player is moved to does not act.
      steps.push(this.step('bump', { victim: q.id, from: n, to, forward: !back, skip: q.skip }));
      if (back && this.opt.backPay === 'all') this.pay(q, 'pot', this.stake, steps, 'bumped');
    }

    win(p, steps) {
      p.pos = GOAL;
      steps.push(this.step('arrive', { square: GOAL, kind: 'goal' }));
      const pot = this.pot;
      this.pay('pot', p, pot, steps, 'win');
      this.over = true; this.winner = p.id;
      steps.push(this.step('win', { amount: pot }));
    }
  }

  function rand(n) {
    if (root.crypto && root.crypto.getRandomValues) {
      const a = new Uint32Array(1), lim = Math.floor(0xFFFFFFFF / n) * n;
      do { root.crypto.getRandomValues(a); } while (a[0] >= lim);
      return (a[0] % n) + 1;
    }
    return 1 + Math.floor(Math.random() * n);
  }

  const api = { Game, DEFAULTS, LABOUR, SEND_BACK, POVERTY, GOAL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // for tests in Node
  root.FC = root.FC || {};
  root.FC.engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
