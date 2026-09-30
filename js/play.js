/* =========================================================================
   play.js — the Play page: setup, the board or the unrolled path, and the
   turn-by-turn reading of every house a player lands on.

   Flow: setup → new FC.engine.Game → on "Throw", game.play() returns steps →
   the steps are shown one by one; every adorned house reached (by throw, by
   Labour, or by being sent there) opens a card that must be clicked through.
   ========================================================================= */
(function () {
  const { $, $$, esc, html, plural } = FC.util;
  const E = FC.engine;
  const COLORS = ['#8e2c1c', '#2f5d62', '#9b7426', '#4a3d7a', '#3f6b2f', '#6b4a2f'];
  const WHY = {
    rebound: 'for counting back from the Palm', hope: 'the toll at the Pass of Hope', favourite: 'on reaching the Favourite',
    well: 'one to each of the other players', 'well-ropes': 'two to the pot “para sogas”, for ropes',
    back: 'for going back', bumped: 'for going back', alms: 'as alms', win: 'the whole pot',
  };
  let game = null, setup = null, viewer = null, queue = [], busy = false, view = 'board', pending = [];
  const ed = () => setup.edition;
  const SAVE_VERSION = 1;
  /** Forget any turn in progress (a card left open, steps not yet shown). */
  function resetTurn() { busy = false; queue = []; pending = []; }
  const pl = id => game.players[id];

  /* ------------------------------------------------------------ setup */
  function renderSetup() {
    let saved = FC.prefs.get('game', null);
    if (saved && saved.v !== SAVE_VERSION) saved = null;
    const players = FC.prefs.get('players', [{ name: 'Pedro', token: 'ring' }, { name: 'Diego', token: 'real' }, { name: 'Rodrigo', token: 'doblon' }]);
    const opts = FC.prefs.get('options', {});
    const edition = FC.prefs.get('edition', 'C');
    $('#app').innerHTML = `
    <section class="setup">
      <p class="kicker sc" style="color:var(--rubric);letter-spacing:.08em;margin:0">A game for two or more, on one screen</p>
      <h1 style="margin-top:.2em">Enter through the Gate of Opinion</h1>
      <p class="measure">Each player is a suitor at the court of Philip II. You move by the dice from the Gate of Opinion toward the Palm of Victory at the centre, through sixty-three houses that stand, says Barros in the Madrid edition of 1587, for <i lang="es">“los años de la vida que se gastan en una pretensión y los que también la gastan a ella”</i> — the years of life spent in a suit, and that the suit spends in turn. Every house you land on is read aloud to you, as the book was read beside the sheet.</p>
      ${saved && !saved.over ? `<p class="notice">A game is in progress (round ${saved.round}). <button class="btn small primary" id="resume">Resume it</button> <button class="btn small" id="discard">Start afresh</button></p>` : ''}
      <fieldset><legend>The players</legend>
        <p class="small muted">Barros's worked example has three players — Pedro with a ring, Diego with a <i lang="es">real de a dos</i>, Rodrigo with a <i lang="es">doblón</i> — and asks only that every marker be different. The one listed first plays first (<i lang="es">“jugó Pedro de mano”</i>).</p>
        <div class="player-rows" id="rows"></div>
        <p style="margin:.6rem 0 0"><button class="btn small" id="add">+ Add a player</button></p>
      </fieldset>
      <fieldset><legend>Which edition?</legend>
        <p class="small muted">Three editions appeared within a year. You always play on the only board that survives, Cartaro's of 1588; the choice changes the rules, the verses and the texts where the editions differ. <a href="about.html#about-editions">About the editions</a>.</p>
        <div class="version-cards">${['C', 'M', 'G'].map(k => `
          <label><input type="radio" name="ed" value="${k}" ${edition === k ? 'checked' : ''}> <span class="vt">${FC.EDITIONS[k].short}</span>
          <div class="vd">${{ C: 'The book printed with the surviving board: Italian and Spanish verses, Italian rule labels on the sheet.', M: 'The expanded Madrid edition, with Barros’s full rules and worked example. Its own board is lost.', G: 'The first edition: Poverty stands on house 59, and five of the eight other Labour verses differ. Its board is lost.' }[k]}</div></label>`).join('')}
        </div>
      </fieldset>
      <details class="sect"><summary>Rules where the sources are silent</summary>
        <p class="small">Barros leaves some things unsaid. Our choices, and the alternatives, are explained on <a href="about.html#about-rules">How the game is played</a>.</p>
        <div class="opt-row"><span>Dice</span><select id="o-dice"><option value="2">two dice (Madrid 1587, Madrigal)</option><option value="1">one die (“el dado”, 1587 princeps and 1588)</option></select></div>
        <div class="opt-row"><span>Paying for going back</span><select id="o-back"><option value="all">every move back costs one stake</option><option value="overshoot">only counting back from the Palm</option></select></div>
        <div class="opt-row"><span>House of Fortune (51)</span><select id="o-fortune"><option value="1">one extra throw</option><option value="2">two extra throws</option></select></div>
        <div class="opt-row"><span>Stakes in each purse</span><input id="o-purse" type="number" min="5" max="200" value="20"></div>
      </details>
      <p style="margin-top:1.4rem"><button class="btn primary" id="begin">Put your stakes in the pot, and begin ☞</button></p>
    </section>`;
    const rows = $('#rows');
    function drawRows() {
      rows.innerHTML = players.map((p, i) => `
        <div class="player-row" data-i="${i}">
          <span style="width:1.1rem;height:1.1rem;border-radius:50%;background:${COLORS[i]}"></span>
          <input type="text" value="${esc(p.name)}" aria-label="Name of player ${i + 1}" maxlength="24">
          <div class="tok-pick">${FC.tokens.list.map(t => `<button type="button" title="${esc(t.name)}" aria-label="${esc(t.name)}" aria-pressed="${p.token === t.id}" data-tok="${t.id}">${FC.tokens.svg(t.id)}</button>`).join('')}</div>
          <button class="btn small" data-del ${players.length <= 2 ? 'disabled' : ''} aria-label="Remove player">✕</button>
        </div>`).join('');
      $$('.player-row', rows).forEach(r => {
        const i = +r.dataset.i;
        $('input', r).addEventListener('input', e => { players[i].name = e.target.value; });
        $$('[data-tok]', r).forEach(b => b.addEventListener('click', () => {
          const t = b.dataset.tok, other = players.find((q, j) => j !== i && q.token === t);
          if (other) other.token = players[i].token;              // swap: markers must differ
          players[i].token = t; drawRows();
        }));
        $('[data-del]', r).addEventListener('click', () => { players.splice(i, 1); drawRows(); });
      });
      $('#add').disabled = players.length >= 6;
    }
    drawRows();
    $('#add').addEventListener('click', () => {
      const used = players.map(p => p.token), free = FC.tokens.list.find(t => !used.includes(t.id));
      players.push({ name: ['Juan', 'Isabel', 'Catalina', 'Luis', 'Ana'][players.length - 3] || 'Suitor', token: free.id });
      drawRows();
    });
    $('#o-dice').value = String(opts.dice || 2); $('#o-back').value = opts.backPay || 'all';
    $('#o-fortune').value = String(opts.fortuneThrows || 1); $('#o-purse').value = opts.purse || 20;
    $('#begin').addEventListener('click', () => {
      const edition = $('input[name=ed]:checked').value;
      const options = { edition, dice: +$('#o-dice').value, backPay: $('#o-back').value, fortuneThrows: +$('#o-fortune').value, purse: FC.util.clamp(+$('#o-purse').value || 20, 5, 200) };
      const ps = players.map((p, i) => ({ name: p.name.trim() || `Player ${i + 1}`, token: p.token, color: COLORS[i] }));
      FC.prefs.set('players', players); FC.prefs.set('options', options); FC.prefs.set('edition', edition);
      start(ps, options);
    });
    window.scrollTo(0, 0);
    if (saved && !saved.over) {
      $('#resume').addEventListener('click', () => resume(saved));
      $('#discard').addEventListener('click', () => { FC.prefs.set('game', null); renderSetup(); });
    }
  }

  /* ------------------------------------------------------------ start / save */
  function start(players, options) {
    resetTurn();
    setup = options;
    game = new E.Game(players, options);
    game.log = [`Each player puts one stake in the pot: the pot holds ${game.pot}.`];
    renderGame();
  }
  function save() {
    const g = Object.assign({}, game); delete g.history;
    FC.prefs.set('game', { v: SAVE_VERSION, setup, g, over: game.over, round: game.round });
  }
  function resume(saved) {
    resetTurn();
    setup = saved.setup;
    game = new E.Game(saved.g.players, setup);
    Object.assign(game, saved.g); game.history = [];
    game.log.push('(Game resumed.)');
    renderGame();
  }

  /* ------------------------------------------------------------ game screen */
  function renderGame() {
    const mobile = matchMedia('(max-width: 899px)').matches;
    view = FC.prefs.get('view-' + (mobile ? 'm' : 'd'), mobile ? 'path' : 'board');
    $('#app').innerHTML = `
      <h1 class="visually-hidden">Playing the Filosofía cortesana</h1>
      <div class="play-layout">
        <div class="board-col" id="boardcol"></div>
        <aside class="side" aria-label="The game">
          <div class="card turn-panel" id="turn"></div>
          <div id="cardslot" aria-live="polite"></div>
          <div class="card" style="padding:.6rem .9rem"><ul class="players" id="plist"></ul></div>
          <div class="card" style="padding:.6rem .9rem">
            <div class="board-toggle"><span class="sc small muted">View</span>
              <div class="seg-toggle" role="group"><button data-view="board" aria-pressed="${view === 'board'}">Board</button><button data-view="path" aria-pressed="${view === 'path'}">Path</button></div>
              <label class="small" style="margin-left:auto"><input type="checkbox" id="follow" ${FC.prefs.get('follow', true) ? 'checked' : ''}> follow the play</label></div>
            <label class="small"><input type="checkbox" id="names" ${FC.prefs.get('names', false) ? 'checked' : ''}> English names on the board</label>
            <details class="log"><summary class="sc">Record of play</summary><ol id="log"></ol></details>
            <p class="small" style="margin:.4rem 0 0"><a href="#" id="rules">Barros’s rules for this edition</a> · <a href="#" id="quit">End this game</a> · <span class="muted">${esc(FC.EDITIONS[ed()].short)}</span></p>
          </div>
        </aside>
      </div>
      <div class="mobile-bar" id="mbar" aria-live="polite"></div>`;
    $$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    $('#follow').addEventListener('change', e => FC.prefs.set('follow', e.target.checked));
    $('#names').addEventListener('change', e => { FC.prefs.set('names', e.target.checked); if (viewer) viewer.names(e.target.checked, ed()); });
    $('#rules').addEventListener('click', e => { e.preventDefault(); showRules(); });
    $('#quit').addEventListener('click', e => {
      e.preventDefault();
      if (!confirm('End this game? It cannot be resumed.')) return;
      resetTurn(); FC.prefs.set('game', null); renderSetup();
    });
    setView(view, true);
    drawAll(game.snapshot());
    idle();
    window.scrollTo(0, 0);
    const here = $('#path li.here'); if (here) here.scrollIntoView({ block: 'center' });
  }

  function setView(v, first) {
    view = v;
    const mobile = matchMedia('(max-width: 899px)').matches;
    FC.prefs.set('view-' + (mobile ? 'm' : 'd'), v);
    $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v));
    const col = $('#boardcol');
    col.innerHTML = '';
    viewer = null;
    if (v === 'board') {
      const div = document.createElement('div'); col.append(div);
      viewer = new FC.Viewer(div, { onSquare: n => openAnnotation(n) });
      viewer.edition = ed();
      if (ed() === 'G') { viewer.mark([59], 'variant'); viewer.labels([{ n: 59, text: 'Poverty (1587)' }, { n: 60, text: 'plain (1587)' }]); }
      viewer.names(FC.prefs.get('names', false), ed());
      col.append(html(`<p class="credit">Board: Mario Cartaro, Naples 1588. © The Trustees of the British Museum. Click any house to read it.</p>`));
    } else {
      col.append(renderPath());
    }
    if (!first) drawAll(game.snapshot());
    if (mobile) { const b = $('#mbar .seg-toggle'); if (b) $$('button', b).forEach(x => x.setAttribute('aria-pressed', x.dataset.view === v)); }
  }

  function renderPath() {
    const ul = document.createElement('ol');
    ul.className = 'path'; ul.id = 'path';
    let h = `<li class="gate-li adorned" data-n="0"><img src="img/feat/entrance_gate.jpg" alt="The entrance gate" loading="lazy"><div><div class="pt">The Gate: before house 1</div><div class="pv">Where every suitor waits to enter, under the swan that sings “Know thyself”.</div><div class="ptoks"></div></div></li>`;
    for (let n = 1; n <= 63; n++) {
      const ad = FC.sq.adorned(n, ed()), v = FC.sq.verse(n, ed());
      h += `<li class="${ad ? 'adorned' : ''}" data-n="${n}"><img src="${FC.sq.tile(n)}" alt="House ${n}" loading="lazy" width="84" height="112">
        <div><div class="pn">${n}</div><div class="pt">${ad ? esc(FC.sq.name(n, ed())) : '<span class="muted">a plain house</span>'}</div>
        ${v ? `<div class="pv">${esc(v.en)}</div>` : ''}<div class="ptoks"></div></div></li>`;
    }
    ul.innerHTML = h;
    ul.querySelectorAll('li').forEach(li => { li.tabIndex = 0; li.setAttribute('role', 'button'); });
    ul.addEventListener('click', e => { const li = e.target.closest('li'); if (!li) return; const n = +li.dataset.n; openAnnotation(n || 'gate'); });
    ul.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li')) { e.preventDefault(); e.target.click(); } });
    return ul;
  }

  /** Barros's own rules, in the edition being played. */
  function showRules() {
    const seg = s => `<div class="barros-seg"><div class="es" lang="es">${esc(s.es)}</div><div class="en">${s.en}</div>${s.note ? `<div class="tnote">${s.note}</div>` : ''}</div>`;
    let h = `<h2>How Barros says the game is played</h2>`;
    if (ed() === 'M') {
      h += `<p class="small muted">Madrid, Pedro Madrigal, 1587: “Declaración del juego y orden de jugarle”, from a modernized transcription (Ciompi and Seville after Dadson 1987).</p>`;
      h += FC.text.M.filter(s => s.kind === 'rules' || /Declaraci/.test(s.es)).map(seg).join('');
    } else {
      h += `<p class="small muted">Naples, Cacchij, 1588, pp. 60–63: “EL YVEGO SE juega en esta forma”.</p>`;
      h += FC.text.C.filter(s => s.kind === 'rules' || s.id === 'C-066a').map(seg).join('');
      if (ed() === 'G') h += `<p class="notice">The first edition (Madrid 1587) has the same short rules, headed “Esto se juega en esta forma”, with Poverty on house 59, and ends “Deo gratias” without saying how the game is won (Lucero Sánchez 2016, 189–90; Lucero 2019a, 204).</p>`;
    }
    h += `<p><a href="about.html#about-rules">What this edition decides where Barros is silent →</a></p>`;
    FC.drawer.open(h, 'Rules');
  }

  function openAnnotation(key) {
    const title = typeof key === 'number' ? `House ${key}` : '';
    FC.drawer.open(FC.annotate(key, ed()), title);
    const link = FC.drawer.body.querySelector('[data-show-on-board]');
    if (link) link.addEventListener('click', e => { e.preventDefault(); FC.drawer.close(); if (view !== 'board') setView('board'); setTimeout(() => viewer && viewer.focusSquare(key), 60); });
  }

  /* ------------------------------------------------------------ drawing */
  function drawAll(state) {
    const players = game.players.map(p => Object.assign({}, p, state.players.find(s => s.id === p.id)));
    if (viewer) viewer.tokens(players);
    if ($('#path')) {
      $$('#path .ptoks').forEach(d => { d.innerHTML = ''; });
      $$('#path li.here').forEach(li => li.classList.remove('here'));
      players.forEach(p => {
        const li = $(`#path li[data-n="${p.pos}"]`);
        if (li) { $('.ptoks', li).insertAdjacentHTML('beforeend', `<span title="${esc(p.name)}" style="border:2px solid ${p.color};border-radius:50%;display:inline-flex">${FC.tokens.svg(p.token)}</span>`); }
      });
      const cur = players[game.turn]; const li = cur && $(`#path li[data-n="${cur.pos}"]`); if (li) li.classList.add('here');
    }
    $('#plist').innerHTML = players.map((p, i) => `<li class="${i === game.turn && !game.over ? 'current' : ''}">
      <span style="border:2px solid ${p.color};border-radius:50%;display:inline-flex">${FC.tokens.svg(p.token)}</span>
      <span>${esc(p.name)}${p.skip && p.pos === 32 ? ' <span class="chip">in the Well</span>' : ''}</span>
      <span class="pos">${p.pos ? `house ${p.pos}` : 'at the gate'}<br><span class="small">${p.pos && FC.sq.adorned(p.pos, ed()) ? esc(FC.sq.name(p.pos, ed())) : ''}</span></span>
      <span class="purse" title="stakes in purse">${p.purse} ◉</span></li>`).join('');
    $('#log').innerHTML = game.log.slice(-80).map(l => `<li>${l}</li>`).join('');
  }

  function turnPanel(inner) {
    const p = game.current;
    const htmlStr = `<div class="who"><span style="border:2px solid ${p.color};border-radius:50%;display:inline-flex">${FC.tokens.svg(p.token)}</span><div><div class="nm">${esc(p.name)}</div><div class="small muted">${p.pos ? `on house ${p.pos}${FC.sq.adorned(p.pos, ed()) ? ', ' + esc(FC.sq.name(p.pos, ed())) : ''}` : 'at the gate'} · ${p.purse} stakes</div></div>
      <div class="pot" style="margin-left:auto" title="the pot (la polla)"><span>pot</span><b>${game.pot}</b></div></div>${inner}`;
    $('#turn').innerHTML = htmlStr;
    const mb = $('#mbar');
    mb.innerHTML = `<div class="row"><span style="border:2px solid ${p.color};border-radius:50%;display:inline-flex">${FC.tokens.svg(p.token)}</span><div class="grow"><div class="nm">${esc(p.name)}</div><div class="small muted">${p.pos ? `house ${p.pos}` : 'at the gate'} · ${p.purse} stakes · pot ${game.pot}</div></div>
      <div class="seg-toggle" role="group"><button data-view="board" aria-pressed="${view === 'board'}">Board</button><button data-view="path" aria-pressed="${view === 'path'}">Path</button></div></div><div class="mb-inner">${inner}</div>`;
    $$('#mbar [data-view]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.view); drawAll(game.snapshot()); }));
  }

  function diceSVG(vals, rolling) {
    const pip = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
    return vals.map(v => `<svg class="die${rolling ? ' rolling' : ''}" viewBox="-24 -24 48 48" role="img" aria-label="${v}"><rect x="-21" y="-21" width="42" height="42" rx="7"/>${pip[v].map(([x, y]) => `<circle cx="${x * 11}" cy="${y * 11}" r="4.3"/>`).join('')}</svg>`).join('');
  }

  /* ------------------------------------------------------------ the turn */
  function idle(extraNote = '') {
    if (game.over) return;
    const p = game.current;
    const again = game.extra > 0;
    const note = p.skip && !again ? `<p class="small">${esc(p.name)} is in the Well of Oblivion and misses this round.</p>` : '';
    turnPanel(`${extraNote}${note}<div class="dice"></div><button class="btn primary throw-btn" style="width:100%">${p.skip && !again ? 'Pass the round' : again ? 'Throw again (Fortune)' : game.opt.dice === 2 ? 'Throw the dice' : 'Throw the die'}</button>`);
    $$('.throw-btn').forEach(b => b.addEventListener('click', doThrow));
    save();
    if (document.activeElement === document.body || !document.activeElement) {
      const t = $(matchMedia('(max-width: 899px)').matches ? '#mbar .throw-btn' : '#turn .throw-btn');
      if (t) t.focus({ preventScroll: true });
    }
  }

  function doThrow() {
    if (busy) return;
    busy = true;
    const steps = game.play();
    save();                                        // a reload now keeps the result of this throw
    queue = steps.slice();
    $$('.throw-btn').forEach(b => { b.disabled = true; });
    const t = steps.find(s => s.type === 'throw');
    if (t) {
      $$('.dice').forEach(d => { d.innerHTML = diceSVG(t.dice.map(() => 1 + Math.floor(Math.random() * 6)), true); });
      setTimeout(() => { $$('.dice').forEach(d => { d.innerHTML = diceSVG(t.dice) + `<span class="sc" style="font-size:1.4rem;margin-left:.3rem">${t.total}</span>`; }); pump(); }, 550);
    } else pump();
  }

  /** Work through the queue of steps; stop at every card. */
  async function pump() {
    while (queue.length) {
      const s = queue.shift();
      const p = pl(s.player);
      switch (s.type) {
        case 'throw':
          game.log.push(`${esc(p.name)} throws ${s.dice.join(' + ')} = ${s.total}${s.extra ? ' (Fortune’s extra throw)' : ''}.`);
          break;
        case 'skip':
          game.log.push(`${esc(p.name)} stays in the Well of Oblivion this round.`);
          await card(wellSkipCard(p));
          break;
        case 'move':
          await animateMove(s);
          break;
        case 'rebound':
          pending.push(`Past the Palm by ${plural(s.bounce, 'house', 'houses')}: count back to house ${s.square} (“buelue atras los que sobran”).`);
          while (queue[0] && queue[0].type === 'pay') { const q = queue.shift(); pending.push(effectText(q)); game.log.push(effectText(q)); drawAll(q.state); }
          break;
        case 'arrive': {
          const effects = collectEffects();
          effects.pre = pending; pending = [];
          const plainByThrow = !FC.sq.adorned(s.square, ed()) && s.kind === 'plain' && !effects.pre.length && !effects.list.length;
          drawAll(s.state);
          if (plainByThrow) { game.log.push(`${esc(p.name)} comes to house ${s.square}.`); break; }
          await card(arriveCard(s, effects));
          applyEffects(effects);
          break;
        }
        case 'win': {
          drawAll(s.state);
          game.log.push(`<b>${esc(p.name)} reaches the Palm and wins the pot of ${s.amount}.</b>`);
          FC.prefs.set('game', null);
          showVictory(p, s.amount);
          busy = false;
          return;
        }
        case 'again':
          drawAll(s.state);
          busy = false;
          idle(`<p class="small"><b>Fortune:</b> ${esc(p.name)} throws again${s.left > 1 ? ` (${s.left} throws left)` : ''}.</p>`);
          return;
        case 'next':
          drawAll(s.state);
          busy = false;
          if (viewer && $('#follow') && $('#follow').checked) viewer.fit(true);
          { const li = $('#path li.here'); if (li) li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
          idle();
          return;
        default:
          drawAll(s.state);
      }
    }
    busy = false; idle();
  }

  /**
   * Gather the effect steps that belong to the house just reached (payments, being sent
   * on, displacing another player…), so that they are shown on that house's card.
   * A Labour house's effect is the move that follows it: that move is taken out of the
   * queue here, described on the card, and put back by applyEffects() so that the token
   * is animated after the player has read the card.
   */
  function collectEffects() {
    const list = [];
    while (queue.length && ['pay', 'transfer', 'bump', 'skipset', 'loop'].includes(queue[0].type)) list.push(queue.shift());
    // Labour: the following move is part of this house's effect
    if (queue[0] && queue[0].type === 'move' && queue[0].via === 'labour') list.push(Object.assign({ labour: true }, queue.shift()));
    return { pre: [], list };
  }

  function effectText(e) {
    const who = (id, cap) => id === 'pot' ? (cap ? 'The pot' : 'the pot') : esc(pl(id).name);
    switch (e.type) {
      case 'pay': return `${who(e.from, true)} pays ${plural(e.amount, 'stake', 'stakes')} to ${who(e.to)} — ${WHY[e.why] || ''}.`;
      case 'transfer': return e.to === 0 ? `Back to the Gate, to begin the game again.` : `Go to house ${e.to}, ${esc(FC.sq.name(e.to, ed()))}.`;
      case 'bump': return `${who(e.victim)} was on this house and must take the one ${esc(pl(e.player).name)} left: ${e.to ? `house ${e.to}` : 'back to the gate, with no house'}${e.forward ? ' (which, as it happens, is further on)' : ''} — “porque assi es el vso de la competencia”.`;
      case 'skipset': return `Miss the next round, waiting to be pulled out.`;
      case 'loop': return `The Labour moves would go round in a circle; you stop here.`;
      case 'move': return e.bounce ? `Labour: go on ${e.by} more houses — past the Palm by ${e.bounce}, so count back to ${e.to}.` : `Labour: go on ${e.by} more houses, to house ${e.to}.`;
    }
    return '';
  }

  /** After Continue: record the effects in the log, show their result, re-queue a Labour move. */
  function applyEffects(effects) {
    effects.list.forEach(e => {
      if (e.labour) return;                          // the move step itself animates later
      if (e.type === 'pay') game.log.push(effectText(e));
      if (e.type === 'transfer') game.log.push(`${esc(pl(e.player).name)}: ${effectText(e)}`);
      if (e.type === 'bump') game.log.push(effectText(e));
    });
    const last = [...effects.list].reverse().find(e => !e.labour);
    if (last) drawAll(last.state);
    // put the labour move back at the head of the queue so it animates
    const lab = effects.list.find(e => e.labour);
    if (lab) queue.unshift(Object.assign({}, lab, { labour: undefined }));
  }

  function arriveCard(s, effects) {
    const n = s.square, p = pl(s.player);
    const v = FC.sq.verse(n, ed()), a = FC.annotations[FC.sq.annId(n, ed())];
    // several one-stake payments of the same kind (the Well, alms) are shown as one line
    const grouped = [];
    effects.list.forEach(e => {
      const last = grouped[grouped.length - 1];
      if (e.type === 'pay' && (e.why === 'well' || e.why === 'alms') && last && last.type === 'pay' && last.why === e.why) last.n = (last.n || 1) + 1;
      else grouped.push(Object.assign({}, e));
    });
    const effs = effects.pre.concat(grouped.map(e => e.n
      ? (e.why === 'well' ? `${esc(pl(e.from).name)} pays one stake to each of the ${e.n} other players.`
                          : `Each of the ${e.n} other players gives ${esc(pl(e.to).name)} one stake as alms.`)
      : effectText(e)).filter(Boolean));
    if (s.kind === 'fortune') effs.push('Throw again at once.');
    if (s.kind === 'goal') effs.push('The exact throw: the Palm is won.');
    if (s.via === 'transfer' && !effs.length) effs.push(n === 26 ? 'You are here by the Pass of Hope.' : `Sent here from another house: its own rule does not act again.`);
    if (!effs.length && s.kind === 'plain') effs.push('Nothing befalls you here.');
    const headline = s.via === 'transfer' ? `${esc(p.name)} is sent to` : s.via === 'labour' ? `${esc(p.name)} labours on to` : `${esc(p.name)} lands on`;
    const why = a && a.id !== 'plain' ? a.why : '';
    return `<article class="card event-card" aria-live="polite">
      <div class="ev-img"><img src="${FC.sq.tile(n)}" alt="House ${n}"><div>
        <div class="small muted">${headline}</div><div class="ev-num">${n}</div><div class="ev-title">${FC.sq.adorned(n, ed()) ? esc(FC.sq.name(n, ed())) : 'A plain house'}</div>
        ${v ? `<div class="ev-verse">${esc(v.en).replace(' / ', '<br>')}</div><div class="ev-verse-es" lang="es">${esc(v.es_board || v.es_book).replace(' / ', ' / ')}</div>` : ''}
      </div></div>
      <div class="ev-body">
        ${effs.length ? `<ul class="effects">${effs.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
        ${why ? `<details class="why"><summary class="sc small">Why? What Barros meant</summary>${why}</details>` : ''}
        <div class="actions"><button class="btn primary" data-continue>Continue</button><button class="btn" data-read="${n}">Read about this house</button></div>
      </div></article>`;
  }

  function wellSkipCard(p) {
    return `<article class="card event-card"><div class="ev-img"><img src="${FC.sq.tile(32)}" alt="House 32"><div>
      <div class="small muted">${esc(p.name)} is still in</div><div class="ev-num">32</div><div class="ev-title">The Well of Oblivion</div>
      <div class="ev-verse">${esc(FC.board.verses.h32.en).replace(' / ', '<br>')}</div></div></div>
      <div class="ev-body"><ul class="effects"><li>A round without playing, until the ropes of liberality pull the suitor out.</li></ul>
      <div class="actions"><button class="btn primary" data-continue>Continue</button><button class="btn" data-read="32">Read about this house</button></div></div></article>`;
  }

  /** Show a card (side panel on desktop, bottom bar on phones) and wait for Continue. */
  function card(htmlStr) {
    return new Promise(resolve => {
      const slot = $('#cardslot'), mb = $('#mbar .mb-inner');
      slot.innerHTML = htmlStr;
      if (mb) mb.innerHTML = htmlStr;
      const n = +(slot.querySelector('[data-read]') || {}).dataset?.read;
      if (n) {
        if (viewer && $('#follow').checked) viewer.focusSquare(n, true, 2.4);
        if (viewer) viewer.mark([n], 'focus');
        const li = $(`#path li[data-n="${n}"]`);
        if (li) { $$('#path li.dest').forEach(x => x.classList.remove('dest')); li.classList.add('dest'); li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
      }
      $$('[data-read]').forEach(b => b.addEventListener('click', () => openAnnotation(+b.dataset.read)));
      const btns = $$('[data-continue]');
      btns.forEach(b => b.addEventListener('click', () => {
        slot.innerHTML = ''; if (mb) mb.innerHTML = '';
        if (viewer) viewer.mark([], 'focus');
        resolve();
      }));
      const target = matchMedia('(max-width: 899px)').matches ? $('#mbar [data-continue]') : slot.querySelector('[data-continue]');
      if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'nearest' }); }
    });
  }

  /** Hop the token house by house (and back, if it overshoots the Palm). */
  function animateMove(s) {
    return new Promise(resolve => {
      const path = [];
      if (s.bounce) { for (let i = s.from + 1; i <= 63; i++) path.push(i); for (let i = 62; i >= s.to; i--) path.push(i); }
      else for (let i = s.from + 1; i <= s.to; i++) path.push(i);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const delay = reduce ? 0 : Math.max(40, Math.min(140, 1400 / Math.max(1, path.length)));
      const base = s.state.players.map(x => Object.assign({}, x));
      let i = 0;
      const tick = () => {
        if (i >= path.length) { drawAll(s.state); resolve(); return; }
        const st = { pot: s.state.pot, players: base.map(x => x.id === s.player ? Object.assign({}, x, { pos: path[i] }) : x) };
        drawAll(st);
        const li = $(`#path li[data-n="${path[i]}"]`); if (li && i === path.length - 1) li.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        i++; setTimeout(tick, delay);
      };
      if (!path.length) { drawAll(s.state); resolve(); } else tick();
    });
  }

  function showVictory(p, amount) {
    const v = FC.board.verses;
    const rows = game.players.map(q => `<tr><td>${esc(q.name)}</td><td>${q.paid}</td><td>${q.received}</td><td>${q.purse}</td></tr>`).join('');
    const htmlStr = `<article class="card victory">
      <img src="img/feat/aedicule.jpg" alt="The gate of Victory with the palm" style="max-height:220px;margin:0 auto">
      <p class="sc muted" style="margin:.6rem 0 0">Vitoria</p><h2>${esc(p.name)} takes the pot: ${amount} stakes</h2>
      <p style="font-family:var(--f-display);font-size:1.2rem">${esc(v.h63.en).replace(' / ', '<br>')}</p>
      <p class="small"><i lang="es">“Ni lo mucho ni lo poco”</i>: neither too much nor too little. Barros reads the exact throw as temperance, and warns that no prize at court is secure. Outside the palm a man clings to it, holding a fish, one shoe lost in the sea: nothing is won for nothing.</p>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Paid out</th><th>Received</th><th>Purse</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p><button class="btn primary again">Play again</button> <button class="btn" data-read="63">Read about the Palm</button></p></article>`;
    turnPanel('<p class="small">The game is over.</p>');
    $('#cardslot').innerHTML = htmlStr; $('#mbar .mb-inner').innerHTML = htmlStr;
    $$('.again').forEach(b => b.addEventListener('click', renderSetup));
    $$('[data-read]').forEach(b => b.addEventListener('click', () => openAnnotation(+b.dataset.read)));
    if (viewer) viewer.focusSquare(63, true, 2.2);
  }

  document.addEventListener('DOMContentLoaded', renderSetup);
})();
